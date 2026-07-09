"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import axios from "axios";
import toast from "react-hot-toast";

export default function SuperAdminPage() {
  const { 
    account, 
    isSuperAdmin, 
    isConnecting, 
    contract, 
    connectWallet,
    superAdminsList,
    authoritiesList,
    fetchLists
  } = useAdmin();
  
  const [targetAddress, setTargetAddress] = useState("");
  const [actionType, setActionType] = useState("0");
  const [durationInDays, setDurationInDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"proposals" | "members">("proposals");
  const [isFunding, setIsFunding] = useState(false);

  const handleTopUp = async () => {
    setIsFunding(true);
    const loadToast = toast.loading("Scanning wallet balances & topping up...");
    try {
      const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || "https://relayer.internalbuildtools.online";
      const response = await axios.post(`${relayerUrl}/funding/scan`);
      const { funded, skipped, errors } = response.data.data;

      const fundedCount = funded.length;
      const skippedCount = skipped.length;
      const errorCount = errors.length;

      let msg = `Scan complete. Topped up: ${fundedCount}, Skipped: ${skippedCount}`;
      if (errorCount > 0) {
        msg += `, Errors: ${errorCount}`;
      }

      if (fundedCount > 0) {
        toast.success(msg, { id: loadToast });
      } else {
        toast.success(`${msg} (All wallets have sufficient balance)`, { id: loadToast });
      }
    } catch (error: any) {
      console.error("Failed to trigger top-up scan:", error);
      toast.error(error.response?.data?.message || "Failed to trigger top-up scan.", { id: loadToast });
    } finally {
      setIsFunding(false);
    }
  };

  useEffect(() => {
    if (contract && isSuperAdmin) {
      fetchProposals();
    }
  }, [contract, isSuperAdmin]);

  const fetchProposals = async () => {
    if (!contract) return;
    try {
      const count = await contract.proposalCount();
      const loadedProposals = [];
      for (let i = Number(count); i > 0; i--) {
        const p = await contract.proposals(i);
        loadedProposals.push({
          id: i,
          target: p.target,
          actionType: Number(p.actionType),
          yesVotes: Number(p.yesVotes),
          noVotes: Number(p.noVotes),
          deadline: Number(p.deadline),
          executed: p.executed,
        });
      }
      setProposals(loadedProposals);
      
      // Also refresh lists when proposals load
      await fetchLists();
    } catch (error) {
      console.error("Error fetching proposals", error);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    
    setIsSubmitting(true);
    try {
      const safeAddress = targetAddress.trim().toLowerCase();
      const tx = await contract.submitProposal(safeAddress, Number(actionType), durationInDays);
      await tx.wait();
      alert("Proposal submitted successfully!");
      setTargetAddress("");
      fetchProposals();
    } catch (error: any) {
      console.error(error);
      alert("Failed to submit proposal. See console.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (proposalId: number, support: boolean) => {
    if (!contract) return;
    try {
      const tx = await contract.vote(proposalId, support);
      await tx.wait();
      alert(`Voted ${support ? 'Yes' : 'No'} successfully!`);
      fetchProposals();
    } catch (error: any) {
      console.error(error);
      alert("Failed to cast vote. See console for details.");
    }
  };

  const getActionName = (type: number) => {
    switch(type) {
      case 0: return "Add Super Admin";
      case 1: return "Remove Super Admin";
      case 2: return "Add Authority";
      case 3: return "Remove Authority";
      default: return "Unknown";
    }
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <h1 className="text-3xl font-bold mb-4 text-slate-800">Super Admin Portal</h1>
        <p className="text-slate-600 mb-8 text-center max-w-md">
          Connect your MetaMask wallet to access the decentralized governance dashboard.
        </p>
        <button 
          onClick={connectWallet}
          disabled={isConnecting}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md transition-colors disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect MetaMask"}
        </button>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl border border-red-200 text-center max-w-md">
          <svg className="w-12 h-12 mx-auto mb-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>Your connected address ({account.substring(0, 6)}...{account.substring(account.length - 4)}) is not registered as a Super Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Super Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage system authorities and governance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTopUp}
            disabled={isFunding}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 shadow-md hover:shadow-lg"
          >
            {isFunding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            {isFunding ? "Scanning..." : "Top-Up Wallets"}
          </button>
          <div className="bg-white border border-slate-200 px-4 py-2 rounded-full text-sm font-mono text-slate-600 shadow-sm">
            🟢 Connected: {account.substring(0, 6)}...{account.substring(account.length - 4)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Submit Proposal Form */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Create Proposal</h2>
            <form onSubmit={handleSubmitProposal}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Wallet Address</label>
                <input 
                  type="text" 
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  placeholder="0x..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">Action Type</label>
                <select 
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="0">Add Super Admin</option>
                  <option value="1">Remove Super Admin</option>
                  <option value="2">Add Authority</option>
                  <option value="3">Remove Authority</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">Validity Period (Days)</label>
                <input 
                  type="number" 
                  min="1"
                  max="30"
                  value={durationInDays}
                  onChange={(e) => setDurationInDays(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit Proposal"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Tabs Container */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            
            {/* Tab Header */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <button 
                onClick={() => setActiveTab("proposals")}
                className={`flex-1 py-4 text-center font-semibold text-sm transition-colors ${activeTab === "proposals" ? "border-b-2 border-blue-600 text-blue-600 bg-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
              >
                Recent Proposals
              </button>
              <button 
                onClick={() => setActiveTab("members")}
                className={`flex-1 py-4 text-center font-semibold text-sm transition-colors ${activeTab === "members" ? "border-b-2 border-blue-600 text-blue-600 bg-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
              >
                Governance Members
              </button>
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === "proposals" && (
                <>
                  <div className="p-4 border-b border-slate-100 flex justify-end bg-white">
                    <button onClick={fetchProposals} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </button>
                  </div>
                  {proposals.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                      No proposals found.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-200">
                {proposals.map((prop) => {
                  const isExpired = Date.now() > prop.deadline * 1000;
                  const timeRemaining = Math.max(0, prop.deadline * 1000 - Date.now());
                  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
                  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  
                  return (
                  <li key={prop.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                      <div className="w-full lg:w-1/2">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-1 rounded">#{prop.id}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded ${prop.executed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {prop.executed ? 'Executed' : 'Pending'}
                          </span>
                          {!prop.executed && (
                            <span className={`text-xs font-bold px-2 py-1 rounded ${isExpired ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isExpired ? 'Expired' : `${daysRemaining}d ${hoursRemaining}h remaining`}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-900">{getActionName(prop.actionType)}</h3>
                        <p className="text-sm text-slate-500 font-mono mt-1 break-all">Target: {prop.target}</p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-center gap-6 w-full lg:w-auto">
                        <div className="flex gap-6 w-full justify-between sm:justify-start">
                          <div className="text-center bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">Yes Votes</div>
                            <div className="text-2xl font-bold text-green-600">{prop.yesVotes}</div>
                          </div>
                          <div className="text-center bg-red-50 px-4 py-2 rounded-lg border border-red-100">
                            <div className="text-xs font-semibold text-red-700 uppercase tracking-wide">No Votes</div>
                            <div className="text-2xl font-bold text-red-600">{prop.noVotes}</div>
                          </div>
                        </div>
                        
                        {!prop.executed && !isExpired && (
                          <div className="flex flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            <button 
                              onClick={() => handleVote(prop.id, true)}
                              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                            >
                              Vote Yes
                            </button>
                            <button 
                              onClick={() => handleVote(prop.id, false)}
                              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                            >
                              Vote No
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )})}
              </ul>
                  )}
                </>
              )}

              {activeTab === "members" && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Super Admins List */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Super Admins
                    </h3>
                    {superAdminsList.length === 0 ? (
                      <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100">No super admins found.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {superAdminsList.map((admin, idx) => (
                          <div key={`sa-${idx}`} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0 border border-blue-100">
                              {idx + 1}
                            </div>
                            <p className="font-mono text-sm text-slate-700 truncate" title={admin}>{admin}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Authorities List */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Authorities
                    </h3>
                    {authoritiesList.length === 0 ? (
                      <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100">No authorities configured.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {authoritiesList.map((auth, idx) => (
                          <div key={`auth-${idx}`} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 font-bold text-sm shrink-0 border border-green-100">
                              A
                            </div>
                            <p className="font-mono text-sm text-slate-700 truncate" title={auth}>{auth}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
