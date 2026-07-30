import type { VotePhase } from "@/lib/vote";

// ─── Status Enum (mirrors Reporting.sol) ─────────────────────────────────────
export const REPORT_STATUS = {
  PendingValidation: 0,
  CommunityRejected: 1,
  Open: 2,
  InProgress: 3,
  PendingRejectionReview: 4,
  PendingVerification: 5,
  Closed: 6,
  Reopened: 7,
} as const;

export type ReportStatusNumber = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

// ─── Status Display Map ────────────────────────────────────────────────────────
export interface StatusMeta {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export const STATUS_MAP: Record<number, StatusMeta> = {
  0: { label: "Pending Validation",      bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",  dot: "bg-amber-400" },
  1: { label: "Community Rejected",      bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",    dot: "bg-red-400" },
  2: { label: "Open",                    bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",   dot: "bg-blue-400" },
  3: { label: "In Progress",             bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200", dot: "bg-indigo-400" },
  4: { label: "Pending Rejection Review",bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200", dot: "bg-orange-400" },
  5: { label: "Pending Verification",    bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200", dot: "bg-purple-400" },
  6: { label: "Closed / Solved",         bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200",  dot: "bg-green-400" },
  7: { label: "Reopened",               bg: "bg-slate-50",   text: "text-slate-700",   border: "border-slate-200",  dot: "bg-slate-400" },
};

export function getStatusMeta(status: number): StatusMeta {
  return STATUS_MAP[status] ?? {
    label: "Unknown",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-400",
  };
}

// ─── Vote Phase Detection ─────────────────────────────────────────────────────
export function getVotePhaseFromStatus(status: number): VotePhase | null {
  switch (status) {
    case REPORT_STATUS.PendingValidation:
      return "validation";
    case REPORT_STATUS.PendingVerification:
      return "verification";
    case REPORT_STATUS.PendingRejectionReview:
      return "rejectionReview";
    default:
      return null;
  }
}

// ─── Authority Action Definitions ─────────────────────────────────────────────
export type AuthorityAction = "startWork" | "markAsSolved" | "rejectIssue" | "addUpdate" | "downgradeEmergency";

export interface AuthorityActionMeta {
  action: AuthorityAction;
  label: string;
  description: string;
  confirmTitle: string;
  confirmMessage: string;
  color: "green" | "red" | "slate";
}

const ACTION_META: Record<AuthorityAction, AuthorityActionMeta> = {
  startWork: {
    action: "startWork",
    label: "Start Work",
    description: "Claim this report and begin resolving the issue.",
    confirmTitle: "Start Working on This Report?",
    confirmMessage:
      "You are about to claim this report and mark it as In Progress. Your wallet address will be recorded as the assigned authority on-chain.",
    color: "green",
  },
  markAsSolved: {
    action: "markAsSolved",
    label: "Mark as Solved",
    description: "Submit evidence of resolution. Opens community verification voting.",
    confirmTitle: "Mark Report as Solved?",
    confirmMessage:
      "You are about to mark this report as solved. This will open a community verification voting window for citizens to confirm the resolution.",
    color: "slate",
  },
  rejectIssue: {
    action: "rejectIssue",
    label: "Reject Issue",
    description: "Reject this report. Opens a community rejection review voting window.",
    confirmTitle: "Reject This Issue?",
    confirmMessage:
      "You are about to reject this report. This will open a community rejection review voting window for citizens to appeal or uphold your decision.",
    color: "red",
  },
  addUpdate: {
    action: "addUpdate",
    label: "Post Progress Update",
    description: "Post a progress update with comments and/or images without changing report status.",
    confirmTitle: "Post Progress Update?",
    confirmMessage:
      "You are about to post a progress update for this report on-chain. This will not change the report status.",
    color: "green",
  },
  downgradeEmergency: {
    action: "downgradeEmergency",
    label: "Downgrade Fake Emergency",
    description: "Reclassify this as non-emergency. Applies a 30-day penalty to the citizen.",
    confirmTitle: "Downgrade Emergency?",
    confirmMessage:
      "You are about to downgrade this emergency report. This will strip its emergency status and immediately lock the citizen's ID in the cryptographic penalty box for 30 days.",
    color: "red",
  },
};

export function getActionMeta(action: AuthorityAction): AuthorityActionMeta {
  return ACTION_META[action];
}

export function getAvailableActions(
  status: number,
  assignedAuthority: string,
  currentAccount: string,
  isEmergency: boolean = false
): AuthorityAction[] {
  const nullAddress = "0x0000000000000000000000000000000000000000";
  const isAssigned =
    assignedAuthority.toLowerCase() === currentAccount.toLowerCase();
  const isUnassigned = assignedAuthority === nullAddress;

  let actions: AuthorityAction[] = [];

  switch (status) {
    case REPORT_STATUS.Open:
    case REPORT_STATUS.Reopened:
      actions = ["startWork", "rejectIssue"];
      break;
    case REPORT_STATUS.InProgress:
      if (isAssigned) actions = ["markAsSolved", "rejectIssue", "addUpdate"];
      break;
  }

  if (isEmergency && status !== REPORT_STATUS.Closed) {
    actions.push("downgradeEmergency");
  }

  return actions;
}

// ─── Admin Status Filter Tabs ─────────────────────────────────────────────────
export interface StatusFilter {
  key: string;
  label: string;
  statuses: number[];
}

export const ADMIN_STATUS_FILTERS: StatusFilter[] = [
  { key: "actionable",            label: "Actionable",               statuses: [2, 3, 7] },
  { key: "open",                  label: "Open",                     statuses: [2] },
  { key: "inprogress",            label: "In Progress",              statuses: [3] },
  { key: "pendingRejection",      label: "Pending Rejection Review", statuses: [4] },
  { key: "pendingVerification",   label: "Pending Verification",     statuses: [5] },
  { key: "reopened",              label: "Reopened",                 statuses: [7] },
  { key: "all",                   label: "All Reports",              statuses: [] },
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface EnrichedReport {
  id: number;
  ipfsCid: string;
  reportHash: string;
  status: number;
  createdAt: number;
  updatedAt: number;
  phaseDeadline: number;
  assignedAuthority: string;
  votes: {
    validationUpvotes: number;
    validationDownvotes: number;
    verificationAcceptVotes: number;
    verificationRejectVotes: number;
    rejectionUpholdVotes: number;
    rejectionAppealVotes: number;
  };
  authorityComment?: string;
  authorityImageCid?: string;
  authorityCommentResolved?: string;
  description?: string;
  category?: string;
  location?: string;
  images?: { data: string; mimeType: string; originalName: string }[];
  ipfsLoaded: boolean;
  isEmergency: boolean;
}

// ─── Converters ───────────────────────────────────────────────────────────────
export function rawToEnriched(raw: any): EnrichedReport {
  return {
    id: Number(raw.id),
    ipfsCid: raw.ipfsCid,
    reportHash: raw.reportHash,
    status: Number(raw.status),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
    phaseDeadline: Number(raw.phaseDeadline),
    assignedAuthority: raw.assignedAuthority,
    votes: {
      validationUpvotes: Number(raw.votes.validationUpvotes),
      validationDownvotes: Number(raw.votes.validationDownvotes),
      verificationAcceptVotes: Number(raw.votes.verificationAcceptVotes),
      verificationRejectVotes: Number(raw.votes.verificationRejectVotes),
      rejectionUpholdVotes: Number(raw.votes.rejectionUpholdVotes),
      rejectionAppealVotes: Number(raw.votes.rejectionAppealVotes),
    },
    authorityComment: raw.authorityComment,
    authorityImageCid: raw.authorityImageCid,
    ipfsLoaded: false,
    isEmergency: Boolean(raw.isEmergency),
  };
}

function extractCid(raw: string): string | null {
  if (!raw || raw === "ipfs://none") return null;
  const first = raw.split(",")[0].trim();
  return first.startsWith("ipfs://") ? first.slice(7) : first;
}

export async function enrichReportWithIPFS(
  report: EnrichedReport
): Promise<EnrichedReport> {
  let enriched = { ...report };

  // Resolve citizen report IPFS data
  const cid = extractCid(report.ipfsCid);
  if (cid) {
    try {
      const res = await fetch(`/api/ipfs/${cid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          enriched.description = data.description;
          enriched.category = data.category;
          enriched.location = data.location;
          enriched.images = data.images ?? [];
        }
      }
    } catch (err) {
      console.error("Failed to fetch complaint IPFS data:", err);
    }
  }

  // Resolve authority comment text from IPFS if present
  if (report.authorityComment && report.authorityComment.length > 5) {
    try {
      const res = await fetch(`/api/ipfs/text/${report.authorityComment}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.content) {
          enriched.authorityCommentResolved = data.content;
        }
      }
    } catch (err) {
      console.error("Failed to fetch authority comment from IPFS:", err);
    }
  }

  enriched.ipfsLoaded = true;
  return enriched;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────
export function formatLocation(raw?: string): string | undefined {
  if (!raw) return undefined;
  let address = raw;
  try {
    const parsed = JSON.parse(raw);
    address = parsed.address ?? raw;
  } catch {}
  const parts = address
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

export function shortenAddress(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000")
    return "Unassigned";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function extractCoordinates(raw?: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number")
      return { lat: parsed.lat, lng: parsed.lng };
    if (
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    )
      return { lat: parsed.latitude, lng: parsed.longitude };
  } catch {}
  return null;
}

