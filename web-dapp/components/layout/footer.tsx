import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6 text-slate-500 text-xs font-medium">
      <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
          <span>© 2026 AuraChain. Decentralized Governance for Local Communities.</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Powered by EVM Smart Contracts</span>
          <span>&bull;</span>
          <span>IPFS Storage</span>
        </div>
      </div>
    </footer>
  );
}
