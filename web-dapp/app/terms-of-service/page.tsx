"use client";

import Link from "next/link";
import { ArrowLeft, AlertCircle, ShieldCheck, Scale } from "lucide-react";

export default function TermsOfServicePage() {
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
            Governance Agreement
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 py-10 space-y-8">
        
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/60 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
            <Scale className="h-4 w-4" /> Terms of Service v1.0
          </div>

          <h1 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
            Terms of Service &amp; Community Guidelines
          </h1>

          <p className="text-slate-600 text-base md:text-lg leading-relaxed">
            By accessing or submitting civic reports through AuraChain, you agree to adhere to these community guidelines and governance protocol rules.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-10 text-slate-700 text-sm md:text-base leading-relaxed">
          
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              1. Authentic Civic Reporting
            </h2>
            <p>
              Users must submit accurate, real-world community reports (such as damaged road infrastructure, broken streetlights, water supply leaks, or public safety hazards). Falsification of evidence or submitting offensive content is prohibited.
            </p>
          </section>

          <section className="space-y-4 pt-6 border-t border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              2. Emergency Reporting Penalty Policy (&quot;Skin in the Game&quot;)
            </h2>
            <p>
              Emergency alerts trigger direct sirens to municipal dispatchers. Submitting false emergency reports carries an automated <strong>30-day cryptographic penalty lock</strong> on your identity, restricting your ability to log further emergency calls.
            </p>
          </section>

          <section className="space-y-4 pt-6 border-t border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Scale className="h-5 w-5 text-blue-600" />
              3. Academic Research Prototype Notice
            </h2>
            <p>
              AuraChain is developed as an open-source undergraduate engineering research project at the Department of Electrical and Information Engineering, Faculty of Engineering, University of Ruhuna, under the supervision of Dr. Subodha Gunawardena.
            </p>
          </section>

        </div>

      </main>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-slate-200 bg-white text-xs text-slate-500 font-medium">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
            <span>© 2026 AuraChain • Terms of Service</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy-policy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link href="/whitepaper" className="hover:text-slate-900 transition-colors">Whitepaper</Link>
            <Link href="/contact" className="hover:text-slate-900 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
