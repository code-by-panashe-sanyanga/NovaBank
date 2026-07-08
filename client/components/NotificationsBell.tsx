import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import api from "../services/api";
import { formatDateTime } from "../services/format";

interface Notification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// bell icon in the top bar with a dropdown of recent notifications.
// opening the dropdown marks everything as read
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get("/notifications")
      .then((res) => {
        setNotifications(res.data.notifications);
        setUnread(res.data.unreadCount);
      })
      .catch(() => {}); // not the end of the world if the bell fails
  }, []);

  // close the dropdown when you click anywhere else on the page
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      api.patch("/notifications/read-all").catch(() => {});
      setUnread(0);
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={toggleOpen}
        className="btn-ghost relative !px-2.5"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-80 overflow-hidden">
          <p className="border-b border-ink-100 px-4 py-3 text-sm font-semibold dark:border-ink-800">
            Notifications
          </p>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-400">
                Nothing here yet
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="border-b border-ink-50 px-4 py-3 last:border-0 dark:border-ink-800/50"
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{n.message}</p>
                  <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
