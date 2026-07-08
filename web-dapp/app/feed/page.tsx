"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";

import MapPreview from "@/components/MapPreview";

import {
  ThumbsUp,
  CheckCircle2,
  Plus,
  MoreHorizontal,
  ImageIcon,
  FileText,
  ChevronDown,
  Share2,
  Globe,
  Shield,
  RotateCw,
  AlertCircle,
  MapPin,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                   CONFIG                                   */
/* -------------------------------------------------------------------------- */

const FILTERS = ["All Issues", "Infrastructure", "Parks", "Safety"];
const SORT_OPTIONS = ["Most Recent", "Most Voted", "Oldest"];

const PUBLIC_REPORTING_ABI = [
  {
    "type": "function",
    "name": "getAllReports",
    "inputs": [
      { "name": "offset", "type": "uint256" },
      { "name": "limit", "type": "uint256" }
    ],
    "outputs": [
      {
        "name": "page",
        "type": "tuple[]",
        "components": [
          { "name": "id", "type": "uint256" },
          { "name": "ipfsCid", "type": "string" },
          { "name": "reportHash", "type": "bytes32" },
          { "name": "submissionNullifier", "type": "bytes32" },
          { "name": "citizenPseudonym", "type": "bytes32" },
          { "name": "submittedByRelayer", "type": "address" },
          { "name": "status", "type": "uint8" },
          { "name": "createdAt", "type": "uint256" },
          { "name": "updatedAt", "type": "uint256" },
          { "name": "phaseDeadline", "type": "uint256" },
          { "name": "assignedAuthority", "type": "address" },
          {
            "name": "votes",
            "type": "tuple",
            "components": [
              { "name": "validationUpvotes", "type": "uint256" },
              { "name": "validationDownvotes", "type": "uint256" },
              { "name": "verificationAcceptVotes", "type": "uint256" },
              { "name": "verificationRejectVotes", "type": "uint256" },
              { "name": "rejectionUpholdVotes", "type": "uint256" },
              { "name": "rejectionAppealVotes", "type": "uint256" }
            ]
          }
        ]
      },
      { "name": "total", "type": "uint256" }
    ],
    "stateMutability": "view"
  }
];

const LIMIT = 20;

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export interface PublicReport {
  id: string;
  ipfsCid: string;
  status: number;
  createdAt: number;
  upvotes: number;
  downvotes: number;

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

/* -------------------------------------------------------------------------- */
/*                               HELPER METHODS                               */
/* -------------------------------------------------------------------------- */

function extractCid(raw: string): string | null {
  if (!raw || raw === "ipfs://none") return null;

  const first = raw.split(",")[0].trim();

  return first.startsWith("ipfs://") ? first.slice(7) : first;
}

function parseCoordinates(raw: string | undefined) {
  if (!raw) return undefined;

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
  } catch {}

  return undefined;
}

function formatLocation(raw: string | undefined): string | undefined {
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

async function fetchIpfsMetadata(
  report: PublicReport
): Promise<Partial<PublicReport>> {
  const cid = extractCid(report.ipfsCid);

  if (!cid) return { ipfsLoaded: true };

  try {
    const res = await fetch(`/api/ipfs/${cid}`);

    if (!res.ok) return { ipfsLoaded: true };

    const data = await res.json();

    if (!data.success) return { ipfsLoaded: true };

    const firstImg = data.images?.[0];

    return {
      description: data.description ?? undefined,
      category: data.category ?? undefined,

      location: formatLocation(data.location),

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

const getStatusDetails = (status: number) => {
  switch (status) {
    case 0:
      return {
        label: "Pending Validation",
        bg: "bg-amber-100",
        text: "text-amber-700",
        resolved: false,
      };

    case 1:
      return {
        label: "Community Rejected",
        bg: "bg-red-100",
        text: "text-red-700",
        resolved: true,
      };

    case 2:
      return {
        label: "Open",
        bg: "bg-blue-100",
        text: "text-blue-700",
        resolved: false,
      };

    case 3:
      return {
        label: "In Progress",
        bg: "bg-indigo-100",
        text: "text-indigo-700",
        resolved: false,
      };

    case 4:
      return {
        label: "Rejection Under Review",
        bg: "bg-orange-100",
        text: "text-orange-700",
        resolved: false,
      };

    case 5:
      return {
        label: "Pending Verification",
        bg: "bg-purple-100",
        text: "text-purple-700",
        resolved: false,
      };

    case 6:
      return {
        label: "Closed / Solved",
        bg: "bg-green-100",
        text: "text-green-700",
        resolved: true,
      };

    case 7:
      return {
        label: "Reopened",
        bg: "bg-slate-100",
        text: "text-slate-700",
        resolved: false,
      };

    default:
      return {
        label: "Unknown",
        bg: "bg-slate-100",
        text: "text-slate-700",
        resolved: false,
      };
  }
};

/* -------------------------------------------------------------------------- */
/*                             MEDIA / MAP DISPLAY                            */
/* -------------------------------------------------------------------------- */

function ReportVisual({ report }: { report: PublicReport }) {
  // SHOW IMAGE
  if (report.imageUrl) {
    return (
      <img
        src={report.imageUrl}
        alt={report.description || `Report ${report.id}`}
        className="w-full h-full object-cover"
      />
    );
  }

  // SHOW MAP
  if (report.coordinates) {
    return (
      <div className="relative w-full h-full">
        <MapPreview
          lat={report.coordinates.lat}
          lng={report.coordinates.lng}
        />

        <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow text-[11px] font-semibold text-slate-700 flex items-center gap-1">
          <MapPin className="h-3 w-3 text-blue-600" />
          Location
        </div>
      </div>
    );
  }

  // FALLBACK
  return (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />

        <p className="text-xs text-slate-400">No Media</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   PAGE                                     */
/* -------------------------------------------------------------------------- */

export default function FeedPage() {
  const [filter, setFilter] = useState("All Issues");
  const [sort, setSort] = useState("Most Recent");

  const [reports, setReports] = useState<PublicReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPublicReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const RPC_URL =
        process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

      const CONTRACT_ADDRESS =
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";

      if (!CONTRACT_ADDRESS) {
        throw new Error("Smart contract address is not configured.");
      }

      const provider = new ethers.JsonRpcProvider(RPC_URL);

      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        PUBLIC_REPORTING_ABI,
        provider
      );

      const [pageArray, totalReports] =
        await contract.getAllReports(offset, LIMIT);

      console.log("Raw Response Page:", pageArray);
      console.log("Total Reports:", totalReports);

      const baseReports: PublicReport[] = pageArray.map((r: any) => ({
        id: r.id.toString(),
        ipfsCid: r.ipfsCid,
        status: Number(r.status),
        createdAt: Number(r.createdAt) * 1000,
        upvotes: Number(r.votes.validationUpvotes),
        downvotes: Number(r.votes.validationDownvotes),
        ipfsLoaded: false,
      }));

      setTotalCount(Number(totalReports));

      setReports(baseReports);

      const enriched = await Promise.all(
        baseReports.map(async (r) => ({
          ...r,
          ...(await fetchIpfsMetadata(r)),
        }))
      );

      setReports(enriched);
    } catch (err: any) {
      console.error("Error fetching feed:", err);

      setError(
        err.message || "Failed to load reports from blockchain."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicReports();
  }, [offset]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900">
              Community Feed
            </h1>

            {totalCount > 0 && (
              <p className="text-sm text-slate-500 mt-1">
                Displaying {reports.length} of {totalCount} reports
              </p>
            )}
          </div>

          <button
            onClick={fetchPublicReports}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm"
          >
            <RotateCw
              className={`h-4 w-4 ${
                loading ? "animate-spin" : ""
              }`}
            />

            Refresh Feed
          </button>
        </div>

        {/* FILTERS */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                  filter === f
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <span>SORT BY:</span>

            <div className="relative flex items-center gap-1 text-blue-600 cursor-pointer">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none bg-transparent pr-5 font-bold text-blue-600 focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>

              <ChevronDown className="h-4 w-4 pointer-events-none absolute right-0" />
            </div>
          </div>
        </div>

        {/* STATES */}
        {loading && reports.length === 0 ? (
          <div className="py-32 text-center">
            <RotateCw className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />

            <p className="text-slate-500 font-medium">
              Syncing public ledger...
            </p>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-start gap-3">
            <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />

            <div>
              <h4 className="font-bold text-lg">
                Error Loading Feed
              </h4>

              <p className="mt-1">{error}</p>
            </div>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-32 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <FileText className="h-16 w-16 mx-auto text-slate-300 mb-4" />

            <p className="text-xl font-medium text-slate-900">
              No reports recorded yet
            </p>
          </div>
        ) : (
          /* GRID */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col"
              >
                {/* IMAGE / MAP */}
                <div className="relative h-56 bg-slate-100 overflow-hidden">
                  <ReportVisual report={report} />

                  {!report.ipfsLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-[1200]">
                      <RotateCw className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  )}

                  <span
                    className={`absolute top-3 left-3 z-[1200] px-3 py-1 rounded-full text-xs font-bold ${
                      getStatusDetails(report.status).bg
                    } ${getStatusDetails(report.status).text}`}
                  >
                    {getStatusDetails(report.status).label}
                  </span>

                  {report.imageUrl && (
                    <div className="absolute top-3 right-3 z-[1200] w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow">
                      <ImageIcon className="h-4 w-4 text-slate-700" />
                    </div>
                  )}
                </div>

                {/* CONTENT */}
                <div className="p-5 flex flex-col flex-1">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />

                    {report.category || "GENERAL"}
                  </p>

                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Report #{report.id}
                  </h3>

                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 flex-1 mb-3">
                    {report.description ||
                      (!report.ipfsLoaded
                        ? "Loading metadata from IPFS..."
                        : "No description available.")}
                  </p>

                  {report.location && (
                    <div className="flex items-start gap-1.5 text-xs text-slate-400 mb-4">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />

                      <span className="line-clamp-2">
                        {report.location}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                      <ThumbsUp className="h-4 w-4 text-blue-500" />

                      {report.upvotes}
                    </span>

                    <Link
                      href={`/issues/${report.id}`}
                      className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Detail →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAGINATION */}
        {totalCount > LIMIT && (
          <div className="flex justify-center items-center gap-4 pt-10">
            <button
              className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 transition-colors"
              disabled={offset === 0 || loading}
              onClick={() =>
                setOffset((prev) => Math.max(0, prev - LIMIT))
              }
            >
              ← Previous
            </button>

            <span className="text-sm text-slate-500 font-medium">
              Showing {offset + 1}–
              {Math.min(offset + LIMIT, totalCount)} of{" "}
              {totalCount} reports
            </span>

            <button
              className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 transition-colors"
              disabled={offset + LIMIT >= totalCount || loading}
              onClick={() => setOffset((prev) => prev + LIMIT)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}