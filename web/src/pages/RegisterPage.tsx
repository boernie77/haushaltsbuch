import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { householdAPI, api } from '../services/api';

interface RegisterForm { name: string; email: string; password: string; inviteCode?: string; theme: string; }

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register: registerUser, setHouseholds, setCurrentHousehold, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>({
    defaultValues: { theme: 'feminine', inviteCode: searchParams.get('code') || '' }
  });
  const selectedTheme = watch('theme');

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      await registerUser(data.name, data.email, data.password, data.inviteCode || undefined);
      await api.put('/auth/profile', { theme: data.theme });
      updateUser({ theme: data.theme as any });
      const { data: hd } = await householdAPI.getAll();
      setHouseholds(hd.households);
      if (hd.households.length > 0) setCurrentHousehold(hd.households[0]);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registrierung fehlgeschlagen');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 dark:from-blue-900 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-3xl font-bold text-white">Haushaltsbuch</h1>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Konto erstellen</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input type="text" className="input" placeholder="Dein Name" {...register('name', { required: 'Name ist erforderlich' })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-Mail</label>
              <input type="email" className="input" placeholder="deine@email.de" {...register('email', { required: true })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passwort (min. 8 Zeichen)</label>
              <input type="password" className="input" {...register('password', { required: true, minLength: 8 })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Einladungscode</label>
              <input type="text" className="input" placeholder="z.B. HB-ABC123" {...register('inviteCode')} />
              <p className="text-xs text-gray-400 mt-1">Nur der allererste Benutzer benötigt keinen Code.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Design wählen</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'feminine', emoji: '🌸', label: 'Rosa (Feminin)', desc: 'Hell & modern' },
                  { value: 'masculine', emoji: '💙', label: 'Dunkel (Maskulin)', desc: 'Dark Mode' }
                ].map(t => (
                  <label key={t.value} className={`cursor-pointer border-2 rounded-xl p-3 text-center transition-all ${selectedTheme === t.value ? 'border-[var(--primary)] bg-pink-50 dark:bg-slate-700' : 'border-gray-200 dark:border-slate-600'}`}>
                    <input type="radio" value={t.value} {...register('theme')} className="hidden" />
                    <div className="text-2xl mb-1">{t.emoji}</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.desc}</div>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : null}
              Konto erstellen
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Bereits registriert? <Link to="/login" className="text-[var(--primary)] hover:underline font-medium">Anmelden</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
