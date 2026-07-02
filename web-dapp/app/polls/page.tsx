"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { getPollingContract } from "@/lib/contracts/polling";
import { ethers } from "ethers";
import axios from "axios";
import Link from "next/link";

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

  const fetchActiveSlate = async () => {
    if (!provider) return;
    try {
      setLoading(true);
      const contract = getPollingContract(provider);
      const chainCount = await contract.pollCount();
      const loadedPolls: PollStructure[] = [];

      for (let i = 1; i <= Number(chainCount); i++) {
        const chainPoll = await contract.polls(i);

        let metaTitle = "Unknown Poll";
        let metaDesc = "Could not fetch metadata details from the IPFS gateway.";
        let metaOptions: string[] = ["False", "True"];
        let metaImages = [];

        try {
          // Fetch the structured envelope from the IPFS backend service via local proxy
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
      setPolls(loadedPolls.reverse()); // Newest polls first
    } catch (err) {
      console.error("Failed loading ballot indices natively:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (provider) fetchActiveSlate();
  }, [provider]);

  const handleCastVote = async (pollId: number, optionIndex: number) => {
    if (!wallet) {
      alert("Please log in with your Citizen credentials first.");
      return;
    }
    if (availableTicketsCount === 0) {
      alert("You have run out of ZKP action tickets in your session! Please request more.");
      return;
    }

    setVotingMap(prev => ({ ...prev, [pollId]: true }));
    try {
      // Pop the first ticket from the current available batch
      const activeTicket = consumeTicket();
      if (!activeTicket) throw new Error("Ticket acquisition error");

      // Generate secure signer wallet for the citizen
      const ethersWallet = new ethers.Wallet(wallet.privateKey);
      const timestamp = Date.now();

      // 1. Generate challenge for CitizenAuthGuard validation
      const authChallenge = `get-pseudonym:${wallet.publicKey}:${timestamp}`;
      const authSignature = await ethersWallet.signMessage(authChallenge);

      // 2. Generate citizen's signature over the vote payload itself
      const voteMessageHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "string"],
        [pollId, optionIndex, activeTicket.ticketId]
      );
      const voteSignature = await ethersWallet.signMessage(ethers.getBytes(voteMessageHash));

      // Post secure payload to NestJS backend relayer (port 3001)
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
        alert("Your anonymous ballot option has been successfully recorded on-chain!");
        await fetchActiveSlate(); // Reload the results
      }
    } catch (error: any) {
      console.error(error);
      alert(`Ballot rejected: ${error.response?.data?.message || error.message}`);
    } finally {
      setVotingMap(prev => ({ ...prev, [pollId]: false }));
    }
  };

  const handleClosePoll = async (pollId: number) => {
    if (!provider) {
      alert("Web3 Provider not found. Please connect your wallet.");
      return;
    }
    try {
      const signer = await provider.getSigner();
      const contract = getPollingContract(signer);
      const tx = await contract.finalizePoll(pollId);
      alert("Finalization transaction submitted. Waiting for confirmation...");
      await tx.wait();
      alert("Poll successfully finalized on-chain!");
      await fetchActiveSlate();
    } catch (err: any) {
      console.error(err);
      alert(`Deactivation failure: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xl animate-pulse">Resolving IPFS Envelopes & Fetching On-Chain State...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header section with contextual controls */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-green-500">Official Local Polls</h1>
            <p className="text-sm text-gray-400 mt-1">Anonymized voting parameters guarded by ZK action tickets.</p>
          </div>
          <div className="flex items-center space-x-4">
            {isAuthority && (
              <Link href="/polls/create" className="bg-green-600 hover:bg-green-500 text-black font-bold px-4 py-2 rounded-lg transition text-sm">
                + Create New Poll
              </Link>
            )}
            {wallet && (
              <div className="bg-gray-950 border border-gray-800 px-4 py-2 rounded-lg text-right">
                <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">ZK Tickets Remaining</span>
                <span className="text-lg font-mono text-green-400">{availableTicketsCount} Available</span>
              </div>
            )}
          </div>
        </div>

        {polls.length === 0 ? (
          <p className="text-center text-gray-500 py-12">No active polling metrics currently recorded on-chain.</p>
        ) : (
          <div className="grid gap-8">
            {polls.map((poll) => {
              const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
              const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
              const isOpen = poll.isActive && !isExpired;

              return (
                <div key={poll.id} className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-4 shadow-xl">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <span className="text-xs bg-gray-900 border border-gray-800 px-2.5 py-1 rounded text-gray-400 font-bold">
                        Poll #{poll.id} — {poll.pollType === 0 ? "True / False Split" : "Multi-Choice Selection"}
                      </span>
                      <h2 className="text-2xl font-bold text-white">{poll.title}</h2>
                    </div>
                    <div className="flex items-center space-x-3">
                      {isAuthority && poll.isActive && isExpired && (
                        <button onClick={() => handleClosePoll(poll.id)} className="bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1.5 rounded transition text-xs">
                          Finalize Poll
                        </button>
                      )}
                      <span className={`px-2.5 py-1 text-xs font-bold rounded uppercase ${isOpen ? "bg-green-950 text-green-400 border border-green-800" : "bg-red-950 text-red-400 border border-red-800"}`}>
                        {isOpen ? "Open for Voting" : "Closed / Finalized"}
                      </span>
                    </div>
                  </div>

                  <p className="text-gray-300 text-sm leading-relaxed">{poll.description}</p>

                  {/* Render Images if nested inside the metadata envelope */}
                  {poll.images && poll.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {poll.images.map((img, index) => (
                        <img
                          key={index}
                          src={`data:${img.mimeType};base64,${img.data}`}
                          alt={img.originalName}
                          className="w-24 h-24 object-cover border border-gray-800 rounded-lg hover:scale-105 transition-all duration-200"
                        />
                      ))}
                    </div>
                  )}

                  {/* Options & Progress Visualization Block */}
                  <div className="space-y-3 pt-2">
                    {poll.options.map((option, idx) => {
                      const voteCount = poll.results?.[idx] || 0;
                      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

                      return (
                        <div key={idx} className="relative flex flex-col justify-center bg-gray-900 border border-gray-800 rounded-lg p-4 overflow-hidden">
                          {/* Animated Progress Bar background tracking metrics — only shown if poll is closed */}
                          {!isOpen && (
                            <div className="absolute top-0 left-0 bottom-0 bg-green-500/10 transition-all duration-700 ease-out" style={{ width: `${percentage}%` }} />
                          )}

                          <div className="relative z-10 flex justify-between items-center w-full">
                            <div className="flex items-center space-x-3">
                              {isOpen && wallet && (
                                <button disabled={votingMap[poll.id]} onClick={() => handleCastVote(poll.id, idx)}
                                  className="text-xs bg-green-600 hover:bg-green-500 text-black font-extrabold px-3 py-1.5 rounded transition disabled:opacity-50">
                                  Vote
                                </button>
                              )}
                              <span className="font-semibold text-sm">{option}</span>
                            </div>
                            
                            {!isOpen ? (
                              <div className="text-sm font-mono text-gray-400 space-x-3">
                                <span>{voteCount} votes</span>
                                <span className="text-green-400 font-bold">({percentage}%)</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500 italic">Results hidden until closed</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-gray-500 font-medium pt-3 border-t border-gray-900 flex justify-between">
                    <span>Aggregate Verified Ballots: {isOpen ? "Hidden" : totalVotes}</span>
                    <span>Closing Window: {new Date(poll.deadline * 1000).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}