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
      <div className="md:hidden min-h-screen pb-24 bg-[#F9FAFB]">

        {/* HERO */}
        <div className="relative h-64 bg-slate-100">

          {hasImages ? (
            <img
              src={heroImage!}
              alt={`Report ${report.id}`}
              className="w-full h-full object-cover"
            />
          ) : coordinates ? (
            <MapPreview
              lat={coordinates.lat}
              lng={coordinates.lng}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
              No Preview Available
            </div>
          )}

          {!isEmbed && (
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm"
            >
              <ArrowLeft className="h-4 w-4 text-slate-700" />
            </button>
          )}

          <span
            className={`absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
        </div>

        <div className="p-4 space-y-5">
          {/* Active Voting Phase Countdown */}
          {(report.status === 0 || report.status === 4 || report.status === 5) && report.phaseDeadline > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-[24px] p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
                <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                <span>Voting Ends In:</span>
              </div>
              <CountdownTimer deadline={report.phaseDeadline} compact={true} />
            </div>
          )}

          {/* Voting Phase Explanations */}
          {report.status === 0 && (
            <div className="bg-amber-50/70 border border-amber-100/80 rounded-[24px] p-4.5 text-sm text-amber-900 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Info className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                <span>Community Validation Phase</span>
              </div>
              <p className="leading-relaxed text-xs sm:text-sm text-amber-900/90 font-medium">
                Community members vote to confirm if this report is genuine. If validated by votes, it opens for local authorities to take action. If flagged as fake or duplicate, it is rejected.
              </p>
            </div>
          )}

          {report.status === 5 && (
            <div className="bg-purple-50/70 border border-purple-100/80 rounded-[24px] p-4.5 text-sm text-purple-900 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                <Info className="h-4.5 w-4.5 text-purple-600 shrink-0" />
                <span>Community Verification Phase</span>
              </div>
              <p className="leading-relaxed text-xs sm:text-sm text-purple-900/90 font-medium">
                An authority has submitted work to solve this issue. Citizens vote to verify if the resolution was completed properly or if further work is required.
              </p>
            </div>
          )}

          {report.status === 4 && (
            <div className="bg-orange-50/70 border border-orange-100/80 rounded-[24px] p-4.5 text-sm text-orange-900 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-orange-900 font-bold text-sm">
                <Info className="h-4.5 w-4.5 text-orange-600 shrink-0" />
                <span>Community Rejection Review Phase</span>
              </div>
              <p className="leading-relaxed text-xs sm:text-sm text-orange-900/90 font-medium">
                An authority rejected this issue. Citizens vote to either uphold the authority&apos;s rejection or overturn it to reopen the report for investigation.
              </p>
            </div>
          )}

          {/* Description */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-3">
              Description
            </h2>

            <p className="text-slate-600 text-sm leading-relaxed">
              {report.description ??
                "No description provided."}
            </p>
          </div>

          {/* Meta */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5 space-y-3 text-sm text-slate-600">

            {report.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                <span>{formatLocation(report.location)}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Reported {reportedAt}</span>
            </div>


          </div>

          {/* Assigned Authority Mobile (No wallet addresses, CIDs, or hashes) */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5 flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Landmark className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                Assigned Authority
              </p>
              {report.assignedAuthority === "0x0000000000000000000000000000000000000000" ? (
                <p className="text-sm font-bold text-slate-950">Not yet assigned</p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-900">
                    {report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : "Official Representative"}
                  </p>
                  {report.assignedAuthorityProfile && (
                    <p className="text-xs text-slate-500 font-medium">
                      {report.assignedAuthorityProfile.position} &bull; {report.assignedAuthorityProfile.department}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Authority Action Log Mobile (No wallet addresses, CIDs, or hashes) */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              Authority Action Log
            </h3>
            {actionsHistory.length === 0 ? (
              <p className="text-slate-400 italic text-sm text-center py-2">
                No authority actions recorded on-chain yet.
              </p>
            ) : (
              <div className="relative border-l border-slate-200 ml-3 pl-5 space-y-6">
                {actionsHistory.map((act, index) => {
                  const actionDate = new Date(act.timestamp * 1000).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  });

                  const statusMeta = getStatusMeta(act.stage);

                  return (
                    <div key={index} className="relative">
                      {/* Timeline dot */}
                      <span className={`absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-white ${statusMeta.dot}`} />

                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                            {statusMeta.label}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {actionDate}
                          </span>
                        </div>

                        {/* Authority Name / Role (No wallet address) */}
                        <div className="text-xs font-semibold text-slate-700">
                          <span className="text-slate-800">
                            {act.profile ? act.profile.name : "Official Representative"}
                          </span>
                          {act.profile && (
                            <span className="text-slate-400 font-medium">
                              {" "}({act.profile.position} &bull; {act.profile.department})
                            </span>
                          )}
                        </div>

                        {/* Comment Content */}
                        {act.commentText && (
                          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100/50 rounded-xl p-2.5 leading-relaxed whitespace-pre-wrap">
                            {act.commentText}
                          </p>
                        )}

                        {/* Uploaded Evidence Image (No IPFS CID text displayed) */}
                        {act.imageCid && act.imageCid.length > 5 && (
                          <div className="mt-1.5 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-xs aspect-video bg-slate-50">
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
            )}
          </div>

          {voteControls}

          {voteMessage && (
            <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{voteMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex flex-col w-full min-h-screen bg-[#F9FAFB]">
        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">

          {/* Top Bar */}
          {!isEmbed && (
            <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-6">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-800 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Report Detail
              </button>

              <div className="flex items-center gap-4 text-slate-500">
                <button className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <Bell className="h-5 w-5" />
                </button>

                <button className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-[1fr_320px] gap-8 px-4 sm:px-6 lg:px-8 pb-8">

            {/* LEFT */}
          <div className="flex flex-col gap-6">

            {/* HERO */}
            <div className="relative w-full h-85 rounded-[24px] overflow-hidden bg-slate-100 shadow-sm">

              {hasImages ? (
                <img
                  src={heroImage!}
                  alt={`Report ${report.id}`}
                  className="w-full h-full object-cover"
                />
              ) : coordinates ? (
                <MapPreview
                  lat={coordinates.lat}
                  lng={coordinates.lng}
                  interactive={true}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  No Preview Available
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.text}`}
                >
                  {status.label}
                </span>

                {report.category && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600">
                    {report.category}
                  </span>
                )}

                <span className="text-slate-400 text-sm font-mono">
                  ID: #{report.id}
                </span>
              </div>

              {(report.status === 0 || report.status === 4 || report.status === 5) && report.phaseDeadline > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-3.5 py-1.5 rounded-full text-blue-700 text-xs font-bold shadow-sm">
                  <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                  <span>VOTING ENDS IN:</span>
                  <CountdownTimer deadline={report.phaseDeadline} compact={true} />
                </div>
              )}
            </div>

            {/* Title */}
            <h1 className="text-4xl font-extrabold text-slate-900 leading-tight">
              {report.category
                ? `${report.category} Issue`
                : `Report #${report.id}`}
            </h1>

            {/* Meta */}
            <div className="flex items-center flex-wrap gap-4 text-sm text-slate-500">

              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Reported {reportedAt}
              </span>

              {report.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {formatLocation(report.location)}
                </span>
              )}
            </div>

            {/* Voting Phase Explanations */}
            {report.status === 0 && (
              <div className="bg-amber-50/70 border border-amber-100/80 rounded-[24px] p-4.5 text-sm text-amber-900 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <Info className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                  <span>Community Validation Phase</span>
                </div>
                <p className="leading-relaxed text-xs sm:text-sm text-amber-900/90 font-medium">
                  Community members vote to confirm if this report is genuine. If validated by votes, it opens for local authorities to take action. If flagged as fake or duplicate, it is rejected.
                </p>
              </div>
            )}

            {report.status === 5 && (
              <div className="bg-purple-50/70 border border-purple-100/80 rounded-[24px] p-4.5 text-sm text-purple-900 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                  <Info className="h-4.5 w-4.5 text-purple-600 shrink-0" />
                  <span>Community Verification Phase</span>
                </div>
                <p className="leading-relaxed text-xs sm:text-sm text-purple-900/90 font-medium">
                  An authority has submitted work to solve this issue. Citizens vote to verify if the resolution was completed properly or if further work is required.
                </p>
              </div>
            )}

            {report.status === 4 && (
              <div className="bg-orange-50/70 border border-orange-100/80 rounded-[24px] p-4.5 text-sm text-orange-900 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-orange-900 font-bold text-sm">
                  <Info className="h-4.5 w-4.5 text-orange-600 shrink-0" />
                  <span>Community Rejection Review Phase</span>
                </div>
                <p className="leading-relaxed text-xs sm:text-sm text-orange-900/90 font-medium">
                  An authority rejected this issue. Citizens vote to either uphold the authority&apos;s rejection or overturn it to reopen the report for investigation.
                </p>
              </div>
            )}

            {/* Description */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">
                Detailed Description
              </h2>

              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                {report.description ??
                  "No description provided."}
              </p>
            </div>

            {/* Evidence */}
            {report.images && report.images.length > 1 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-slate-500" />
                  Evidence ({report.images.length} images)
                </h2>

                <div className="grid grid-cols-2 gap-4">

                  {report.images.map((img, i) => (
                    <div
                      key={i}
                      className="rounded-[24px] overflow-hidden border border-slate-100 shadow-sm aspect-video bg-slate-100"
                    >
                      <img
                        src={`data:${
                          img.mimeType || "image/jpeg"
                        };base64,${img.data}`}
                        alt={img.originalName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IPFS */}
            {/* <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                IPFS Content Identifier
              </p>

              <p className="text-xs font-mono text-slate-600 break-all">
                {report.ipfsCid}
              </p>
            </div> */}

            {/* Authority Action Log Desktop (No wallet addresses, CIDs, or hashes) */}
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 mt-2">
              <h2 className="text-lg font-bold text-slate-900 mb-5">
                Authority Action Log
              </h2>
              {actionsHistory.length === 0 ? (
                <p className="text-slate-400 italic text-sm text-center py-4">
                  No authority actions recorded on-chain yet.
                </p>
              ) : (
                <div className="relative border-l border-slate-200 ml-4 pl-6 space-y-8">
                  {actionsHistory.map((act, index) => {
                    const actionDate = new Date(act.timestamp * 1000).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });

                    const statusMeta = getStatusMeta(act.stage);

                    return (
                      <div key={index} className="relative">
                        {/* Timeline dot */}
                        <span className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white ${statusMeta.dot}`} />

                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                              {statusMeta.label}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {actionDate}
                            </span>
                          </div>

                          {/* Authority Name / Role (No wallet address) */}
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <span className="text-slate-800">
                              {act.profile ? act.profile.name : "Official Representative"}
                            </span>
                            {act.profile && (
                              <span className="text-slate-400 font-medium">
                                ({act.profile.position} &bull; {act.profile.department})
                              </span>
                            )}
                          </div>

                          {/* Comment Content */}
                          {act.commentText && (
                            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100/50 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                              {act.commentText}
                            </p>
                          )}

                          {/* Uploaded Evidence Image (No IPFS CID text displayed) */}
                          {act.imageCid && act.imageCid.length > 5 && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-sm aspect-video bg-slate-50">
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
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-5 sticky top-8 self-start">

            {voteControls}

            {voteMessage && (
              <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{voteMessage}</span>
              </div>
            )}

            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5">

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">
                  Community Consensus
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                  {phaseVotes.phaseLabel}
                </span>
              </div>

              <div className="mb-4">

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">
                    {phaseVotes.agreeLabel} rate
                  </span>

                  <span className="text-2xl font-extrabold text-blue-600">
                    {pct}%
                  </span>
                </div>

                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3" />
                    {phaseVotes.agree} {phaseVotes.agreeLabel}
                  </p>
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                    <ThumbsDown className="h-3 w-3" />
                    {phaseVotes.disagree} {phaseVotes.disagreeLabel}
                  </p>
                </div>
              </div>
            </div>

            {/* Authority */}
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5 flex gap-4">

              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Landmark className="h-5 w-5 text-slate-500" />
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                  Assigned Authority
                </p>

                {report.assignedAuthority === "0x0000000000000000000000000000000000000000" ? (
                  <p className="text-sm font-bold text-slate-950">Not yet assigned</p>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      {report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : "Official Representative"}
                    </p>
                    {report.assignedAuthorityProfile && (
                      <p className="text-xs text-slate-500 font-medium">
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
    </>
  );
}
