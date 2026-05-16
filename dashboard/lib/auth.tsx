"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { authApi, type AuthUser } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

const PUBLIC_PATHS = ["/login", "/register"];
const NO_AUTH_REDIRECT_PATHS = ["/login", "/register", "/landing"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const checkedRef = useRef(false);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setUser(null);
    router.push("/login");
  }, [router]);

  const login = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem("auth_token", token);
    setUser(authUser);
    router.push("/");
  }, [router]);

  const updateUser = useCallback((authUser: AuthUser) => {
    setUser(authUser);
  }, []);

  // Check auth once on mount
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then((resp: any) => {
        const u = resp.user ?? resp;
        setUser(u);
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle redirects ONLY after loading is done
  useEffect(() => {
    if (loading) return;

    const needsAuth = !NO_AUTH_REDIRECT_PATHS.includes(pathname) && !pathname.startsWith("/landing");
    const isAuthPage = PUBLIC_PATHS.includes(pathname);

    if (!user && needsAuth) {
      router.replace("/login");
    } else if (user && isAuthPage) {
      router.replace("/");
    }
  }, [loading, user, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
