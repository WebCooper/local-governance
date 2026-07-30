import Link from "next/link";
import { Shield, Lock, Landmark, Globe, Share2 } from "lucide-react";

export default function Home() {
  return (
    <>
      {/* Mobile View (Existing) */}
      <div className="flex md:hidden flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -z-10" />

        <div className="mb-12 relative flex items-center justify-center">
          <div className="absolute w-32 h-32 bg-blue-100 rounded-full animate-pulse" />
          <div className="absolute w-24 h-24 bg-blue-200 rounded-full" />
          <div className="relative w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <div className="w-8 h-8 rounded-full border-2 border-white/80" />
          </div>
        </div>

        <div className="text-center max-w-sm mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
            Your City, Your<br />Voice. Protected.
          </h1>
          <p className="text-slate-500">
            Secure, decentralized, and private civic engagement for everyone.
          </p>
        </div>

        <div className="flex flex-col items-center w-full max-w-xs gap-6">
          <Link href="/login" className="w-full">
            <button className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-colors text-center">
              Get Started
            </button>
          </Link>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
            <Shield className="h-3 w-3" />
            <span>Privacy-first with Zero-Knowledge Proofs</span>
          </div>
        </div>
      </div>

      {/* Desktop View (New) */}
      <div className="hidden md:flex flex-col w-full max-w-6xl mx-auto p-8 gap-16 pb-12">
        {/* Hero Section */}
        <div className="grid grid-cols-2 gap-12 items-center">
          {/* Left Hero */}
          <div className="flex flex-col items-start relative z-10">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -z-10" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/50 text-blue-700 rounded-full text-sm font-medium mb-6">
              <Shield className="h-4 w-4" />
              <span>SECURED BY ZK-PROOFS</span>
            </div>

            <h1 className="text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
              Your City, Your Voice.<br />
              <span className="text-blue-600">Protected.</span>
            </h1>

            <p className="text-slate-500 text-lg mb-8 max-w-md">
              Experience the future of decentralized governance. AuraChain combines institutional stability with sovereign identity to give you a true seat at the table.
            </p>

            <div className="flex items-center gap-4 mb-12">
              <Link href="/login">
                <button className="py-3 px-8 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full shadow-sm transition-colors">
                  Get Started
                </button>
              </Link>
              <button className="py-3 px-8 border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium rounded-full transition-colors">
                View Whitepaper
              </button>
            </div>

            <div className="flex items-center gap-12 border-t border-slate-200 pt-6">
              <div>
                <div className="text-2xl font-bold text-blue-600">12.4k</div>
                <div className="text-sm text-slate-500">Active Citizens</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">482</div>
                <div className="text-sm text-slate-500">Proposals Passed</div>
              </div>
            </div>
          </div>

          {/* Right Hero (Card) */}
          <div className="relative z-10 flex justify-end">
            <div className="absolute right-10 top-1/2 -translate-y-1/2 w-80 h-80 bg-blue-100/50 rounded-full blur-3xl -z-10" />

            <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 w-full max-w-md">
              <div className="flex justify-between items-start mb-6">
                <div className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full">Active Vote</div>
                <Shield className="h-8 w-8 text-blue-600" />
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-4">New Greenway Initiative</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                This proposal aims to create 15km of new pedestrian paths through the city center using sustainable materials.
              </p>

              <div className="mb-8">
                <div className="flex justify-between text-xs font-bold text-slate-900 mb-2">
                  <span>Consensus Progress</span>
                  <span>82%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-blue-600 w-[82%] rounded-full"></div>
                  <div className="h-full bg-slate-800 w-[18%]"></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-xs text-slate-500 font-medium mb-1">Trust Score</div>
                  <div className="text-blue-600 font-bold">99.9%</div>
                </div>
                <div className="border border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-xs text-slate-500 font-medium mb-1">ZK-Identity</div>
                  <div className="text-blue-600 font-bold">Verified</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Separator Text */}
        <div className="text-center text-sm font-medium text-slate-500 mt-8 mb-4">
          Institutional Stability Meets Digital Sovereignty
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-3 gap-6">
          {/* ZK Privacy Card (Col Span 2) */}
          <div className="col-span-2 bg-white rounded-3xl p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
                <Lock className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">Zero-Knowledge Privacy</h3>

              <div className="flex items-center justify-between gap-8">
                <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
                  Vote and participate in city governance without ever compromising your personal data. Our ZK-Proof infrastructure ensures that while your voice is counted, your identity remains completely anonymous.
                </p>
                <div className="w-28 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex flex-col items-center justify-center text-white p-3 shadow-md shrink-0">
                  <Shield className="h-6 w-6 text-white mb-1" />
                  <span className="text-[10px] font-bold tracking-widest uppercase text-blue-100">Zero Knowledge</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 mt-8">
              <div className="flex items-center gap-2 text-sm text-slate-900 font-medium">
                <Shield className="h-4 w-4 text-blue-600" />
                Anonymous Verification &amp; Cryptographic Identity
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-900 font-medium">
                <Shield className="h-4 w-4 text-blue-600" />
                Verifiable Multi-Party On-Chain Tallying
              </div>
            </div>
          </div>

          {/* Absolute Transparency Card */}
          <div className="bg-white rounded-3xl p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-6">
                <Landmark className="h-6 w-6 text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">Absolute Transparency</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Every report resolution and governance decision is recorded on-chain, creating an immutable audit trail for all citizens.
              </p>
            </div>

            <Link href="/all-reports" className="text-blue-600 font-semibold text-sm flex items-center gap-2 hover:gap-3 transition-all">
              Explore Reports Ledger <span className="text-lg">→</span>
            </Link>
          </div>
        </div>

        {/* Bottom Row Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Global Scale */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
            <Globe className="h-10 w-10 text-blue-200 mb-4" />
            <h3 className="text-lg font-bold mb-2">Decentralized Triage</h3>
            <p className="text-blue-100 text-sm max-w-xs leading-relaxed">
              Empowering civic reporting across local municipal councils with AI Content Moderation.
            </p>
          </div>

          {/* Secure Transparency (Avatars) */}
          <div className="bg-white rounded-3xl p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-slate-900 font-bold mb-2">Secure Community Validation</h3>
              <p className="text-slate-500 text-sm max-w-[250px] leading-relaxed">
                Bridging institutional reliability with decentralized zero-knowledge privacy protocols.
              </p>
            </div>
            <div className="flex -space-x-3">
              <div className="w-10 h-10 rounded-full border-2 border-white bg-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                C1
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-white bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                C2
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-white bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                C3
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-white bg-slate-900 flex items-center justify-center text-white text-xs font-bold z-10 shadow-sm">
                +48
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
            <span>© 2026 AuraChain. Decentralized Governance for Local Communities.</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>EVM Smart Contracts</span>
            <span>&bull;</span>
            <span>IPFS Storage</span>
          </div>
        </footer>
      </div>
    </>
  );
}
