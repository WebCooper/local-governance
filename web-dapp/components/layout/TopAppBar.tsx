"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Shield, User, LogOut, Bell, Settings, Search } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useAdmin } from "@/context/AdminContext";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export function TopAppBar({ className = "" }: { className?: string }) {
  const { wallet, logout: citizenLogout } = useCitizen();
  const { account, disconnectWallet } = useAdmin();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      <Link href="/" className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-blue-600" />
        <span className="font-bold text-xl text-blue-600 tracking-tight hidden md:inline-block">AURACHAIN</span>
      </Link>

      {/* Desktop Search Bar (Centered) */}
      <div className="hidden md:flex flex-1 max-w-md relative mx-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search proposals, reports..." 
          className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" 
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3 md:gap-5 text-slate-500">
        {isLoggedIn ? (
          <>
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <Settings className="h-5 w-5" />
            </button>
            
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center justify-center rounded-full hover:ring-2 hover:ring-slate-200 transition-all ml-1"
              >
                <img src="/avatar_1.png" alt="Profile" className="w-9 h-9 rounded-full object-cover border border-slate-200" />
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
