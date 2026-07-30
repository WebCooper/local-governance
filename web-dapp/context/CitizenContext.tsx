"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { CitizenWallet } from '@/lib/walletUtils';
import { encryptSessionData, decryptSessionData } from '@/lib/cryptoUtils';

const LOCAL_KEY_SESSION = 'ac_secure_session';

export interface ZkpTicket {
  ticketId: string;
  signature: string;
}

interface CitizenContextType {
  wallet: CitizenWallet | null;
  ticketBatch: ZkpTicket[];
  isLocked: boolean;
  isSettingPin: boolean;
  login: (wallet: CitizenWallet, tickets: ZkpTicket[]) => void;
  logout: () => void;
  setupLock: (pin: string) => Promise<void>;
  unlockSession: (pin: string) => Promise<boolean>;
  consumeTicket: () => ZkpTicket | null;
  availableTicketsCount: number;
}

const CitizenContext = createContext<CitizenContextType | undefined>(undefined);

export const CitizenProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<CitizenWallet | null>(null);
  const [ticketBatch, setTicketBatch] = useState<ZkpTicket[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);
  
  // We keep the PIN in memory to re-encrypt data when tickets are consumed
  const [sessionPin, setSessionPin] = useState<string | null>(null);

  // ── Rehydrate from localStorage on first mount ──
  useEffect(() => {
    const storedSession = localStorage.getItem(LOCAL_KEY_SESSION);
    if (storedSession) {
      setIsLocked(true);
    }
  }, []);

  const login = (newWallet: CitizenWallet, tickets: ZkpTicket[]) => {
    setWallet(newWallet);
    setTicketBatch(tickets);
    setIsSettingPin(true);
  };

  const setupLock = async (pin: string) => {
    if (!wallet) return;
    const dataToEncrypt = JSON.stringify({ wallet, tickets: ticketBatch });
    try {
      const encryptedBlob = await encryptSessionData(dataToEncrypt, pin);
      localStorage.setItem(LOCAL_KEY_SESSION, encryptedBlob);
      setSessionPin(pin);
      setIsSettingPin(false);
      setIsLocked(false);
    } catch (e) {
      console.error("Encryption failed:", e);
      throw e;
    }
  };

  const unlockSession = async (pin: string): Promise<boolean> => {
    try {
      const storedSession = localStorage.getItem(LOCAL_KEY_SESSION);
      if (!storedSession) return false;

      const decrypted = await decryptSessionData(storedSession, pin);
      const parsed = JSON.parse(decrypted);

      setWallet(parsed.wallet);
      setTicketBatch(parsed.tickets);
      setSessionPin(pin);
      setIsLocked(false);
      return true;
    } catch (e) {
      console.error("Decryption failed (likely wrong PIN):", e);
      return false;
    }
  };

  const logout = () => {
    setWallet(null);
    setTicketBatch([]);
    setSessionPin(null);
    setIsLocked(false);
    setIsSettingPin(false);
    localStorage.removeItem(LOCAL_KEY_SESSION);
    sessionStorage.removeItem('ac_wallet');
    sessionStorage.removeItem('ac_tickets');
  };

  const consumeTicket = (): ZkpTicket | null => {
    if (ticketBatch.length === 0) return null;

    const ticketToUse = ticketBatch[0];
    const remaining = ticketBatch.slice(1);

    setTicketBatch(remaining);

    // Re-encrypt and persist asynchronously without blocking
    if (sessionPin && wallet) {
      const dataToEncrypt = JSON.stringify({ wallet, tickets: remaining });
      encryptSessionData(dataToEncrypt, sessionPin)
        .then(encryptedBlob => {
          localStorage.setItem(LOCAL_KEY_SESSION, encryptedBlob);
        })
        .catch(e => {
          console.error("Failed to re-encrypt session after consuming ticket", e);
        });
    }

    return ticketToUse;
  };

  return (
    <CitizenContext.Provider value={{
      wallet,
      ticketBatch,
      isLocked,
      isSettingPin,
      login,
      logout,
      setupLock,
      unlockSession,
      consumeTicket,
      availableTicketsCount: ticketBatch.length
    }}>
      {children}
    </CitizenContext.Provider>
  );
};

export const useCitizen = () => {
  const context = useContext(CitizenContext);
  if (!context) throw new Error("useCitizen must be used within a CitizenProvider");
  return context;
};