"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/lib/auth";
import Sidebar from "./Sidebar";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

const BARE_PAGES = ["/landing"];
const AUTH_PAGES = ["/login", "/register"];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBare = BARE_PAGES.includes(pathname);
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (isBare) {
    // Landing page still needs Google sign-in if we add a CTA there later;
    // wrap it too so the provider context exists wherever it's mounted.
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        {children}
      </GoogleOAuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <AuthProvider>
      {isAuthPage ? (
        <div className="bg-background text-foreground">
          <div className="mesh-bg" />
          {children}
        </div>
      ) : (
        <div className="flex relative overflow-x-hidden bg-background text-foreground">
          <Sidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

          {/* Mobile top bar — only visible <md */}
          <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 px-4 flex items-center justify-between glass-topbar">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-foreground hover:bg-accent-soft transition-colors press"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/landing" className="text-[15px] font-semibold tracking-tight text-foreground">
              Splash <span className="text-muted-light font-normal">Accountability</span>
            </Link>
            <div className="w-10" />
          </div>

          <main className="flex-1 ml-0 md:ml-[260px] pt-20 md:pt-10 px-4 sm:px-6 md:px-10 pb-10 overflow-auto relative min-h-screen">
            <div className="mesh-bg" />
            {children}
          </main>
        </div>
      )}
    </AuthProvider>
    </GoogleOAuthProvider>
  );
}
