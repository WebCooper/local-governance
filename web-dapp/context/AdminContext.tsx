"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { AuthorityMultiSigABI, ReportingABI, EmergencyReportingABI } from "@/lib/contracts/abis";
import toast from "react-hot-toast";

export const MULTISIG_ADDRESS = process.env.NEXT_PUBLIC_MULTISIG_ADDRESS || "";
export const REPORTING_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const EMERGENCY_REPORTING_ADDRESS =
  process.env.NEXT_PUBLIC_EMERGANCY_REPORT_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_EMERGENCY_REPORT_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_EMERGENCY_REPORTING_ADDRESS ||
  process.env.NEXT_PUBLIC_EMERGENCY_REPORTING_CONTRACT_ADDRESS ||
  "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";


interface AdminContextType {
  account: string | null;
  isSuperAdmin: boolean;
  isAuthority: boolean;
  isConnecting: boolean;
  provider: ethers.BrowserProvider | null;
  contract: ethers.Contract | null;
  reportingContract: ethers.Contract | null;
  emergencyReportingContract: ethers.Contract | null;
  superAdminsList: string[];
  authoritiesList: string[];
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  fetchLists: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType>({
  account: null,
  isSuperAdmin: false,
  isAuthority: false,
  isConnecting: false,
  provider: null,
  contract: null,
  reportingContract: null,
  emergencyReportingContract: null,
  superAdminsList: [],
  authoritiesList: [],
  connectWallet: async () => { },
  disconnectWallet: () => { },
  fetchLists: async () => { },
});

export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAuthority, setIsAuthority] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [reportingContract, setReportingContract] = useState<ethers.Contract | null>(null);
  const [emergencyReportingContract, setEmergencyReportingContract] = useState<ethers.Contract | null>(null);
  const [superAdminsList, setSuperAdminsList] = useState<string[]>([]);
  const [authoritiesList, setAuthoritiesList] = useState<string[]>([]);

  const fetchLists = useCallback(async (
    multiSig: ethers.Contract | null = contract,
    reporting: ethers.Contract | null = reportingContract
  ) => {
    if (!multiSig || !reporting) return;
    try {
      const sAdmins = await multiSig.getSuperAdmins();
      const auths = await reporting.getAuthorities();
      setSuperAdminsList(sAdmins);
      setAuthoritiesList(auths);
    } catch (error) {
      console.error("Error fetching admin lists", error);
    }
  }, [contract, reportingContract]);

  const checkAdminStatus = async (
    userAddress: string,
    multiSigContract: ethers.Contract,
    reportingContract: ethers.Contract
  ) => {
    try {
      const sAdminStatus = await multiSigContract.isSuperAdmin(userAddress);
      setIsSuperAdmin(sAdminStatus);

      const authStatus = await reportingContract.authorizedAuthorities(userAddress);
      setIsAuthority(authStatus);
    } catch (error) {
      console.error("Error checking roles status", error);
      setIsSuperAdmin(false);
      setIsAuthority(false);
    }
  };

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      localStorage.removeItem("admin_disconnected");
      setIsConnecting(true);
      try {
        const chainIdHex = "0x539"; // 1337 in hex for Geth Private Network
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: chainIdHex,
                  chainName: 'Geth Private Network',
                  rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.internalbuildtools.online'],
                  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                },
              ],
            });
          }
        }

        const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await browserProvider.send("eth_requestAccounts", []);
        const signer = await browserProvider.getSigner();

        const multiSig = new ethers.Contract(MULTISIG_ADDRESS, AuthorityMultiSigABI, signer);
        const reporting = new ethers.Contract(REPORTING_ADDRESS, ReportingABI, signer);
        const emergencyReporting = new ethers.Contract(EMERGENCY_REPORTING_ADDRESS, EmergencyReportingABI, signer);

        setProvider(browserProvider);
        setAccount(accounts[0]);
        setContract(multiSig);
        setReportingContract(reporting);
        setEmergencyReportingContract(emergencyReporting);

        await checkAdminStatus(accounts[0], multiSig, reporting);
        await fetchLists(multiSig, reporting);
      } catch (error) {
        console.error("User denied account access or error occurred", error);
      } finally {
        setIsConnecting(false);
      }
    } else {
      toast.error("MetaMask is not installed!");
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setIsSuperAdmin(false);
    setIsAuthority(false);
    setContract(null);
    setReportingContract(null);
    setEmergencyReportingContract(null);
    setSuperAdminsList([]);
    setAuthoritiesList([]);
    localStorage.setItem("admin_disconnected", "true");
  };

  useEffect(() => {
    const autoConnect = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        if (localStorage.getItem("admin_disconnected") === "true") return;
        
        try {
          const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
          // Check if there are any connected accounts already
          const accounts = await browserProvider.send("eth_accounts", []);
          if (accounts.length > 0) {
            await connectWallet();
          }
        } catch (error) {
          console.error("Auto-connect failed", error);
        }

        (window as any).ethereum.on("accountsChanged", (accounts: string[]) => {
          if (accounts.length > 0) {
            connectWallet();
          } else {
            setAccount(null);
            setIsSuperAdmin(false);
            setIsAuthority(false);
            setContract(null);
            setReportingContract(null);
            setEmergencyReportingContract(null);
            setSuperAdminsList([]);
            setAuthoritiesList([]);
          }
        });
      }
    };

    autoConnect();
  }, []);

  return (
    <AdminContext.Provider
      value={{
        account,
        isSuperAdmin,
        isAuthority,
        isConnecting,
        provider,
        contract,
        reportingContract,
        emergencyReportingContract,
        superAdminsList,
        authoritiesList,
        connectWallet,
        disconnectWallet,
        fetchLists,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => useContext(AdminContext);
