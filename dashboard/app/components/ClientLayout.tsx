"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth";
import Sidebar from "./Sidebar";

const BARE_PAGES = ["/landing"];
const AUTH_PAGES = ["/login", "/register"];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBare = BARE_PAGES.includes(pathname);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      {isAuthPage ? (
        <div className="bg-background text-foreground">
          <div className="mesh-bg" />
          {children}
        </div>
      ) : (
        <div className="flex relative overflow-x-hidden bg-background text-foreground">
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
