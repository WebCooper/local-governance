"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import axios from "axios";
import toast from "react-hot-toast";

import MapPreview from "@/components/MapPreview";
import { CitizenEmergencyFeed } from "@/components/CitizenEmergencyFeed";
import { useAdmin } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { getPollingContract } from "@/lib/contracts/polling";
import CountdownTimer from "@/components/ui/CountdownTimer";

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
  phaseDeadline: number;
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

function getReportPhaseVotes(votes: any, status: number) {
  const validationUpvotes = Number(votes.validationUpvotes);
  const validationDownvotes = Number(votes.validationDownvotes);
  const verificationAcceptVotes = Number(votes.verificationAcceptVotes);
  const verificationRejectVotes = Number(votes.verificationRejectVotes);
  const rejectionUpholdVotes = Number(votes.rejectionUpholdVotes);
  const rejectionAppealVotes = Number(votes.rejectionAppealVotes);

  switch (status) {
    case 0: // PendingValidation
      return {
        upvotes: validationUpvotes,
        downvotes: validationDownvotes,
      };
    case 5: // PendingVerification
      return {
        upvotes: verificationAcceptVotes,
        downvotes: verificationRejectVotes,
      };
    case 4: // PendingRejectionReview
      return {
        upvotes: rejectionUpholdVotes,
        downvotes: rejectionAppealVotes,
      };
    default:
      // Inactive window — surface the most-recent phase that has data
      if (verificationAcceptVotes + verificationRejectVotes > 0) {
        return {
          upvotes: verificationAcceptVotes,
          downvotes: verificationRejectVotes,
        };
      }
      if (rejectionUpholdVotes + rejectionAppealVotes > 0) {
        return {
          upvotes: rejectionUpholdVotes,
          downvotes: rejectionAppealVotes,
        };
      }
      return {
        upvotes: validationUpvotes,
        downvotes: validationDownvotes,
      };
  }
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
  } catch { }

  return undefined;
}

function formatLocation(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  let address = raw;

  try {
    const parsed = JSON.parse(raw);

    address = parsed.address ?? raw;
  } catch { }

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
  const [activeFeedTab, setActiveFeedTab] = useState<"reports" | "polls" | "emergency">("reports");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("tab=emergency")) {
      setActiveFeedTab("emergency");
    }
  }, []);

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

      const baseReports: PublicReport[] = pageArray.map((r: any) => {
        const { upvotes, downvotes } = getReportPhaseVotes(r.votes, Number(r.status));
        return {
          id: r.id.toString(),
          ipfsCid: r.ipfsCid,
          status: Number(r.status),
          createdAt: Number(r.createdAt) * 1000,
          phaseDeadline: Number(r.phaseDeadline) * 1000,
          upvotes,
          downvotes,
          ipfsLoaded: false,
        };
      });

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
    <div className="min-h-screen bg-[#F9FAFB] pb-16 pt-4 md:pt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-start">
        
        {/* LEFT MAIN CONTENT */}
        <div className="w-full flex flex-col">
          
          {/* HERO BANNER */}
          <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-[#6B46C1] to-[#4C1D95] p-8 md:p-10 text-white relative mb-10 shadow-sm flex flex-col justify-center">
            {/* Aesthetic star/blur behind */}
            <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
              <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 0L105 85L200 100L105 115L100 200L95 115L0 100L95 85L100 0Z" fill="white" />
              </svg>
            </div>
            
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-purple-200">Civic Action</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
              See a Problem? Report to the Community
            </h1>
            
            <div>
              <Link href="/report">
                <button className="mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-full transition-all shadow-sm flex items-center gap-3 text-sm">
                  Report an issue 
                  <span className="bg-white text-slate-900 rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs">→</span>
                </button>
              </Link>
            </div>
          </div>

          {/* FEED PORTAL TABS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <h2 className="text-2xl font-bold text-slate-900">Community Feed</h2>
            <div className="flex items-center bg-white p-1 rounded-full border border-slate-100 shadow-sm shrink-0">
              <button
                onClick={() => setActiveFeedTab("reports")}
                className={`px-5 py-2 text-sm font-bold rounded-full transition-all ${
                  activeFeedTab === "reports" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Reports
              </button>
              <button
                onClick={() => setActiveFeedTab("polls")}
                className={`px-5 py-2 text-sm font-bold rounded-full transition-all ${
                  activeFeedTab === "polls" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Polls
              </button>
              <button
                onClick={() => setActiveFeedTab("emergency")}
                className={`px-5 py-2 text-sm font-bold rounded-full transition-all ${
                  activeFeedTab === "emergency" ? "bg-red-50 text-red-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Emergency
              </button>
            </div>
          </div>

          {/* TAB CONTENTS */}
          {activeFeedTab === "reports" && (
            <>
              {/* REPORTS FILTERS */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${filter === f
                          ? "bg-purple-50 text-purple-700 border border-purple-100"
                          : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleRefresh}
                  disabled={loadingReports}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-full hover:bg-slate-50 disabled:opacity-50 transition-all text-xs shadow-sm shrink-0"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${loadingReports ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* REPORTS STATES */}
              {loadingReports && reports.length === 0 ? (
                <div className="py-20 text-center">
                  <RotateCw className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
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
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-lg font-bold text-slate-900">No reports recorded yet</p>
                </div>
              ) : (
                /* REPORTS GRID */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200 p-4"
                    >
                      <div className="relative h-48 bg-slate-100 overflow-hidden rounded-2xl mb-4">
                        <ReportVisual report={report} />
                        {!report.ipfsLoaded && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-[1200]">
                            <RotateCw className="h-5 w-5 animate-spin text-slate-400" />
                          </div>
                        )}
                        <span
                          className={`absolute top-3 left-3 z-[1200] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusDetails(report.status).bg} ${getStatusDetails(report.status).text}`}
                        >
                          {getStatusDetails(report.status).label}
                        </span>
                        {report.imageUrl && (
                          <div className="absolute top-3 right-3 z-[1200] w-8 h-8 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-sm">
                            <ImageIcon className="h-4 w-4 text-slate-700" />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col flex-1 px-2">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider bg-purple-50 px-2 py-1 rounded-md">
                            {report.category || "GENERAL"}
                          </p>
                          <h3 className="text-sm font-bold text-slate-400">#{report.id}</h3>
                        </div>
                        
                        <p className="text-sm font-bold text-slate-900 leading-relaxed line-clamp-2 mb-3">
                          {report.description || (!report.ipfsLoaded ? "Loading..." : "No description")}
                        </p>
                        
                        <div className="flex items-center justify-between pt-4 mt-auto border-t border-slate-50">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                              <ThumbsUp className="h-3.5 w-3.5" /> {report.upvotes}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md">
                              <ThumbsDown className="h-3.5 w-3.5" /> {report.downvotes}
                            </span>
                          </div>
                          <Link href={`/issues/${report.id}`} className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
                            Details →
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
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-sm"
                    disabled={offset === 0 || loadingReports}
                    onClick={() => setOffset((prev) => Math.max(0, prev - LIMIT))}
                  >
                    Previous
                  </button>
                  <button
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-sm"
                    disabled={offset + LIMIT >= totalCount || loadingReports}
                    onClick={() => setOffset((prev) => prev + LIMIT)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {activeFeedTab === "emergency" && (
            <CitizenEmergencyFeed />
          )}

          {activeFeedTab === "polls" && (
            <>
              {/* POLLS FILTERS */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                  <button
                    onClick={() => { setPollsFilter("all"); setPollsPage(1); }}
                    className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${pollsFilter === "all"
                        ? "bg-purple-50 text-purple-700 border border-purple-100"
                        : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    <span>All</span>
                    <span className={`px-1.5 py-0.5 text-[9px] rounded-md ${pollsFilter === "all" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                      {polls.length}
                    </span>
                  </button>
                  <button
                    onClick={() => { setPollsFilter("open"); setPollsPage(1); }}
                    className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${pollsFilter === "open"
                        ? "bg-purple-50 text-purple-700 border border-purple-100"
                        : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    <span>Active</span>
                    <span className={`px-1.5 py-0.5 text-[9px] rounded-md ${pollsFilter === "open" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                      {polls.filter(p => p.isActive && Math.floor(Date.now() / 1000) < p.deadline).length}
                    </span>
                  </button>
                  <button
                    onClick={() => { setPollsFilter("closed"); setPollsPage(1); }}
                    className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${pollsFilter === "closed"
                        ? "bg-purple-50 text-purple-700 border border-purple-100"
                        : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    <span>Completed</span>
                    <span className={`px-1.5 py-0.5 text-[9px] rounded-md ${pollsFilter === "closed" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                      {polls.filter(p => !p.isActive || Math.floor(Date.now() / 1000) >= p.deadline).length}
                    </span>
                  </button>
                </div>

                <button
                  onClick={handleRefresh}
                  disabled={loadingPolls}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-full hover:bg-slate-50 disabled:opacity-50 transition-all text-xs shadow-sm shrink-0"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${loadingPolls ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* POLLS STATES */}
              {loadingPolls && polls.length === 0 ? (
                <div className="py-20 text-center">
                  <RotateCw className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Syncing opinion polls ledger...</p>
                </div>
              ) : paginatedPolls.length === 0 ? (
                <div className="text-center bg-white border border-slate-100 rounded-3xl py-20 px-4 shadow-sm">
                  <p className="text-slate-500 font-bold">No opinion polls found in this category.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {paginatedPolls.map((poll) => {
                    const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
                    const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
                    const isOpen = poll.isActive && !isExpired;

                    return (
                      <div key={poll.id} className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex justify-between items-start gap-3 mb-4">
                          <h2 className="text-xl font-bold tracking-tight text-slate-900">{poll.title}</h2>
                          <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider shrink-0 ${isOpen
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                            }`}>
                            {isOpen ? "Active" : "Closed"}
                          </span>
                        </div>

                        <p className="text-slate-500 text-sm leading-relaxed mb-6 whitespace-pre-wrap">{poll.description}</p>

                        {poll.images && poll.images.length > 0 && (
                          <div className="mb-6">
                            {poll.images.length === 1 ? (
                              <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-100">
                                <img
                                  src={`data:${poll.images[0].mimeType};base64,${poll.images[0].data}`}
                                  alt={poll.images[0].originalName}
                                  onClick={() => setActiveImage(poll.images![0])}
                                  className="w-full max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                />
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {poll.images.map((img, index) => (
                                  <div key={index} className="overflow-hidden rounded-xl border border-slate-100 aspect-video">
                                    <img
                                      src={`data:${img.mimeType};base64,${img.data}`}
                                      alt={img.originalName}
                                      onClick={() => setActiveImage(img)}
                                      className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Vote Options Block */}
                        <div className="space-y-3">
                          {poll.options.map((option, idx) => {
                            const voteCount = poll.results?.[idx] || 0;
                            const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

                            let barColorClass = "bg-purple-600/10";
                            let textColorClass = "text-purple-600";

                            if (poll.pollType === 0) {
                              if (idx === 0) {
                                barColorClass = "bg-rose-500/10";
                                textColorClass = "text-rose-600";
                              } else {
                                barColorClass = "bg-emerald-500/10";
                                textColorClass = "text-emerald-600";
                              }
                            }

                            const citizenVotedOnThisPoll = userVotes[poll.id] !== undefined;
                            const hasVotedThisOption = userVotes[poll.id] === idx;

                            return (
                              <div key={idx} className={`relative flex flex-col justify-center rounded-2xl p-4 md:p-5 overflow-hidden transition-all border ${hasVotedThisOption
                                  ? "bg-purple-50 border-purple-400 ring-1 ring-purple-400 shadow-sm"
                                  : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                                }`}>
                                {!isOpen && (
                                  <div className={`absolute top-0 left-0 bottom-0 ${barColorClass} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
                                )}

                                <div className="relative z-10 flex justify-between items-center w-full">
                                  <div className="flex items-center gap-3">
                                    {isOpen && wallet && !citizenVotedOnThisPoll ? (
                                      poll.pollType === 0 ? (
                                        idx === 0 ? (
                                          <button
                                            disabled={votingMap[poll.id]}
                                            onClick={() => handleCastVote(poll.id, idx)}
                                            className="p-1.5 bg-white hover:bg-rose-50 rounded-xl transition shadow-sm disabled:opacity-50"
                                          >
                                            <ThumbsDown className="w-5 h-5 text-rose-500" />
                                          </button>
                                        ) : (
                                          <button
                                            disabled={votingMap[poll.id]}
                                            onClick={() => handleCastVote(poll.id, idx)}
                                            className="p-1.5 bg-white hover:bg-emerald-50 rounded-xl transition shadow-sm disabled:opacity-50"
                                          >
                                            <ThumbsUp className="w-5 h-5 text-emerald-500" />
                                          </button>
                                        )
                                      ) : (
                                        <button
                                          disabled={votingMap[poll.id]}
                                          onClick={() => handleCastVote(poll.id, idx)}
                                          className="p-1.5 bg-white hover:bg-purple-50 rounded-xl transition shadow-sm disabled:opacity-50"
                                        >
                                          <CheckCircle2 className="w-5 h-5 text-purple-600" />
                                        </button>
                                      )
                                    ) : (
                                      (poll.pollType === 0 && (
                                        idx === 0
                                          ? <ThumbsDown className="w-4.5 h-4.5 text-rose-400 shrink-0" />
                                          : <ThumbsUp className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                                      ))
                                    )}
                                    <span className="font-bold text-sm text-slate-700">
                                      {option.trim().toLowerCase() === "false"
                                        ? "Disagree / No"
                                        : option.trim().toLowerCase() === "true"
                                          ? "Agree / Yes"
                                          : option}
                                    </span>
                                  </div>

                                  {!isOpen ? (
                                    <div className="text-xs font-mono text-slate-500 space-x-2">
                                      <span>{voteCount} votes</span>
                                      <span className={`${textColorClass} font-bold`}>({percentage}%)</span>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">Results hidden</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* POLLS PAGINATION */}
              {totalPollsPages > 1 && (
                <div className="flex justify-center items-center gap-4 pt-8">
                  <button
                    disabled={activePollsPage === 1}
                    onClick={() => setPollsPage(prev => prev - 1)}
                    className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
                  >
                    Previous
                  </button>
                  <button
                    disabled={activePollsPage === totalPollsPages}
                    onClick={() => setPollsPage(prev => prev + 1)}
                    className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>


      </div>

      {/* Image Preview Modal */}
      {activeImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-all duration-300"
          onClick={() => setActiveImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full h-full flex items-center justify-center">
            <img
              src={`data:${activeImage.mimeType};base64,${activeImage.data}`}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full px-4 py-2 text-sm font-bold backdrop-blur-sm transition"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}