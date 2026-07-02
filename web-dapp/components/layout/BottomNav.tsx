"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, PlusCircle, User, Bell, BarChart2 } from "lucide-react";

export function BottomNav({ className = "", isSidebar = false }: { className?: string; isSidebar?: boolean }) {
  const pathname = usePathname();

  const navItems = [
    { label: "Feed", href: "/feed", icon: Layers },
    { label: isSidebar ? "Reports" : "Report", href: "/report", icon: isSidebar ? BarChart2 : PlusCircle },
    { label: "Profile", href: "/profile", icon: User },
    { label: "Notifications", href: "#", icon: Bell },
  ];

  if (isSidebar) {
    return (
      <nav className={`flex flex-col gap-2 px-4 ${className}`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${
                isActive ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe z-50 ${className}`}>
      <div className="flex items-center justify-around p-3">
        {navItems.map((item) => {
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
              <Icon className="h-6 w-6" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
