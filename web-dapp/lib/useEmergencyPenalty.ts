"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useCitizen } from "@/context/CitizenContext";
import { EMERGENCY_REPORTING_ADDRESS } from "@/context/AdminContext";
import EmergencyReportingArtifact from "@/lib/contracts/EmergencyReporting.json";

export interface EmergencyPenaltyState {
  isPenalized: boolean;
  penaltyUntil: number;
  penaltyUntilDate: Date | null;
  daysRemaining: number;
  reason: string | null;
  reclassifiedReportId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEmergencyPenalty(): EmergencyPenaltyState {
  const { wallet } = useCitizen();
  const [isPenalized, setIsPenalized] = useState(false);
  const [penaltyUntil, setPenaltyUntil] = useState(0);
  const [penaltyUntilDate, setPenaltyUntilDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [reclassifiedReportId, setReclassifiedReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkPenalty = useCallback(async () => {
    if (!wallet || !wallet.publicKey) {
      setIsPenalized(false);
      setPenaltyUntil(0);
      setPenaltyUntilDate(null);
      setDaysRemaining(0);
      setReason(null);
      setReclassifiedReportId(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Derive citizen pseudonym identically to relayer & smart contract
      const salt = process.env.NEXT_PUBLIC_PSEUDONYM_DOMAIN_SALT || "CivicReport-v1";
      const citizenPseudonym = ethers.keccak256(
        ethers.solidityPacked(["address", "string"], [wallet.publicKey, salt])
      );

      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.internalbuildtools.online";
      const contractAddress = EMERGENCY_REPORTING_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, EmergencyReportingArtifact.abi, provider);

      // 1. Query penalty box mapping
      const penaltyRaw: bigint = await contract.emergencyPenaltyBox(citizenPseudonym);
      const penaltyTs = Number(penaltyRaw);
      const currentTs = Math.floor(Date.now() / 1000);

      if (penaltyTs > currentTs) {
        setIsPenalized(true);
        setPenaltyUntil(penaltyTs);
        const endDate = new Date(penaltyTs * 1000);
        setPenaltyUntilDate(endDate);
        const remaining = Math.max(1, Math.ceil((penaltyTs - currentTs) / 86400));
        setDaysRemaining(remaining);

        // 2. Fetch citizen's emergency reports to find the reclassified report and authority comment
        try {
          const [reports] = await contract.getReportsByCitizen(citizenPseudonym, 0, 20);
          const reclassified = reports.find((r: any) => r.isReclassified || Number(r.status) === 3);
          if (reclassified) {
            setReclassifiedReportId(reclassified.id.toString());
            const commentCid = reclassified.authorityComment;
            if (commentCid && commentCid.trim()) {
              try {
                const textRes = await fetch(`/api/ipfs/text/${commentCid.replace("ipfs://", "")}`);
                if (textRes.ok) {
                  const textData = await textRes.json();
                  if (textData.content) {
                    setReason(textData.content);
                  }
                }
              } catch (ipfsErr) {
                console.error("Failed to load penalty comment text from IPFS:", ipfsErr);
              }
            }
          }
        } catch (repErr) {
          console.error("Failed to query citizen reports for penalty reason:", repErr);
        }
      } else {
        setIsPenalized(false);
        setPenaltyUntil(0);
        setPenaltyUntilDate(null);
        setDaysRemaining(0);
        setReason(null);
        setReclassifiedReportId(null);
      }
    } catch (err) {
      console.error("Failed to check emergency penalty box:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    checkPenalty();
  }, [checkPenalty]);

  return {
    isPenalized,
    penaltyUntil,
    penaltyUntilDate,
    daysRemaining,
    reason,
    reclassifiedReportId,
    loading,
    refresh: checkPenalty,
  };
}
