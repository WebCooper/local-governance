import { ethers } from "ethers";
import type { CastVotePayload } from "./relayerAPI";
import type { CitizenWallet } from "@/lib/walletUtils";
import type { ZkpTicket } from "@/context/CitizenContext";

export type VotePhase = CastVotePayload["votePhase"];

export interface VoteDecisionCopy {
  positiveLabel: string;
  negativeLabel: string;
  positiveHint: string;
  negativeHint: string;
}

export const VOTE_PHASE_OPTIONS: Array<{
  value: VotePhase;
  label: string;
  description: string;
}> = [
  {
    value: "validation",
    label: "Validation",
    description: "Initial community check for legitimacy.",
  },
  {
    value: "verification",
    label: "Verification",
    description: "Confirm the issue details after validation.",
  },
  {
    value: "rejectionReview",
    label: "Rejection Review",
    description: "Review an earlier rejection decision.",
  },
];

const VOTE_DECISION_COPY: Record<VotePhase, VoteDecisionCopy> = {
  validation: {
    positiveLabel: "Confirm Real Issue",
    negativeLabel: "Flag Invalid Report",
    positiveHint: "Verify that this is a real problem in your community.",
    negativeHint: "Flag this report as inaccurate, duplicate, or invalid.",
  },
  verification: {
    positiveLabel: "Approve Report",
    negativeLabel: "Reject Report",
    positiveHint: "Confirm details are accurate and resolution is needed.",
    negativeHint: "Reject this report due to insufficient info or incorrect details.",
  },
  rejectionReview: {
    positiveLabel: "Uphold Rejection",
    negativeLabel: "Overturn Rejection",
    positiveHint: "Agree that this report should remain rejected.",
    negativeHint: "Appeal to re-open and re-investigate this report.",
  },
};

export function getVoteDecisionCopy(phase: VotePhase): VoteDecisionCopy {
  return VOTE_DECISION_COPY[phase];
}

export function buildVoteMessageHash(
  reportId: number,
  votePhase: VotePhase,
  decision: boolean,
  zkpTicketId: string,
) {
  return ethers.solidityPackedKeccak256(
    ["uint256", "string", "bool", "string"],
    [reportId, votePhase, decision, zkpTicketId],
  );
}

export async function buildSignedVotePayload({
  wallet,
  reportId,
  votePhase,
  decision,
  ticket,
}: {
  wallet: CitizenWallet;
  reportId: number;
  votePhase: VotePhase;
  decision: boolean;
  ticket: ZkpTicket;
}): Promise<CastVotePayload> {
  const messageHash = buildVoteMessageHash(reportId, votePhase, decision, ticket.ticketId);
  const ethersWallet = new ethers.Wallet(wallet.privateKey);
  const signature = await ethersWallet.signMessage(ethers.getBytes(messageHash));

  return {
    reportId,
    votePhase,
    decision,
    zkpTicketId: ticket.ticketId,
    zkpSignature: ticket.signature,
    citizenPubKey: wallet.publicKey,
    signature,
  };
}