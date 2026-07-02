"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import {
  ArrowLeft,
  MapPin,
  Clock,
  ThumbsUp,
  ShieldCheck,
  RotateCw,
  AlertCircle,
  ImageIcon,
  Bell,
  Settings,
  Landmark,
  Shield,
} from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";

// Dynamic import to avoid SSR window issues
const MapPreview = dynamic(() => import("@/components/MapPreview"), {
  ssr: false,
});

// ── ABI ──────────────────────────────────────────────────────────
const REPORTING_ABI = [
  "function getReport(uint256 reportId) view returns (tuple(uint256 id, string ipfsCid, bytes32 reportHash, bytes32 submissionNullifier, bytes32 citizenPseudonym, address submittedByRelayer, uint8 status, uint256 createdAt, uint256 updatedAt, uint256 phaseDeadline, address assignedAuthority, tuple(uint256 validationUpvotes, uint256 validationDownvotes, uint256 verificationAcceptVotes, uint256 verificationRejectVotes, uint256 rejectionUpholdVotes, uint256 rejectionAppealVotes) votes))",
];

// ── Types ─────────────────────────────────────────────────────────
interface ReportDetail {
  id: string;
  ipfsCid: string;
  status: number;
  createdAt: number;
  upvotes: number;
  downvotes: number;
  assignedAuthority: string;

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


// ── Page ──────────────────────────────────────────────────────────
export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();

  const { id } = use(params);
  const { wallet, consumeTicket, availableTicketsCount } = useCitizen();

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<"legitimate" | "spam" | null>(null);
  
  const handleCastVote = async (decision: boolean) => {
    if (!wallet) return alert("Please connect your wallet first.");

    setIsSubmitting(true);
    try {
      // 1. Get Ticket (Assuming you have a way to consume/get a voting ticket)
      const currentTicket = consumeTicket(); 
      if (!currentTicket) throw new Error("No valid ZKP ticket for voting.");

      // 2. Create the message hash (MUST match backend order exactly)
      // Backend uses: ['uint256', 'string', 'bool', 'string']
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "string", "bool", "string"],
        [Number(report?.id), "validation", decision, currentTicket.ticketId]
      );

      // 3. Sign the hash
      const ethersWallet = new ethers.Wallet(wallet.privateKey);
      const signature = await ethersWallet.signMessage(ethers.getBytes(messageHash));

      // 4. Submit to Relayer
      const response = await fetch("https://relayer.internalbuildtools.online/report/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: Number(report?.id),
          votePhase: "validation",
          decision,
          zkpTicketId: currentTicket.ticketId,
          zkpSignature: currentTicket.signature,
          citizenPubKey: wallet.publicKey,
          signature,
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.message);

      alert("Vote cast successfully!");
    } catch (err: any) {
      console.error("Voting error:", err);
      alert(err.message || "Failed to cast vote.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const RPC_URL =
          process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

        const CONTRACT_ADDRESS =
          process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

        if (!CONTRACT_ADDRESS) {
          throw new Error("Contract address not configured.");
        }

        const provider = new ethers.JsonRpcProvider(RPC_URL);

        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          REPORTING_ABI,
          provider
        );

        const r = await contract.getReport(Number(id));

        const base: ReportDetail = {
          id: r.id.toString(),
          ipfsCid: r.ipfsCid,
          status: Number(r.status),
          createdAt: Number(r.createdAt) * 1000,
          upvotes: Number(r.votes.validationUpvotes),
          downvotes: Number(r.votes.validationDownvotes),
          assignedAuthority: r.assignedAuthority,
          ipfsLoaded: false,
        };

        if (!cancelled) setReport(base);

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
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load report.");
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

  const pct = consensusPct(report.upvotes, report.downvotes);

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

  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden min-h-screen pb-24">

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

          <button
            onClick={() => router.back()}
            className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-slate-700" />
          </button>

          <span
            className={`absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
        </div>

        <div className="p-4 space-y-5">

          {/* Description */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-3">
              Description
            </h2>

            <p className="text-slate-600 text-sm leading-relaxed">
              {report.description ??
                "No description provided."}
            </p>
          </div>

          {/* Meta */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 text-sm text-slate-600">

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

            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="font-mono text-xs break-all">
                {report.ipfsCid}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex flex-col w-full">

        {/* Top Bar */}
        <div className="flex items-center justify-between px-8 py-4">
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

        {/* Grid */}
        <div className="grid grid-cols-[1fr_320px] gap-8 px-8 pb-8">

          {/* LEFT */}
          <div className="flex flex-col gap-6">

            {/* HERO */}
            <div className="relative w-full h-85 rounded-2xl overflow-hidden bg-slate-100 shadow-sm">

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
                      className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm aspect-video bg-slate-100"
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
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-5 sticky top-8 self-start">

            {/* Voting */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">

              <h3 className="text-lg font-bold text-slate-900 mb-5">
                Democratic Voting
              </h3>

              <div className="mb-4">

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Community Consensus
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

                <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" />
                  {report.upvotes} upvotes · {report.downvotes} downvotes
                </p>
              </div>

              <div className="flex flex-col gap-3 mt-4">

                <button
                  onClick={() => setVoted("legitimate")}
                  className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Legitimate
                </button>

                <button
                  onClick={() => setVoted("spam")}
                  className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all"
                >
                  ⚠ Spam/Invalid
                </button>
              </div>
            </div>

            {/* Authority */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex gap-4">

              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Landmark className="h-5 w-5 text-slate-500" />
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                  Assigned Authority
                </p>

                <p className="text-sm font-bold text-slate-900 mb-1 font-mono truncate">
                  {report.assignedAuthority ===
                  "0x0000000000000000000000000000000000000000"
                    ? "Not yet assigned"
                    : `${report.assignedAuthority.slice(
                        0,
                        6
                      )}…${report.assignedAuthority.slice(-4)}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function setIsSubmitting(arg0: boolean) {
  throw new Error("Function not implemented.");
}
