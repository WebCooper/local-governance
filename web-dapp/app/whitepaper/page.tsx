"use client";

import Link from "next/link";
import { ArrowLeft, Shield, Lock, Landmark, Cpu, Database, CheckCircle2, FileText } from "lucide-react";

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 py-6 px-4 md:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <span className="px-3 py-1 bg-blue-50 text-blue-700 font-extrabold text-xs rounded-full uppercase tracking-wider">
            Technical Specification
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 py-10 space-y-10">
        
        {/* Title Header */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/60 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
            <FileText className="h-4 w-4" /> Whitepaper v1.0
          </div>
          
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
            AuraChain: Decentralized Privacy-Preserving Local Governance Protocol
          </h1>

          <p className="text-slate-600 text-base md:text-lg leading-relaxed">
            A technical framework combining Zero-Knowledge Proofs (ZKP), permissioned Ethereum Virtual Machine (EVM) smart contracts, AI Oracle content moderation, and IPFS storage to modernize civic reporting for municipal local governance.
          </p>

          <div className="flex flex-wrap items-center gap-6 border-t border-slate-100 pt-6 text-xs text-slate-500 font-medium">
            <div><strong className="text-slate-900 font-bold">Institution:</strong> University of Ruhuna</div>
            <div><strong className="text-slate-900 font-bold">Faculty:</strong> Faculty of Engineering (DEIE)</div>
            <div><strong className="text-slate-900 font-bold">Supervisor:</strong> Dr. Subodha Gunawardena</div>
          </div>
        </div>

        {/* Technical Sections */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-12 text-slate-700 leading-relaxed text-sm md:text-base">
          
          {/* Section 1: Executive Summary */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">1</span>
              Executive Summary &amp; Problem Statement
            </h2>
            <p>
              Local governments often struggle with inefficiencies in solving public issues. Traditional e-governance systems suffer from central single points of failure, lack of transparency, and vulnerability to citizen retaliation when reporting sensitive municipal problems.
            </p>
            <p>
              AuraChain establishes a <strong>decentralized, community-assisted reporting protocol</strong>. By using Zero-Knowledge Proofs for identity verification, citizens can submit issues and vote on community proposals without exposing their wallet address, IP, or personal data.
            </p>
          </section>

          {/* Section 2: Core Architecture */}
          <section className="space-y-6 pt-6 border-t border-slate-100">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">2</span>
              System Architecture &amp; Pipeline
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-blue-700 font-bold">
                  <Lock className="h-4 w-4" /> ZKP GovID Simulator &amp; Nullifier Salt
                </div>
                <p className="text-slate-600">
                  Issues single-use cryptographic ZKP tickets with deterministic domain salt nullifiers, preventing double-voting or duplicate submissions while keeping identity anonymous.
                </p>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-purple-700 font-bold">
                  <Cpu className="h-4 w-4" /> AI Oracle Content Moderation
                </div>
                <p className="text-slate-600">
                  Performs toxicity checks, duplicate detection, and 360° face-blurring on uploaded evidence images prior to IPFS storage.
                </p>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold">
                  <Database className="h-4 w-4" /> Off-Chain IPFS Storage &amp; Pinning
                </div>
                <p className="text-slate-600">
                  Stores report descriptions and evidence metadata on IPFS, pinning immutable CIDs on the Ethereum smart contract.
                </p>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-green-700 font-bold">
                  <Landmark className="h-4 w-4" /> EVM Smart Contract State Machine
                </div>
                <p className="text-slate-600">
                  Implements finite state machine logic for Report Triage, Democratic Community Voting, and Multi-Sig Authority assignment.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Finite State Machine */}
          <section className="space-y-4 pt-6 border-t border-slate-100">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">3</span>
              Democratic Voting &amp; Lifecycle FSM
            </h2>
            <p>
              Reports transition through well-defined on-chain states governed by community consensus and municipal action:
            </p>
            <ul className="space-y-2.5 text-sm pl-4">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Pending Validation (State 0):</strong> Community votes to confirm if a submitted report is genuine before local authorities receive it.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <span><strong>Open / In Progress (States 2 &amp; 3):</strong> Assigned municipal authorities claim the report and execute maintenance work.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                <span><strong>Pending Verification (State 5):</strong> Citizens vote to verify if the authority&apos;s submitted fix was completed accurately.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <span><strong>Rejection Review (State 4):</strong> If an authority rejects an issue, citizens can appeal to overturn the rejection on-chain.</span>
              </li>
            </ul>
          </section>

        </div>

      </main>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-slate-200 bg-white text-xs text-slate-500 font-medium">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
            <span>© 2026 AuraChain Protocol • Technical Specification</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy-policy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            <Link href="/contact" className="hover:text-slate-900 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
