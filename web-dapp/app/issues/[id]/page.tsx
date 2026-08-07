"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import {
  ArrowLeft,
  MapPin,
  Clock,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
  AlertCircle,
  ImageIcon,
  Bell,
  Settings,
  Landmark,
  Shield,
  Info,
} from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { castVoteOnRelayer } from "@/lib/relayerAPI";
import { buildSignedVotePayload, type VotePhase } from "@/lib/vote";
import { getVotePhaseFromStatus, getStatusMeta } from "@/lib/reportHelpers";
import { VoteControls } from "@/components/VoteControls";
import { ReportingABI, AuthorityMultiSigABI } from "@/lib/contracts/abis";
import CountdownTimer from "@/components/ui/CountdownTimer";

// Dynamic import to avoid SSR window issues
const MapPreview = dynamic(() => import("@/components/MapPreview"), {
  ssr: false,
});

// ── ABI ──────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
const MULTISIG_ADDRESS = process.env.NEXT_PUBLIC_MULTISIG_ADDRESS || "";

// ── Types ─────────────────────────────────────────────────────────
interface VoteCounters {
  validationUpvotes: number;
  validationDownvotes: number;
  verificationAcceptVotes: number;
  verificationRejectVotes: number;
  rejectionUpholdVotes: number;
  rejectionAppealVotes: number;
}

interface AuthorityProfile {
  name: string;
  position: string;
  department: string;
}

interface ActionLogEntry {
  authority: string;
  stage: number;
  commentCid: string;
  imageCid: string;
  timestamp: number;
  commentText: string;
  profile: AuthorityProfile | null;
}

interface ReportDetail {
  id: string;
  ipfsCid: string;
  status: number;
  createdAt: number;
  phaseDeadline: number;
  votes: VoteCounters;
  assignedAuthority: string;
  assignedAuthorityProfile?: AuthorityProfile | null;

  // IPFS
  description?: string;
  category?: string;
  location?: string;
  images?: {
    data: string;
    mimeType: string;
    originalName: string;
  }[];

  ipfsLoaded?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────
const STATUS_MAP: Record<
  number,
  { label: string; bg: string; text: string }
> = {
  0: {
    label: "Pending Validation",
    bg: "bg-amber-100",
    text: "text-amber-700",
  },
  1: {
    label: "Community Rejected",
    bg: "bg-red-100",
    text: "text-red-700",
  },
  2: {
    label: "Open",
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  3: {
    label: "In Progress",
    bg: "bg-indigo-100",
    text: "text-indigo-700",
  },
  4: {
    label: "Rejection Under Review",
    bg: "bg-orange-100",
    text: "text-orange-700",
  },
  5: {
    label: "Pending Verification",
    bg: "bg-purple-100",
    text: "text-purple-700",
  },
  6: {
    label: "Closed / Solved",
    bg: "bg-green-100",
    text: "text-green-700",
  },
  7: {
    label: "Reopened",
    bg: "bg-slate-100",
    text: "text-slate-700",
  },
};

function getStatus(s: number) {
  return (
    STATUS_MAP[s] ?? {
      label: "Unknown",
      bg: "bg-slate-100",
      text: "text-slate-700",
    }
  );
}

function extractCid(raw: string): string | null {
  if (!raw || raw === "ipfs://none") return null;

  const first = raw.split(",")[0].trim();

  return first.startsWith("ipfs://") ? first.slice(7) : first;
}

function formatLocation(raw?: string): string | undefined {
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

function extractCoordinates(
  raw?: string
): { lat: number; lng: number } | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number"
    ) {
      return {
        lat: parsed.lat,
        lng: parsed.lng,
      };
    }

    if (
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    ) {
      return {
        lat: parsed.latitude,
        lng: parsed.longitude,
      };
    }
  } catch {}

  return null;
}

function consensusPct(up: number, down: number) {
  const total = up + down;
  if (total === 0) return 0;
  return Math.round((up / total) * 100);
}

/** Returns the agree/disagree vote pair relevant to the report's current phase. */
function getPhaseVotes(
  votes: VoteCounters,
  status: number
): { agree: number; disagree: number; agreeLabel: string; disagreeLabel: string; phaseLabel: string } {
  switch (status) {
    case 0: // PendingValidation
      return {
        agree: votes.validationUpvotes,
        disagree: votes.validationDownvotes,
        agreeLabel: "Upvotes",
        disagreeLabel: "Downvotes",
        phaseLabel: "Validation",
      };
    case 5: // PendingVerification
      return {
        agree: votes.verificationAcceptVotes,
        disagree: votes.verificationRejectVotes,
        agreeLabel: "Accepted",
        disagreeLabel: "Rejected",
        phaseLabel: "Verification",
      };
    case 4: // PendingRejectionReview
      return {
        agree: votes.rejectionUpholdVotes,
        disagree: votes.rejectionAppealVotes,
        agreeLabel: "Upheld",
        disagreeLabel: "Appealed",
        phaseLabel: "Rejection Review",
      };
    default:
      // No active voting window — show whichever phase had the most activity
      if (votes.verificationAcceptVotes + votes.verificationRejectVotes > 0) {
        return {
          agree: votes.verificationAcceptVotes,
          disagree: votes.verificationRejectVotes,
          agreeLabel: "Accepted",
          disagreeLabel: "Rejected",
          phaseLabel: "Verification",
        };
      }
      if (votes.rejectionUpholdVotes + votes.rejectionAppealVotes > 0) {
        return {
          agree: votes.rejectionUpholdVotes,
          disagree: votes.rejectionAppealVotes,
          agreeLabel: "Upheld",
          disagreeLabel: "Appealed",
          phaseLabel: "Rejection Review",
        };
      }
      return {
        agree: votes.validationUpvotes,
        disagree: votes.validationDownvotes,
        agreeLabel: "Upvotes",
        disagreeLabel: "Downvotes",
        phaseLabel: "Validation",
      };
  }
}


// ── Page ──────────────────────────────────────────────────────────
export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbed = searchParams?.get("embed") === "true";

  const { id } = use(params);
  const { wallet, consumeTicket, availableTicketsCount } = useCitizen();

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voteMessage, setVoteMessage] = useState<string | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionLogEntry[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Derive the correct vote phase from the report's on-chain status
  const votePhase: VotePhase | null = report ? getVotePhaseFromStatus(report.status) : null;

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error";
  
  const handleCastVote = async (decision: boolean) => {
    if (!wallet) {
      toast.error("Please connect your Citizen wallet first.");
      return;
    }

    if (!report) {
      toast.error("Report data is not ready yet.");
      return;
    }

    if (!votePhase) {
      toast.error("This report has no active voting window.");
      return;
    }

    if (availableTicketsCount === 0) {
      toast.error("You have run out of ZKP action tickets! Please request more.");
      return;
    }

    setIsSubmitting(true);
    const votePromise = async () => {
      const currentTicket = consumeTicket();

      if (!currentTicket) {
        throw new Error("No valid ZKP ticket for voting.");
      }

      const payload = await buildSignedVotePayload({
        wallet,
        reportId: Number(report.id),
        votePhase,
        decision,
        ticket: currentTicket,
      });

      const data = await castVoteOnRelayer(payload);

      if (!data?.success) {
        throw new Error(data?.message || "Failed to cast vote.");
      }
      return data;
    };

    toast.promise(votePromise(), {
      loading: 'Submitting your vote securely...',
      success: 'Vote cast successfully!',
      error: (err: any) => getErrorMessage(err) || "Failed to cast vote."
    }).then(() => {
      setSelectedDecision(decision);
    }).finally(() => {
      setIsSubmitting(false);
    });
  };

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          ReportingABI,
          provider
        );

        const r = await contract.getReport(Number(id));

        let assignedProfile = null;
        if (
          MULTISIG_ADDRESS &&
          r.assignedAuthority !== "0x0000000000000000000000000000000000000000"
        ) {
          try {
            const multiSigContract = new ethers.Contract(
              MULTISIG_ADDRESS,
              AuthorityMultiSigABI,
              provider
            );
            const prof = await multiSigContract.getProfile(r.assignedAuthority);
            if (prof.isSet) {
              assignedProfile = {
                name: prof.name,
                position: prof.position,
                department: prof.department,
              };
            }
          } catch (e) {
            console.error("Error fetching assigned authority profile:", e);
          }
        }

        const base: ReportDetail = {
          id: r.id.toString(),
          ipfsCid: r.ipfsCid,
          status: Number(r.status),
          createdAt: Number(r.createdAt) * 1000,
          phaseDeadline: Number(r.phaseDeadline) * 1000,
          votes: {
            validationUpvotes: Number(r.votes.validationUpvotes),
            validationDownvotes: Number(r.votes.validationDownvotes),
            verificationAcceptVotes: Number(r.votes.verificationAcceptVotes),
            verificationRejectVotes: Number(r.votes.verificationRejectVotes),
            rejectionUpholdVotes: Number(r.votes.rejectionUpholdVotes),
            rejectionAppealVotes: Number(r.votes.rejectionAppealVotes),
          },
          assignedAuthority: r.assignedAuthority,
          assignedAuthorityProfile: assignedProfile,
          ipfsLoaded: false,
        };

        // Fetch authority actions history
        let enrichedActions: ActionLogEntry[] = [];
        try {
          const rawActions = await contract.getReportActions(Number(id));
          const multiSigContract = new ethers.Contract(
            MULTISIG_ADDRESS,
            AuthorityMultiSigABI,
            provider
          );
          enrichedActions = await Promise.all(
            rawActions.map(async (act: any) => {
              const authority = act.authority;
              const stage = Number(act.stage);
              const commentCid = act.comment;
              const imageCid = act.imageCid;
              const timestamp = Number(act.timestamp);

              let commentText = "";
              if (commentCid && commentCid.trim().length > 5) {
                try {
                  const textRes = await fetch(`/api/ipfs/text/${commentCid}`);
                  if (textRes.ok) {
                    const textData = await textRes.json();
                    if (textData.success && textData.content) {
                      commentText = textData.content;
                    }
                  }
                } catch (e) {
                  console.error("Error resolving action comment:", e);
                }
              }

              let profile = null;
              if (MULTISIG_ADDRESS) {
                try {
                  const prof = await multiSigContract.getProfile(authority);
                  if (prof.isSet) {
                    profile = {
                      name: prof.name,
                      position: prof.position,
                      department: prof.department,
                    };
                  }
                } catch (e) {
                  console.error("Error fetching authority profile:", e);
                }
              }

              return {
                authority,
                stage,
                commentCid,
                imageCid,
                timestamp,
                commentText,
                profile,
              };
            })
          );
        } catch (err) {
          console.error("Failed to load actions history:", err);
        }

        if (!cancelled) {
          setReport(base);
          setActionsHistory(enrichedActions.reverse());
        }

        const cid = extractCid(r.ipfsCid);

        if (cid) {
          const res = await fetch(`/api/ipfs/${cid}`);

          if (res.ok) {
            const data = await res.json();

            if (data.success && !cancelled) {
              setReport((prev) =>
                prev
                  ? {
                      ...prev,
                      description: data.description,
                      category: data.category,
                      location: data.location,
                      images: data.images ?? [],
                      ipfsLoaded: true,
                    }
                  : prev
              );
            }
          }
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(error) || "Failed to load report.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <RotateCw className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-slate-500 font-medium">
            Retrieving block payload…
          </p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-red-400" />

        <h2 className="text-xl font-bold text-slate-900">
          Report Not Found
        </h2>

        <p className="text-slate-500 text-sm text-center max-w-sm">
          {error ??
            "The requested report could not be found on the ledger."}
        </p>

        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const status = getStatus(report.status);

  const phaseVotes = getPhaseVotes(report.votes, report.status);
  const pct = consensusPct(phaseVotes.agree, phaseVotes.disagree);

  const reportedAt = new Date(report.createdAt).toLocaleString(
    "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  );

  const coordinates = extractCoordinates(report.location);

  const hasImages = report.images && report.images.length > 0;

  const heroImage =
    report.images?.[0]?.data
      ? `data:${report.images[0].mimeType || "image/jpeg"};base64,${
          report.images[0].data
        }`
      : null;

  // Only render vote controls when there is an active voting window
  const voteControls = votePhase ? (
    <VoteControls
      phase={votePhase}
      selectedDecision={selectedDecision}
      onVote={handleCastVote}
      isSubmitting={isSubmitting}
      availableTicketsCount={availableTicketsCount}
    />
  ) : (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-500 text-center">
        No active voting window for this report.
      </p>
    </div>
  );

  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden min-h-screen bg-[#F9FAFB] pb-[160px] relative">
        
        {/* HERO */}
        <div className="relative h-80 w-full rounded-b-[32px] overflow-hidden shadow-sm mb-6">
          {hasImages ? (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/30 to-slate-900/10 z-10" />
              <img
                src={heroImage!}
                alt={`Report ${report.id}`}
                className="w-full h-full object-cover absolute inset-0"
              />
            </>
          ) : coordinates ? (
            <div className="absolute inset-0 w-full h-full">
              <MapPreview
                lat={coordinates.lat}
                lng={coordinates.lng}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent pointer-events-none z-10" />
            </div>
          ) : (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
              <AlertCircle className="h-16 w-16 text-white/10" />
            </div>
          )}

          {!isEmbed && (
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 z-20 shadow-sm"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          )}

          <div className="absolute bottom-5 left-5 right-5 z-20">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${status.bg} ${status.text} bg-opacity-90 backdrop-blur-md`}>
                {status.label}
              </span>
              {report.category && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-sm">
                  {report.category}
                </span>
              )}
            </div>
            
            <h1 className="text-2xl font-extrabold text-white leading-tight drop-shadow-md mb-2">
              {report.category ? `${report.category} Issue` : `Report #${report.id}`}
            </h1>
            
            <div className="flex items-center gap-4 text-white/80 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {reportedAt}
              </span>
              {report.location && (
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3 w-3" />
                  {formatLocation(report.location)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 space-y-6">
          {/* Active Voting Phase Countdown */}
          {(report.status === 0 || report.status === 4 || report.status === 5) && report.phaseDeadline > 0 && (
            <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-xs tracking-wider uppercase">
                <Clock className="h-4 w-4 text-rose-500 animate-pulse" />
                <span>Ends In:</span>
              </div>
              <CountdownTimer deadline={report.phaseDeadline} compact={true} />
            </div>
          )}

          {/* Voting Phase Explanations */}
          {report.status === 0 && (
            <div className="bg-amber-50/70 border border-amber-100/80 rounded-[24px] p-5 text-sm text-amber-900 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Info className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                <span>Validation Phase</span>
              </div>
              <p className="leading-relaxed text-xs text-amber-900/90 font-medium">
                Vote to confirm if this report is genuine. Validated reports are sent to authorities.
              </p>
            </div>
          )}

          {report.status === 5 && (
            <div className="bg-purple-50/70 border border-purple-100/80 rounded-[24px] p-5 text-sm text-purple-900 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                <Info className="h-4.5 w-4.5 text-purple-600 shrink-0" />
                <span>Verification Phase</span>
              </div>
              <p className="leading-relaxed text-xs text-purple-900/90 font-medium">
                An authority has resolved this. Vote to verify the work was completed properly.
              </p>
            </div>
          )}

          {report.status === 4 && (
            <div className="bg-orange-50/70 border border-orange-100/80 rounded-[24px] p-5 text-sm text-orange-900 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-orange-900 font-bold text-sm">
                <Info className="h-4.5 w-4.5 text-orange-600 shrink-0" />
                <span>Rejection Review Phase</span>
              </div>
              <p className="leading-relaxed text-xs text-orange-900/90 font-medium">
                The authority rejected this. Vote to uphold the rejection or overturn it.
              </p>
            </div>
          )}

          {/* Consensus Mini-Card */}
          <div className="bg-white rounded-[24px] shadow-sm border border-slate-100/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Consensus
              </h3>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                {phaseVotes.phaseLabel}
              </span>
            </div>

            <div className="flex items-end justify-between mb-2">
              <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {pct}%
              </span>
              <span className="text-xl font-extrabold tracking-tight text-slate-300">
                {100 - pct}%
              </span>
            </div>

            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex mb-3">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000" style={{ width: `${pct}%` }} />
              <div className="h-full bg-slate-200 transition-all duration-1000" style={{ width: `${100 - pct}%` }} />
            </div>

            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
              <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                <ThumbsUp className="h-3 w-3" /> {phaseVotes.agree}
              </div>
              <div className="flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-md">
                <ThumbsDown className="h-3 w-3" /> {phaseVotes.disagree}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-600 rounded-full inline-block"></span>
              Description
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed font-medium">
              {report.description ?? "No description provided."}
            </p>
          </div>

          {/* Evidence Gallery Mobile */}
          {report.images && report.images.length > 0 && (
            <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-400" />
                Evidence Gallery
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {report.images.map((img, i) => {
                  const imgSrc = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedImage(imgSrc)}
                      className="rounded-[16px] overflow-hidden border border-slate-100 shadow-sm aspect-square bg-slate-100 cursor-pointer"
                    >
                      <img
                        src={imgSrc}
                        alt={img.originalName || "Evidence Photo"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assigned Authority Mobile */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[24px] p-5 text-white shadow-md relative overflow-hidden flex gap-4 items-center">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 backdrop-blur-sm relative z-10 border border-white/10">
              <Landmark className="h-5 w-5 text-blue-200" />
            </div>
            <div className="relative z-10">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                Assigned Authority
              </p>
              {report.assignedAuthority === "0x0000000000000000000000000000000000000000" ? (
                <p className="text-sm font-bold text-white/90">Pending</p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-white">
                    {report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : "Official Representative"}
                  </p>
                  {report.assignedAuthorityProfile && (
                    <p className="text-[10px] text-blue-300 font-medium">
                      {report.assignedAuthorityProfile.department}
                    </p>
                  )}
                </div>
              )}
            </div>
            <Landmark className="absolute -right-2 -bottom-2 w-20 h-20 text-white/5 z-0" />
          </div>

          {/* Authority Action Log Mobile */}
          <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              Action Log
            </h3>
            {actionsHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 bg-slate-50 rounded-[16px] border border-slate-100 border-dashed">
                <Clock className="h-6 w-6 text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium text-xs">No official actions recorded.</p>
              </div>
            ) : (
              <div className="relative ml-2">
                <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-slate-100" />
                <div className="space-y-6 relative">
                  {actionsHistory.map((act, index) => {
                    const actionDate = new Date(act.timestamp * 1000).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });
                    const statusMeta = getStatusMeta(act.stage);

                    return (
                      <div key={index} className="relative pl-8 group">
                        <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center z-10 ${statusMeta.bg} ${statusMeta.text}`}>
                          <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        </div>

                        <div className="bg-slate-50 rounded-[16px] p-4 border border-slate-100/60">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusMeta.bg} ${statusMeta.text}`}>
                              {statusMeta.label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {actionDate}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-800 mb-2">
                            {act.profile ? act.profile.name : "Official"}
                          </div>

                          {act.commentText && (
                            <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-3 leading-relaxed whitespace-pre-wrap shadow-sm">
                              {act.commentText}
                            </p>
                          )}

                          {act.imageCid && act.imageCid.length > 5 && (
                            <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white">
                              <img src={`/api/ipfs/image/${act.imageCid}`} alt="Attachment" className="w-full h-auto object-cover" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FLOATING VOTE CONTROLS (MOBILE) */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-2xl border-t border-slate-100/50 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] z-50 rounded-t-[32px]">
           {votePhase ? (
             <VoteControls
               phase={votePhase}
               selectedDecision={selectedDecision}
               onVote={handleCastVote}
               isSubmitting={isSubmitting}
               availableTicketsCount={availableTicketsCount}
             />
           ) : (
             <div className="text-center py-2 flex items-center justify-center gap-2">
               <Shield className="w-5 h-5 text-slate-300" />
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                 Voting Closed
               </p>
             </div>
           )}
           
           {voteMessage && (
             <div className="mt-3 rounded-[16px] border border-blue-100 bg-blue-50/80 px-4 py-2.5 text-xs text-blue-800 flex items-start gap-2">
               <Info className="h-4 w-4 shrink-0 text-blue-600" />
               <span className="font-medium">{voteMessage}</span>
             </div>
           )}
        </div>
      </div>
      
      {/* DESKTOP */}
      <div className="hidden md:flex flex-col w-full min-h-screen bg-[#F9FAFB] pb-20">
        
        {/* Top Bar */}
        {!isEmbed && (
          <div className="w-full bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-slate-700 font-bold text-sm hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Feed
              </button>

              <div className="flex items-center gap-4 text-slate-500">
                <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <Bell className="h-5 w-5" />
                </button>
                <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-12 flex-1 flex flex-col">
          
          {/* IMMERSIVE HERO HEADER */}
          <div className="relative w-full h-[400px] rounded-[32px] overflow-hidden shadow-sm mb-10 group">
            {hasImages ? (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-900/10 z-10 transition-opacity duration-500" />
                <img
                  src={heroImage!}
                  alt={`Report ${report.id}`}
                  className="w-full h-full object-cover absolute inset-0 transition-transform duration-700 group-hover:scale-105"
                />
              </>
            ) : coordinates ? (
              <div className="absolute inset-0 w-full h-full">
                <MapPreview
                  lat={coordinates.lat}
                  lng={coordinates.lng}
                  interactive={true}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-900/10 pointer-events-none z-10" />
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
                <AlertCircle className="h-32 w-32 text-white/10" />
              </div>
            )}

            {/* Overlay Content */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end p-10 md:p-12 text-white">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div className="flex items-center gap-3">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${status.bg} ${status.text} bg-opacity-90 backdrop-blur-md`}>
                    {status.label}
                  </span>
                  {report.category && (
                    <span className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-sm">
                      {report.category}
                    </span>
                  )}
                  <span className="text-white/60 text-sm font-mono tracking-widest uppercase">
                    ID: #{report.id}
                  </span>
                </div>

                {(report.status === 0 || report.status === 4 || report.status === 5) && report.phaseDeadline > 0 && (
                  <div className="flex items-center gap-2 bg-rose-500/90 backdrop-blur-md border border-rose-400/50 px-4 py-2 rounded-full text-white text-xs font-bold shadow-lg">
                    <Clock className="h-4 w-4 animate-pulse" />
                    <span className="tracking-wider">VOTING ENDS IN:</span>
                    <CountdownTimer deadline={report.phaseDeadline} compact={true} />
                  </div>
                )}
              </div>

              <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight drop-shadow-md max-w-4xl">
                {report.category ? `${report.category} Issue Reported` : `Civic Report #${report.id}`}
              </h1>

              <div className="flex items-center gap-6 text-white/80 font-medium text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Reported {reportedAt}
                </span>
                {report.location && (
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {formatLocation(report.location)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* GRID LAYOUT */}
          <div className="grid grid-cols-[1fr_360px] gap-10">
            
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-8">
              
              {/* Voting Phase Explanations */}
              {report.status === 0 && (
                <div className="bg-amber-50/70 border border-amber-100/80 rounded-[24px] p-6 text-sm text-amber-900 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                    <Info className="h-5 w-5 text-amber-600 shrink-0" />
                    <span>Community Validation Phase</span>
                  </div>
                  <p className="leading-relaxed text-amber-900/90 font-medium text-base">
                    Community members vote to confirm if this report is genuine. If validated by votes, it opens for local authorities to take action. If flagged as fake or duplicate, it is rejected.
                  </p>
                </div>
              )}

              {report.status === 5 && (
                <div className="bg-purple-50/70 border border-purple-100/80 rounded-[24px] p-6 text-sm text-purple-900 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-purple-900 font-bold text-base">
                    <Info className="h-5 w-5 text-purple-600 shrink-0" />
                    <span>Community Verification Phase</span>
                  </div>
                  <p className="leading-relaxed text-purple-900/90 font-medium text-base">
                    An authority has submitted work to solve this issue. Citizens vote to verify if the resolution was completed properly or if further work is required.
                  </p>
                </div>
              )}

              {report.status === 4 && (
                <div className="bg-orange-50/70 border border-orange-100/80 rounded-[24px] p-6 text-sm text-orange-900 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-orange-900 font-bold text-base">
                    <Info className="h-5 w-5 text-orange-600 shrink-0" />
                    <span>Community Rejection Review Phase</span>
                  </div>
                  <p className="leading-relaxed text-orange-900/90 font-medium text-base">
                    An authority rejected this issue. Citizens vote to either uphold the authority's rejection or overturn it to reopen the report for investigation.
                  </p>
                </div>
              )}

              {/* Description */}
              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100/60">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-blue-600 rounded-full inline-block"></span>
                  Detailed Description
                </h2>
                <p className="text-slate-600 text-base leading-relaxed whitespace-pre-wrap font-medium">
                  {report.description ?? "No description provided."}
                </p>
              </div>

              {/* Evidence Gallery */}
              {report.images && report.images.length > 0 && (
                <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100/60">
                  <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-slate-400" />
                    Evidence Gallery
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    {report.images.map((img, i) => {
                      const imgSrc = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedImage(imgSrc)}
                          className="rounded-[20px] overflow-hidden border border-slate-100 shadow-sm aspect-video bg-slate-100 group cursor-pointer relative"
                        >
                          <img
                            src={imgSrc}
                            alt={img.originalName || "Evidence Photo"}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors duration-300 flex items-center justify-center pointer-events-none" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Elegant Timeline (Authority Action Log) */}
              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100/60">
                <h2 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-slate-400" />
                  Authority Action Log
                </h2>
                
                {actionsHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-[20px] border border-slate-100 border-dashed">
                    <Clock className="h-8 w-8 text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium text-sm">No official actions recorded yet.</p>
                  </div>
                ) : (
                  <div className="relative ml-4">
                    {/* Continuous vertical line */}
                    <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-100" />
                    
                    <div className="space-y-8 relative">
                      {actionsHistory.map((act, index) => {
                        const actionDate = new Date(act.timestamp * 1000).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        });
                        const statusMeta = getStatusMeta(act.stage);

                        return (
                          <div key={index} className="relative pl-12 group">
                            {/* Animated Timeline Node */}
                            <div className={`absolute left-0 top-1 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${statusMeta.bg} ${statusMeta.text}`}>
                              <div className="w-2 h-2 rounded-full bg-current" />
                            </div>

                            <div className="bg-slate-50 rounded-[20px] p-5 border border-slate-100/60 transition-colors group-hover:bg-slate-50/80 group-hover:border-slate-200">
                              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusMeta.bg} ${statusMeta.text}`}>
                                  {statusMeta.label}
                                </span>
                                <span className="text-xs text-slate-400 font-medium tracking-wide">
                                  {actionDate}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                                  <Landmark className="w-3.5 h-3.5 text-slate-500" />
                                </div>
                                {act.profile ? act.profile.name : "Official Representative"}
                                {act.profile && (
                                  <span className="text-slate-400 font-medium text-xs ml-1">
                                    &bull; {act.profile.position}, {act.profile.department}
                                  </span>
                                )}
                              </div>

                              {act.commentText && (
                                <p className="text-sm text-slate-600 bg-white border border-slate-100 rounded-xl p-4 leading-relaxed whitespace-pre-wrap shadow-sm">
                                  {act.commentText}
                                </p>
                              )}

                              {act.imageCid && act.imageCid.length > 5 && (
                                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-sm aspect-video bg-white">
                                  <img
                                    src={`/api/ipfs/image/${act.imageCid}`}
                                    alt="Action Attachment"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-6 sticky top-24 self-start">
              
              {/* Glassmorphic Vote Controls */}
              <div className="bg-white/60 backdrop-blur-xl rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white">
                {votePhase ? (
                  <VoteControls
                    phase={votePhase}
                    selectedDecision={selectedDecision}
                    onVote={handleCastVote}
                    isSubmitting={isSubmitting}
                    availableTicketsCount={availableTicketsCount}
                  />
                ) : (
                  <div className="text-center py-4">
                    <Shield className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                      Voting Closed
                    </p>
                  </div>
                )}
                
                {voteMessage && (
                  <div className="mt-4 rounded-[20px] border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-800 flex items-start gap-2 backdrop-blur-sm">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
                    <span className="font-medium">{voteMessage}</span>
                  </div>
                )}
              </div>

              {/* Redesigned Consensus Card */}
              <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Live Consensus
                  </h3>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                    {phaseVotes.phaseLabel}
                  </span>
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {pct}%
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {phaseVotes.agreeLabel}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-3xl font-extrabold tracking-tight text-slate-300">
                      {100 - pct}%
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {phaseVotes.disagreeLabel}
                    </span>
                  </div>
                </div>

                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                  <div
                    className="h-full bg-slate-200 transition-all duration-1000 ease-out"
                    style={{ width: `${100 - pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-4 text-xs font-bold text-slate-500">
                  <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {phaseVotes.agree}
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg">
                    <ThumbsDown className="h-3.5 w-3.5" />
                    {phaseVotes.disagree}
                  </div>
                </div>
              </div>

              {/* Assigned Authority */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-6 -top-6 opacity-10">
                  <Landmark className="w-32 h-32" />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 relative z-10">
                  Assigned Authority
                </p>
                <div className="relative z-10">
                  {report.assignedAuthority === "0x0000000000000000000000000000000000000000" ? (
                    <p className="text-base font-bold text-white/90">Pending Assignment</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-white">
                        {report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : "Official Representative"}
                      </p>
                      {report.assignedAuthorityProfile && (
                        <p className="text-sm text-blue-300 font-medium">
                          {report.assignedAuthorityProfile.position} &bull; {report.assignedAuthorityProfile.department}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 cursor-zoom-out transition-all duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full max-h-[90vh] flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="Evidence Preview" 
              className="max-w-full max-h-full object-contain rounded-[24px] shadow-2xl" 
            />
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
