import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      toast.error('Fehler beim Senden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 dark:from-blue-900 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-3xl font-bold text-white">Haushaltsbuch</h1>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Passwort vergessen</h2>
          {sent ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">📧</div>
              <p className="text-gray-700 dark:text-gray-300 mb-2">Falls ein Konto existiert, wurde eine E-Mail gesendet.</p>
              <p className="text-sm text-gray-500">Bitte prüfe deinen Posteingang und klicke auf den Link.</p>
              <Link to="/login" className="mt-4 inline-block text-[var(--primary)] hover:underline text-sm">Zurück zur Anmeldung</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">Gib deine E-Mail-Adresse ein. Du erhältst einen Link zum Zurücksetzen deines Passworts.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-Mail</label>
                  <input type="email" className="input" placeholder="deine@email.de" value={email}
                    onChange={e => setEmail(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : null}
                  Link senden
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-4">
                <Link to="/login" className="text-[var(--primary)] hover:underline">Zurück zur Anmeldung</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
