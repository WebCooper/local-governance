"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, Wallet } from "lucide-react";
import { deriveCitizenWallet } from "@/lib/walletUtils";
import { useCitizen } from "@/context/CitizenContext";
import { useAdmin } from "@/context/AdminContext";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const { login, wallet } = useCitizen();
  const { connectWallet, isConnecting, account, isSuperAdmin, isAuthority } = useAdmin();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [activeTab, setActiveTab] = useState<"citizen" | "admin">("citizen");
  
  // Citizen form state
  const [isGenerating, setIsGenerating] = useState(false);
  const [govId, setGovId] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const handleCitizenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!govId || !password) {
      toast.error("GovID and Password are required");
      return;
    }

    setIsGenerating(true);
    
    try {
      const response = await fetch("https://zkp.internalbuildtools.online/api/govid/verify-citizen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ govId, password }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Authentication failed");
      }

      if (!Array.isArray(data.ticketBatch) || data.ticketBatch.length === 0) {
        throw new Error("Failed to generate ZKP tickets. Please try again.");
      }

      const citizenWallet = deriveCitizenWallet(data.citizenSeed);
      login(citizenWallet, data.ticketBatch);
      toast.success("Successfully authenticated via ZKP!");
      
      redirectTimeoutRef.current = setTimeout(() => {
        router.push("/feed");
      }, 1500);

    } catch (err: any) {
      toast.error(err.message);
      setIsGenerating(false);
    }
  };

  const handleAdminLogin = async () => {
    await connectWallet();
  };

  useEffect(() => {
    if (account && !isConnecting) {
      if (isSuperAdmin) {
        toast.success("Super Admin access granted!");
        router.push("/super-admin");
      } else if (isAuthority) {
        toast.success("Admin access granted!");
        router.push("/admin");
      } else {
        toast.error("Connected wallet is not registered as an Authority or Super Admin.");
      }
    }
  }, [account, isAuthority, isSuperAdmin, isConnecting, router]);

  useEffect(() => {
    if (wallet) {
      router.push("/feed");
    }
  }, [wallet, router]);

  return (
    <div className="flex flex-col w-full min-h-screen bg-[#F9FAFB] pb-20">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex-1 flex flex-col items-center">
        
        {/* HERO BANNER */}
        <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-700 p-8 md:p-10 text-white relative mb-10 shadow-sm flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
            <svg className="animate-spin-in" width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0L105 85L200 100L105 115L100 200L95 115L0 100L95 85L100 0Z" fill="white" />
            </svg>
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <span className="text-blue-200 font-bold tracking-wider text-xs uppercase mb-3 block">Welcome to AuraChain</span>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">Authenticate Securely</h1>
            <p className="text-blue-100 text-base md:text-lg max-w-2xl leading-relaxed">
              Connect your civic identity or administrative wallet to participate in decentralized local governance.
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-[24px] shadow-sm hover:shadow-md transition-shadow border border-slate-100/60 p-8 w-full max-w-md text-center">
          {/* Tabs */}
          <div className="flex bg-slate-50 rounded-[12px] p-1.5 mb-8 border border-slate-100">
            <button 
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'citizen' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab("citizen")}
            >
              Citizen
            </button>
            <button 
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'admin' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab("admin")}
            >
              Authority
            </button>
          </div>

          {activeTab === "citizen" && (
            <div>
              <p className="text-slate-500 mb-6 px-2 text-sm font-medium">
                No wallet needed. Verify your identity privately using GovID Simulator & ZKP.
              </p>

              {!isGenerating ? (
                <form onSubmit={handleCitizenLogin} className="space-y-4">
                  <input 
                    type="text"
                    placeholder="GovID (e.g. 199812345678)"
                    className="w-full rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-sm font-medium"
                    value={govId}
                    onChange={(e) => setGovId(e.target.value)}
                  />
                  <input 
                    type="password"
                    placeholder="Password"
                    className="w-full rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-sm font-medium mb-2"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-[16px] shadow-sm shadow-blue-600/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <Shield className="h-5 w-5" />
                    <span>Anonymous Login</span>
                  </button>
                </form>
              ) : (
                <div className="bg-slate-50 rounded-[20px] p-8 flex flex-col items-center justify-center border border-slate-100 mt-4 animate-in fade-in zoom-in duration-300">
                  <div className="relative flex items-center justify-center mb-6">
                    <div className="absolute w-20 h-20 border-4 border-blue-100 rounded-full animate-spin border-t-blue-600" />
                    <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                      <Lock className="h-6 w-6" />
                    </div>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mb-1">Generating ZK Proof</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Protocol Active</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "admin" && (
            <div>
              <p className="text-slate-500 mb-8 px-2 text-sm font-medium">
                Connect your Web3 wallet to access the on-chain administration portals.
              </p>
              <button
                onClick={handleAdminLogin}
                disabled={isConnecting}
                className="w-full py-4 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-[16px] shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Wallet className="h-5 w-5" />
                <span>{isConnecting ? "Connecting..." : "Connect MetaMask"}</span>
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span>Institutional Grade</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <div className="flex items-center gap-1.5">
            <Lock className="h-4 w-4" />
            <span>Privacy Assured</span>
          </div>
        </div>
      </div>
    </div>
  );
}
