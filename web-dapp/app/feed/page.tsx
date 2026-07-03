"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import axios from "axios";
import toast from "react-hot-toast";

import MapPreview from "@/components/MapPreview";
import { useAdmin } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { getPollingContract } from "@/lib/contracts/polling";

import {
  ThumbsUp,
  ThumbsDown,
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
  Vote,
  Clock,
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

interface PollStructure {
  id: number;
  title: string;
  description: string;
  options: string[];
  pollType: number;
  deadline: number;
  isActive: boolean;
  results?: number[];
  images?: { originalName: string; mimeType: string; data: string }[];
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
  if (report.imageUrl) {
    return (
      <img
        src={report.imageUrl}
        alt={report.description || `Report ${report.id}`}
        className="w-full h-full object-cover"
      />
    );
  }

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
  const { provider, isAuthority } = useAdmin();
  const { wallet, consumeTicket, availableTicketsCount } = useCitizen();

  // General tab switcher
  const [activeFeedTab, setActiveFeedTab] = useState<"reports" | "polls">("reports");

  // Civic Reports States
  const [filter, setFilter] = useState("All Issues");
  const [sort, setSort] = useState("Most Recent");
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingReports, setLoadingReports] = useState(true);
  const [errorReports, setErrorReports] = useState<string | null>(null);

  // Opinion Polls States
  const [polls, setPolls] = useState<PollStructure[]>([]);
  const [loadingPolls, setLoadingPolls] = useState(false);
  const [pollsFilter, setPollsFilter] = useState<"all" | "open" | "closed">("all");
  const [pollsPage, setPollsPage] = useState(1);
  const [votingMap, setVotingMap] = useState<Record<number, boolean>>({});
  const [userVotes, setUserVotes] = useState<Record<number, number>>({});
  const [activeImage, setActiveImage] = useState<{ data: string; mimeType: string } | null>(null);
  const pollsPerPage = 5;

  // Local storage votes tracking
  useEffect(() => {
    if (wallet) {
      const stored = localStorage.getItem(`citizen_poll_votes_${wallet.publicKey}`);
      if (stored) {
        try {
          setUserVotes(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      setUserVotes({});
    }
  }, [wallet]);

  const fetchPublicReports = async () => {
    setLoadingReports(true);
    setErrorReports(null);

    try {
      const RPC_URL =
        process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

      const CONTRACT_ADDRESS =
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";

      if (!CONTRACT_ADDRESS) {
        throw new Error("Smart contract address is not configured.");
      }

      const providerObj = new ethers.JsonRpcProvider(RPC_URL);

      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        PUBLIC_REPORTING_ABI,
        providerObj
      );

      const [pageArray, totalReports] =
        await contract.getAllReports(offset, LIMIT);

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
      setErrorReports(
        err.message || "Failed to load reports from blockchain."
      );
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchActivePolls = async () => {
    setLoadingPolls(true);
    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const readProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = getPollingContract(readProvider);
      const chainCount = Number(await contract.pollCount());

      const loadedPolls: PollStructure[] = [];

      if (chainCount > 0) {
        for (let i = chainCount; i >= 1; i--) {
          const chainPoll = await contract.polls(i);

          let metaTitle = `Opinion Poll #${i}`;
          let metaDesc = "Loading metadata...";
          let metaOptions: string[] = ["False", "True"];
          let metaImages = [];

          try {
            const ipfsRes = await axios.get(`/api/ipfs/poll/${chainPoll.ipfsMetadataCid}`);
            if (ipfsRes.data) {
              metaTitle = ipfsRes.data.title;
              metaDesc = ipfsRes.data.description;
              metaOptions = ipfsRes.data.options;
              metaImages = ipfsRes.data.images || [];
            }
          } catch (e) {
            console.error(`Failed to resolve IPFS metadata for poll ${i}`, e);
          }

          const optionCount = Number(chainPoll.pollType) === 0 ? 2 : metaOptions.length;
          const freshTally = await contract.getPollResults(i, optionCount);

          loadedPolls.push({
            id: i,
            title: metaTitle,
            description: metaDesc,
            options: metaOptions,
            pollType: Number(chainPoll.pollType),
            deadline: Number(chainPoll.deadline),
            isActive: chainPoll.isActive,
            results: freshTally.map((votes: any) => Number(votes)),
            images: metaImages
          });
        }
      }
      setPolls(loadedPolls);
    } catch (err) {
      console.error("Failed loading opinion polls in feed:", err);
      toast.error("Unable to fetch polls from blockchain.");
    } finally {
      setLoadingPolls(false);
    }
  };

  useEffect(() => {
    if (activeFeedTab === "reports") {
      fetchPublicReports();
    } else {
      fetchActivePolls();
    }
  }, [offset, activeFeedTab]);

  const handleRefresh = () => {
    if (activeFeedTab === "reports") {
      fetchPublicReports();
    } else {
      fetchActivePolls();
    }
  };

  const handleCastVote = async (pollId: number, optionIndex: number) => {
    if (!wallet) {
      toast.error("Please authenticate with your Citizen credentials first.");
      return;
    }
    if (availableTicketsCount === 0) {
      toast.error("All ZKP action tickets used! Please request a new batch.");
      return;
    }

    setVotingMap(prev => ({ ...prev, [pollId]: true }));
    const loadingToast = toast.loading("Verifying credentials and casting your vote...");
    
    try {
      const activeTicket = consumeTicket();
      if (!activeTicket) throw new Error("Could not acquire active ticket.");

      const ethersWallet = new ethers.Wallet(wallet.privateKey);
      const timestamp = Date.now();

      const authChallenge = `get-pseudonym:${wallet.publicKey}:${timestamp}`;
      const authSignature = await ethersWallet.signMessage(authChallenge);

      const voteMessageHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "string"],
        [pollId, optionIndex, activeTicket.ticketId]
      );
      const voteSignature = await ethersWallet.signMessage(ethers.getBytes(voteMessageHash));

      const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "http://localhost:3001";
      const response = await axios.post(`${RELAYER_URL}/polling/vote`, {
        pollId,
        optionIndex,
        zkpTicketId: activeTicket.ticketId,
        zkpSignature: activeTicket.signature,
        citizenPubKey: wallet.publicKey,
        signature: voteSignature
      }, {
        headers: {
          Authorization: `${wallet.publicKey}:${timestamp}:${authSignature}`
        }
      });

      if (response.data.success) {
        toast.success("Your anonymous vote has been successfully cast on-chain!", { id: loadingToast });
        
        const updatedVotes = { ...userVotes, [pollId]: optionIndex };
        setUserVotes(updatedVotes);
        localStorage.setItem(`citizen_poll_votes_${wallet.publicKey}`, JSON.stringify(updatedVotes));

        await fetchActivePolls();
      }
    } catch (error: any) {
      console.error(error);
      const errMsg = error.response?.data?.message || error.message || "Relayer communication failure.";
      toast.error(`Vote failed: ${errMsg}`, { id: loadingToast });
    } finally {
      setVotingMap(prev => ({ ...prev, [pollId]: false }));
    }
  };

  // Poll filters
  const filteredPolls = polls.filter((poll) => {
    const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
    const isOpen = poll.isActive && !isExpired;

    if (pollsFilter === "open") return isOpen;
    if (pollsFilter === "closed") return !isOpen;
    return true;
  });

  const totalPollsPages = Math.max(1, Math.ceil(filteredPolls.length / pollsPerPage));
  const activePollsPage = Math.min(pollsPage, totalPollsPages);
  const paginatedPolls = filteredPolls.slice(
    (activePollsPage - 1) * pollsPerPage,
    activePollsPage * pollsPerPage
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
              Community Feed
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Participate in anonymous civic reporting and opinion polls on-chain.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {wallet && activeFeedTab === "polls" && (
              <div className="bg-sky-50 border border-sky-100 px-4 py-2 rounded-xl text-right shadow-sm">
                <span className="block text-[10px] text-sky-700 font-semibold uppercase tracking-wider">ZK Action Tickets</span>
                <span className="text-sm font-mono font-bold text-sky-800">{availableTicketsCount} Available</span>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={loadingReports || loadingPolls}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all text-sm shadow-sm"
            >
              <RotateCw
                className={`h-4 w-4 ${
                  loadingReports || loadingPolls ? "animate-spin" : ""
                }`}
              />
              Refresh Feed
            </button>
          </div>
        </div>

        {/* Banners */}
        {isAuthority && !wallet && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm text-blue-700 shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
              <span>You are connected as an Authority. Create and finalize polls directly inside your official panel.</span>
            </div>
            <Link href="/admin" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs shadow-sm whitespace-nowrap shrink-0">
              Go to Admin Panel
            </Link>
          </div>
        )}

        {!wallet && !isAuthority && activeFeedTab === "polls" && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm text-amber-800 shadow-sm animate-in fade-in duration-300">
            <div>
              <span className="font-bold">Voting is locked.</span> Authenticate with your GovID to receive anonymous ZK action tickets and participate.
            </div>
            <Link href="/auth" className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs shadow-sm whitespace-nowrap shrink-0">
              Get ZK Tickets
            </Link>
          </div>
        )}

        {/* FEED PORTAL TABS */}
        <div className="flex border-b border-slate-200 mb-8 gap-6">
          <button
            onClick={() => setActiveFeedTab("reports")}
            className={`pb-4 text-lg font-bold transition-all relative ${
              activeFeedTab === "reports" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Civic Reports
          </button>
          <button
            onClick={() => setActiveFeedTab("polls")}
            className={`pb-4 text-lg font-bold transition-all relative ${
              activeFeedTab === "polls" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Opinion Polls ({polls.length})
          </button>
        </div>

        {activeFeedTab === "reports" ? (
          <>
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

            {/* REPORTS STATES */}
            {loadingReports && reports.length === 0 ? (
              <div className="py-32 text-center">
                <RotateCw className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">Syncing public ledger...</p>
              </div>
            ) : errorReports ? (
              <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-start gap-3">
                <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-lg">Error Loading Reports</h4>
                  <p className="mt-1">{errorReports}</p>
                </div>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-32 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <FileText className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-xl font-medium text-slate-900">No reports recorded yet</p>
              </div>
            ) : (
              /* REPORTS GRID */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200"
                  >
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
                          <span className="line-clamp-2">{report.location}</span>
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

            {/* REPORTS PAGINATION */}
            {totalCount > LIMIT && (
              <div className="flex justify-center items-center gap-4 pt-10">
                <button
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 transition-colors"
                  disabled={offset === 0 || loadingReports}
                  onClick={() => setOffset((prev) => Math.max(0, prev - LIMIT))}
                >
                  ← Previous
                </button>
                <span className="text-sm text-slate-500 font-medium">
                  Showing {offset + 1}–{Math.min(offset + LIMIT, totalCount)} of {totalCount} reports
                </span>
                <button
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 transition-colors"
                  disabled={offset + LIMIT >= totalCount || loadingReports}
                  onClick={() => setOffset((prev) => prev + LIMIT)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* POLLS FILTERS */}
            <div className="flex space-x-2 bg-slate-100 p-1.5 rounded-xl self-start mb-6 w-fit shadow-inner">
              <button
                onClick={() => { setPollsFilter("all"); setPollsPage(1); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
                  pollsFilter === "all"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>All Polls</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded-md ${pollsFilter === "all" ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"}`}>
                  {polls.length}
                </span>
              </button>
              <button
                onClick={() => { setPollsFilter("open"); setPollsPage(1); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
                  pollsFilter === "open"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Active</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded-md ${pollsFilter === "open" ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"}`}>
                  {polls.filter(p => p.isActive && Math.floor(Date.now() / 1000) < p.deadline).length}
                </span>
              </button>
              <button
                onClick={() => { setPollsFilter("closed"); setPollsPage(1); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
                  pollsFilter === "closed"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Completed</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded-md ${pollsFilter === "closed" ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"}`}>
                  {polls.filter(p => !p.isActive || Math.floor(Date.now() / 1000) >= p.deadline).length}
                </span>
              </button>
            </div>

            {/* POLLS STATES */}
            {loadingPolls && polls.length === 0 ? (
              <div className="py-32 text-center">
                <RotateCw className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">Syncing opinion polls ledger...</p>
              </div>
            ) : paginatedPolls.length === 0 ? (
              <div className="text-center bg-white border border-slate-200 rounded-2xl py-16 px-4 shadow-sm">
                <p className="text-slate-500 font-medium">No opinion polls found in this category.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {paginatedPolls.map((poll) => {
                  const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
                  const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
                  const isOpen = poll.isActive && !isExpired;

                  return (
                    <div key={poll.id} className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow duration-200">
                      <div className="flex justify-between items-start gap-3">
                        <h2 className="text-xl font-bold tracking-tight text-slate-850">{poll.title}</h2>
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-lg uppercase border shrink-0 ${
                          isOpen 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}>
                          {isOpen ? "Open" : "Closed"}
                        </span>
                      </div>

                      <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{poll.description}</p>

                      {poll.images && poll.images.length > 0 && (
                        <div className="pt-1">
                          {poll.images.length === 1 ? (
                            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 shadow-sm hover:opacity-90 transition-opacity">
                              <img
                                src={`data:${poll.images[0].mimeType};base64,${poll.images[0].data}`}
                                alt={poll.images[0].originalName}
                                onClick={() => setActiveImage(poll.images![0])}
                                className="w-full max-h-48 object-cover cursor-pointer"
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {poll.images.map((img, index) => (
                                <div key={index} className="overflow-hidden rounded-lg border border-slate-200 shadow-sm hover:opacity-90 transition-opacity aspect-video">
                                  <img
                                    src={`data:${img.mimeType};base64,${img.data}`}
                                    alt={img.originalName}
                                    onClick={() => setActiveImage(img)}
                                    className="w-full h-full object-cover cursor-pointer"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Vote Options Block */}
                      <div className="space-y-2 pt-2">
                        {poll.options.map((option, idx) => {
                          const voteCount = poll.results?.[idx] || 0;
                          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

                          let barColorClass = "bg-blue-600/10";
                          let textColorClass = "text-blue-600";

                          if (poll.pollType === 0) {
                            if (idx === 0) {
                              barColorClass = "bg-rose-500/10";
                              textColorClass = "text-rose-600";
                            } else {
                              barColorClass = "bg-emerald-500/10";
                              textColorClass = "text-emerald-600";
                            }
                          } else {
                            const colors = [
                              { bar: "bg-blue-600/10", text: "text-blue-600" },
                              { bar: "bg-indigo-600/10", text: "text-indigo-600" },
                              { bar: "bg-sky-600/10", text: "text-sky-600" },
                              { bar: "bg-violet-600/10", text: "text-violet-600" }
                            ];
                            const choiceStyle = colors[idx % colors.length];
                            barColorClass = choiceStyle.bar;
                            textColorClass = choiceStyle.text;
                          }

                          const citizenVotedOnThisPoll = userVotes[poll.id] !== undefined;
                          const hasVotedThisOption = userVotes[poll.id] === idx;

                          return (
                            <div key={idx} className={`relative flex flex-col justify-center rounded-xl p-3.5 overflow-hidden border transition-all ${
                              hasVotedThisOption 
                                ? "bg-blue-50/20 border-blue-300 ring-1 ring-blue-300 shadow-sm" 
                                : "bg-slate-50 border-slate-100"
                            }`}>
                              {!isOpen && (
                                <div className={`absolute top-0 left-0 bottom-0 ${barColorClass} transition-all duration-700 ease-out`} style={{ width: `${percentage}%` }} />
                              )}

                              <div className="relative z-10 flex justify-between items-center w-full">
                                <div className="flex items-center gap-3">
                                  {isOpen && wallet && !citizenVotedOnThisPoll ? (
                                    poll.pollType === 0 ? (
                                      idx === 0 ? (
                                        <button 
                                          disabled={votingMap[poll.id]} 
                                          onClick={() => handleCastVote(poll.id, idx)}
                                          className="p-1.5 hover:bg-rose-50 rounded-xl transition active:scale-95 disabled:opacity-50 shrink-0"
                                          title="Vote No"
                                        >
                                          <ThumbsDown className="w-5 h-5 text-rose-500 hover:-rotate-12 hover:scale-110 transition-transform" />
                                        </button>
                                      ) : (
                                        <button 
                                          disabled={votingMap[poll.id]} 
                                          onClick={() => handleCastVote(poll.id, idx)}
                                          className="p-1.5 hover:bg-emerald-50 rounded-xl transition active:scale-95 disabled:opacity-50 shrink-0"
                                          title="Vote Yes"
                                        >
                                          <ThumbsUp className="w-5 h-5 text-emerald-500 hover:rotate-12 hover:scale-110 transition-transform" />
                                        </button>
                                      )
                                    ) : (
                                      <button 
                                        disabled={votingMap[poll.id]} 
                                        onClick={() => handleCastVote(poll.id, idx)}
                                        className="p-1.5 hover:bg-blue-50 rounded-xl transition active:scale-95 disabled:opacity-50 shrink-0"
                                        title="Vote Option"
                                      >
                                        <CheckCircle2 className="w-5 h-5 text-blue-600 hover:scale-110 transition-transform" />
                                      </button>
                                    )
                                  ) : (
                                    (poll.pollType === 0 && (
                                      idx === 0 
                                        ? <ThumbsDown className="w-4.5 h-4.5 text-rose-400 shrink-0" />
                                        : <ThumbsUp className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                                    ))
                                  )}
                                  <span className="font-semibold text-sm text-slate-700">
                                    {option.trim().toLowerCase() === "false" 
                                      ? "Disagree / No" 
                                      : option.trim().toLowerCase() === "true" 
                                      ? "Agree / Yes" 
                                      : option}
                                  </span>
                                  {hasVotedThisOption && (
                                    <span className="inline-block text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 shadow-sm">
                                      Your Vote
                                    </span>
                                  )}
                                </div>
                                
                                {!isOpen ? (
                                  <div className="text-xs font-mono text-slate-500 space-x-2">
                                    <span>{voteCount} votes</span>
                                    <span className={`${textColorClass} font-bold`}>({percentage}%)</span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Results hidden until closed</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-slate-400 font-medium pt-3 border-t border-slate-100 flex justify-between">
                        <span>Total Votes: {isOpen ? "Hidden" : totalVotes}</span>
                        <span>Expires: {new Date(poll.deadline * 1000).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* POLLS PAGINATION */}
            {totalPollsPages > 1 && (
              <div className="flex justify-center items-center space-x-4 pt-6">
                <button
                  disabled={activePollsPage === 1}
                  onClick={() => setPollsPage(prev => prev - 1)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
                >
                  Previous
                </button>
                <span className="text-sm font-medium text-slate-500">
                  Page {activePollsPage} of {totalPollsPages}
                </span>
                <button
                  disabled={activePollsPage === totalPollsPages}
                  onClick={() => setPollsPage(prev => prev + 1)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Image Preview Modal */}
      {activeImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-all duration-300"
          onClick={() => setActiveImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full h-full flex items-center justify-center">
            <img 
              src={`data:${activeImage.mimeType};base64,${activeImage.data}`} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
            <button 
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur-sm transition"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}