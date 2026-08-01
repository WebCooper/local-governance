"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import axios from "axios";
import toast from "react-hot-toast";
import VotingMethodProposalForm from "@/components/admin/VotingMethodProposalForm";
import VotingConfigPanel from "@/components/admin/VotingConfigPanel";
import { AuthorityRosterTable } from "@/components/admin/AuthorityRosterTable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberProfile {
  address: string;
  name: string;
  position: string;
  department: string;
  isSet: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_TYPE_META: Record<
  number,
  { label: string; color: string; bg: string; icon: string; description: string }
> = {
  0: {
    label: "Add Super Admin",
    color: "text-blue-700",
    bg: "bg-blue-50",
    icon: "👑",
    description: "Adds a new wallet to the super admin multi-sig group.",
  },
  1: {
    label: "Remove Super Admin",
    color: "text-red-700",
    bg: "bg-red-50",
    icon: "🗑️",
    description: "Removes an existing wallet from the super admin group.",
  },
  2: {
    label: "Add Authority",
    color: "text-green-700",
    bg: "bg-green-50",
    icon: "✅",
    description:
      "Grants a wallet authority worker access to act on civic reports (start work, mark solved, reject).",
  },
  3: {
    label: "Remove Authority",
    color: "text-orange-700",
    bg: "bg-orange-50",
    icon: "🚫",
    description: "Revokes a wallet's authority worker access on the reporting contract.",
  },
  4: {
    label: "Set Voting Strategy",
    color: "text-violet-700",
    bg: "bg-violet-50",
    icon: "⚙️",
    description:
      "Changes the global voting method used for all report phases (validation, verification, rejection review).",
  },
};

const VOTING_METHOD_NAMES: Record<number, string> = {
  0: "Majority 51%",
  1: "Super-Majority 66⅔%",
  2: "Threshold",
  3: "Hybrid",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const {
    account,
    isSuperAdmin,
    isConnecting,
    contract,
    reportingContract,
    connectWallet,
    superAdminsList,
    authoritiesList,
    fetchLists,
  } = useAdmin();

  const [targetAddress, setTargetAddress] = useState("");
  const [actionType, setActionType] = useState("0");
  const [durationInDays, setDurationInDays] = useState<number>(7);

  // Proposal target profile details
  const [targetName, setTargetName] = useState("");
  const [targetPosition, setTargetPosition] = useState("");
  const [targetDepartment, setTargetDepartment] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [proposalFilter, setProposalFilter] = useState<"ALL" | "Active" | "Executed" | "Expired">("ALL");
  const [activeTab, setActiveTab] = useState<"proposals" | "members" | "voting">(
    "proposals"
  );
  const [isFunding, setIsFunding] = useState(false);

  // Voting window duration states
  const [votingDurationHours, setVotingDurationHours] = useState<number>(6);
  const [isUpdatingDuration, setIsUpdatingDuration] = useState(false);

  // Profile data states for existing members
  const [superAdminProfiles, setSuperAdminProfiles] = useState<MemberProfile[]>([]);
  const [authorityProfiles, setAuthorityProfiles] = useState<MemberProfile[]>([]);

  const filteredProposals = proposals.filter((p) => {
    if (proposalFilter === "ALL") return true;
    const isExpired = Date.now() > p.deadline * 1000;
    if (proposalFilter === "Executed") return p.executed;
    if (proposalFilter === "Active") return !p.executed && !isExpired;
    if (proposalFilter === "Expired") return !p.executed && isExpired;
    return true;
  });

  const handleSelectAuthorityForProposal = (
    address: string,
    name: string,
    position: string,
    department: string
  ) => {
    setTargetAddress(address);
    setTargetName(name);
    setTargetPosition(position);
    setTargetDepartment(department);
    setActionType("3"); // Remove Authority proposal by default
    setActiveTab("proposals");
    toast.success(`Selected ${name || address} for proposal!`);
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleTopUp = async () => {
    const loadToast = toast.loading("Scanning wallet balances & topping up...");
    try {
      const relayerUrl =
        process.env.NEXT_PUBLIC_RELAYER_URL ||
        "https://relayer.internalbuildtools.online";
      const response = await axios.post(`${relayerUrl}/funding/scan`);
      const { funded, skipped, errors } = response.data.data;

      const fundedCount = funded.length;
      const skippedCount = skipped.length;
      const errorCount = errors.length;

      let msg = `Scan complete. Topped up: ${fundedCount}, Skipped: ${skippedCount}`;
      if (errorCount > 0) msg += `, Errors: ${errorCount}`;

      if (fundedCount > 0) {
        toast.success(msg, { id: loadToast });
      } else {
        toast.success(`${msg} (All wallets have sufficient balance)`, {
          id: loadToast,
        });
      }
    } catch (error: any) {
      console.error("Failed to trigger top-up scan:", error);
      toast.error(
        error.response?.data?.message || "Failed to trigger top-up scan.",
        { id: loadToast }
      );
    } finally {
      setIsFunding(false);
    }
  };

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
          name: p.name,
          position: p.position,
          department: p.department,
          // Voting config payload (populated for SetVotingMethod proposals)
          newVotingMethod: Number(p.newVotingMethod),
          newMinVotes: Number(p.newMinVotes),
          newHybrid1: Number(p.newHybrid1),
          newHybrid2: Number(p.newHybrid2),
        });
      }
      setProposals(loadedProposals);

      // Also refresh lists when proposals load
      await fetchLists();
    } catch (error) {
      console.error("Error fetching proposals", error);
    }
  };

  const fetchVotingDuration = async () => {
    if (!reportingContract) return;
    try {
      const durationSec = await reportingContract.votingWindowDuration();
      setVotingDurationHours(Number(durationSec) / 3600);
    } catch (e) {
      console.error("Error fetching voting window duration:", e);
    }
  };

  const handleUpdateDuration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setIsUpdatingDuration(true);
    const loadToast = toast.loading("Updating voting window duration...");
    try {
      const durationInSeconds = Math.round(Number(votingDurationHours) * 3600);
      const tx = await contract.setVotingWindowDuration(durationInSeconds);
      await tx.wait();
      toast.success("Voting window duration updated successfully!", {
        id: loadToast,
      });
      fetchVotingDuration();
    } catch (error: any) {
      console.error("Failed to update voting window duration:", error);
      toast.error(error.message || "Failed to update duration.", {
        id: loadToast,
      });
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  const loadProfiles = async () => {
    if (!contract) return;
    try {
      const saProfs = await Promise.all(
        superAdminsList.map(async (addr) => {
          try {
            const p = await contract.getProfile(addr);
            return {
              address: addr,
              name: p.name,
              position: p.position,
              department: p.department,
              isSet: p.isSet,
            };
          } catch {
            return { address: addr, name: "", position: "", department: "", isSet: false };
          }
        })
      );
      setSuperAdminProfiles(saProfs);

      const authProfs = await Promise.all(
        authoritiesList.map(async (addr) => {
          try {
            const p = await contract.getProfile(addr);
            return {
              address: addr,
              name: p.name,
              position: p.position,
              department: p.department,
              isSet: p.isSet,
            };
          } catch {
            return { address: addr, name: "", position: "", department: "", isSet: false };
          }
        })
      );
      setAuthorityProfiles(authProfs);
    } catch (e) {
      console.error("Error loading member profiles:", e);
    }
  };

  useEffect(() => {
    if (contract && isSuperAdmin) {
      fetchProposals();
    }
  }, [contract, isSuperAdmin]);

  useEffect(() => {
    if (contract && (superAdminsList.length > 0 || authoritiesList.length > 0)) {
      loadProfiles();
    }
    if (reportingContract) {
      fetchVotingDuration();
    }
  }, [contract, reportingContract, superAdminsList, authoritiesList]);

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    const submitPromise = async () => {
      const safeAddress = targetAddress.trim().toLowerCase();
      const nameVal =
        actionType === "0" || actionType === "2" ? targetName.trim() : "";
      const posVal =
        actionType === "0" || actionType === "2" ? targetPosition.trim() : "";
      const deptVal =
        actionType === "0" || actionType === "2" ? targetDepartment.trim() : "";

      const tx = await contract.submitProposal(
        safeAddress,
        Number(actionType),
        durationInDays,
        nameVal,
        posVal,
        deptVal
      );
      await tx.wait();
    };

    setIsSubmitting(true);
    toast
      .promise(submitPromise(), {
        loading: "Submitting proposal on-chain...",
        success: "Proposal submitted successfully!",
        error: (err: any) => err.message || "Failed to submit proposal.",
      })
      .then(() => {
        setTargetAddress("");
        setTargetName("");
        setTargetPosition("");
        setTargetDepartment("");
        fetchProposals();
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleVote = async (proposalId: number, support: boolean) => {
    if (!contract) return;

    const votePromise = async () => {
      const tx = await contract.vote(proposalId, support);
      await tx.wait();
    };

    toast
      .promise(votePromise(), {
        loading: "Casting vote on-chain...",
        success: `Voted ${support ? "Yes" : "No"} successfully!`,
        error: (err: any) => err.message || "Failed to cast vote.",
      })
      .then(() => {
        fetchProposals();
      })
      .catch((error) => {
        console.error(error);
      });
  };

  // ─── Guards ──────────────────────────────────────────────────────────────────

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <h1 className="text-3xl font-bold mb-4 text-slate-800">
          Super Admin Portal
        </h1>
        <p className="text-slate-600 mb-8 text-center max-w-md">
          Connect your MetaMask wallet to access the decentralized governance
          dashboard.
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
          <svg
            className="w-12 h-12 mx-auto mb-4 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>
            Your connected address ({account.substring(0, 6)}...
            {account.substring(account.length - 4)}) is not registered as a Super
            Admin.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Super Admin Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Manage system authorities and governance
          </p>
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
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            )}
            {isFunding ? "Scanning..." : "Top-Up Wallets"}
          </button>
          <div className="bg-white border border-slate-200 px-4 py-2 rounded-full text-sm font-medium text-slate-600 shadow-sm">
            🟢 Connected
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Left Column ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Submit Proposal Form */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              Create Proposal
            </h2>
            <form onSubmit={handleSubmitProposal}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Target Wallet Address
                </label>
                <input
                  type="text"
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  placeholder="0x..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Action Type
                </label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
                >
                  <option value="0">Add Super Admin</option>
                  <option value="1">Remove Super Admin</option>
                  <option value="2">Add Authority</option>
                  <option value="3">Remove Authority</option>
                </select>
                {/* Action description */}
                <p className="text-xs text-slate-400 mt-1.5 leading-snug">
                  {ACTION_TYPE_META[Number(actionType)]?.description}
                </p>
              </div>

              {/* Conditional Profile Fields */}
              {(actionType === "0" || actionType === "2") && (
                <div className="space-y-4 mb-4 bg-slate-50 p-4 rounded-xl border border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Member Details
                  </h4>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      placeholder="e.g. Janitha Rajapakse"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Position / Job Title
                    </label>
                    <input
                      type="text"
                      value={targetPosition}
                      onChange={(e) => setTargetPosition(e.target.value)}
                      placeholder="e.g. Chief Executive Officer"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={targetDepartment}
                      onChange={(e) => setTargetDepartment(e.target.value)}
                      placeholder="e.g. Technology Department"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Validity Period (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={durationInDays}
                  onChange={(e) => setDurationInDays(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
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

          {/* System Settings Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              System Configuration
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Configure parameters directly without proposal approvals.
            </p>
            <form onSubmit={handleUpdateDuration}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Voting Window Duration (Hours)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={votingDurationHours}
                  onChange={(e) =>
                    setVotingDurationHours(Number(e.target.value))
                  }
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isUpdatingDuration}
                className="w-full bg-slate-950 hover:bg-slate-800 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {isUpdatingDuration ? "Updating..." : "Update Duration"}
              </button>
            </form>
          </div>
        </div>

        {/* ── Right Column: Tabs ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Tab Header */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              {(
                [
                  { key: "proposals", label: "Recent Proposals" },
                  { key: "voting", label: "Voting Strategy" },
                  { key: "members", label: "Governance Members" },
                ] as { key: typeof activeTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-4 text-center font-semibold text-sm transition-colors ${
                    activeTab === tab.key
                      ? "border-b-2 border-blue-600 text-blue-600 bg-white"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Proposals ──────────────────────────────────────────── */}
            {activeTab === "proposals" && (
              <>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                  {/* Proposal Status Filters */}
                  <div className="flex items-center gap-2">
                    {(["ALL", "Active", "Executed", "Expired"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setProposalFilter(filter)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                          proposalFilter === filter
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={fetchProposals}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Refresh
                  </button>
                </div>
                {filteredProposals.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    No proposals matching &quot;{proposalFilter}&quot;.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {filteredProposals.map((prop) => {
                      const isExpired = Date.now() > prop.deadline * 1000;
                      const timeRemaining = Math.max(
                        0,
                        prop.deadline * 1000 - Date.now()
                      );
                      const daysRemaining = Math.floor(
                        timeRemaining / (1000 * 60 * 60 * 24)
                      );
                      const hoursRemaining = Math.floor(
                        (timeRemaining % (1000 * 60 * 60 * 24)) /
                          (1000 * 60 * 60)
                      );
                      const meta = ACTION_TYPE_META[prop.actionType];

                      return (
                        <li
                          key={prop.id}
                          className="p-6 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                            <div className="w-full lg:w-1/2">
                              {/* Badges row */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-1 rounded">
                                  #{prop.id}
                                </span>
                                <span
                                  className={`text-xs font-bold px-2 py-1 rounded ${
                                    prop.executed
                                      ? "bg-green-100 text-green-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {prop.executed ? "Executed" : "Pending"}
                                </span>
                                {!prop.executed && (
                                  <span
                                    className={`text-xs font-bold px-2 py-1 rounded ${
                                      isExpired
                                        ? "bg-red-100 text-red-700"
                                        : "bg-blue-100 text-blue-700"
                                    }`}
                                  >
                                    {isExpired
                                      ? "Expired"
                                      : `${daysRemaining}d ${hoursRemaining}h remaining`}
                                  </span>
                                )}
                              </div>

                              {/* Action type with icon + description */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-base">{meta?.icon}</span>
                                <h3 className="font-semibold text-slate-900 leading-tight">
                                  {meta?.label ?? `Action #${prop.actionType}`}
                                </h3>
                              </div>
                              {meta?.description && (
                                <p className="text-xs text-slate-400 mb-2 leading-snug">
                                  {meta.description}
                                </p>
                              )}

                              {/* Profile detail (for Add actions) */}
                              {prop.name && (
                                <div className="mt-2 bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-xs text-slate-600">
                                  <span className="font-bold text-slate-700">
                                    Proposed Profile:
                                  </span>{" "}
                                  {prop.name} ({prop.position} &bull;{" "}
                                  {prop.department})
                                </div>
                              )}

                              {/* Voting config detail (for SetVotingMethod proposals) */}
                              {prop.actionType === 4 && (
                                <div className="mt-2 bg-violet-50 border border-violet-100 p-2.5 rounded-lg text-xs text-violet-700 space-y-0.5">
                                  <p className="font-bold text-violet-800">
                                    Proposed Voting Config:
                                  </p>
                                  <p>
                                    Strategy:{" "}
                                    <strong>
                                      {VOTING_METHOD_NAMES[prop.newVotingMethod] ??
                                        `Method ${prop.newVotingMethod}`}
                                    </strong>
                                  </p>
                                  {prop.newVotingMethod === 2 && (
                                    <p>Min Votes: <strong>{prop.newMinVotes}</strong></p>
                                  )}
                                  {prop.newVotingMethod === 3 && (
                                    <>
                                      <p>
                                        Sub-strategy 1:{" "}
                                        <strong>
                                          {VOTING_METHOD_NAMES[prop.newHybrid1]}
                                        </strong>
                                      </p>
                                      <p>
                                        Sub-strategy 2:{" "}
                                        <strong>
                                          {VOTING_METHOD_NAMES[prop.newHybrid2]}
                                        </strong>
                                      </p>
                                      {(prop.newHybrid1 === 2 || prop.newHybrid2 === 2) && (
                                        <p>Min Votes: <strong>{prop.newMinVotes}</strong></p>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}

                              <p className="text-xs text-slate-400 font-mono mt-2 break-all">
                                Target: {prop.target}
                              </p>
                            </div>

                            {/* Vote counts + buttons */}
                            <div className="flex flex-col sm:flex-row items-center gap-6 w-full lg:w-auto">
                              <div className="flex gap-6 w-full justify-between sm:justify-start">
                                <div className="text-center bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                                  <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                                    Yes Votes
                                  </div>
                                  <div className="text-2xl font-bold text-green-600">
                                    {prop.yesVotes}
                                  </div>
                                </div>
                                <div className="text-center bg-red-50 px-4 py-2 rounded-lg border border-red-100">
                                  <div className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                                    No Votes
                                  </div>
                                  <div className="text-2xl font-bold text-red-600">
                                    {prop.noVotes}
                                  </div>
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
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {/* ── Tab: Voting Strategy ─────────────────────────────────────── */}
            {activeTab === "voting" && (
              <div className="p-6 space-y-6">
                {/* Live config read-out */}
                <VotingConfigPanel reportingContract={reportingContract} />

                {/* Proposal submission form */}
                <VotingMethodProposalForm
                  contract={contract}
                  onSuccess={() => {
                    fetchProposals();
                    setActiveTab("proposals");
                  }}
                />
              </div>
            )}

            {/* ── Tab: Members ─────────────────────────────────────────────── */}
            {activeTab === "members" && (
              <div className="p-6 flex flex-col gap-8">
                {/* Super Admins List */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span>Super Admin Multisig Council</span>
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                      {superAdminProfiles.length} Member(s)
                    </span>
                  </div>
                  {superAdminProfiles.length === 0 ? (
                    <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      No super admins found.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {superAdminProfiles.map((member, idx) => (
                        <div
                          key={`sa-${idx}`}
                          className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200/80 shadow-sm hover:border-blue-300 transition-all"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0 border border-blue-100 mt-0.5">
                            {idx + 1}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            {member.isSet ? (
                              <>
                                <p className="font-bold text-slate-800 text-sm leading-snug">
                                  {member.name}
                                </p>
                                <p className="text-xs text-slate-500 font-medium">
                                  {member.position} &bull; {member.department}
                                </p>
                                <p
                                  className="font-mono text-[10px] text-slate-400 mt-0.5 break-all"
                                  title={member.address}
                                >
                                  {member.address}
                                </p>
                              </>
                            ) : (
                              <>
                                <p
                                  className="font-mono text-xs text-slate-700 truncate"
                                  title={member.address}
                                >
                                  {member.address}
                                </p>
                                <p className="text-[10px] text-slate-400 italic">
                                  No profile details set
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Municipal Authorities Roster */}
                <div>
                  <AuthorityRosterTable
                    members={authorityProfiles}
                    onSelectForProposal={handleSelectAuthorityForProposal}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
