"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Shield, User, LogOut, Settings } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useAdmin } from "@/context/AdminContext";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { NotificationBell } from "@/components/layout/NotificationBell";

export function TopAppBar({ className = "" }: { className?: string }) {
  const { wallet, logout: citizenLogout } = useCitizen();
  const { account, disconnectWallet } = useAdmin();
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
    <header className={`flex items-center justify-between px-4 md:px-8 py-3 bg-white shadow-sm border-b border-slate-100 z-50 ${className}`}>
      {/* Brand */}
      <Link href={isLoggedIn ? "/feed" : "/"} className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-blue-600" />
        <span className="font-bold text-xl text-blue-600 tracking-tight hidden md:inline-block">AURACHAIN</span>
      </Link>



      {/* Right Actions */}
      <div className="flex items-center gap-3 md:gap-5 text-slate-500">
        {isLoggedIn ? (
          <>
            {/* Live Notification Bell */}
            <NotificationBell />
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <Settings className="h-5 w-5" />
            </button>
            
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center justify-center rounded-full hover:ring-2 hover:ring-slate-200 transition-all ml-1"
              >
                <img 
                  src={wallet ? `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${encodeURIComponent(wallet.publicKey)}` : "/avatar_1.png"} 
                  alt="Profile" 
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 bg-blue-50" 
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-slate-50 mb-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {wallet ? "Citizen" : "Authority"}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {wallet ? "GovID Session" : (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "")}
                    </p>
                  </div>
                  <Link href={wallet ? "/profile" : (account ? "/admin" : "/")}>
                    <button 
                      onClick={() => setDropdownOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </button>
                  </Link>
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
            <button className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors">
              Login
            </button>
          </Link>
        )}
      </div>
    </header>
  );
}
