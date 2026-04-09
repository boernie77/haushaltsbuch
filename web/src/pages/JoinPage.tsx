import { Link, useParams } from "react-router-dom";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 p-4 dark:from-blue-900 dark:to-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
        <div className="mb-4 text-5xl">🏠</div>
        <h1 className="mb-2 font-bold text-2xl text-gray-900 dark:text-white">
          Du wurdest eingeladen!
        </h1>
        <p className="mb-6 text-gray-500 dark:text-gray-400">
          Registriere dich mit diesem Code, um Haushaltsbuch beizutreten.
        </p>
        <div className="mb-8 rounded-xl bg-gray-100 p-3 font-bold font-mono text-[var(--primary)] text-xl tracking-widest dark:bg-slate-700">
          {code}
        </div>
        <div className="space-y-3">
          <Link
            className="btn-primary flex w-full items-center justify-center py-3 text-base"
            to={`/register?code=${code}`}
          >
            Jetzt registrieren & beitreten
          </Link>
          <Link
            className="block w-full rounded-xl bg-gray-100 px-4 py-3 text-center font-medium text-gray-700 text-sm transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
            to="/login"
          >
            Bereits registriert? Anmelden
          </Link>
        </div>
      </div>
    </div>
  );
}
