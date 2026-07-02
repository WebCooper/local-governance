export interface CastVotePayload {
  reportId: number;
  votePhase: 'validation' | 'verification' | 'rejectionReview';
  decision: boolean;
  zkpTicketId: string;
  zkpSignature: string;
  citizenPubKey: string;
  signature: string;
}

export async function castVoteOnRelayer(payload: CastVotePayload) {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  
  const response = await fetch(`${API_URL}/report/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to cast vote via relayer.');
  }

  return response.json();
}