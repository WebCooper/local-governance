import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TopAppBar } from "@/components/layout/TopAppBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { CitizenProvider } from "@/context/CitizenContext";
import { AdminProvider } from "@/context/AdminContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AURACHAIN | Local Governance",
  description: "Secure, decentralized, and private civic engagement for everyone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-slate-50 flex flex-col md:flex-row`}>
        <CitizenProvider>
          <AdminProvider>
            {/* Mobile Top App Bar */}
            <TopAppBar className="md:hidden" />
            
            {/* Desktop Sidebar (Optional/If needed later) - For now just TopAppBar + BottomNav */}
            {/* If we want to strictly follow the prompt "Reddit-like UI... sidebar for desktop", let's make the TopAppBar act like a header and Sidebar act as navigation on desktop. */}
            
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white sticky top-0 h-screen">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-2xl text-blue-600 tracking-tight">AuraChain</span>
                </div>
                <div className="text-slate-500 text-sm">Civic Identity</div>
              </div>
              
              <div className="flex-1 overflow-y-auto py-2">
                <BottomNav isSidebar />
              </div>

              <div className="p-4">
                <button className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors text-center">
                  Create Proposal
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 bg-slate-50 text-slate-900 pb-20 md:pb-0 min-h-screen flex flex-col overflow-x-hidden">
              {/* Desktop Top Nav */}
              <header className="hidden md:flex items-center justify-between px-8 py-4 bg-slate-50 z-10 w-full max-w-6xl mx-auto">
                <div className="flex-1 max-w-md relative">
                  <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input type="text" placeholder="Search proposals..." className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                
                <div className="flex items-center gap-4 text-slate-500">
                  <button className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                  </button>
                  <button className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                  </button>
                  <img src="/avatar_1.png" alt="Profile" className="w-8 h-8 rounded-full ml-2 object-cover border border-slate-200" />
                </div>
              </header>
              <div className="flex-1 w-full max-w-6xl mx-auto">
                {children}
              </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <BottomNav className="md:hidden" />
          </AdminProvider>
        </CitizenProvider>
      </body>
    </html>
  );
}
