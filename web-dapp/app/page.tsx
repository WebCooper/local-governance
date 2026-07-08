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
          <Link href="/auth" className="w-full">
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
              <Link href="/auth">
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
                  Vote and participate in city governance without ever compromising your personal data. Our ZK-Proof infrastructure ensures that while your voice is counted, your identity remains your own.
                </p>
                <div className="w-32 h-16 rounded-xl overflow-hidden bg-slate-900 shadow-inner">
                  <img src="/zk_privacy.png" alt="ZK Crypto" className="w-full h-full object-cover opacity-80" />
                </div>
              </div>
            </div>
            
            <div className="space-y-3 mt-8">
              <div className="flex items-center gap-2 text-sm text-slate-900 font-medium">
                <Shield className="h-4 w-4 text-blue-600" />
                Anonymous Verification
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-900 font-medium">
                <Shield className="h-4 w-4 text-blue-600" />
                Verifiable Tallying
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
                Every treasury movement and governance decision is recorded on-chain, creating an immutable audit trail for all citizens.
              </p>
            </div>
            
            <Link href="#" className="text-blue-600 font-semibold text-sm flex items-center gap-2 hover:gap-3 transition-all">
              Explore Ledger <span className="text-lg">→</span>
            </Link>
          </div>
        </div>

        {/* Bottom Row Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Global Scale */}
          <div className="bg-blue-700 rounded-3xl p-8 text-white flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
            <Globe className="h-10 w-10 text-blue-300 mb-4" />
            <h3 className="text-lg font-medium mb-2">Global Scale</h3>
            <p className="text-blue-100 text-sm max-w-xs">
              Deploying AuraChain protocols in 12+ cities worldwide.
            </p>
          </div>

          {/* Secure Transparency (Avatars) */}
          <div className="bg-white rounded-3xl p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-slate-900 font-medium mb-2">Secure Transparency</h3>
              <p className="text-slate-500 text-sm max-w-[250px] leading-relaxed">
                We bridge the gap between traditional government reliability and the innovation of decentralized protocols.
              </p>
            </div>
            <div className="flex -space-x-4">
              <img src="/avatar_1.png" alt="Avatar" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
              <img src="/avatar_2.png" alt="Avatar" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
              <img src="/avatar_3.png" alt="Avatar" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
              <div className="w-12 h-12 rounded-full border-2 border-white bg-blue-600 flex items-center justify-center text-white text-xs font-bold z-10">
                +24
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-blue-600 text-base">AuraChain</span>
            <span>© 2024 AuraChain. Decentralized Governance for the People.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="#" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Whitepaper</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Support</Link>
            <div className="flex items-center gap-3 ml-4">
              <Share2 className="h-4 w-4 hover:text-slate-900 cursor-pointer transition-colors" />
              <Globe className="h-4 w-4 hover:text-slate-900 cursor-pointer transition-colors" />
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
