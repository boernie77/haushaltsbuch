"""FinTS-Sidecar: holt Kontoumsätze per FinTS/HBCI (PIN/TAN) über python-fints.

Zustandslos bis auf laufende TAN-Dialoge (im Speicher, kurze Lebensdauer).
PIN und Zugangsdaten werden nie geloggt oder gespeichert — sie kommen bei
jedem Aufruf vom Backend, das sie verschlüsselt in der DB hält.

Die FinTS-Produktregistrierungsnummer kommt aus FINTS_PRODUCT_ID (Pflicht,
vertraulich, nie ins Repo). Ohne sie meldet /health configured=false.
"""

import logging
import os
import secrets
import threading
import time
from datetime import date
from typing import Optional

from fastapi import FastAPI
from fints.client import FinTS3PinTanClient, NeedTANResponse
from pydantic import BaseModel

PRODUCT_ID = os.environ.get("FINTS_PRODUCT_ID", "").strip()
PRODUCT_VERSION = os.environ.get("FINTS_PRODUCT_VERSION", "1.0")
SESSION_TTL_SECONDS = 600

class BankMessages(logging.Handler):
    """Sammelt die Antwortcodes der Bank ("Dialog response: 9xxx - Text").

    python-fints loggt nur Codes und Klartext-Meldungen der Bank, keine PIN.
    Ohne diese Meldungen sieht man bei Fehlern nur Folgefehler wie
    "Could not find system_id".
    """

    def __init__(self):
        super().__init__(level=logging.INFO)
        self.messages = []
        self.lock = threading.Lock()

    def emit(self, record):
        text = record.getMessage()
        if text.startswith("Dialog response:"):
            with self.lock:
                self.messages = (self.messages + [text[len("Dialog response:") :].strip()])[-15:]

    def take(self):
        with self.lock:
            out, self.messages = self.messages, []
        return out


bank_messages = BankMessages()
_fints_logger = logging.getLogger("fints.client")
_fints_logger.setLevel(logging.INFO)
_fints_logger.addHandler(bank_messages)

app = FastAPI(title="Haushaltsbuch FinTS")
sessions: dict = {}
sessions_lock = threading.Lock()


class Connection(BaseModel):
    bankCode: str
    url: str
    login: str
    pin: str
    tanMethod: Optional[str] = None
    tanMedium: Optional[str] = None


class FetchRequest(Connection):
    iban: str
    dateFrom: str
    dateTo: str


class TanRequest(BaseModel):
    session: str
    tan: str = ""


class Session:
    def __init__(self, client, iban, date_from, date_to):
        self.client = client
        self.iban = iban
        self.date_from = date_from
        self.date_to = date_to
        self.stage = "init"  # init → accounts → transactions
        self.pending = None
        self.account = None
        self.created = time.time()
        self.lock = threading.Lock()


def new_client(c: Connection):
    return FinTS3PinTanClient(
        c.bankCode,
        c.login,
        c.pin,
        c.url,
        product_id=PRODUCT_ID,
        product_version=PRODUCT_VERSION,
    )


def cleanup():
    now = time.time()
    with sessions_lock:
        for sid in [s for s, v in sessions.items() if now - v.created > SESSION_TTL_SECONDS]:
            close(sessions.pop(sid))


def close(sess):
    try:
        sess.client.__exit__(None, None, None)
    except Exception:
        pass


def tan_methods(client):
    methods = []
    for code, m in client.get_tan_mechanisms().items():
        methods.append({"code": code, "name": getattr(m, "name", code)})
    return methods


def challenge_json(sid, sess):
    p = sess.pending
    matrix = getattr(p, "challenge_matrix", None)
    image = None
    if matrix:
        import base64

        image = {
            "mime": matrix[0],
            "data": base64.b64encode(matrix[1]).decode("ascii"),
        }
    return {
        "status": "tan_required",
        "session": sid,
        "decoupled": bool(getattr(p, "decoupled", False)),
        "challenge": getattr(p, "challenge", None),
        "challengeImage": image,
    }


def to_rows(transactions):
    rows = []
    for t in transactions:
        d = getattr(t, "data", t)
        amount = d.get("amount")
        value = getattr(amount, "amount", amount)
        booking = d.get("date") or d.get("entry_date")
        purpose = (d.get("purpose") or "").strip()
        posting = (d.get("posting_text") or "").strip()
        rows.append(
            {
                "date": booking.isoformat() if booking else None,
                "amount": float(value),
                "purpose": purpose or posting,
                "counterpartyName": (d.get("applicant_name") or "").strip() or None,
                "counterpartyIban": (d.get("applicant_iban") or "").strip() or None,
            }
        )
    return [r for r in rows if r["date"]]


def run(sid, sess, tan):
    """Treibt den Dialog bis zur nächsten TAN-Abfrage oder zum Ergebnis."""
    c = sess.client
    if sess.pending is not None:
        pending = sess.pending
        try:
            res = c.send_tan(pending, tan)
        except Exception as err:
            # Entkoppelte TAN (Push): noch nicht in der App bestätigt.
            if getattr(pending, "decoupled", False):
                out = challenge_json(sid, sess)
                out["message"] = f"Noch nicht bestätigt ({err})"
                return out
            raise
        sess.pending = None
        if isinstance(res, NeedTANResponse):
            sess.pending = res
            return challenge_json(sid, sess)
        if sess.stage == "init":
            sess.stage = "accounts"
        elif sess.stage == "accounts":
            sess.account = pick_account(res, sess.iban)
            sess.stage = "transactions"
        elif sess.stage == "transactions":
            return done(sid, res)

    if sess.stage == "init":
        if c.init_tan_response:
            sess.pending = c.init_tan_response
            return challenge_json(sid, sess)
        sess.stage = "accounts"

    if sess.stage == "accounts":
        res = c.get_sepa_accounts()
        if isinstance(res, NeedTANResponse):
            sess.pending = res
            return challenge_json(sid, sess)
        sess.account = pick_account(res, sess.iban)
        sess.stage = "transactions"

    res = c.get_transactions(sess.account, sess.date_from, sess.date_to)
    if isinstance(res, NeedTANResponse):
        sess.pending = res
        return challenge_json(sid, sess)
    return done(sid, res)


def pick_account(accounts, iban):
    wanted = iban.replace(" ", "").upper()
    for a in accounts:
        if (a.iban or "").replace(" ", "").upper() == wanted:
            return a
    available = ", ".join(a.iban for a in accounts if a.iban)
    raise ValueError(f"IBAN {iban} nicht gefunden. Bei der Bank vorhanden: {available}")


def done(sid, transactions):
    with sessions_lock:
        sess = sessions.pop(sid, None)
    if sess:
        close(sess)
    return {"status": "ok", "transactions": to_rows(transactions)}


def error(message, code="error"):
    messages = bank_messages.take()
    if messages:
        message = f"{message} — Meldungen der Bank: {' | '.join(messages)}"
    return {"status": "error", "code": code, "error": message}


def start(sess_args, c: Connection):
    client = new_client(c)
    if c.tanMethod:
        client.fetch_tan_mechanisms()
        client.set_tan_mechanism(c.tanMethod)
    else:
        client.fetch_tan_mechanisms()
        methods = tan_methods(client)
        if len(methods) != 1:
            return None, {"status": "tan_method_needed", "methods": methods}
        client.set_tan_mechanism(methods[0]["code"])
    client.__enter__()
    if c.tanMedium:
        try:
            _, media = client.get_tan_media()
            for m in media:
                if m.tan_medium_name == c.tanMedium:
                    client.set_tan_medium(m)
        except Exception:
            pass  # nicht jede Bank kennt TAN-Medien
    sid = secrets.token_urlsafe(32)
    sess = Session(client, *sess_args)
    with sessions_lock:
        sessions[sid] = sess
    return (sid, sess), None


@app.get("/health")
def health():
    return {"ok": True, "configured": bool(PRODUCT_ID)}


@app.post("/tan-methods")
def methods(c: Connection):
    if not PRODUCT_ID:
        return error("FINTS_PRODUCT_ID ist nicht konfiguriert.", "not_configured")
    try:
        client = new_client(c)
        client.fetch_tan_mechanisms()
        return {"status": "ok", "methods": tan_methods(client)}
    except Exception as err:
        return error(str(err))


@app.post("/fetch")
def fetch(req: FetchRequest):
    if not PRODUCT_ID:
        return error("FINTS_PRODUCT_ID ist nicht konfiguriert.", "not_configured")
    cleanup()
    bank_messages.take()
    try:
        started, early = start(
            (
                req.iban,
                date.fromisoformat(req.dateFrom),
                date.fromisoformat(req.dateTo),
            ),
            req,
        )
        if early:
            return early
        sid, sess = started
        with sess.lock:
            try:
                return run(sid, sess, "")
            except Exception:
                with sessions_lock:
                    sessions.pop(sid, None)
                close(sess)
                raise
    except Exception as err:
        return error(str(err))


@app.post("/tan")
def tan(req: TanRequest):
    cleanup()
    with sessions_lock:
        sess = sessions.get(req.session)
    if not sess:
        return error("Sitzung abgelaufen. Bitte neu abrufen.", "session_expired")
    with sess.lock:
        try:
            return run(req.session, sess, req.tan)
        except Exception as err:
            with sessions_lock:
                sessions.pop(req.session, None)
            close(sess)
            return error(str(err))
