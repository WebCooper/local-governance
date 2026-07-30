"use client";
 
import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Landmark,
  Shield,
  RotateCw,
  AlertCircle,
  ImageIcon,
  Calendar,
  Users,
  MessageSquare,
  Plus,
} from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { ReportStatusBadge } from "@/components/admin/ReportStatusBadge";
import { ReportActionButtons } from "@/components/admin/ReportActionButtons";
import { VoteRow } from "@/components/admin/VoteRow";
import { ReportingABI, AuthorityMultiSigABI } from "@/lib/contracts/abis";
import {
  type EnrichedReport,
  rawToEnriched,
  enrichReportWithIPFS,
  formatLocation,
  shortenAddress,
  getStatusMeta,
  extractCoordinates,
} from "@/lib/reportHelpers";
import Link from "next/link";
import {
  getTaskByReportId,
  assignTask,
  getTaskComments,
  addTaskComment,
  getWorkers,
} from "@/lib/relayerAPI";
import toast from "react-hot-toast";

const MapPreview = dynamic(() => import("@/components/MapPreview"), {

  ssr: false,
});

interface ActionLogEntry {
  authority: string;
  stage: number;
  commentCid: string;
  imageCid: string;
  timestamp: number;
  commentText: string;
  profile: {
    name: string;
    position: string;
    department: string;
  } | null;
}

const ENABLE_WORKFORCE_TRACKING = process.env.NEXT_PUBLIC_ENABLE_WORKFORCE_TRACKING === "true";

export default function AuthorityReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { account, isAuthority, isSuperAdmin, isConnecting, reportingContract, connectWallet } = useAdmin();
  const { wallet } = useCitizen();

  const [report, setReport] = useState<EnrichedReport | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Planka Task Tracking States ---
  const [taskAssignment, setTaskAssignment] = useState<any | null>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [internalNotes, setInternalNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [isPostingNote, setIsPostingNote] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignAddress, setAssignAddress] = useState("");
  const [assignPriority, setAssignPriority] = useState("MEDIUM");
  const [assignDueDate, setAssignDueDate] = useState("");

  const handleAssignWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignAddress) {
      toast.error("Please select a worker.");
      return;
    }
    setIsAssigning(true);
    const loadToast = toast.loading("Updating off-chain task assignment...");
    try {
      const res = await assignTask(
        Number(id),
        assignAddress,
        assignPriority,
        assignDueDate || undefined
      );
      if (res.success) {
        toast.success("Task successfully assigned off-chain!", { id: loadToast });
        // Reload details
        const taskRes = await getTaskByReportId(Number(id));
        if (taskRes.success) setTaskAssignment(taskRes.data);
      } else {
        toast.error(res.message || "Failed to update assignment.", { id: loadToast });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to assign task.", { id: loadToast });
    } finally {
      setIsAssigning(false);
    }
  };

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    setIsPostingNote(true);
    try {
      const res = await addTaskComment(Number(id), newNoteText);
      if (res.success) {
        setNewNoteText("");
        // Reload notes
        const commentsRes = await getTaskComments(Number(id));
        if (commentsRes.success) {
          setInternalNotes(commentsRes.data);
        }
        toast.success("Internal note posted.");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to post note.");
    } finally {
      setIsPostingNote(false);
    }
  };

  const loadReport = async () => {

    setLoading(true);
    setError(null);
    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
      const MULTISIG_ADDRESS = process.env.NEXT_PUBLIC_MULTISIG_ADDRESS || "";
      if (!CONTRACT_ADDRESS) throw new Error("Contract address not configured.");

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ReportingABI, provider);
      const multiSig = new ethers.Contract(MULTISIG_ADDRESS, AuthorityMultiSigABI, provider);

      // Fetch main report details
      const raw = await contract.getReport(Number(id));
      const base = rawToEnriched(raw);
      setReport(base);

      // Fetch authority actions history
      try {
        const rawActions = await contract.getReportActions(Number(id));
        const enrichedActions = await Promise.all(
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
                const prof = await multiSig.getProfile(authority);
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
        // Sort actions: newest first
        setActionsHistory(enrichedActions.reverse());
      } catch (err) {
        console.error("Failed to load actions history:", err);
      }

      // Async IPFS enrichment
      const enriched = await enrichReportWithIPFS(base);
      setReport(enriched);

      // Fetch Planka task assignment & workers directory if enabled
      if (ENABLE_WORKFORCE_TRACKING) {
        try {
          const taskRes = await getTaskByReportId(Number(id));
          if (taskRes.success && taskRes.data) {
            setTaskAssignment(taskRes.data);
            setAssignAddress(taskRes.data.assignedWorkerAddress || "");
            setAssignPriority(taskRes.data.priority || "MEDIUM");
            setAssignDueDate(taskRes.data.dueDate ? taskRes.data.dueDate.slice(0, 10) : "");
            
            // Fetch card comments
            const commentsRes = await getTaskComments(Number(id));
            if (commentsRes.success) {
              setInternalNotes(commentsRes.data);
            }
          }
        } catch (err) {
          console.error("Failed to load Planka task tracking data:", err);
        }

        try {
          const workersRes = await getWorkers();
          if (workersRes.success) {
            setWorkers(workersRes.data);
          }
        } catch (err) {
          console.error("Failed to load workers directory:", err);
        }
      }
    } catch (err: any) {

      setError(err?.message || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ─── Guard: citizen session active ──────────────────────────────────────────
  if (wallet) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 text-sm mb-6">
            Please log out of your Citizen session to access the Authority portal.
          </p>
          <Link
            href="/profile"
            className="inline-block w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors text-center"
          >
            Go to Profile (Sign Out)
          </Link>
        </div>
      </div>
    );
  }

  // ─── Guard: not connected ────────────────────────────────────────────────────
  if (!account) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Authority Required</h1>
          <p className="text-slate-500 mb-6 text-sm">
            Connect your authority wallet to view this report.
          </p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-md transition-all"
          >
            {isConnecting ? "Connecting…" : "Connect MetaMask"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RotateCw className="w-10 h-10 animate-spin text-green-600" />
          <p className="text-slate-500 font-medium">Loading report from ledger…</p>
        </div>
      </div>
    );
  }

  // ─── Guard: connected but not authority ─────────────────────────────────────
  if (!isAuthority && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 text-sm mb-4">
            This wallet is not registered as an Admin or Authority on-chain.
          </p>
          <p className="font-mono text-xs text-slate-600 bg-slate-50 p-3 rounded-lg break-all">
            {account}
          </p>
        </div>
      </div>
    );
  }


  // ─── Error ───────────────────────────────────────────────────────────────────
  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-bold text-slate-900">Report Not Found</h2>
        <p className="text-slate-500 text-sm text-center max-w-sm">
          {error ?? "The requested report could not be found on the ledger."}
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  const createdAt = new Date(report.createdAt * 1000).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const updatedAt = new Date(report.updatedAt * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const deadlineAt =
    report.phaseDeadline > 0
      ? new Date(report.phaseDeadline * 1000).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  const coordinates = extractCoordinates(report.location);
  const hasImages = report.images && report.images.length > 0;
  const heroImage = hasImages
    ? `data:${report.images![0].mimeType || "image/jpeg"};base64,${report.images![0].data}`
    : null;

  const isAssigned =
    report.assignedAuthority.toLowerCase() === account.toLowerCase() &&
    report.assignedAuthority !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-green-600 font-bold text-sm hover:text-green-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-500 font-medium">
            Report #{report.id}
          </span>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 py-2 px-4 rounded-full border border-slate-200">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-mono text-slate-700">
            {account.slice(0, 6)}…{account.slice(-4)}
          </span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

          {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {/* Hero */}
            <div className="relative w-full h-80 rounded-2xl overflow-hidden bg-slate-100 shadow-sm">
              {hasImages ? (
                <img
                  src={heroImage!}
                  alt={`Report ${report.id}`}
                  className="w-full h-full object-cover"
                />
              ) : coordinates ? (
                <MapPreview lat={coordinates.lat} lng={coordinates.lng} interactive />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  No Preview Available
                </div>
              )}

              {/* Overlay badges */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <ReportStatusBadge status={report.status} showDot />
                {isAssigned && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-600/90 text-white backdrop-blur-sm">
                    Assigned to you
                  </span>
                )}
              </div>
            </div>

            {/* Title / Category */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                {report.category && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100">
                    {report.category}
                  </span>
                )}
                <span className="text-sm text-slate-400 font-mono">ID: #{report.id}</span>
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">
                {report.category ? `${report.category} Issue` : `Report #${report.id}`}
              </h1>
            </div>

            {/* Meta */}
            <div className="flex items-center flex-wrap gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Reported {createdAt}
              </span>
              {report.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {formatLocation(report.location)}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-3">
                Detailed Description
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                {report.description ?? (
                  <span className="text-slate-400 italic">
                    {report.ipfsLoaded
                      ? "No description provided."
                      : "Loading IPFS metadata…"}
                  </span>
                )}
              </p>
            </div>

            {/* Evidence Images */}
            {hasImages && report.images!.length > 1 && (
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-slate-500" />
                  Evidence ({report.images!.length} images)
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {report.images!.map((img, i) => (
                    <div
                      key={i}
                      className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm aspect-video bg-slate-100"
                    >
                      <img
                        src={`data:${img.mimeType || "image/jpeg"};base64,${img.data}`}
                        alt={img.originalName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vote Statistics */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-5">
                Vote Statistics
              </h2>
              <div className="space-y-5">
                <VoteRow
                  label="Community Validation"
                  yes={report.votes.validationUpvotes}
                  no={report.votes.validationDownvotes}
                  yesLabel="Upvotes"
                  noLabel="Downvotes"
                />
                {(report.votes.verificationAcceptVotes > 0 || report.votes.verificationRejectVotes > 0) && (
                  <VoteRow
                    label="Verification"
                    yes={report.votes.verificationAcceptVotes}
                    no={report.votes.verificationRejectVotes}
                    yesLabel="Accept"
                    noLabel="Reject"
                  />
                )}
                {(report.votes.rejectionUpholdVotes > 0 || report.votes.rejectionAppealVotes > 0) && (
                  <VoteRow
                    label="Rejection Review"
                    yes={report.votes.rejectionUpholdVotes}
                    no={report.votes.rejectionAppealVotes}
                    yesLabel="Uphold"
                    noLabel="Appeal"
                  />
                )}
              </div>
            </div>

            {/* Authority Action Log / Timeline */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-5">
                Authority Activity History
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

                          {/* Authority Name / Role */}
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <span className="text-slate-800">
                              {act.profile ? act.profile.name : shortenAddress(act.authority)}
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

                          {/* Uploaded Evidence Image */}
                          {act.imageCid && act.imageCid.length > 5 && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-sm aspect-video bg-slate-50">
                              <img
                                src={`/api/ipfs/image/${act.imageCid}`}
                                alt="Action Attachment"
                                className="w-full h-full object-cover hover:scale-[1.02] transition-all"
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

            {/* Internal Discussion Notes (Off-Chain) */}
            {ENABLE_WORKFORCE_TRACKING && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-bold text-slate-900">
                    Internal Discussion Notes (Off-Chain)
                  </h2>
                </div>
                <p className="text-xs text-slate-500">
                  Collaborate internally on this task. These comments are stored off-chain on Planka and are gasless.
                </p>

                {/* Comment Thread */}
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {internalNotes.length === 0 ? (
                    <p className="text-slate-400 italic text-sm text-center py-6">
                      No internal discussion notes yet.
                    </p>
                  ) : (
                    internalNotes.map((note) => {
                      const noteDate = new Date(note.createdAt).toLocaleString();
                      return (
                        <div key={note.id} className="bg-slate-50 border border-slate-100/50 rounded-xl p-3 space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400">
                            <span>{note.user?.name || "System User"}</span>
                            <span>{noteDate}</span>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {note.text}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Comment Box */}
                <form onSubmit={handlePostNote} className="space-y-3 pt-2 border-t border-slate-100">
                  <textarea
                    rows={3}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Type an internal note to team members..."
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-800"
                  />
                  <button
                    type="submit"
                    disabled={isPostingNote || !newNoteText.trim()}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                  >
                    {isPostingNote ? "Posting..." : "Post Note"}
                  </button>
                </form>
              </div>
            )}

          </div>


          {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">

            {/* Authority Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Authority Actions
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Execute state updates with notes and image uploads.
              </p>
              <ReportActionButtons
                report={report}
                currentAccount={account}
                reportingContract={reportingContract}
                onActionSuccess={() => loadReport()}
                layout="column"
              />
            </div>

            {/* Report Info */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Report Info</h3>

              <div className="space-y-3 text-sm">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                    Status
                  </span>
                  <ReportStatusBadge status={report.status} showDot size="sm" />
                </div>

                {/* Assigned Authority */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">
                    Assigned To
                  </span>
                  <div className="flex items-center gap-1.5 text-right">
                    <Landmark className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono text-xs text-slate-700 break-all">
                      {shortenAddress(report.assignedAuthority)}
                    </span>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">
                    Submitted
                  </span>
                  <span className="text-xs text-slate-600 text-right">{createdAt}</span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">
                    Last Update
                  </span>
                  <span className="text-xs text-slate-600 text-right">{updatedAt}</span>
                </div>

                {deadlineAt && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0 text-orange-600">
                      Phase Deadline
                    </span>
                    <span className="text-xs text-orange-600 font-semibold text-right">
                      {deadlineAt}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Workforce Assignment (Off-Chain) */}
            {ENABLE_WORKFORCE_TRACKING && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  Workforce Assignment
                </h3>
                <p className="text-xs text-slate-500">
                  Assign a registered worker and schedule details off-chain (gasless).
                </p>

                <form onSubmit={handleAssignWorker} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Assignee
                    </label>
                    <select
                      value={assignAddress}
                      onChange={(e) => setAssignAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-700"
                    >
                      <option value="">Unassigned</option>
                      {workers.map((w) => (
                        <option key={w.walletAddress} value={w.walletAddress}>
                          {w.name} ({w.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Priority
                      </label>
                      <select
                        value={assignPriority}
                        onChange={(e) => setAssignPriority(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-700"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={assignDueDate}
                        onChange={(e) => setAssignDueDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-700"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAssigning}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isAssigning ? "Assigning..." : "Assign Task"}
                  </button>
                </form>
              </div>
            )}

            {/* On-Chain Hashes */}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-400" />
                On-Chain Proofs
              </h3>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  IPFS CID
                </p>
                <p className="text-xs font-mono text-slate-600 break-all">
                  {report.ipfsCid}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Report Hash
                </p>
                <p className="text-xs font-mono text-slate-600 break-all">
                  {report.reportHash}
                </p>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
