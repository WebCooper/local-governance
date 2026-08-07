import Link from "next/link";
import { Shield, Lock, Landmark, Globe } from "lucide-react";

export default function Home() {
  return (
    <>
      {/* Mobile View */}
      <div className="flex md:hidden flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] -z-10" />

        <div className="mb-12 relative flex items-center justify-center">
          <div className="absolute w-32 h-32 bg-blue-100 rounded-full animate-pulse blur-md" />
          <div className="absolute w-24 h-24 bg-blue-200 rounded-full blur-sm" />
          <div className="relative w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-md">
            <div className="w-8 h-8 rounded-full border-2 border-white/80" />
          </div>
        </div>

        <div className="text-center max-w-sm mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4 drop-shadow-sm">
            Your City, Your<br />Voice. Protected.
          </h1>
          <p className="text-slate-600">
            Secure, decentralized, and private civic engagement for everyone.
          </p>
        </div>

        <div className="flex flex-col items-center w-full max-w-xs gap-6">
          <Link href="/login" className="w-full">
            <button className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all text-center">
              Get Started
            </button>
          </Link>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-xs font-medium border border-slate-200 shadow-sm">
            <Shield className="h-3 w-3 text-blue-500" />
            <span>Privacy-first with Zero-Knowledge Proofs</span>
          </div>
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden md:flex flex-col w-full max-w-6xl mx-auto p-8 gap-16 pb-12">
        {/* Hero Section */}
        <div className="grid grid-cols-2 gap-12 items-center min-h-[70vh]">
          {/* Left Hero */}
          <div className="flex flex-col items-start relative z-10">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] -z-10" />
            <div className="absolute bottom-0 left-1/4 translate-x-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px] -z-10" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-full text-sm font-bold tracking-widest uppercase mb-6 shadow-sm">
              <Shield className="h-4 w-4" />
              <span>SECURED BY ZK-PROOFS</span>
            </div>

            <h1 className="text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.15] drop-shadow-sm">
              Your City, Your Voice.<br />
              <span className="text-blue-600">Protected.</span>
            </h1>

            <p className="text-slate-600 text-lg mb-8 max-w-md leading-relaxed">
              Experience the future of decentralized governance. AuraChain combines institutional stability with sovereign identity to give you a true seat at the table.
            </p>

            <div className="flex items-center gap-4 mb-12">
              <Link href="/login">
                <button className="py-3.5 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all">
                  Get Started
                </button>
              </Link>
            </div>

            <div className="flex items-center gap-12 border-t border-slate-200 pt-8 mt-2">
              <div>
                <div className="text-3xl font-extrabold text-blue-600 mb-1">12.4k</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Citizens</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-blue-600 mb-1">482</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Proposals Passed</div>
              </div>
            </div>
          </div>

          {/* Right Hero (Card) */}
          <div className="relative z-10 flex justify-end">
            <div className="absolute right-10 top-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] -z-10" />

            {/* Mock Card */}
            <div className="bg-white/80 backdrop-blur-md p-8 w-full max-w-md relative overflow-hidden group hover:shadow-xl border border-slate-200 rounded-3xl transition-all duration-500 hover:-translate-y-2">
              
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="px-3 py-1 bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-full">Active Vote</div>
                <Shield className="h-8 w-8 text-blue-500" />
              </div>

              <h3 className="text-2xl font-bold text-slate-900 mb-3 relative z-10">New Greenway Initiative</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed relative z-10">
                This proposal aims to create 15km of new pedestrian paths through the city center using sustainable materials.
              </p>

              <div className="mb-8 relative z-10">
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-2">
                  <span className="uppercase tracking-wider">Consensus Progress</span>
                  <span className="text-blue-600">82%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                  <div className="h-full bg-blue-500 w-[82%] rounded-full"></div>
                  <div className="h-full bg-transparent w-[18%]"></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Trust Score</div>
                  <div className="text-emerald-600 font-bold text-lg">99.9%</div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">ZK-Identity</div>
                  <div className="text-blue-600 font-bold text-lg">Verified</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Separator Text */}
        <div className="text-center text-sm font-bold text-slate-400 mt-8 mb-4 tracking-widest uppercase">
          Institutional Stability Meets Digital Sovereignty
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ZK Privacy Card (Col Span 2) */}
          <div className="md:col-span-2 bg-white/80 backdrop-blur-md p-8 flex flex-col justify-between group hover:shadow-lg border border-slate-200 rounded-3xl transition-all duration-300 hover:-translate-y-1">
            <div>
              <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center mb-6">
                <Lock className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Zero-Knowledge Privacy</h3>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
                <p className="text-slate-600 text-sm leading-relaxed max-w-md">
                  Vote and participate in city governance without ever compromising your personal data. Our ZK-Proof infrastructure ensures that while your voice is counted, your identity remains completely anonymous.
                </p>
                <div className="w-32 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-500 flex flex-col items-center justify-center text-white p-3 shadow-md shrink-0">
                  <Shield className="h-8 w-8 text-white mb-2" />
                  <span className="text-[10px] font-bold tracking-widest uppercase text-blue-100 text-center">Zero<br/>Knowledge</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 mt-8">
              <div className="flex items-center gap-3 text-sm text-slate-700 font-medium">
                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                  <Shield className="h-3 w-3 text-blue-600" />
                </div>
                Anonymous Verification &amp; Cryptographic Identity
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700 font-medium">
                <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center border border-purple-100">
                  <Lock className="h-3 w-3 text-purple-600" />
                </div>
                Verifiable Multi-Party On-Chain Tallying
              </div>
            </div>
          </div>

          {/* Absolute Transparency Card */}
          <div className="bg-white/80 backdrop-blur-md p-8 flex flex-col justify-between group hover:shadow-lg border border-slate-200 rounded-3xl transition-all duration-300 hover:-translate-y-1">
            <div>
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center mb-6">
                <Landmark className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">Absolute Transparency</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-8">
                Every report resolution and governance decision is recorded on-chain, creating an immutable audit trail for all citizens.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Row Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Global Scale */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-10 text-white flex flex-col items-center justify-center text-center shadow-md border border-blue-500 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
            <Globe className="h-12 w-12 text-blue-200 mb-6 drop-shadow-sm" />
            <h3 className="text-2xl font-bold mb-3 text-white">Decentralized Triage</h3>
            <p className="text-blue-100 text-sm max-w-sm leading-relaxed">
              Empowering civic reporting across local municipal councils with AI Content Moderation.
            </p>
          </div>

          {/* Secure Transparency (Avatars) */}
          <div className="bg-white/80 backdrop-blur-md p-10 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left gap-8 group hover:shadow-lg border border-slate-200 rounded-3xl transition-all duration-300 hover:scale-[1.02]">
            <div>
              <h3 className="text-slate-900 text-xl font-bold mb-3">Secure Community Validation</h3>
              <p className="text-slate-500 text-sm max-w-[250px] leading-relaxed mx-auto sm:mx-0">
                Bridging institutional reliability with decentralized zero-knowledge privacy protocols.
              </p>
            </div>
            <div className="flex -space-x-4 shrink-0">
              <div className="w-14 h-14 rounded-full border-[3px] border-white bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold shadow-sm">
                C1
              </div>
              <div className="w-14 h-14 rounded-full border-[3px] border-white bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold shadow-sm">
                C2
              </div>
              <div className="w-14 h-14 rounded-full border-[3px] border-white bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shadow-sm">
                C3
              </div>
              <div className="w-14 h-14 rounded-full border-[3px] border-white bg-slate-100 flex items-center justify-center text-slate-700 text-sm font-bold z-10 shadow-sm">
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
