import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CitizenProvider } from "@/context/CitizenContext";
import { AdminProvider } from "@/context/AdminContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ClientToaster } from "@/components/layout/ClientToaster";
import { RouteGuard } from "@/components/layout/RouteGuard";
import { EmbedLayoutWrapper } from "@/components/layout/EmbedLayoutWrapper";

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
                <EmbedLayoutWrapper>
                  {children}
                </EmbedLayoutWrapper>
              </RouteGuard>
            </NotificationProvider>
          </AdminProvider>
        </CitizenProvider>
      </body>
    </html>
  );
}

