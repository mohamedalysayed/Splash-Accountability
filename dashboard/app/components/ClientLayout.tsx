"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth";
import Sidebar from "./Sidebar";

const AUTH_PAGES = ["/login", "/register"];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.includes(pathname);

  return (
    <AuthProvider>
      {isAuthPage ? (
        <>{children}</>
      ) : (
        <div className="flex relative overflow-x-hidden">
          <Sidebar />
          <main className="flex-1 ml-[260px] p-10 overflow-auto relative min-h-screen">
            <div className="mesh-bg" />
            {children}
          </main>
        </div>
      )}
    </AuthProvider>
  );
}
