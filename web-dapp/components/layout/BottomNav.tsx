"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCitizen } from "@/context/CitizenContext";
import { useAdmin } from "@/context/AdminContext";
import { Layers, PlusCircle, User, Bell, BarChart2, Vote, ShieldCheck, LayoutDashboard, ShieldAlert, MoreHorizontal, X, FileText, Users } from "lucide-react";

export function BottomNav({ className = "", isSidebar = false }: { className?: string; isSidebar?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get("tab") || "reports";
  const { wallet } = useCitizen();
  const { account, isAuthority, isSuperAdmin } = useAdmin();

  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const citizenItems = [
    { label: "Feed", href: "/feed", icon: Layers },
    { label: "Emergency", href: "/emergency", icon: ShieldAlert },
    { label: "Polls", href: "/polls", icon: Vote },
    { label: isSidebar ? "Reports" : "Report", href: "/report", icon: isSidebar ? BarChart2 : PlusCircle },
    ...(wallet ? [{ label: "Profile", href: "/profile", icon: User }] : []),
    { label: "Notifications", href: "/notifications", icon: Bell },
  ];

  const ENABLE_WORKFORCE_TRACKING = process.env.NEXT_PUBLIC_ENABLE_WORKFORCE_TRACKING === "true";

  const authorityItems = [
    { label: "Dashboard", href: "/admin?tab=dashboard", icon: LayoutDashboard },
    { label: "Civic Reports", href: "/admin?tab=reports", icon: FileText },
    { label: "Emergency", href: "/admin?tab=emergency", icon: ShieldAlert },
    { label: "Opinion Polls", href: "/admin?tab=polls", icon: BarChart2 },
    ...(ENABLE_WORKFORCE_TRACKING ? [{ label: "Workforce", href: "/admin?tab=workforce", icon: Users }] : []),
  ];

  const isAdminOrSuper = account && (isAuthority || isSuperAdmin);

  if (isSidebar) {
    return (
      <nav className={`flex flex-col gap-6 px-4 ${className}`}>
        {/* Citizen Space - Visible only for non-admins */}
        {!isAdminOrSuper && (
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
                      isActive ? "bg-slate-900 text-white font-semibold shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
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

        {/* Authority Portal - Visible only if logged in as Admin via MetaMask */}
        {isAdminOrSuper && (
          <div>
            <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Authority Portal</p>
            <div className="flex flex-col gap-1">
              {authorityItems.map((item) => {
                const isActive = pathname === item.href || (pathname === "/admin" && pathname + "?tab=" + currentTab === item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 ${
                      isActive ? "bg-slate-900 text-white font-semibold shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm">{item.label}</span>
                  </Link>
                );
              })}
              
              {/* Super Admin Dashboard Link */}
              {isSuperAdmin && (
                <Link
                  href="/super-admin"
                  className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 ${
                    pathname === "/super-admin" ? "bg-blue-50 text-blue-600 font-semibold shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-sm">Super Admin</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>
    );
  }

  const allItems = isAdminOrSuper
    ? [
        ...authorityItems,
        ...(isSuperAdmin ? [{ label: "Super", href: "/super-admin", icon: ShieldCheck }] : []),
      ]
    : citizenItems;

  const maxVisible = 4;
  const visibleItems = allItems.length > 5 ? allItems.slice(0, maxVisible) : allItems;
  const hiddenItems = allItems.length > 5 ? allItems.slice(maxVisible) : [];

  return (
    <>
      {/* Dimmed Overlay for Mobile Menu */}
      {isMoreOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[9998]"
          onClick={() => setIsMoreOpen(false)}
        />
      )}

      {/* Slide-up More Menu */}
      {isMoreOpen && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0)+64px)] left-0 right-0 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgb(0,0,0,0.1)] border-t border-slate-100 z-[9999] p-4 pb-6 animate-in slide-in-from-bottom-8 duration-200">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-bold text-slate-900">More Options</h3>
            <button onClick={() => setIsMoreOpen(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {hiddenItems.map((item) => {
              const isActive = pathname === item.href || (pathname === "/admin" && pathname + "?tab=" + currentTab === item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMoreOpen(false)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-colors ${
                    isActive ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[10px] font-bold text-center leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe z-[9999] ${className}`}>
        <div className="flex items-center justify-around p-3">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || (pathname === "/admin" && pathname + "?tab=" + currentTab === item.href);
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
          
          {hiddenItems.length > 0 && (
            <button
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className={`flex flex-col items-center gap-1 min-w-[64px] transition-colors ${
                isMoreOpen ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
