import React from 'react';
import { useParams, Link } from 'react-router-dom';

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 dark:from-blue-900 dark:to-slate-900 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
        <div className="text-5xl mb-4">🏠</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Du wurdest eingeladen!</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Registriere dich mit diesem Code, um Haushaltsbuch beizutreten.
        </p>
        <div className="bg-gray-100 dark:bg-slate-700 rounded-xl p-3 font-mono text-xl font-bold text-[var(--primary)] mb-8 tracking-widest">
          {code}
        </div>
        <div className="space-y-3">
          <Link
            to={`/register?code=${code}`}
            className="btn-primary w-full flex items-center justify-center text-base py-3"
          >
            Jetzt registrieren & beitreten
          </Link>
          <Link
            to="/login"
            className="block w-full text-center px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            Bereits registriert? Anmelden
          </Link>
        </div>
      </div>
    </div>
  );
}
