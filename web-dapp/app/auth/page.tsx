"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock } from "lucide-react";
import { deriveCitizenWallet } from "@/lib/walletUtils";
import { useCitizen } from "@/context/CitizenContext";

export default function AuthPage() {
  const router = useRouter();
  const { login } = useCitizen();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [govId, setGovId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!govId || !password) {
      setError("GovID and Password are required");
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
      
      // Simulate slight delay for "Proof Generating" animation effect
      redirectTimeoutRef.current = setTimeout(() => {
        router.push("/feed");
      }, 1500);

    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4 py-8">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 w-full max-w-md text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
          Authenticate<br />Securely
        </h1>
        <p className="text-slate-500 mb-6 px-2 text-sm">
          No wallet needed. Verify your identity privately using GovID Simulator & ZKP.
        </p>

        {!isGenerating ? (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}
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
