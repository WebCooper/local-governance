"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCitizen } from "@/context/CitizenContext";
import { useAdmin } from "@/context/AdminContext";
import toast from "react-hot-toast";

const CITIZEN_ROUTES = ["/profile", "/report", "/my-reports"];
const ADMIN_ROUTES = ["/admin", "/super-admin", "/dashboard", "/polls/create"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { wallet } = useCitizen();
  const { account, isAuthority, isSuperAdmin, isConnecting } = useAdmin();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait a tick for hydration
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || isConnecting) return;

    // Check Citizen Routes
    if (CITIZEN_ROUTES.some(route => pathname.startsWith(route))) {
      if (!wallet) {
        toast.error("You must be logged in as a Citizen to access this page.");
        router.push("/login");
      }
    }

    // Check Admin Routes
    if (ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      if (!account) {
        toast.error("You must connect your wallet to access the Authority portal.");
        router.push("/login");
      } else if (pathname.startsWith("/super-admin") && !isSuperAdmin) {
        toast.error("Unauthorized. Super Admin access required.");
        router.push("/");
      } else if (!isAuthority && !isSuperAdmin) {
        toast.error("Unauthorized. Authority access required.");
        router.push("/");
      }
    }
  }, [pathname, wallet, account, isAuthority, isSuperAdmin, isConnecting, isReady, router]);

  return <>{children}</>;
}
