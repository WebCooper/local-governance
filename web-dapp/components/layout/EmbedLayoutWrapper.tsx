"use client";

import React, { Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { TopAppBar } from "@/components/layout/TopAppBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { PinScreen } from "@/components/auth/PinScreen";
import { Shield } from "lucide-react";

function EmbedLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isIframe, setIsIframe] = React.useState(false);

  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.self !== window.top || window.location.search.includes("embed=true"))
    ) {
      setIsIframe(true);
    }
  }, []);

  const isEmbed = searchParams?.get("embed") === "true" || isIframe;

  if (isEmbed) {
    return (
      <main className="flex-1 bg-white text-slate-900 overflow-y-auto overflow-x-hidden relative">
        <div className="w-full max-w-6xl mx-auto h-full p-4 md:p-8">
          {children}
        </div>
      </main>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-white flex flex-col relative overflow-hidden">
      <PinScreen />
      
      {/* App Container */}
      <div className="flex-1 w-full h-full bg-white overflow-hidden flex flex-col md:flex-row">
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-100 shrink-0">
          <div className="p-6 border-b border-slate-100 flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-xl text-slate-900 tracking-tight">AURACHAIN</span>
          </div>

          <div className="flex-1 py-6 overflow-y-auto">
            <BottomNav isSidebar />
          </div>

          <div className="p-6 shrink-0 bg-white">
            <Link href="/report" className="block w-full">
              <button className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition-colors text-center text-sm">
                + Create Report
              </button>
            </Link>
          </div>
        </aside>

        {/* Right Side container (TopBar + Content) */}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <TopAppBar />
          
          <main className="flex-1 bg-[#F9FAFB] text-slate-900 pb-20 md:pb-0 overflow-y-auto overflow-x-hidden relative">
            <div className="flex-1 w-full mx-auto h-full">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav className="md:hidden" />
    </div>
  );
}

export function EmbedLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#F9FAFB]">{children}</div>}>
      <EmbedLayoutInner>{children}</EmbedLayoutInner>
    </Suspense>
  );
}
