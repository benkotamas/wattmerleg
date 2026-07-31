"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Gauge, History, PlusCircle, Settings } from "lucide-react";

const links = [
  { href: "/", label: "Áttekintés", icon: Gauge },
  { href: "/uj-meres", label: "Új mérés", icon: PlusCircle },
  { href: "/elozmenyek", label: "Előzmények", icon: History },
  { href: "/statisztika", label: "Statisztika", icon: BarChart3 },
  { href: "/beallitasok", label: "Beállítások", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto min-h-screen max-w-6xl pb-24 md:pb-8">
      <header className="flex items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-700 text-xl font-black text-white">W</span>
          <div><p className="text-lg font-black tracking-tight">Wattmérleg</p><p className="text-xs text-slate-500">Otthoni energianapló</p></div>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className={`rounded-xl px-3 py-2 text-sm font-semibold ${pathname === href ? "bg-emerald-100 text-emerald-800" : "text-slate-600 hover:bg-white"}`}>{label}</Link>
          ))}
        </nav>
      </header>
      <main className="px-4 md:px-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl justify-around border-t border-slate-200 bg-white/95 px-1 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] font-bold ${pathname === href ? "text-emerald-700" : "text-slate-500"}`}>
            <span className={href === "/uj-meres" ? "-mt-5 grid size-11 place-items-center rounded-full bg-emerald-700 text-white shadow-lg ring-4 ring-white" : "grid size-6 place-items-center"}><Icon size={href === "/uj-meres" ? 24 : 21}/></span><span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
