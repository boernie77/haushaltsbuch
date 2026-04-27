import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, householdAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, setHouseholds, setCurrentHousehold } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  // SSO error from backend redirect (?sso_error=...)
  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    if (ssoError) {
      toast.error(ssoError);
      window.history.replaceState(null, "", "/login");
    }
  }, [searchParams]);

  // SSO success: Backend redirected with #token=<jwt>
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get("token");
    if (!token) {
      return;
    }
    localStorage.setItem("auth_token", token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    window.history.replaceState(null, "", "/login");
    useAuthStore
      .getState()
      .loadStoredAuth()
      .then(() => navigate("/"));
  }, [navigate]);

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      const { data: hd } = await householdAPI.getAll();
      setHouseholds(hd.households);
      if (hd.households.length > 0) {
        setCurrentHousehold(hd.households[0]);
      }
      navigate("/");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Anmeldung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const handleSsoLogin = () => {
    const apiBase = (api.defaults.baseURL || "/api").replace(/\/$/, "");
    window.location.href = `${apiBase}/auth/oidc/login`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-400 to-purple-600 p-4 dark:from-blue-900 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 text-6xl">💰</div>
          <h1 className="font-bold text-3xl text-white">Haushaltsbuch</h1>
          <p className="mt-2 text-white/80">Deine Finanzen im Blick</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
          <h2 className="mb-6 font-semibold text-gray-900 text-xl dark:text-white">
            Anmelden
          </h2>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                E-Mail
              </label>
              <input
                className="input"
                placeholder="deine@email.de"
                type="email"
                {...register("email", { required: "E-Mail ist erforderlich" })}
              />
              {errors.email && (
                <p className="mt-1 text-red-500 text-xs">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Passwort
              </label>
              <input
                className="input"
                placeholder="••••••••"
                type="password"
                {...register("password", {
                  required: "Passwort ist erforderlich",
                })}
              />
              {errors.password && (
                <p className="mt-1 text-red-500 text-xs">
                  {errors.password.message}
                </p>
              )}
            </div>
            <button
              className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : null}
              Anmelden
            </button>
          </form>
          <div className="my-4 flex items-center gap-3 text-gray-400 text-xs">
            <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
            <span>oder</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-2 font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            onClick={handleSsoLogin}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Mit Authentik anmelden
          </button>
          <div className="mt-4 space-y-2 text-center text-gray-500 text-sm dark:text-gray-400">
            <p>
              Noch kein Konto?{" "}
              <Link
                className="font-medium text-[var(--primary)] hover:underline"
                to="/register"
              >
                Registrieren
              </Link>
            </p>
            <p>
              <Link
                className="text-[var(--primary)] hover:underline"
                to="/forgot-password"
              >
                Passwort vergessen?
              </Link>
            </p>
          </div>
        </div>
        <p className="mt-4 space-x-3 text-center text-white/60 text-xs">
          <Link className="hover:text-white" to="/impressum">
            Impressum
          </Link>
          <span>·</span>
          <Link className="hover:text-white" to="/datenschutz">
            Datenschutz
          </Link>
        </p>
      </div>
    </div>
  );
}
