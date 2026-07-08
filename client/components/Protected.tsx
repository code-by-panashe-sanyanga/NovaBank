import { ReactNode, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../hooks/useAuth";

// wraps any page that needs a login. while we're checking the token it
// shows a spinner, and if there's no user it bounces to /login
export default function Protected({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (adminOnly && user.role !== "ADMIN") {
      // logged in but not an admin - send them to their own dashboard
      router.replace("/dashboard");
    }
  }, [user, loading, adminOnly, router]);

  if (loading || !user || (adminOnly && user.role !== "ADMIN")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
