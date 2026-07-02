"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { useCitizen } from "@/context/CitizenContext";
import dynamic from "next/dynamic";
import {
  FileText,
  Shield,
  AlertCircle,
  RotateCw,
  Plus,
  Search,
  MoreVertical,
  Calendar,
  Share2,
  Globe,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  AlertTriangle,
  MapPin,
} from "lucide-react";

const MapPreview = dynamic(() => import("@/components/MapPreview"), {
  ssr: false,
});

// Minimal ABI for fetching reports directly from the Reporting smart contract
const REPORTING_ABI = [
  "function getReportsByCitizen(bytes32 citizenPseudonym, uint256 offset, uint256 limit) view returns (tuple(uint256 id, string ipfsCid, bytes32 reportHash, bytes32 submissionNullifier, bytes32 citizenPseudonym, address submittedByRelayer, uint8 status, uint256 createdAt, uint256 updatedAt, uint256 phaseDeadline, address assignedAuthority, tuple(uint256 validationUpvotes, uint256 validationDownvotes, uint256 verificationAcceptVotes, uint256 verificationRejectVotes, uint256 rejectionUpholdVotes, uint256 rejectionAppealVotes) votes)[] page, uint256 total)",
];

export interface FetchedReport {
  id: string;
  ipfsCid: string;
  status: number;
  timestamp: number;

  description?: string;
  category?: string;
  location?: string;
  imageUrl?: string;
  ipfsLoaded?: boolean;

  coordinates?: {
    lat: number;
    lng: number;
  };
}

const STATUS_CONFIG: Record<
  number,
  { label: string; color: string; bgColor: string; dot: string; icon: React.ReactNode; progress?: number }
> = {
  0: {
    label: "Pending Validation",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    dot: "bg-amber-500",
    icon: <Clock className="h-3.5 w-3.5" />,
    progress: 15,
  },
  1: {
    label: "Rejected",
    color: "text-red-700",
    bgColor: "bg-red-100",
    dot: "bg-red-500",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  2: {
    label: "Open",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    dot: "bg-blue-500",
    icon: <FileText className="h-3.5 w-3.5" />,
    progress: 40,
  },
  3: {
    label: "In Progress",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    dot: "bg-indigo-500",
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    progress: 65,
  },
  4: {
    label: "Rejection Review",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    dot: "bg-orange-500",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    progress: 30,
  },
  5: {
    label: "In Review",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
    dot: "bg-purple-500",
    icon: <Shield className="h-3.5 w-3.5" />,
    progress: 85,
  },
  6: {
    label: "Resolved",
    color: "text-green-700",
    bgColor: "bg-green-100",
    dot: "bg-green-500",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    progress: 100,
  },
  7: {
    label: "Reopened",
    color: "text-slate-700",
    bgColor: "bg-slate-100",
    dot: "bg-slate-500",
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    progress: 50,
  },
};

const FILTER_TABS = ["All", "In Progress", "Resolved"];

function getStatusConfig(status: number) {
  return STATUS_CONFIG[status] ?? {
    label: "Unknown",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    dot: "bg-slate-400",
    icon: <FileText className="h-3.5 w-3.5" />,
  };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function matchesFilter(report: FetchedReport, filter: string) {
  if (filter === "All") return true;
  if (filter === "Resolved") return report.status === 6;
  if (filter === "In Progress") return [2, 3, 4, 5].includes(report.status);
  return true;
}

function extractCid(raw: string): string | null {
  if (!raw || raw === "ipfs://none") return null;
  const first = raw.split(",")[0].trim();
  return first.startsWith("ipfs://") ? first.slice(7) : first;
}

function parseCoordinates(raw: string | undefined) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      return { lat: parsed.lat, lng: parsed.lng };
    }
    if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
      return { lat: parsed.latitude, lng: parsed.longitude };
    }
  } catch {}
  return undefined;
}

async function fetchIpfsMetadata(
  report: FetchedReport
): Promise<Partial<FetchedReport>> {
  const cid = extractCid(report.ipfsCid);
  if (!cid) return { ipfsLoaded: true };
  try {
    const res = await fetch(`/api/ipfs/${cid}`);
    if (!res.ok) return { ipfsLoaded: true };
    const data = await res.json();
    if (!data.success) return { ipfsLoaded: true };

    const firstImg = data.images?.[0];

    return {
      description: data.description ?? "No description",
      category: data.category ?? "GENERAL",
      location: data.location,
      coordinates: parseCoordinates(data.location),
      imageUrl: firstImg?.data
        ? `data:${firstImg.mimeType || "image/jpeg"};base64,${firstImg.data}`
        : undefined,
      ipfsLoaded: true,
    };
  } catch {
    return { ipfsLoaded: true };
  }
}

export default function MyReportsPage() {
  const { wallet } = useCitizen();
  const [pseudonym, setPseudonym] = useState<string | null>(null);
  const [reports, setReports] = useState<FetchedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const fetchCitizenReports = async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ethersWallet = new ethers.Wallet(wallet.privateKey);
      const timestamp = Date.now();
      const challenge = `get-pseudonym:${wallet.publicKey}:${timestamp}`;
      const signature = await ethersWallet.signMessage(challenge);

      const RELAYER_URL =
        process.env.NEXT_PUBLIC_RELAYER_URL ||
        "https://relayer.internalbuildtools.online";
      const res = await fetch(`${RELAYER_URL}/report/my-pseudonym`, {
        headers: {
          Authorization: `${wallet.publicKey}:${timestamp}:${signature}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to authenticate and retrieve pseudonym."
        );
      }

      const data = await res.json();
      const resolvedPseudonym = data.pseudonym;
      setPseudonym(resolvedPseudonym);

      const RPC_URL =
        process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const CONTRACT_ADDRESS =
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

      if (!CONTRACT_ADDRESS) {
        throw new Error(
          "Smart contract address is not configured in environment variables."
        );
      }

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        REPORTING_ABI,
        provider
      );

      const [reportsArray] = await contract.getReportsByCitizen(
        resolvedPseudonym,
        0,
        50
      );

      const baseReports: FetchedReport[] = reportsArray.map((r: any) => ({
        id: r.id.toString(),
        ipfsCid: r.ipfsCid,
        status: Number(r.status),
        timestamp: Number(r.createdAt) * 1000,
        ipfsLoaded: false,
      }));

      const reversedBase = baseReports.reverse();
      setReports(reversedBase);

      const enriched = await Promise.all(
        reversedBase.map(async (r) => ({
          ...r,
          ...(await fetchIpfsMetadata(r)),
        }))
      );

      setReports(enriched);
    } catch (err: any) {
      console.error("Error retrieving reports:", err);
      setError(
        err.message ||
          "An unexpected error occurred while loading your reports."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCitizenReports();
  }, []);

  const filtered = reports.filter(
    (r) =>
      matchesFilter(r, filter) &&
      (search === "" ||
        (r.category || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.description || "").toLowerCase().includes(search.toLowerCase()) ||
        r.id.includes(search))
  );

  const totalResolved = reports.filter((r) => r.status === 6).length;
  const totalActive = reports.filter((r) => [2, 3, 5].includes(r.status)).length;

  // ─── Shared: no-wallet / loading / error / empty ────────────────
  const renderState = () => {
    if (!wallet) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            Wallet Disconnected
          </h3>
          <p className="text-slate-500 text-sm mb-6 max-w-xs">
            Please log in with your citizen seed phrase to access your anonymous
            reports.
          </p>
          <Link
            href="/auth"
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <RotateCw className="h-8 w-8 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-500 text-sm font-medium">
            Verifying cryptographic challenge &amp; querying AuraChain…
          </p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="mx-4 md:mx-0 p-5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <h4 className="font-bold text-sm text-red-700">
              Failed to load reports
            </h4>
            <p className="text-xs text-red-600 leading-relaxed">{error}</p>
            <button
              onClick={fetchCitizenReports}
              className="mt-1 text-xs font-semibold text-red-600 underline hover:text-red-800 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <p className="text-base font-bold text-slate-800 mb-1">
            No reports found
          </p>
          <p className="text-slate-500 text-sm">
            {search
              ? "No reports match your search."
              : "You haven't submitted any civic issues yet."}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* ══════════════════════════════════════════════
          MOBILE LAYOUT
      ══════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen bg-slate-50 pb-28">
        {/* Header */}
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            My Reports
          </h1>
          <p className="text-slate-500 text-sm">
            Manage and track the progress of your submitted governance reports.
          </p>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === tab
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Cards / state */}
        {renderState() ?? (
          <div className="px-4 space-y-4">
            {filtered.map((report) => {
              const s = getStatusConfig(report.status);
              return (
                <div
                  key={report.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100"
                >
                  {/* Image/Map container with status badge */}
                  <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                    {report.imageUrl ? (
                      <img
                        src={report.imageUrl}
                        alt={`Report ${report.id}`}
                        className="w-full h-full object-cover"
                      />
                    ) : report.coordinates ? (
                      <div className="w-full h-full">
                        <MapPreview
                          lat={report.coordinates.lat}
                          lng={report.coordinates.lng}
                        />
                      </div>
                    ) : (
                      <FileText className="h-12 w-12 text-slate-300" />
                    )}

                    {!report.ipfsLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-[1200]">
                        <RotateCw className="h-6 w-6 animate-spin text-slate-400" />
                      </div>
                    )}

                    <span
                      className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${s.bgColor} ${s.color} z-[1200]`}
                    >
                      {s.label}
                    </span>
                  </div>

                  <div className="p-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h2 className="text-base font-bold text-slate-900 leading-snug line-clamp-1">
                        {report.category || "Loading..."}
                      </h2>
                      <button className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(report.timestamp)}</span>
                    </div>

                    {/* Description excerpt */}
                    <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                      {report.description || "Loading..."}
                    </p>

                    {/* Progress bar (for statuses with progress) */}
                    {s.progress !== undefined && (
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-slate-500">
                            {s.progress === 100
                              ? "Complete"
                              : s.progress >= 80
                              ? `Reviewing: ${s.progress}%`
                              : `Validation Progress: ${s.progress}%`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              s.progress === 100
                                ? "bg-green-500"
                                : s.progress >= 80
                                ? "bg-blue-500"
                                : "bg-blue-500"
                            }`}
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FAB */}
        <Link
          href="/report"
          className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-600/30 hover:-translate-y-1 hover:shadow-xl transition-all z-40"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </div>

      {/* ══════════════════════════════════════════════
          DESKTOP LAYOUT
      ══════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col w-full min-h-screen">
        {/* ── Page Header ── */}
        <div className="px-8 pt-6 pb-4 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-1">
              My Reports
            </h1>
            <p className="text-slate-500 text-sm">
              Track and manage your community governance contributions.
              {pseudonym && (
                <span className="ml-2 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500">
                  ZK ID: {pseudonym.slice(0, 10)}…{pseudonym.slice(-6)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchCitizenReports}
              className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              href="/report"
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
            >
              <Plus className="h-4 w-4" />
              New Report
            </Link>
          </div>
        </div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-3 gap-4 px-8 mb-6">
          {[
            { label: "TOTAL REPORTS", value: reports.length, icon: <FileText className="h-6 w-6 text-blue-500" />, bg: "bg-blue-50" },
            { label: "RESOLVED", value: totalResolved, icon: <CheckCircle2 className="h-6 w-6 text-green-500" />, bg: "bg-green-50" },
            { label: "ACTIVE", value: totalActive, icon: <Clock className="h-6 w-6 text-slate-400" />, bg: "bg-slate-100" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4"
            >
              <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center shrink-0`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  {stat.label}
                </p>
                <p className="text-3xl font-extrabold text-slate-900 mt-0.5">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Submissions Table Card ── */}
        <div className="mx-8 mb-6 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">
              Recent Submissions
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all w-56"
              />
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex gap-2 px-6 py-3 border-b border-slate-50">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filter === tab
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Table or state */}
          {renderState() ?? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Title
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Category
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Submission Date
                    </th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((report) => {
                    const s = getStatusConfig(report.status);
                    return (
                      <tr
                        key={report.id}
                        className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                      >
                        {/* Title + ID */}
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900 line-clamp-1 mb-0.5">
                            {(report.description || "").length > 60
                              ? (report.description || "").slice(0, 60) + "…"
                              : (report.description || "Loading...")}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            ID: AC-{report.id.padStart(4, "0")}
                          </p>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-4">
                          <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold uppercase tracking-wide">
                            {report.category || "Loading..."}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${s.bgColor} ${s.color}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${s.dot}`}
                            />
                            {s.label}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-4 text-slate-500 text-sm">
                          {formatDate(report.timestamp)}
                        </td>

                        {/* Action */}
                        <td className="px-6 py-4 text-right">
                          <button className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-semibold transition-colors">
                            View Details
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination row */}
              <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Showing {filtered.length} of {reports.length} reports
                </p>
                <div className="flex items-center gap-2">
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40">
                    ‹
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40">
                    ›
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ZK Privacy Note ── */}
        <div className="mx-8 mb-6 bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-900 mb-0.5">
              Zero-Knowledge Privacy Active
            </p>
            <p className="text-xs text-blue-700 leading-relaxed">
              All reports are submitted under your anonymous ZK pseudonym. Your
              wallet address and identity are never exposed on-chain.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto px-8 py-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-4">
            <span className="font-bold text-blue-600 text-base">AuraChain</span>
            <span>© 2024 AuraChain. Decentralized Governance for the People.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="#" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Whitepaper</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Support</Link>
            <div className="flex items-center gap-3 ml-2">
              <Share2 className="h-4 w-4 hover:text-slate-900 cursor-pointer transition-colors" />
              <Globe className="h-4 w-4 hover:text-slate-900 cursor-pointer transition-colors" />
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}