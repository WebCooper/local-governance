import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40 text-muted-foreground py-12">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4 col-span-1 md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <span className="text-lg font-extrabold text-blue-600 tracking-tight">
                AuraChain
              </span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
              Blockchain-based community-assisted privacy-preserving reporting platform for local governance. Empowering citizens through Zero-Knowledge Proofs and verifiable transparency.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-4 text-sm">Platform</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/all-reports" className="hover:text-blue-600 transition-colors">Issues Explorer</Link></li>
              <li><Link href="/report" className="hover:text-blue-600 transition-colors">Submit Civic Report</Link></li>
              <li><Link href="/polls" className="hover:text-blue-600 transition-colors">Opinion Polls</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-4 text-sm">Legal &amp; Research</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/privacy-policy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/whitepaper" className="hover:text-blue-600 transition-colors">Technical Whitepaper</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-blue-600 transition-colors">Terms of Service</Link></li>
              <li><Link href="/contact" className="hover:text-blue-600 font-semibold transition-colors">Contact Us &amp; Academic Info</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500">
          <p>© 2026 AuraChain. Decentralized Governance for Local Communities.</p>
          <div className="mt-4 md:mt-0 space-x-4">
            <span>Powered by EVM Smart Contracts</span>
            <span>&bull;</span>
            <span>IPFS Decentralized Storage</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
