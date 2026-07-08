import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CreditCard,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import Logo from "./Logo";
import NotificationsBell from "./NotificationsBell";

// the shell around every logged-in page: sidebar on desktop,
// slide-out menu on mobile, top bar with notifications + theme toggle
export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/accounts", label: "Accounts", icon: Wallet },
    { href: "/payments", label: "Payments", icon: ArrowLeftRight },
    { href: "/cards", label: "Cards", icon: CreditCard },
  ];

  // admins get one extra link
  if (user?.role === "ADMIN") {
    links.push({ href: "/admin", label: "Admin", icon: ShieldCheck });
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = router.pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-brand-600 text-white"
                : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/80 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80">
        <div className="flex items-center justify-between px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost !px-2 lg:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <Menu size={20} />
            </button>
            <Logo href="/dashboard" />
          </div>

          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="btn-ghost !px-2.5" aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NotificationsBell />
            <div className="mx-2 hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{user?.fullName}</p>
              <p className="text-xs text-ink-400">{user?.customerId}</p>
            </div>
            <button onClick={logout} className="btn-ghost !px-2.5" aria-label="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* sidebar - fixed on desktop, dropdown panel on mobile */}
        <aside
          className={`${
            menuOpen ? "block" : "hidden"
          } absolute z-10 w-full border-b border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-950 lg:static lg:block lg:min-h-[calc(100vh-61px)] lg:w-60 lg:border-b-0 lg:border-r lg:p-6`}
        >
          {nav}
        </aside>

        <main className="w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
