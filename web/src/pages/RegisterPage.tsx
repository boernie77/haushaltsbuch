import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, householdAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface RegisterForm {
  email: string;
  inviteCode?: string;
  name: string;
  password: string;
  theme: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    register: registerUser,
    setHouseholds,
    setCurrentHousehold,
    updateUser,
  } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch } = useForm<RegisterForm>({
    defaultValues: {
      theme: "feminine",
      inviteCode: searchParams.get("code") || "",
    },
  });
  const selectedTheme = watch("theme");

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      await registerUser(
        data.name,
        data.email,
        data.password,
        data.inviteCode || undefined
      );
      await api.put("/auth/profile", { theme: data.theme });
      updateUser({ theme: data.theme as any });
      const { data: hd } = await householdAPI.getAll();
      setHouseholds(hd.households);
      if (hd.households.length > 0) {
        setCurrentHousehold(hd.households[0]);
      }
      navigate("/");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Registrierung fehlgeschlagen");
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
          <h2 className="mb-6 font-semibold text-gray-900 text-xl dark:text-white">
            Konto erstellen
          </h2>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Name
              </label>
              <input
                className="input"
                placeholder="Dein Name"
                type="text"
                {...register("name", { required: "Name ist erforderlich" })}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                E-Mail
              </label>
              <input
                className="input"
                placeholder="deine@email.de"
                type="email"
                {...register("email", { required: true })}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Passwort (min. 8 Zeichen)
              </label>
              <input
                className="input"
                type="password"
                {...register("password", { required: true, minLength: 8 })}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Einladungscode
              </label>
              <input
                className="input"
                placeholder="z.B. HB-ABC123"
                type="text"
                {...register("inviteCode")}
              />
              <p className="mt-1 text-gray-400 text-xs">
                Nur der allererste Benutzer benötigt keinen Code.
              </p>
            </div>
            <div>
              <label className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Design wählen
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    value: "feminine",
                    emoji: "🌸",
                    label: "Rosa",
                    desc: "Hell & modern",
                  },
                  {
                    value: "masculine",
                    emoji: "🌑",
                    label: "Dunkel Blau",
                    desc: "Dark Mode",
                  },
                  {
                    value: "professional-light",
                    emoji: "💼",
                    label: "Professional",
                    desc: "Indigo, hell",
                  },
                  {
                    value: "professional-dark",
                    emoji: "🌙",
                    label: "Professional",
                    desc: "Indigo, dunkel",
                  },
                ].map((t) => (
                  <label
                    className={`cursor-pointer rounded-xl border-2 p-3 text-center transition-all ${selectedTheme === t.value ? "border-[var(--primary)] bg-pink-50 dark:bg-slate-700" : "border-gray-200 dark:border-slate-600"}`}
                    key={t.value}
                  >
                    <input
                      type="radio"
                      value={t.value}
                      {...register("theme")}
                      className="hidden"
                    />
                    <div className="mb-1 text-2xl">{t.emoji}</div>
                    <div className="font-medium text-gray-900 text-sm dark:text-white">
                      {t.label}
                    </div>
                    <div className="text-gray-500 text-xs">{t.desc}</div>
                  </label>
                ))}
              </div>
            </div>
            <button
              className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : null}
              Konto erstellen
            </button>
          </form>
          <p className="mt-4 text-center text-gray-500 text-sm">
            Bereits registriert?{" "}
            <Link
              className="font-medium text-[var(--primary)] hover:underline"
              to="/login"
            >
              Anmelden
            </Link>
          </p>
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
