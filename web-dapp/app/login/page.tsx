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
    if (account) {
      if (isAuthority) {
        toast.success("Admin access granted!");
        router.push("/admin");
      } else if (isSuperAdmin) {
        toast.success("Super Admin access granted!");
        router.push("/super-admin");
      } else {
        toast.error("Connected wallet is not registered as an Authority or Super Admin.");
      }
    }
  }, [account, isAuthority, isSuperAdmin, router]);

  useEffect(() => {
    if (wallet) {
      router.push("/feed");
    }
  }, [wallet, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4 py-8">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 w-full max-w-md text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
          Authenticate<br />Securely
        </h1>
        
        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
          <button 
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'citizen' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab("citizen")}
          >
            Citizen
          </button>
          <button 
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'admin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab("admin")}
          >
            Authority
          </button>
        </div>

        {activeTab === "citizen" && (
          <div>
            <p className="text-slate-500 mb-6 px-2 text-sm">
              No wallet needed. Verify your identity privately using GovID Simulator & ZKP.
            </p>

            {!isGenerating ? (
              <form onSubmit={handleCitizenLogin} className="space-y-4">
                <input 
                  type="text"
                  placeholder="GovID (e.g. 199812345678)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-sm"
                  value={govId}
                  onChange={(e) => setGovId(e.target.value)}
                />
                <input 
                  type="password"
                  placeholder="Password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-sm mb-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="submit"
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Shield className="h-5 w-5" />
                  <span>Anonymous Login</span>
                </button>
              </form>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center border border-slate-100 mt-4 animate-in fade-in zoom-in duration-300">
                <div className="relative flex items-center justify-center mb-4">
                  <div className="absolute w-16 h-16 border-4 border-blue-100 rounded-full animate-spin border-t-blue-600" />
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                    <Lock className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">Proof Generating...</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                  <p className="text-xs text-slate-500">Zero-Knowledge Protocol active</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "admin" && (
          <div>
            <p className="text-slate-500 mb-6 px-2 text-sm">
              Connect your Web3 wallet to access the on-chain administration portals.
            </p>
            <button
              onClick={handleAdminLogin}
              disabled={isConnecting}
              className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <Wallet className="h-5 w-5" />
              <span>{isConnecting ? "Connecting..." : "Connect MetaMask"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center gap-4 text-xs font-medium text-slate-400">
        <div className="flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" />
          <span>Institutional Grade</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-slate-300" />
        <div className="flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" />
          <span>Privacy Assured</span>
        </div>
      </div>
    </div>
  );
}
