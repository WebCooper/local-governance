"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import { getPollingContract } from "@/lib/contracts/polling";
import { ethers } from "ethers";
import axios from "axios";
import Link from "next/link";
import toast from "react-hot-toast";
import { useCitizen } from "@/context/CitizenContext";

interface PollStructure {
  id: number;
  title: string;
  description: string;
  options: string[];
  pollType: number;
  deadline: number;
  isActive: boolean;
  results?: number[];
}

export default function AuthorityAdminPage() {
  const { account, isAuthority, isConnecting, provider, reportingContract, connectWallet } = useAdmin();
  const { wallet } = useCitizen();
  const [reports, setReports] = useState<any[]>([]);
  const [polls, setPolls] = useState<PollStructure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"reports" | "polls">("reports");
  const [finalizingMap, setFinalizingMap] = useState<Record<number, boolean>>({});

  const fetchReports = async () => {
    if (!reportingContract) return;
    setIsLoading(true);
    try {
      // Fetch latest 20 reports
      const [page] = await reportingContract.getAllReports(0, 20);
      setReports(page);
    } catch (error) {
      console.error("Error fetching reports", error);
      toast.error("Error fetching reports from blockchain");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPolls = async () => {
    if (!provider) return;
    setIsLoading(true);
    try {
      const contract = getPollingContract(provider);
      const chainCount = Number(await contract.pollCount());
      const loadedPolls: PollStructure[] = [];

      if (chainCount > 0) {
        for (let i = chainCount; i >= 1; i--) {
          const chainPoll = await contract.polls(i);
          let metaTitle = `Opinion Poll #${i}`;
          let metaDesc = "Loading metadata...";
          let metaOptions: string[] = ["False", "True"];

          try {
            const ipfsRes = await axios.get(`/api/ipfs/poll/${chainPoll.ipfsMetadataCid}`);
            if (ipfsRes.data) {
              metaTitle = ipfsRes.data.title;
              metaDesc = ipfsRes.data.description;
              metaOptions = ipfsRes.data.options;
            }
          } catch (e) {
            console.error(`Failed to resolve IPFS metadata for poll ${i}`, e);
          }

          const optionCount = Number(chainPoll.pollType) === 0 ? 2 : metaOptions.length;
          const tally = await contract.getPollResults(i, optionCount);

          loadedPolls.push({
            id: i,
            title: metaTitle,
            description: metaDesc,
            options: metaOptions,
            pollType: Number(chainPoll.pollType),
            deadline: Number(chainPoll.deadline),
            isActive: chainPoll.isActive,
            results: tally.map((v: any) => Number(v)),
          });
        }
      }
      setPolls(loadedPolls);
    } catch (error) {
      console.error("Error fetching polls", error);
      toast.error("Error fetching opinion polls from blockchain");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthority) {
      if (activeTab === "reports" && reportingContract) {
        fetchReports();
      } else if (activeTab === "polls" && provider) {
        fetchPolls();
      }
    }
  }, [isAuthority, activeTab, reportingContract, provider]);

  const handleResolve = async (reportId: number) => {
    // Placeholder for resolving a report
    alert("Resolving functionality will be implemented soon!");
  };

  const handleFinalizePoll = async (pollId: number) => {
    if (!provider) return;
    setFinalizingMap(prev => ({ ...prev, [pollId]: true }));
    const loadToast = toast.loading("Finalizing and closing poll on-chain...");
    try {
      const signer = await provider.getSigner();
      const contract = getPollingContract(signer);
      const tx = await contract.finalizePoll(pollId);
      await tx.wait();
      toast.success("Poll successfully finalized!", { id: loadToast });
      fetchPolls();
    } catch (error: any) {
      console.error(error);
      toast.error(`Finalization failed: ${error.message}`, { id: loadToast });
    } finally {
      setFinalizingMap(prev => ({ ...prev, [pollId]: false }));
    }
  };

  // If a citizen session is active, block access to authority portal
  if (wallet) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">Please log out of your Citizen session to access the Authority portal.</p>
          <Link href="/profile" className="inline-block w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors text-center">
            Go to Profile (Sign Out)
          </Link>
        </div>
      </div>
    );
  }

  // If wallet is not connected
  if (!account) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Authority Portal</h1>
          <p className="text-slate-500 mb-8">Connect your wallet to access the city administration dashboard and manage civic reports & polls.</p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-md transition-all flex justify-center items-center gap-2"
          >
            {isConnecting ? "Connecting..." : "Connect MetaMask"}
          </button>
        </div>
      </div>
    );
  }

  // If connected but NOT an authority
  if (!isAuthority) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6 font-mono text-sm break-all bg-slate-50 p-3 rounded">{account}</p>
          <p className="text-slate-500 mb-8">This wallet address is not registered as an Authority on the blockchain.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Authority Dashboard</h1>
            <p className="text-sm text-slate-500">Manage Civic Reports & Polls</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 py-2 px-4 rounded-full border border-slate-200">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-mono text-slate-700">
            Authority: {account.slice(0, 6)}...{account.slice(-4)}
          </span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 md:p-8">
        
        {/* Portal Tabs */}
        <div className="flex border-b border-slate-200 mb-8 gap-6">
          <button
            onClick={() => setActiveTab("reports")}
            className={`pb-4 text-base font-bold transition-all relative ${
              activeTab === "reports" ? "text-green-600 border-b-2 border-green-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Civic Reports ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab("polls")}
            className={`pb-4 text-base font-bold transition-all relative ${
              activeTab === "polls" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Opinion Polls ({polls.length})
          </button>
        </div>

        {activeTab === "reports" ? (
          <>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Active Civic Reports</h2>
                <p className="text-slate-500 mt-1">Review and manage issues reported by citizens.</p>
              </div>
              <button 
                onClick={fetchReports}
                className="text-green-600 hover:text-green-700 font-medium text-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh List
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  Loading reports...
                </div>
              ) : reports.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  No reports found in the system.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                        <th className="p-4 font-medium">ID</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium">Report Hash</th>
                        <th className="p-4 font-medium">Created</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-mono text-slate-900">#{Number(report.id)}</td>
                          <td className="p-4">
                            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                              Status: {Number(report.status)}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-sm text-slate-500 truncate max-w-[200px]">
                            {report.reportHash}
                          </td>
                          <td className="p-4 text-sm text-slate-500">
                            {new Date(Number(report.createdAt) * 1000).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => handleResolve(Number(report.id))}
                              className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
                            >
                              Resolve Issue
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Decentralized Opinion Polls</h2>
                <p className="text-slate-500 mt-1">Monitor, finalize, and publish public policy votes.</p>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/polls/create" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm shadow-sm flex items-center gap-1">
                  + Create Poll
                </Link>
                <button 
                  onClick={fetchPolls}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Polls
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  Syncing poll ledger...
                </div>
              ) : polls.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  No opinion polls found in the system.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                        <th className="p-4 font-medium">ID</th>
                        <th className="p-4 font-medium">Title</th>
                        <th className="p-4 font-medium">Type</th>
                        <th className="p-4 font-medium">Results / Distribution</th>
                        <th className="p-4 font-medium">Deadline</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {polls.map((poll) => {
                        const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
                        const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
                        const isOpen = poll.isActive && !isExpired;

                        return (
                          <tr key={poll.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono text-slate-900">#{poll.id}</td>
                            <td className="p-4 font-medium text-slate-900 max-w-[200px] truncate" title={poll.title}>
                              {poll.title}
                            </td>
                            <td className="p-4 text-sm text-slate-500">
                              {poll.pollType === 0 ? "Yes / No" : "Multi-Choice"}
                            </td>
                            <td className="p-4 min-w-[200px]">
                              {!isOpen ? (
                                <div className="space-y-1.5 w-full">
                                  <div className="flex justify-between text-xs text-slate-600 font-semibold">
                                    <span>Total: {totalVotes} votes</span>
                                  </div>
                                  <div className="flex gap-1 w-full max-w-[180px]">
                                    {poll.options.map((opt, oIdx) => {
                                      const count = poll.results?.[oIdx] || 0;
                                      const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                                      return (
                                        <div 
                                          key={oIdx} 
                                          style={{ width: `${Math.max(8, pct)}%` }} 
                                          title={`${opt}: ${count} votes (${Math.round(pct)}%)`}
                                          className={`h-2.5 rounded-full ${
                                            poll.pollType === 0 
                                              ? oIdx === 0 ? "bg-rose-500" : "bg-emerald-500"
                                              : oIdx % 4 === 0 ? "bg-blue-500" : oIdx % 4 === 1 ? "bg-indigo-500" : oIdx % 4 === 2 ? "bg-sky-500" : "bg-violet-500"
                                          }`}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Results hidden until closed</span>
                              )}
                            </td>
                            <td className="p-4 text-xs text-slate-500">
                              {new Date(poll.deadline * 1000).toLocaleString()}
                            </td>
                            <td className="p-4">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                isOpen 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}>
                                {isOpen ? "Active" : "Closed"}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              {poll.isActive && isExpired ? (
                                <button 
                                  disabled={finalizingMap[poll.id]}
                                  onClick={() => handleFinalizePoll(poll.id)}
                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
                                >
                                  {finalizingMap[poll.id] ? "Finalizing..." : "Finalize Poll"}
                                </button>
                              ) : poll.isActive ? (
                                <span className="text-xs text-slate-400 italic font-medium">Running...</span>
                              ) : (
                                <span className="text-xs text-green-600 font-bold flex items-center justify-end gap-1">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Completed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
