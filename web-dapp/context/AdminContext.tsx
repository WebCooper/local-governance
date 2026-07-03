"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { AuthorityMultiSigABI, ReportingABI } from "@/lib/contracts/abis";

export const MULTISIG_ADDRESS = "0x53A70A51d7a8e0B751d66daaCAA65D3f0dd06b45";
export const REPORTING_ADDRESS = "0x0B895D1eD1C8DE04853a1731453FFdFcDcCBcA19";


interface AdminContextType {
  account: string | null;
  isSuperAdmin: boolean;
  isAuthority: boolean;
  isConnecting: boolean;
  provider: ethers.BrowserProvider | null;
  contract: ethers.Contract | null;
  reportingContract: ethers.Contract | null;
  superAdminsList: string[];
  authoritiesList: string[];
  connectWallet: () => Promise<void>;
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
  superAdminsList: [],
  authoritiesList: [],
  connectWallet: async () => { },
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
      setIsConnecting(true);
      try {
        const chainIdHex = "0x7a69";
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
                  chainName: 'Hardhat Localhost',
                  rpcUrls: ['http://127.0.0.1:8545/'],
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

        setProvider(browserProvider);
        setAccount(accounts[0]);
        setContract(multiSig);
        setReportingContract(reporting);

        await checkAdminStatus(accounts[0], multiSig, reporting);
        await fetchLists(multiSig, reporting);
      } catch (error) {
        console.error("User denied account access or error occurred", error);
      } finally {
        setIsConnecting(false);
      }
    } else {
      alert("MetaMask is not installed!");
    }
  };

  useEffect(() => {
    const autoConnect = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
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
        superAdminsList,
        authoritiesList,
        connectWallet,
        fetchLists,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => useContext(AdminContext);
