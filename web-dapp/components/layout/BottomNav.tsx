"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCitizen } from "@/context/CitizenContext";
import { Layers, PlusCircle, User, Bell, BarChart2, Vote, ShieldCheck, LayoutDashboard } from "lucide-react";

export function BottomNav({ className = "", isSidebar = false }: { className?: string; isSidebar?: boolean }) {
  const pathname = usePathname();
  const { wallet } = useCitizen();

  const citizenItems = [
    { label: "Feed", href: "/feed", icon: Layers },
    { label: "Polls", href: "/polls", icon: Vote },
    { label: isSidebar ? "Reports" : "Report", href: "/report", icon: isSidebar ? BarChart2 : PlusCircle },
    { label: "Profile", href: "/profile", icon: User },
    { label: "Notifications", href: "#", icon: Bell },
  ];

  const authorityItems = [
    { label: "On-Chain Admin", href: "/admin", icon: ShieldCheck },
    { label: "Demo Dashboard", href: "/dashboard", icon: LayoutDashboard },
  ];

  if (isSidebar) {
    return (
      <nav className={`flex flex-col gap-6 px-4 ${className}`}>
        <div>
          <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Citizen Space</p>
          <div className="flex flex-col gap-1">
            {citizenItems.map((item) => {
              const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 ${
                    isActive ? "bg-blue-50 text-blue-600 font-semibold shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {!wallet && (
          <div>
            <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Authority Portal</p>
            <div className="flex flex-col gap-1">
              {authorityItems.map((item) => {
                const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 ${
                      isActive ? "bg-blue-50 text-blue-600 font-semibold shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe z-50 ${className}`}>
      <div className="flex items-center justify-around p-3">
        {citizenItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center gap-1 min-w-[64px] transition-colors ${
                isActive ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
