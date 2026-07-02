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
  const [votingMap, setVotingMap] = useState<Record<number, boolean>>({});

  // Navigation states
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const pollsPerPage = 5;

  const fetchActiveSlate = async () => {
    if (!provider) return;
    try {
      setLoading(true);
      const contract = getPollingContract(provider);
      const chainCount = Number(await contract.pollCount());

      const loadedPolls: PollStructure[] = [];

      if (chainCount > 0) {
        // Fetch all polls newest first
        for (let i = chainCount; i >= 1; i--) {
          const chainPoll = await contract.polls(i);

          let metaTitle = "Opinion Poll";
          let metaDesc = "Retrieving metadata from decentralized storage...";
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
            console.error(`Failed to resolve IPFS node envelope for index: ${i}`, e);
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
      console.error("Failed loading ballot indices natively:", err);
      toast.error("Unable to fetch polls from the blockchain network.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (provider) fetchActiveSlate();
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
    const loadingToast = toast.loading("Verifying cryptographies and casting ballot...");
    
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
        toast.success("Your anonymous ballot has been recorded on-chain!", { id: loadingToast });
        await fetchActiveSlate();
      }
    } catch (error: any) {
      console.error(error);
      const errMsg = error.response?.data?.message || error.message || "Relayer communication failure.";
      toast.error(`Ballot rejected: ${errMsg}`, { id: loadingToast });
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

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Responsive Header Section */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-600">Opinion Polling</h1>
            <p className="text-sm text-slate-500 mt-1">Cast fully anonymous votes secured by zero-knowledge ticket credentials.</p>
          </div>
          <div className="flex items-center gap-4 self-start md:self-auto">
            {isAuthority && !wallet && (
              <Link href="/polls/create" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm shadow-sm">
                + Create New Poll
              </Link>
            )}
            {wallet && (
              <div className="bg-sky-50 border border-sky-100 px-4 py-2 rounded-xl text-right shadow-sm">
                <span className="block text-[10px] text-sky-700 font-semibold uppercase tracking-wider">ZK Action Tickets</span>
                <span className="text-lg font-mono font-bold text-sky-800">{availableTicketsCount} Available</span>
              </div>
            )}
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex space-x-2 bg-slate-100 p-1.5 rounded-xl self-start max-w-xs shadow-inner">
          <button
            onClick={() => { setFilter("all"); setCurrentPage(1); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              filter === "all"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            All Polls
          </button>
          <button
            onClick={() => { setFilter("open"); setCurrentPage(1); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              filter === "open"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Open
          </button>
          <button
            onClick={() => { setFilter("closed"); setCurrentPage(1); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              filter === "closed"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Closed
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
                <div key={poll.id} className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div className="space-y-1">
                      <span className="inline-block text-[10px] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-slate-500 font-bold uppercase tracking-wider">
                        Poll #{poll.id} — {poll.pollType === 0 ? "True/False" : "Multi-Choice Selection"}
                      </span>
                      <h2 className="text-2xl font-bold tracking-tight mt-1 text-slate-800">{poll.title}</h2>
                    </div>
                    <div className="flex items-center gap-3 self-start sm:self-auto">
                      {isAuthority && !wallet && poll.isActive && isExpired && (
                        <button onClick={() => handleClosePoll(poll.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition text-xs shadow-sm">
                          Close Poll
                        </button>
                      )}
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg uppercase border ${
                        isOpen 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {isOpen ? "Open" : "Closed"}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-600 text-sm leading-relaxed">{poll.description}</p>

                  {/* Render Images if nested inside the metadata envelope */}
                  {poll.images && poll.images.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {poll.images.map((img, index) => (
                        <img
                          key={index}
                          src={`data:${img.mimeType};base64,${img.data}`}
                          alt={img.originalName}
                          className="w-24 h-24 object-cover border border-slate-200 rounded-xl hover:scale-105 transition-all duration-200 shadow-sm"
                        />
                      ))}
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

                      return (
                        <div key={idx} className="relative flex flex-col justify-center bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-hidden">
                          {/* Animated Progress Bar background tracking metrics — only shown if poll is closed */}
                          {!isOpen && (
                            <div className={`absolute top-0 left-0 bottom-0 ${barColorClass} transition-all duration-700 ease-out`} style={{ width: `${percentage}%` }} />
                          )}

                          <div className="relative z-10 flex justify-between items-center w-full">
                            <div className="flex items-center gap-3">
                              {isOpen && wallet ? (
                                // Clickable icon buttons for active citizen voting
                                poll.pollType === 0 ? (
                                  idx === 0 ? (
                                    <button 
                                      disabled={votingMap[poll.id]} 
                                      onClick={() => handleCastVote(poll.id, idx)}
                                      className="p-2 hover:bg-rose-50 rounded-xl transition active:scale-95 disabled:opacity-50 shrink-0"
                                      title="Vote No"
                                    >
                                      <ThumbsDown className="w-5 h-5 text-rose-500 hover:-rotate-12 hover:scale-110 transition-transform" />
                                    </button>
                                  ) : (
                                    <button 
                                      disabled={votingMap[poll.id]} 
                                      onClick={() => handleCastVote(poll.id, idx)}
                                      className="p-2 hover:bg-emerald-50 rounded-xl transition active:scale-95 disabled:opacity-50 shrink-0"
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
                                // Static display icons if closed / not authenticated as citizen
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
                    <span>Total Ballots Cast: {isOpen ? "Hidden" : totalVotes}</span>
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
    </main>
  );
}