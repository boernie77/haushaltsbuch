import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Passwörter stimmen nicht überein'); return; }
    if (password.length < 8) { toast.error('Mindestens 8 Zeichen'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      toast.success('Passwort erfolgreich geändert');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Link ungültig oder abgelaufen');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 dark:from-blue-900 dark:to-slate-900 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl text-center">
        <p className="text-red-500 mb-4">Ungültiger Reset-Link.</p>
        <Link to="/login" className="text-[var(--primary)] hover:underline">Zur Anmeldung</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 dark:from-blue-900 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-3xl font-bold text-white">Haushaltsbuch</h1>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Neues Passwort setzen</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Neues Passwort</label>
              <input type="password" className="input" placeholder="Mindestens 8 Zeichen" value={password}
                onChange={e => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passwort wiederholen</label>
              <input type="password" className="input" placeholder="••••••••" value={confirm}
                onChange={e => setConfirm(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : null}
              Passwort speichern
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
