"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { User, LogOut, LayoutDashboard, ShieldCheck, Search } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useAdmin } from "@/context/AdminContext";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { NotificationBell } from "@/components/layout/NotificationBell";

export function TopAppBar({ className = "" }: { className?: string }) {
  const { wallet, logout: citizenLogout } = useCitizen();
  const { account, disconnectWallet, isSuperAdmin } = useAdmin();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarStyle, setAvatarStyle] = useState<string>("bottts");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateStyle = () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("ac_avatar_style");
        if (saved) setAvatarStyle(saved);
      }
    };
    updateStyle();
    window.addEventListener("avatar_updated", updateStyle);
    return () => window.removeEventListener("avatar_updated", updateStyle);
  }, []);

  const handleLogout = () => {
    if (wallet) {
      citizenLogout();
      toast.success("Logged out successfully");
    }
    if (account && disconnectWallet) {
      disconnectWallet();
      toast.success("Disconnected wallet");
    }
    setDropdownOpen(false);
    router.push("/login");
  };

  const isLoggedIn = !!wallet || !!account;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className={`flex items-center justify-between px-6 py-4 bg-white z-50 ${className}`}>
      
      {/* Search Bar */}
      <div className="flex-1 max-w-xl relative hidden md:block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input 
          type="text"
          placeholder="Search civic reports, polls, or users..."
          className="w-full bg-slate-50 border border-slate-100 rounded-full py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4 ml-auto">
        {isLoggedIn ? (
          <>
            {/* Live Notification Bell */}
            <NotificationBell />
            
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-3 hover:bg-slate-50 p-1.5 pr-3 rounded-full transition-all border border-transparent hover:border-slate-100"
              >
                <img 
                  src={wallet ? `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${encodeURIComponent(wallet.publicKey)}` : "/avatar_1.png"} 
                  alt="Profile" 
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 bg-blue-50" 
                />
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-bold text-slate-800 leading-tight">
                    {wallet ? "Citizen" : (isSuperAdmin ? "Super Admin" : "Authority")}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {wallet ? "GovID Verified" : (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "")}
                  </span>
                </div>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {wallet ? (
                    <Link href="/profile">
                      <button 
                        onClick={() => setDropdownOpen(false)}
                        className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                      >
                        <User className="h-4 w-4" />
                        Profile
                      </button>
                    </Link>
                  ) : account ? (
                    <>
                      <Link href="/admin">
                        <button 
                          onClick={() => setDropdownOpen(false)}
                          className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                        >
                          <LayoutDashboard className="h-4 w-4 text-blue-600" />
                          Dashboard
                        </button>
                      </Link>
                      {isSuperAdmin && (
                        <Link href="/super-admin">
                          <button 
                            onClick={() => setDropdownOpen(false)}
                            className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                          >
                            <ShieldCheck className="h-4 w-4 text-blue-600" />
                            Super Admin
                          </button>
                        </Link>
                      )}
                    </>
                  ) : null}
                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link href="/login">
            <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-sm transition-colors">
              Login
            </button>
          </Link>
        )}
      </div>
    </header>
  );
}
