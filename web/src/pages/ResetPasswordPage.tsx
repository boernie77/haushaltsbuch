import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwörter stimmen nicht überein");
      return;
    }
    if (password.length < 8) {
      toast.error("Mindestens 8 Zeichen");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Passwort erfolgreich geändert");
      navigate("/login");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Link ungültig oder abgelaufen");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 p-4 dark:from-blue-900 dark:to-slate-900">
        <div className="rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
          <p className="mb-4 text-red-500">Ungültiger Reset-Link.</p>
          <Link className="text-[var(--primary)] hover:underline" to="/login">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 p-4 dark:from-blue-900 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 text-6xl">💰</div>
          <h1 className="font-bold text-3xl text-white">Haushaltsbuch</h1>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
          <h2 className="mb-6 font-semibold text-gray-900 text-xl dark:text-white">
            Neues Passwort setzen
          </h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Neues Passwort
              </label>
              <input
                className="input"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                required
                type="password"
                value={password}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Passwort wiederholen
              </label>
              <input
                className="input"
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                type="password"
                value={confirm}
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
              Passwort speichern
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
