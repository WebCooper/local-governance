import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";
import { TopAppBar } from "@/components/layout/TopAppBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { CitizenProvider } from "@/context/CitizenContext";
import { AdminProvider } from "@/context/AdminContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ClientToaster } from "@/components/layout/ClientToaster";
import { RouteGuard } from "@/components/layout/RouteGuard";
import { PinScreen } from "@/components/auth/PinScreen";

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
      <body className={`${inter.className} h-[100dvh] overflow-hidden bg-slate-50 flex flex-col`}>
        <CitizenProvider>
          <AdminProvider>
            <NotificationProvider>
              <RouteGuard>
                <ClientToaster />
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
              </RouteGuard>
            </NotificationProvider>
          </AdminProvider>
        </CitizenProvider>
      </body>

    </html>
  );
}
