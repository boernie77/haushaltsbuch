"""FinTS-Sidecar: holt Kontoumsätze per FinTS/HBCI (PIN/TAN) über python-fints.

Zustandslos bis auf laufende TAN-Dialoge (im Speicher, kurze Lebensdauer).
PIN und Zugangsdaten werden nie geloggt oder gespeichert — sie kommen bei
jedem Aufruf vom Backend, das sie verschlüsselt in der DB hält.

Die FinTS-Produktregistrierungsnummer kommt aus FINTS_PRODUCT_ID (Pflicht,
vertraulich, nie ins Repo). Ohne sie meldet /health configured=false.
"""

import logging
import os
import re
import secrets
import threading
import time
from datetime import date
from typing import Optional

import xml.etree.ElementTree as ET

import requests
from fastapi import FastAPI
from collections import OrderedDict

from fints.client import (
    IMPLEMENTED_HKTAN_VERSIONS,
    ING_BANK_IDENTIFIER,
    FinTS3PinTanClient,
    NeedTANResponse,
)
from fints.exceptions import FinTSUnsupportedOperation
from fints.formals import SupportedMessageTypes
from fints.segments.statement import HKCAZ1
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("haushaltsbuch.fints")

# python-fints setzt keinen Timeout: antwortet die Bank nicht, hängt der Abruf
# ewig. Verbindungsaufbau 15 s, Antwort der Bank max. 120 s.
BANK_TIMEOUT = (15, 120)
_original_request = requests.Session.request


def _request_with_timeout(self, *args, **kwargs):
    kwargs.setdefault("timeout", BANK_TIMEOUT)
    return _original_request(self, *args, **kwargs)


requests.Session.request = _request_with_timeout

# FINTS_DEBUG=1: Nachrichten zwischen Server und Bank im Log (python-fints
# maskiert die PIN). Nur zur Fehlersuche einschalten.
if os.environ.get("FINTS_DEBUG"):
    logging.getLogger("fints").setLevel(logging.DEBUG)

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
        # NICHT self.lock: logging.Handler benutzt dieses Attribut selbst
        # (RLock). Überschreiben führte zum Deadlock beim Loggen.
        self.messages_lock = threading.Lock()

    def add(self, text):
        with self.messages_lock:
            if text not in self.messages:
                self.messages = (self.messages + [text])[-15:]

    def emit(self, record):
        text = record.getMessage()
        if text.startswith("Dialog response:"):
            self.add(text[len("Dialog response:") :].strip())

    def take(self):
        with self.messages_lock:
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


class LoggingClient(FinTS3PinTanClient):
    """Merkt sich alle Antwortcodes der Bank.

    python-fints loggt Antworten des ersten Dialogs (Synchronisierung) nicht,
    genau dort lehnt die Bank aber bei falschen Zugangsdaten oder unbekannter
    Produkt-ID ab. Folge wäre nur "Could not find system_id".
    """

    def process_response_message(self, dialog, message, internal_send=True):
        for kind in ("HIRMG", "HIRMS"):
            for seg in message.find_segments(kind):
                for r in seg.responses:
                    bank_messages.add(f"{r.code} - {r.text}")
                    # python-fints übernimmt die erlaubten TAN-Verfahren (3920)
                    # bei ING bewusst nicht → Liste bliebe leer. Nur die Liste
                    # setzen, die Auswahl trifft weiterhin der Nutzer.
                    if r.code == "3920" and self.bank_identifier == ING_BANK_IDENTIFIER:
                        self.allowed_security_functions = list(r.parameters)
        return super().process_response_message(dialog, message, internal_send)


def new_client(c: Connection):
    return LoggingClient(
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
    mechanisms = client.get_tan_mechanisms()
    if not mechanisms:
        # Erlaubte Verfahren unbekannt (z. B. ING nennt sie erst nach der
        # Anmeldung): alle Verfahren aus den Bankparametern anbieten.
        mechanisms = OrderedDict()
        for version in sorted(IMPLEMENTED_HKTAN_VERSIONS):
            for seg in client.bpd.find_segments("HITANS", version):
                for p in seg.parameter.twostep_parameters:
                    mechanisms[p.security_function] = p
    for code, m in mechanisms.items():
        methods.append({"code": code, "name": getattr(m, "name", code)})
    return methods


def discover_via_login(c):
    """TAN-Verfahren nach der Anmeldung lesen (z. B. ING).

    Manche Banken nennen ihre Parameter und die erlaubten TAN-Verfahren erst
    im angemeldeten Dialog. Dafür wird einmal mit dem Einschritt-Verfahren
    angemeldet (ohne Umsätze, ohne TAN) und die Antwort ausgewertet."""
    login = new_client(c)
    try:
        with login:
            pass
    except Exception as err:
        log.info("Anmeldung zur Verfahrenssuche: %s", err)
        if not login.allowed_security_functions:
            raise
    try:
        versions = sorted(
            {int(x.header.version) for x in login.bpd.find_segments("HITANS")}
        )
    except Exception:
        versions = "keine BPD"
    log.info(
        "Nach Anmeldung: erlaubte Funktionen=%s, HITANS-Versionen=%s, Meldungen=%s",
        login.allowed_security_functions,
        versions,
        list(bank_messages.messages),
    )
    return tan_methods(login)


def list_methods(c, client):
    methods = tan_methods(client)
    if not methods:
        log.info("Keine TAN-Verfahren vor der Anmeldung, lese sie nach der Anmeldung")
        methods = discover_via_login(c)
    return methods


def challenge_json(sid, sess):
    p = sess.pending
    log.info("TAN verlangt (Stufe %s, entkoppelt: %s)", sess.stage, bool(getattr(p, "decoupled", False)))
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


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _child(node, *path):
    """Erstes Kind-Element entlang eines Pfads (Namespace-unabhängig)."""
    for name in path:
        found = None
        for c in node:
            if _local(c.tag) == name:
                found = c
                break
        if found is None:
            return None
        node = found
    return node


def _text(node, *path):
    n = _child(node, *path) if path else node
    return (n.text or "").strip() if n is not None and n.text else ""


def camt_to_rows(streams):
    """camt.052 (XML) → dieselben Zeilen wie to_rows() (nur gebuchte Umsätze)."""
    rows = []
    for stream in streams:
        root = ET.fromstring(stream)
        for ntry in root.iter():
            if _local(ntry.tag) != "Ntry":
                continue
            amount = _text(ntry, "Amt")
            if not amount:
                continue
            value = float(amount)
            credit = _text(ntry, "CdtDbtInd") == "CRDT"
            if not credit:
                value = -value
            booking = _text(ntry, "BookgDt", "Dt") or _text(ntry, "ValDt", "Dt")
            if not booking:
                continue
            details = _child(ntry, "NtryDtls", "TxDtls")
            purpose_parts, name, iban = [], "", ""
            if details is not None:
                purpose_parts = [
                    (u.text or "").strip()
                    for u in details.iter()
                    if _local(u.tag) == "Ustrd" and u.text
                ]
                side = "Dbtr" if credit else "Cdtr"
                # camt.052.001.08: Name unter Pty/Nm, ältere Versionen direkt Nm.
                name = _text(details, "RltdPties", side, "Nm") or _text(
                    details, "RltdPties", side, "Pty", "Nm"
                )
                iban = _text(details, "RltdPties", side + "Acct", "Id", "IBAN")
            purpose = " ".join(purpose_parts) or _text(ntry, "AddtlNtryInf")
            rows.append(
                {
                    "date": booking[:10],
                    "amount": value,
                    "purpose": purpose,
                    "counterpartyName": name or None,
                    "counterpartyIban": iban or None,
                }
            )
    return rows


CAMT_PATTERN = re.compile(r"urn:iso:std:iso:20022:tech:xsd:camt\.052\.001\.(\d+)")
DEFAULT_CAMT = "urn:iso:std:iso:20022:tech:xsd:camt.052.001.08"


def pick_camt_type(client):
    """camt.052-Version, die die Bank laut BPD (HICAZS) zulässt.

    python-fints fragt fest camt.052.001.02 an; Sparda lehnt das mit 9010
    "camt-Nachricht nicht zugelassen" ab und erlaubt nur .08.
    """
    found = set()
    for seg in client.bpd.find_segments("HICAZS"):
        found.update(CAMT_PATTERN.findall(repr(seg)))
    if not found:
        return DEFAULT_CAMT
    best = sorted(found, key=int)[-1]
    chosen = f"urn:iso:std:iso:20022:tech:xsd:camt.052.001.{best}"
    log.info("camt-Version laut BPD: %s (verfügbar: %s)", chosen, sorted(found))
    return chosen


def get_transactions_camt(client, account, start, end):
    """Wie FinTS3PinTanClient.get_transactions_xml, aber mit passender camt-Version."""
    camt_type = pick_camt_type(client)
    with client._get_dialog() as dialog:
        hkcaz = client._find_highest_supported_command(HKCAZ1)
        return client._fetch_with_touchdowns(
            dialog,
            lambda touchdown: hkcaz(
                account=hkcaz._fields["account"].type.from_sepa_account(account),
                all_accounts=False,
                date_start=start,
                date_end=end,
                touchdown_point=touchdown,
                supported_camt_messages=SupportedMessageTypes([camt_type]),
            ),
            FinTS3PinTanClient._response_handler_get_transactions_xml,
            "HICAZ",
        )


def fetch_transactions(sess):
    """MT940 (HKKAZ), sonst camt (HKCAZ) — Sparda & Co. bieten nur camt an."""
    try:
        return sess.client.get_transactions(sess.account, sess.date_from, sess.date_to)
    except FinTSUnsupportedOperation:
        log.info("Bank bietet kein HKKAZ (MT940), verwende HKCAZ (camt.052)")
        return get_transactions_camt(sess.client, sess.account, sess.date_from, sess.date_to)


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

    res = fetch_transactions(sess)
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
    # camt-Abruf liefert (gebuchte XML-Dokumente, vorgemerkte XML-Dokumente).
    if isinstance(transactions, tuple):
        rows = camt_to_rows(transactions[0])
    else:
        rows = to_rows(transactions)
    log.info("Abruf fertig: %d Umsätze", len(rows))
    with sessions_lock:
        sess = sessions.pop(sid, None)
    if sess:
        close(sess)
    return {"status": "ok", "transactions": rows}


# Verständliche Hinweise zu häufigen Antwortcodes der Bank (FinTS-Rückmeldungen).
CODE_HINTS = {
    "9078": "Die Registrierungsnummer dieser Installation ist bei der Bank noch nicht bekannt (die Aktualisierung bei den Banken kann Wochen dauern) oder falsch eingetragen.",
    "9930": "Zugangsname nicht akzeptiert. Prüfe, welche Kennung die Bank für FinTS erwartet (z. B. Anmeldename, Alias, VR-NetKey, Sparda-NetKey).",
    "9931": "Zugangsname oder PIN falsch, eventuell ist der Zugang gesperrt. Zur Kontrolle einmal normal im Online-Banking anmelden.",
    "9942": "Anmeldedaten ungültig: Zugangsname oder PIN stimmen nicht. Mehrfache Fehlversuche können den Zugang sperren.",
    "9010": "Die Bank lehnt das angefragte Format oder den Auftrag ab.",
    "9380": "Die Bank verlangt eine TAN-Freigabe oder ein anderes TAN-Verfahren.",
}
CODE_PATTERN = re.compile(r"\b(9\d{3})\b")


def explain(message):
    """Deutsche Hinweise zu den in der Meldung vorkommenden Bankcodes."""
    seen = []
    for code in CODE_PATTERN.findall(message):
        if code in CODE_HINTS and CODE_HINTS[code] not in seen:
            seen.append(CODE_HINTS[code])
    return seen


def error(message, code="error"):
    messages = bank_messages.take()
    if messages:
        message = f"{message} — Meldungen der Bank: {' | '.join(messages)}"
    hints = explain(message)
    if hints:
        message = f"{message} — Hinweis: {' '.join(hints)}"
    # Nie PIN oder Zugangsdaten loggen, nur Fehlertext und Bankcodes.
    log.error("Fehler (%s): %s", code, message)
    return {"status": "error", "code": code, "error": message}


def start(sess_args, c: Connection):
    client = new_client(c)
    if c.tanMethod:
        client.fetch_tan_mechanisms()
        client.set_tan_mechanism(c.tanMethod)
    else:
        client.fetch_tan_mechanisms()
        methods = list_methods(c, client)
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
        return {"status": "ok", "methods": list_methods(c, client)}
    except Exception as err:
        return error(str(err))


class ProbeRequest(Connection):
    iban: Optional[str] = None


def mask(iban):
    return f"{iban[:4]}…{iban[-4:]}" if iban and len(iban) > 8 else iban


@app.post("/probe")
def probe(req: ProbeRequest):
    """Verbindungstest: meldet sich an und liest, was die Bank kann — ohne
    Umsätze abzurufen und ohne TAN-Freigabe (hält vorher an)."""
    if not PRODUCT_ID:
        return error("FINTS_PRODUCT_ID ist nicht konfiguriert.", "not_configured")
    cleanup()
    bank_messages.take()
    log.info("Verbindungstest: Bank %s", req.bankCode)
    out = {"status": "ok", "notes": []}
    try:
        client = new_client(req)
        client.fetch_tan_mechanisms()
        methods = list_methods(req, client)
        out["methods"] = methods
        method = req.tanMethod or (methods[0]["code"] if len(methods) == 1 else None)
        if not method:
            out["tanMethodNeeded"] = True
            out["notes"].append("Mehrere TAN-Verfahren: bitte eines auswählen und erneut testen.")
            return out
        client.set_tan_mechanism(method)
        with client:
            out["bankName"] = getattr(getattr(client, "bpa", None), "bank_name", None)
            out["loginNeedsTan"] = bool(client.init_tan_response)
            if out["loginNeedsTan"]:
                out["notes"].append("Schon die Anmeldung verlangt eine TAN-Freigabe (Test endet hier).")
            else:
                accounts = client.get_sepa_accounts()
                if isinstance(accounts, NeedTANResponse):
                    out["accountsNeedTan"] = True
                    out["notes"].append("Das Laden der Konten verlangt eine TAN-Freigabe (Test endet hier).")
                else:
                    out["accounts"] = [mask(a.iban) for a in accounts]
                    if req.iban:
                        wanted = req.iban.replace(" ", "").upper()
                        out["ibanFound"] = any((a.iban or "").upper() == wanted for a in accounts)
                        if not out["ibanFound"]:
                            out["notes"].append("Die IBAN des Kontos wurde bei der Bank nicht gefunden.")
            out["mt940"] = sorted({int(x.header.version) for x in client.bpd.find_segments("HIKAZS")})
            camt = set()
            for seg in client.bpd.find_segments("HICAZS"):
                camt.update(CAMT_PATTERN.findall(repr(seg)))
            out["camt"] = sorted(camt, key=int)
            if not out["mt940"] and not out["camt"]:
                out["notes"].append("Die Bank bietet keinen Umsatzabruf per FinTS an (weder MT940 noch camt). Nutze den Datei-Import.")
        out["bankMessages"] = bank_messages.take()
        return out
    except Exception as err:
        return error(str(err) or err.__class__.__name__)


@app.post("/fetch")
def fetch(req: FetchRequest):
    if not PRODUCT_ID:
        return error("FINTS_PRODUCT_ID ist nicht konfiguriert.", "not_configured")
    cleanup()
    bank_messages.take()
    log.info("Abruf gestartet: Bank %s, %s bis %s", req.bankCode, req.dateFrom, req.dateTo)
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
        log.exception("Abruf fehlgeschlagen")
        return error(str(err) or err.__class__.__name__)


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
            log.exception("TAN-Schritt fehlgeschlagen")
            return error(str(err) or err.__class__.__name__)
