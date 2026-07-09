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
  ThumbsUp,
  ThumbsDown,
  Hash,
  Calendar,
} from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { ReportStatusBadge } from "@/components/admin/ReportStatusBadge";
import { ReportActionButtons } from "@/components/admin/ReportActionButtons";
import {
  type EnrichedReport,
  rawToEnriched,
  enrichReportWithIPFS,
  formatLocation,
  shortenAddress,
  REPORT_STATUS,
} from "@/lib/reportHelpers";
import Link from "next/link";

const MapPreview = dynamic(() => import("@/components/MapPreview"), {
  ssr: false,
});

// ─── ABI (view only — reads done via public RPC) ──────────────────────────────
const REPORTING_ABI = [
  "function getReport(uint256 reportId) view returns (tuple(uint256 id, string ipfsCid, bytes32 reportHash, bytes32 submissionNullifier, bytes32 citizenPseudonym, address submittedByRelayer, uint8 status, uint256 createdAt, uint256 updatedAt, uint256 phaseDeadline, address assignedAuthority, tuple(uint256 validationUpvotes, uint256 validationDownvotes, uint256 verificationAcceptVotes, uint256 verificationRejectVotes, uint256 rejectionUpholdVotes, uint256 rejectionAppealVotes) votes))",
];

function extractCoordinates(raw?: string): { lat: number; lng: number } | null {
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

function VoteRow({
  label,
  yes,
  no,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  label: string;
  yes: number;
  no: number;
  yesLabel?: string;
  noLabel?: string;
}) {
  const total = yes + no;
  const pct = total === 0 ? 0 : Math.round((yes / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
        <span>{label}</span>
        <span className="font-bold text-slate-700">{pct}% {yesLabel}</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1 text-green-600 font-semibold">
          <ThumbsUp className="w-3 h-3" />
          {yes} {yesLabel}
        </span>
        <span className="flex items-center gap-1 text-red-500 font-semibold">
          <ThumbsDown className="w-3 h-3" />
          {no} {noLabel}
        </span>
        <span className="ml-auto">{total} total votes</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuthorityReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { account, isAuthority, isConnecting, reportingContract, connectWallet } = useAdmin();
  const { wallet } = useCitizen();

  const [report, setReport] = useState<EnrichedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
      if (!CONTRACT_ADDRESS) throw new Error("Contract address not configured.");

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, REPORTING_ABI, provider);
      const raw = await contract.getReport(Number(id));

      const base = rawToEnriched(raw);
      setReport(base);

      // Async IPFS enrichment
      const enriched = await enrichReportWithIPFS(base);
      setReport(enriched);
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

  // ─── Guard: connected but not authority ─────────────────────────────────────
  if (!isAuthority) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 text-sm mb-4">
            This wallet is not registered as an Authority on-chain.
          </p>
          <p className="font-mono text-xs text-slate-600 bg-slate-50 p-3 rounded-lg break-all">
            {account}
          </p>
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
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">

            {/* Authority Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Authority Actions
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Actions available for the current report status.
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
