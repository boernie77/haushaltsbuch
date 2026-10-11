import clsx from "clsx";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useNotificationStore } from "../store/notificationStore";

const KIND_STYLE = {
  error:
    "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  success:
    "border-green-300 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200",
  info: "border-gray-200 bg-gray-50 text-gray-800 dark:bg-slate-800 dark:text-gray-200",
} as const;

const formatTime = (t: number) =>
  new Date(t).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function NotificationBell({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);
  const unread = items.filter((n) => !n.read).length;

  const toggle = () => {
    if (open) {
      markAllRead();
    }
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        aria-label="Benachrichtigungen"
        className={clsx(
          "relative flex items-center gap-3 rounded-xl text-gray-500 hover:text-[var(--primary)]",
          compact
            ? "p-1"
            : "w-full p-2 hover:bg-pink-50 dark:hover:bg-slate-700"
        )}
        onClick={toggle}
        title="Benachrichtigungen"
        type="button"
      >
        <Bell size={compact ? 20 : 18} />
        {!compact && <span className="text-sm">Benachrichtigungen</span>}
        {unread > 0 && (
          <span className="absolute top-0 left-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 z-50 flex max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800">
          <div className="flex items-center justify-between border-gray-200 border-b px-4 py-2 dark:border-slate-600">
            <span className="font-semibold text-gray-900 text-sm dark:text-white">
              Benachrichtigungen
            </span>
            <div className="flex gap-3 text-xs">
              {items.length > 0 && (
                <button
                  className="text-gray-500 underline"
                  onClick={clear}
                  type="button"
                >
                  Leeren
                </button>
              )}
              <button
                className="text-gray-500 underline"
                onClick={toggle}
                type="button"
              >
                Schließen
              </button>
            </div>
          </div>
          <div className="space-y-2 overflow-y-auto p-3">
            {items.length === 0 && (
              <p className="text-gray-500 text-sm">Keine Meldungen.</p>
            )}
            {items.map((n) => (
              <div
                className={clsx(
                  "rounded-lg border p-2 text-sm",
                  KIND_STYLE[n.kind]
                )}
                key={n.id}
              >
                <p className="break-words">{n.message}</p>
                <p className="mt-1 text-[11px] opacity-60">
                  {formatTime(n.time)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
