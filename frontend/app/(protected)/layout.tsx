"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { isAuthenticated, clearToken, getToken, decodeToken } from "@/lib/auth";
import {
  LayoutDashboard, Server, Briefcase, Activity,
  LogOut, Settings, ChevronRight, Cpu,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/jobs",      icon: Briefcase,       label: "Jobs" },
  { href: "/machines",  icon: Server,          label: "Machines" },
  { href: "/monitor",   icon: Activity,        label: "Monitor" },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking]   = useState(true);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      const token = getToken();
      if (token) {
        const payload = decodeToken(token) as any;
        setUserEmail(payload?.sub ?? "");
      }
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080810]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#080810] text-white overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.05] bg-[#0a0a14] relative">

        {/* top glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

        {/* Logo */}
        <div className="px-5 py-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Cpu size={16} className="text-white" />
            </div>
            <span className="font-bold text-white tracking-tight">
              Distributed<span className="text-violet-400">R</span>
            </span>
          </Link>
        </div>

        {/* Nav label */}
        <div className="px-5 mb-2">
          <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
            Navigation
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}>
                <motion.div
                  whileHover={{ x: 3 }}
                  transition={{ duration: 0.15 }}
                  className={`
                    relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all duration-200 group
                    ${active
                      ? "bg-violet-600/15 text-violet-300 border border-violet-500/20"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"}
                  `}
                >
                  {active && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-500 rounded-r-full"
                    />
                  )}
                  <Icon size={16} className={active ? "text-violet-400" : "text-slate-600 group-hover:text-slate-400"} />
                  {label}
                  {active && <ChevronRight size={12} className="ml-auto text-violet-500" />}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom user section */}
        <div className="p-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.03] transition-colors group cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
              {userEmail?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-300 font-medium truncate">{userEmail.split("@")[0]}</div>
              <div className="text-[10px] text-slate-600">Student</div>
            </div>
            <button
              onClick={() => { clearToken(); router.replace("/login"); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              title="Sign out"
            >
              <LogOut size={14} className="text-slate-600 hover:text-red-400 transition-colors" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
