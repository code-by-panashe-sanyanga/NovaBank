import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/router";
import api from "../services/api";

interface User {
  id: number;
  customerId?: string;
  fullName: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

// context so any component can ask "who is logged in?" without prop drilling
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // on first load, if there's a token in localStorage ask the API who we are.
  // this is what keeps you logged in after a page refresh
  useEffect(() => {
    const token = localStorage.getItem("novabank_token");
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem("novabank_token"))
      .finally(() => setLoading(false));
  }, []);

  function login(token: string, newUser: User) {
    localStorage.setItem("novabank_token", token);
    setUser(newUser);
  }

  function logout() {
    // fire and forget - we don't need to wait for the audit log
    api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("novabank_token");
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
