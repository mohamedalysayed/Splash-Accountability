"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { authApi, type AuthUser } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

const PUBLIC_PATHS = ["/login", "/register"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setUser(null);
    router.push("/login");
  }, [router]);

  const login = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem("auth_token", token);
    setUser(authUser);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) {
        router.push("/login");
      }
      return;
    }

    authApi
      .me()
      .then((u) => {
        setUser(u);
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        setLoading(false);
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.push("/login");
        }
      });
  }, [pathname, router]);

  // Redirect away from auth pages if already logged in
  useEffect(() => {
    if (!loading && user && PUBLIC_PATHS.includes(pathname)) {
      router.push("/");
    }
  }, [loading, user, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
