"use client";

import Link from "next/link";
import { ArrowLeft, Shield, Lock, EyeOff, CheckCircle2 } from "lucide-react";

export default function PrivacyPolicyPage() {
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
            Zero-Knowledge Guarantees
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 py-10 space-y-8">
        
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/60 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
            <Shield className="h-4 w-4" /> Privacy-First Architecture
          </div>

          <h1 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
            Privacy Policy &amp; Anonymity Guarantees
          </h1>

          <p className="text-slate-600 text-base md:text-lg leading-relaxed">
            AuraChain is built from the ground up on Zero-Knowledge Proof (ZKP) principles. We believe citizens should never have to sacrifice their privacy or risk personal safety to participate in local e-governance.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-10 text-slate-700 text-sm md:text-base leading-relaxed">
          
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Lock className="h-5 w-5 text-blue-600" />
              1. Zero-Knowledge Citizen Authentication
            </h2>
            <p>
              When registering or logging into AuraChain, your citizen credentials remain on your device. The system uses single-use ZKP tickets containing cryptographic nullifier hashes. No wallet private keys, email addresses, names, or physical addresses are recorded on-chain or stored in our database.
            </p>
          </section>

          <section className="space-y-4 pt-6 border-t border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <EyeOff className="h-5 w-5 text-blue-600" />
              2. Automated 360° Face &amp; PII Blurring
            </h2>
            <p>
              Before any media evidence is uploaded to public IPFS decentralized storage, our AI Moderation Oracle scans the image using multi-cascade facial recognition (frontal, left profile, right profile, and angled head poses). Any detected human faces or license plates are automatically blurred on-server prior to pinning.
            </p>
          </section>

          <section className="space-y-4 pt-6 border-t border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              3. Gasless Relayer &amp; IP Protection
            </h2>
            <p>
              Citizens do not interact directly with RPC node endpoints. All transactions are relayed through an institutional backend relayer that sponsors gas fees and shields user IP addresses from network eavesdroppers.
            </p>
          </section>

        </div>

      </main>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-slate-200 bg-white text-xs text-slate-500 font-medium">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
            <span>© 2026 AuraChain • Privacy Policy</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/terms-of-service" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            <Link href="/whitepaper" className="hover:text-slate-900 transition-colors">Whitepaper</Link>
            <Link href="/contact" className="hover:text-slate-900 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
