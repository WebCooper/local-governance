"use client";

// context/CitizenContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { CitizenWallet } from '@/lib/walletUtils';

const SESSION_KEY_WALLET  = 'ac_wallet';
const SESSION_KEY_TICKETS = 'ac_tickets';

// Define the ticket structure based on your ZKP server response
export interface ZkpTicket {
  ticketId: string;
  signature: string;
}

interface CitizenContextType {
  wallet: CitizenWallet | null;
  ticketBatch: ZkpTicket[];
  login: (wallet: CitizenWallet, tickets: ZkpTicket[]) => void;
  logout: () => void;
  consumeTicket: () => ZkpTicket | null;
  availableTicketsCount: number;
}

const CitizenContext = createContext<CitizenContextType | undefined>(undefined);

export const CitizenProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<CitizenWallet | null>(null);
  const [ticketBatch, setTicketBatch] = useState<ZkpTicket[]>([]);

  // ── Rehydrate from sessionStorage on first mount (client-side only) ──
  useEffect(() => {
    try {
      const storedWallet  = sessionStorage.getItem(SESSION_KEY_WALLET);
      const storedTickets = sessionStorage.getItem(SESSION_KEY_TICKETS);

      if (storedWallet)  setWallet(JSON.parse(storedWallet));
      if (storedTickets) setTicketBatch(JSON.parse(storedTickets));
    } catch {
      // Corrupted data — start fresh
      sessionStorage.removeItem(SESSION_KEY_WALLET);
      sessionStorage.removeItem(SESSION_KEY_TICKETS);
    }
  }, []);

  const login = (newWallet: CitizenWallet, tickets: ZkpTicket[]) => {
    setWallet(newWallet);
    setTicketBatch(tickets);
    sessionStorage.setItem(SESSION_KEY_WALLET,  JSON.stringify(newWallet));
    sessionStorage.setItem(SESSION_KEY_TICKETS, JSON.stringify(tickets));
  };

  const logout = () => {
    setWallet(null);
    setTicketBatch([]);
    sessionStorage.removeItem(SESSION_KEY_WALLET);
    sessionStorage.removeItem(SESSION_KEY_TICKETS);
  };

  // Pops the first ticket, persists the remaining batch
  const consumeTicket = (): ZkpTicket | null => {
    if (ticketBatch.length === 0) return null;

    const ticketToUse  = ticketBatch[0];
    const remaining    = ticketBatch.slice(1);

    setTicketBatch(remaining);
    sessionStorage.setItem(SESSION_KEY_TICKETS, JSON.stringify(remaining));

    return ticketToUse;
  };

  return (
    <CitizenContext.Provider value={{
      wallet,
      ticketBatch,
      login,
      logout,
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