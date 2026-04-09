import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      toast.error("Fehler beim Senden");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 p-4 dark:from-blue-900 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 text-6xl">💰</div>
          <h1 className="font-bold text-3xl text-white">Haushaltsbuch</h1>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
          <h2 className="mb-2 font-semibold text-gray-900 text-xl dark:text-white">
            Passwort vergessen
          </h2>
          {sent ? (
            <div className="py-4 text-center">
              <div className="mb-4 text-5xl">📧</div>
              <p className="mb-2 text-gray-700 dark:text-gray-300">
                Falls ein Konto existiert, wurde eine E-Mail gesendet.
              </p>
              <p className="text-gray-500 text-sm">
                Bitte prüfe deinen Posteingang und klicke auf den Link.
              </p>
              <Link
                className="mt-4 inline-block text-[var(--primary)] text-sm hover:underline"
                to="/login"
              >
                Zurück zur Anmeldung
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-6 text-gray-500 text-sm">
                Gib deine E-Mail-Adresse ein. Du erhältst einen Link zum
                Zurücksetzen deines Passworts.
              </p>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    E-Mail
                  </label>
                  <input
                    className="input"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="deine@email.de"
                    required
                    type="email"
                    value={email}
                  />
                </div>
                <button
                  className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : null}
                  Link senden
                </button>
              </form>
              <p className="mt-4 text-center text-gray-500 text-sm">
                <Link
                  className="text-[var(--primary)] hover:underline"
                  to="/login"
                >
                  Zurück zur Anmeldung
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
