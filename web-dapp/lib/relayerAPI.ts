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

export async function getTasks() {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/tasks`);
  if (!response.ok) throw new Error('Failed to fetch tasks');
  return response.json();
}

export async function getTaskByReportId(reportId: number) {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/tasks/${reportId}`);
  if (!response.ok) throw new Error(`Failed to fetch task ${reportId}`);
  return response.json();
}

export async function assignTask(reportId: number, workerAddress: string, priority?: string, dueDate?: string) {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/tasks/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId, workerAddress, priority, dueDate }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to assign task');
  }
  return response.json();
}

export async function getTaskComments(reportId: number) {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/tasks/${reportId}/comments`);
  if (!response.ok) throw new Error(`Failed to fetch comments for task ${reportId}`);
  return response.json();
}

export async function addTaskComment(reportId: number, text: string) {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/tasks/${reportId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error('Failed to post comment');
  return response.json();
}

export async function getWorkers() {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/workers`);
  if (!response.ok) throw new Error('Failed to fetch workers');
  return response.json();
}

export async function registerWorker(walletAddress: string, name: string, department: string, plankaUserId: string) {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, plankaUserId, name, department }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to register worker');
  }
  return response.json();
}

export async function getPlankaUsers() {
  const API_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${API_URL}/admin/planka-users`);
  if (!response.ok) throw new Error('Failed to fetch Planka users');
  return response.json();
}