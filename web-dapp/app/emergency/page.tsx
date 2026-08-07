"use client";

import Link from "next/link";
import { ShieldAlert, PlusCircle, ArrowLeft, Layers, AlertTriangle } from "lucide-react";
import { CitizenEmergencyFeed } from "@/components/CitizenEmergencyFeed";

export default function EmergencyPage() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16 pt-4 md:pt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-start">
        
        {/* LEFT MAIN CONTENT */}
        <div className="w-full flex flex-col">
          
          {/* HERO BANNER */}
          <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-[#E11D48] to-[#9F1239] p-8 md:p-10 text-white relative mb-10 shadow-sm flex flex-col justify-center">
            {/* Aesthetic star/blur behind */}
            <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
              <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 0L105 85L200 100L105 115L100 200L95 115L0 100L95 85L100 0Z" fill="white" />
              </svg>
            </div>
            
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-rose-200">Priority Civic Channel</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
              Instant Authority Action & Accountability
            </h1>
            <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
               Emergency reports bypass community validation for immediate local authority dispatch and rapid resolution.
            </p>
            
            <div className="flex gap-4">
              <Link href="/report">
                <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-full transition-all shadow-sm flex items-center gap-3 text-sm">
                  Report Emergency
                  <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs">→</span>
                </button>
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Emergency Alerts Hub</h2>
          </div>

          {/* Emergency Reports Feed Component */}
          <CitizenEmergencyFeed />
        </div>
      </div>
    </div>
  );
}
