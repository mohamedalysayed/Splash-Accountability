"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const nav = [
  { href: "/", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/weekly", label: "Weekly", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { href: "/goals", label: "Goals", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/trends", label: "Trends", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initial = user?.name?.charAt(0)?.toUpperCase() || "?";

  return (
    <aside className="fixed left-0 top-0 h-screen w-[260px] flex flex-col z-50 glass-sidebar">
      {/* Logo */}
      <div className="px-7 py-7">
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Splash <span className="text-muted-light font-normal">Accountability</span>
        </h1>
        <p className="text-[11px] text-muted-light mt-1 tracking-wide uppercase">
          Daily discipline tracker
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 mt-2 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-medium transition-all duration-300 press ${
                active
                  ? "text-accent bg-accent-soft shadow-sm glass-highlight"
                  : "text-muted hover:text-foreground hover:bg-accent-soft/50"
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${
                active
                  ? "bg-accent text-white shadow-sm"
                  : "bg-transparent group-hover:bg-accent-soft"
              }`}>
                <svg
                  className={`w-[16px] h-[16px] flex-shrink-0 transition-all duration-300 ${
                    active ? "text-white" : "text-current"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 pb-5">
        <div className="card p-4">
          {user && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-2xl bg-accent/10 text-accent flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-[11px] text-muted-light truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 text-[12px] text-muted hover:text-danger transition-all duration-300 w-full font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
