"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TopAppBar } from "@/components/layout/TopAppBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { PinScreen } from "@/components/auth/PinScreen";

function EmbedLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
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
    <>
      <PinScreen />
      
      {/* Global Top App Bar */}
      <TopAppBar />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white shrink-0">
          <div className="flex-1 py-4 overflow-y-auto">
            <BottomNav isSidebar />
          </div>

          <div className="p-4 border-t border-slate-100 shrink-0 bg-white">
            <Link href="/report" className="block w-full">
              <button className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors text-center">
                File Civic Report
              </button>
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-slate-50 text-slate-900 pb-20 md:pb-0 overflow-y-auto overflow-x-hidden relative">
          <div className="flex-1 w-full max-w-6xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav className="md:hidden" />
    </>
  );
}

export function EmbedLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1 bg-slate-50">{children}</div>}>
      <EmbedLayoutInner>{children}</EmbedLayoutInner>
    </Suspense>
  );
}
