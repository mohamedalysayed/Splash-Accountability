"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Avatar from "./Avatar";

const nav = [
  { href: "/", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/weekly", label: "Weekly", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { href: "/goals", label: "Goals", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/trends", label: "Trends", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
  { href: "/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

const ADMIN_ITEM = {
  href: "/admin",
  label: "Admin",
  icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = user?.is_admin ? [...nav, ADMIN_ITEM] : nav;

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={`fixed left-0 top-0 h-screen w-[260px] flex flex-col z-50 glass-sidebar transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo — links to landing */}
        <Link
          href="/landing"
          className="px-7 py-7 block transition-opacity hover:opacity-70"
          onClick={onClose}
        >
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Splash <span className="text-muted-light font-normal">Accountability</span>
          </h1>
          <p className="text-[11px] text-muted-light mt-1 tracking-wide uppercase">
            Daily discipline tracker
          </p>
        </Link>

        {/* Nav */}
        <nav className="flex-1 px-4 mt-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
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
              <Link
                href="/profile"
                onClick={onClose}
                className="flex items-center gap-3 mb-3 group"
              >
                <Avatar src={user.avatar_url} name={user.name} nickname={user.nickname} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                    {user.nickname || user.name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] text-muted-light truncate">{user.email}</p>
                    {user.tier && user.tier !== "free" && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[1px] rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white">
                        {user.tier === "lifetime" ? "∞" : "Pro"}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
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
    </>
  );
}
