"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { getPollingContract } from "@/lib/contracts/polling";
import { ethers } from "ethers";
import axios from "axios";
import Link from "next/link";
import toast from "react-hot-toast";
import { ThumbsUp, ThumbsDown, CheckCircle2 } from "lucide-react";

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

export default function PollsFeedPage() {
  const { provider, isAuthority } = useAdmin();
  const { wallet, consumeTicket, availableTicketsCount } = useCitizen();

  const [polls, setPolls] = useState<PollStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [votingMap, setVotingMap] = useState<Record<number, boolean>>({});
  const [activeImage, setActiveImage] = useState<{ data: string; mimeType: string } | null>(null);

  // Navigation states
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const pollsPerPage = 5;

  // Local storage votes tracking to show the citizen's own voted option locally (preserving anonymity)
  const [userVotes, setUserVotes] = useState<Record<number, number>>({});

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

  const fetchActiveSlate = async () => {
    try {
      if (firstLoad) setLoading(true);
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const readProvider = provider || new ethers.JsonRpcProvider(RPC_URL);
      const contract = getPollingContract(readProvider);
      const chainCount = Number(await contract.pollCount());

      if (chainCount > 0) {
        // Fetch all polls concurrently in parallel using Promise.all
        const pollIndices = Array.from({ length: chainCount }, (_, idx) => chainCount - idx);

        const loadedPolls = await Promise.all(
          pollIndices.map(async (i) => {
            try {
              const chainPoll = await contract.polls(i);

              let metaTitle = `Opinion Poll #${i}`;
              let metaDesc = "Retrieving metadata from decentralized storage...";
              let metaOptions: string[] = ["False", "True"];
              let metaImages: any[] = [];

              // Fetch IPFS metadata & vote results concurrently
              const [ipfsResult, tallyResult] = await Promise.allSettled([
                axios.get(`/api/ipfs/poll/${chainPoll.ipfsMetadataCid}`),
                contract.getPollResults(i, Number(chainPoll.pollType) === 0 ? 2 : 5),
              ]);

              if (ipfsResult.status === "fulfilled" && ipfsResult.value?.data) {
                const data = ipfsResult.value.data;
                metaTitle = data.title || metaTitle;
                metaDesc = data.description || metaDesc;
                metaOptions = data.options || metaOptions;
                metaImages = data.images || [];
              }

              let results: number[] = [];
              if (tallyResult.status === "fulfilled" && Array.isArray(tallyResult.value)) {
                results = tallyResult.value.map((v: any) => Number(v));
              }

              return {
                id: i,
                title: metaTitle,
                description: metaDesc,
                options: metaOptions,
                pollType: Number(chainPoll.pollType),
                deadline: Number(chainPoll.deadline),
                isActive: chainPoll.isActive,
                results,
                images: metaImages,
              } as PollStructure;
            } catch (e) {
              console.error(`Failed to fetch poll #${i}`, e);
              return null;
            }
          })
        );

        const validPolls = loadedPolls.filter((p): p is PollStructure => p !== null);
        setPolls(validPolls);
      } else {
        setPolls([]);
      }
    } catch (err) {
      console.error("Failed loading opinion polls natively:", err);
      toast.error("Unable to fetch polls from the blockchain network.");
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  };

  useEffect(() => {
    fetchActiveSlate();
  }, [provider]);

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

        // Save vote to local state & localStorage
        const updatedVotes = { ...userVotes, [pollId]: optionIndex };
        setUserVotes(updatedVotes);
        if (wallet) {
          localStorage.setItem(`citizen_poll_votes_${wallet.publicKey}`, JSON.stringify(updatedVotes));
        }

        await fetchActiveSlate();
      }
    } catch (error: any) {
      console.error(error);
      const errMsg = error.response?.data?.message || error.message || "Relayer communication failure.";
      toast.error(`Vote failed: ${errMsg}`, { id: loadingToast });
    } finally {
      setVotingMap(prev => ({ ...prev, [pollId]: false }));
    }
  };

  const handleClosePoll = async (pollId: number) => {
    if (!provider) {
      toast.error("Web3 Provider missing. Reconnect your browser wallet.");
      return;
    }
    const loadingToast = toast.loading("Broadcasting finalization transaction...");
    try {
      const signer = await provider.getSigner();
      const contract = getPollingContract(signer);
      const tx = await contract.finalizePoll(pollId);
      toast.loading("Waiting for block inclusion...", { id: loadingToast });
      await tx.wait();
      toast.success("Poll successfully finalized and closed on-chain!", { id: loadingToast });
      await fetchActiveSlate();
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to finalize: ${err.message}`, { id: loadingToast });
    }
  };

  // Derived client-side filters
  const filteredPolls = polls.filter((poll) => {
    const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
    const isOpen = poll.isActive && !isExpired;

    if (filter === "open") return isOpen;
    if (filter === "closed") return !isOpen;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPolls.length / pollsPerPage));
  const activePage = Math.min(currentPage, totalPages);

  const paginatedPolls = filteredPolls.slice(
    (activePage - 1) * pollsPerPage,
    activePage * pollsPerPage
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-semibold animate-pulse">Syncing smart contracts & IPFS envelopes...</p>
        </div>
      </div>
    );
  }

  // Derive status counts for the filter tabs
  const allCount = polls.length;
  const activeCount = polls.filter((p) => {
    const isExpired = Math.floor(Date.now() / 1000) >= p.deadline;
    return p.isActive && !isExpired;
  }).length;
  const completedCount = polls.filter((p) => {
    const isExpired = Math.floor(Date.now() / 1000) >= p.deadline;
    return !p.isActive || isExpired;
  }).length;

  return (
    <>
      <div className="min-h-screen bg-[#F9FAFB] pb-16 pt-4 md:pt-8 text-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col">
          
          {/* HERO BANNER */}
          <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-[#2563EB] to-[#1E3A8A] p-8 md:p-10 text-white relative mb-10 shadow-sm flex flex-col justify-center">
            <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
              <svg className="animate-spin-in" width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 0L105 85L200 100L105 115L100 200L95 115L0 100L95 85L100 0Z" fill="white" />
              </svg>
            </div>
            
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-blue-200">Community Polling</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
              Shape Your Community with ZK Votes
            </h1>
            <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
               Cast fully anonymous votes secured by zero-knowledge ticket credentials. Your identity remains private, but your vote counts.
            </p>
            
            <div className="flex gap-4">
               {isAuthority && !wallet && (
                <Link href="/polls/create">
                  <button className="bg-white text-blue-900 font-bold py-3.5 px-6 rounded-full transition-all shadow-sm flex items-center gap-3 text-sm hover:bg-slate-50">
                    + Create New Poll
                  </button>
                </Link>
               )}
            </div>
          </div>

          <div className="w-full space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Active Polls</h2>
              {wallet && (
                <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-right shadow-sm flex flex-col">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ZK Tickets</span>
                  <span className="text-sm font-bold text-slate-800">{availableTicketsCount} Available</span>
                </div>
              )}
            </div>

            {isAuthority && !wallet && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm text-blue-700 shadow-sm animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                  <span>You are connected as an Authority. Create and finalize polls directly inside your official panel.</span>
                </div>
                <Link href="/admin" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs shadow-sm whitespace-nowrap shrink-0">
                  Go to Admin Panel
                </Link>
              </div>
            )}

            {!wallet && !isAuthority && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm text-amber-800 shadow-sm animate-in fade-in duration-300">
                <div>
                  <span className="font-bold">Voting is locked.</span> Authenticate with your GovID to receive anonymous ZK action tickets and participate.
                </div>
                <Link href="/auth" className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs shadow-sm whitespace-nowrap shrink-0">
                  Get ZK Tickets
                </Link>
              </div>
            )}

          {/* Filters and Controls */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => { setFilter("all"); setCurrentPage(1); }}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${filter === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
            >
              All Polls <span className="ml-1 opacity-70">({allCount})</span>
            </button>
            <button
              onClick={() => { setFilter("open"); setCurrentPage(1); }}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${filter === "open"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
            >
              Active <span className="ml-1 opacity-70">({activeCount})</span>
            </button>
            <button
              onClick={() => { setFilter("closed"); setCurrentPage(1); }}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${filter === "closed"
                  ? "bg-slate-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
            >
              Completed <span className="ml-1 opacity-70">({completedCount})</span>
            </button>
          </div>

          {paginatedPolls.length === 0 ? (
            <div className="text-center bg-white border border-slate-200 rounded-2xl py-16 px-4 shadow-sm">
              <p className="text-slate-500 font-medium">No opinion polls match the selected filter category.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {paginatedPolls.map((poll) => {
                const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
                const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
                const isOpen = poll.isActive && !isExpired;

                return (
                  <div key={poll.id} className="bg-white border border-slate-100/60 rounded-[24px] p-6 space-y-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{poll.title}</h2>
                      </div>
                      <div className="flex items-center gap-3 self-start sm:self-auto">
                        {isAuthority && !wallet && poll.isActive && isExpired && (
                          <button onClick={() => handleClosePoll(poll.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition text-xs shadow-sm">
                            Close Poll
                          </button>
                        )}
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg uppercase border ${isOpen
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}>
                          {isOpen ? "Open" : "Closed"}
                        </span>
                      </div>
                    </div>

                    <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{poll.description}</p>

                    {/* Render Images if nested inside the metadata envelope */}
                    {poll.images && poll.images.length > 0 && (
                      <div className="pt-2">
                        {poll.images.length === 1 ? (
                          // Single Image: Beautiful full-width or large responsive layout
                          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 shadow-sm hover:opacity-90 transition-opacity">
                            <img
                              src={`data:${poll.images[0].mimeType};base64,${poll.images[0].data}`}
                              alt={poll.images[0].originalName}
                              onClick={() => setActiveImage(poll.images![0])}
                              className="w-full max-h-64 object-cover cursor-pointer"
                            />
                          </div>
                        ) : (
                          // Multiple Images: Grid of 2 or 3 responsive columns
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {poll.images.map((img, index) => (
                              <div key={index} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm hover:opacity-90 transition-opacity aspect-video">
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

                    {/* Options & Progress Visualization Block */}
                    <div className="space-y-3 pt-1">
                      {poll.options.map((option, idx) => {
                        const voteCount = poll.results?.[idx] || 0;
                        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

                        // Determine result bar & text colors dynamically for a beautiful, clear visual presentation
                        let barColorClass = "bg-blue-600/10";
                        let textColorClass = "text-blue-600";

                        if (poll.pollType === 0) {
                          // Binary split: index 0 (False/No) gets a coral/rose accent, index 1 (True/Yes) gets emerald green
                          if (idx === 0) {
                            barColorClass = "bg-rose-500/10";
                            textColorClass = "text-rose-600";
                          } else {
                            barColorClass = "bg-emerald-500/10";
                            textColorClass = "text-emerald-600";
                          }
                        } else {
                          // Multi-choice: cycle through a harmonious palette of premium colors
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
                          <div key={idx} className={`relative flex flex-col justify-center rounded-2xl p-4 md:p-5 overflow-hidden transition-all border ${hasVotedThisOption
                              ? "bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-sm"
                              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                            }`}>
                            {/* Animated Progress Bar background tracking metrics — only shown if poll is closed */}
                            {!isOpen && (
                              <div className={`absolute top-0 left-0 bottom-0 ${barColorClass} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
                            )}

                            <div className="relative z-10 flex justify-between items-center w-full">
                              <div className="flex items-center gap-3">
                                {isOpen && wallet && !citizenVotedOnThisPoll ? (
                                  // Clickable icon buttons for active citizen voting
                                  poll.pollType === 0 ? (
                                    idx === 0 ? (
                                        <button
                                          disabled={votingMap[poll.id]}
                                          onClick={() => handleCastVote(poll.id, idx)}
                                          className="p-2 bg-white hover:bg-rose-50 rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 shrink-0"
                                          title="Vote No"
                                        >
                                        <ThumbsDown className="w-5 h-5 text-rose-500 hover:-rotate-12 hover:scale-110 transition-transform" />
                                      </button>
                                    ) : (
                                        <button
                                          disabled={votingMap[poll.id]}
                                          onClick={() => handleCastVote(poll.id, idx)}
                                          className="p-2 bg-white hover:bg-emerald-50 rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 shrink-0"
                                          title="Vote Yes"
                                        >
                                        <ThumbsUp className="w-5 h-5 text-emerald-500 hover:rotate-12 hover:scale-110 transition-transform" />
                                      </button>
                                    )
                                  ) : (
                                    <button
                                      disabled={votingMap[poll.id]}
                                      onClick={() => handleCastVote(poll.id, idx)}
                                      className="p-2 hover:bg-blue-50 rounded-xl transition active:scale-95 disabled:opacity-50 shrink-0"
                                      title="Vote Option"
                                    >
                                      <CheckCircle2 className="w-5 h-5 text-blue-600 hover:scale-110 transition-transform" />
                                    </button>
                                  )
                                ) : (
                                  // Static display icons if closed / not authenticated as citizen / already voted
                                  (poll.pollType === 0 && (
                                    idx === 0
                                      ? <ThumbsDown className="w-5 h-5 text-rose-400 shrink-0" />
                                      : <ThumbsUp className="w-5 h-5 text-emerald-400 shrink-0" />
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
                                  <span className="inline-block text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0 shadow-sm">
                                    Your Vote
                                  </span>
                                )}
                              </div>

                              {!isOpen ? (
                                <div className="text-sm font-mono text-slate-500 space-x-3">
                                  <span>{voteCount} votes</span>
                                  <span className={`${textColorClass} font-bold`}>({percentage}%)</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Results hidden until closed</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-xs text-slate-400 font-medium pt-3 border-t border-slate-100 flex justify-between">
                      <span>Total Votes Cast: {isOpen ? "Hidden" : totalVotes}</span>
                      <span>Deadline: {new Date(poll.deadline * 1000).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center space-x-4 pt-6">
                  <button
                    disabled={activePage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-medium text-slate-500">
                    Page {activePage} of {totalPages}
                  </span>
                  <button
                    disabled={activePage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
      {activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-all duration-300"
          onClick={() => setActiveImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full h-full flex items-center justify-center">
            <img
              src={`data:${activeImage.mimeType};base64,${activeImage.data}`}
              alt="Fullscreen preview"
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl transition-transform"
            />
            <button
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur-sm transition cursor-pointer"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}