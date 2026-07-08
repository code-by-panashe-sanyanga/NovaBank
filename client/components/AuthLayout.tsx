import { ReactNode } from "react";
import Logo from "./Logo";

// shared frame for login / register / password pages - form on the left,
// brand panel on the right (hidden on mobile)
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <Logo />
          <h1 className="mt-10 font-display text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>

      {/* decorative side panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-ink-950 via-brand-950 to-brand-800 lg:block lg:w-1/2">
        <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute bottom-1/4 right-0 h-96 w-96 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center px-16 text-white">
          <p className="font-display text-4xl font-bold leading-snug">
            Banking that stays
            <br />
            out of your way.
          </p>
          <p className="mt-4 max-w-md text-brand-100/70">
            Track your money, move it in seconds and freeze your card the
            moment something looks off. No queues, no paperwork.
          </p>
          <div className="mt-10 flex gap-8 text-sm text-brand-100/60">
            <div>
              <p className="font-display text-2xl font-bold text-white">2 min</p>
              <p>to open an account</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-white">£0</p>
              <p>monthly fees</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-white">24/7</p>
              <p>instant transfers</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
