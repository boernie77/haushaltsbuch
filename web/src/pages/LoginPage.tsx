import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { householdAPI } from '../services/api';

interface LoginForm { email: string; password: string; }

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, setHouseholds, setCurrentHousehold } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      const { data: hd } = await householdAPI.getAll();
      setHouseholds(hd.households);
      if (hd.households.length > 0) setCurrentHousehold(hd.households[0]);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Anmeldung fehlgeschlagen');
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
          <p className="text-white/80 mt-2">Deine Finanzen im Blick</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Anmelden</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-Mail</label>
              <input
                type="email"
                className="input"
                placeholder="deine@email.de"
                {...register('email', { required: 'E-Mail ist erforderlich' })}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passwort</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                {...register('password', { required: 'Passwort ist erforderlich' })}
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : null}
              Anmelden
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
            Noch kein Konto?{' '}
            <Link to="/register" className="text-[var(--primary)] hover:underline font-medium">Registrieren</Link>
          </p>
        </div>
        <p className="text-center text-xs text-white/60 mt-4 space-x-3">
          <Link to="/impressum" className="hover:text-white">Impressum</Link>
          <span>·</span>
          <Link to="/datenschutz" className="hover:text-white">Datenschutz</Link>
        </p>
      </div>
    </div>
  );
}
