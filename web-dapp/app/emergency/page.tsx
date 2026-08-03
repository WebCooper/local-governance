"use client";

import Link from "next/link";
import { ShieldAlert, PlusCircle, ArrowLeft, Layers, AlertTriangle } from "lucide-react";
import { CitizenEmergencyFeed } from "@/components/CitizenEmergencyFeed";

export default function EmergencyPage() {
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-extrabold border border-red-200 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
              PRIORITY CIVIC CHANNEL
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
              Emergency Alerts Hub
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              High-priority citizen emergency reports registered on AuraChain. These urgent incidents bypass community validation for immediate local authority dispatch and rapid resolution.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/feed"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition shadow-sm"
            >
              <Layers className="w-4 h-4" />
              <span>Civic Reports</span>
            </Link>

            <Link
              href="/report"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Report Emergency</span>
            </Link>
          </div>
        </div>

        {/* Banner */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 rounded-2xl p-6 text-white shadow-md mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold">Instant Authority Action & Accountability</h3>
              <p className="text-xs text-white/90 max-w-xl leading-relaxed mt-0.5">
                Every emergency report is permanently hashed on-chain. Authorities receive instant notifications to start response work and upload verifiable cryptographic evidence upon completion.
              </p>
            </div>
          </div>
          <Link
            href="/report"
            className="px-5 py-2.5 bg-white text-red-700 hover:bg-red-50 rounded-xl text-xs font-extrabold shadow-sm transition shrink-0"
          >
            Create Alert Now
          </Link>
        </div>

        {/* Emergency Reports Feed Component */}
        <CitizenEmergencyFeed />
      </div>
    </div>
  );
}
