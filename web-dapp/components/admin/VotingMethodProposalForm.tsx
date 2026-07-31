"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type VotingMethodId = 0 | 1 | 2 | 3;

interface MethodMeta {
  id: VotingMethodId;
  label: string;
  shortLabel: string;
  icon: string;
  colorClass: string;
  borderClass: string;
  bgClass: string;
  description: string;
  detail: string;
  usesMinVotes: boolean;
  usesHybrid: boolean;
}

const METHODS: MethodMeta[] = [
  {
    id: 0,
    label: "Simple Majority (51%)",
    shortLabel: "Majority 51",
    icon: "⚖️",
    colorClass: "text-sky-700",
    borderClass: "border-sky-300",
    bgClass: "bg-sky-50",
    description: "A vote passes if there are more upvotes than downvotes.",
    detail:
      "The most permissive strategy. Ties go against the motion. No minimum participation required — even a single vote can decide an outcome.",
    usesMinVotes: false,
    usesHybrid: false,
  },
  {
    id: 1,
    label: "Super-Majority (66⅔%)",
    shortLabel: "Super Majority",
    icon: "🛡️",
    colorClass: "text-violet-700",
    borderClass: "border-violet-300",
    bgClass: "bg-violet-50",
    description: "At least two-thirds of all cast votes must be in favour.",
    detail:
      "A stronger consensus requirement. Useful for high-stakes decisions where a simple majority is insufficient. Zero votes always fails.",
    usesMinVotes: false,
    usesHybrid: false,
  },
  {
    id: 2,
    label: "Threshold (Quorum Gate)",
    shortLabel: "Threshold",
    icon: "🔢",
    colorClass: "text-amber-700",
    borderClass: "border-amber-300",
    bgClass: "bg-amber-50",
    description:
      "Requires a minimum number of total votes before any outcome is valid.",
    detail:
      "If the total votes cast (upvotes + downvotes) is below the configured threshold, the vote is treated as a quorum failure and can trigger a revote cycle (validation phase only). Once quorum is met, a simple majority decides.",
    usesMinVotes: true,
    usesHybrid: false,
  },
  {
    id: 3,
    label: "Hybrid (AND-combined)",
    shortLabel: "Hybrid",
    icon: "🔗",
    colorClass: "text-emerald-700",
    borderClass: "border-emerald-300",
    bgClass: "bg-emerald-50",
    description:
      "Combines two sub-strategies — both must independently pass for the motion to succeed.",
    detail:
      "For example: pair Threshold (quorum gate) with Super-Majority (quality gate) to require both sufficient participation AND strong consensus. Note: sub-strategies cannot themselves be Hybrid.",
    usesMinVotes: false,
    usesHybrid: true,
  },
];

const SUB_METHOD_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Simple Majority (51%)" },
  { value: 1, label: "Super-Majority (66⅔%)" },
  { value: 2, label: "Threshold (Quorum Gate)" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface VotingMethodProposalFormProps {
  contract: any; // ethers.Contract (AuthorityMultiSig)
  onSuccess: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VotingMethodProposalForm({
  contract,
  onSuccess,
}: VotingMethodProposalFormProps) {
  const [selectedMethod, setSelectedMethod] = useState<VotingMethodId>(0);
  const [minVotes, setMinVotes] = useState<number>(5);
  const [hybrid1, setHybrid1] = useState<number>(2); // Threshold
  const [hybrid2, setHybrid2] = useState<number>(0); // Majority51
  const [durationInDays, setDurationInDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const meta = METHODS[selectedMethod];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;

    setIsSubmitting(true);
    const loadToast = toast.loading("Submitting voting config proposal…");

    try {
      const tx = await contract.submitVotingConfigProposal(
        durationInDays,
        selectedMethod,
        meta.usesMinVotes || (meta.usesHybrid && (hybrid1 === 2 || hybrid2 === 2))
          ? minVotes
          : 0,
        meta.usesHybrid ? hybrid1 : selectedMethod,
        meta.usesHybrid ? hybrid2 : selectedMethod
      );
      await tx.wait();
      toast.success("Voting config proposal submitted!", { id: loadToast });
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.reason || err?.message || "Failed to submit proposal.", {
        id: loadToast,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Propose Voting Strategy Change
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          This creates a multi-sig proposal. Super admins vote; it executes when
          quorum is reached.
        </p>
      </div>

      {/* Method Selector */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-700">
          Select Voting Strategy
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {METHODS.map((m) => {
            const isSelected = selectedMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMethod(m.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                  isSelected
                    ? `${m.borderClass} ${m.bgClass} shadow-sm`
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{m.icon}</span>
                  <span
                    className={`text-sm font-bold ${isSelected ? m.colorClass : "text-slate-700"}`}
                  >
                    {m.shortLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  {m.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Method Detail Banner */}
      <div
        className={`flex gap-3 p-4 rounded-xl border ${meta.borderClass} ${meta.bgClass}`}
      >
        <span className="text-2xl shrink-0 mt-0.5">{meta.icon}</span>
        <div>
          <p className={`text-sm font-bold ${meta.colorClass} mb-0.5`}>
            {meta.label}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">{meta.detail}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Threshold min votes */}
        {meta.usesMinVotes && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Minimum Votes Required (Quorum)
            </label>
            <input
              type="number"
              min={1}
              value={minVotes}
              onChange={(e) => setMinVotes(Number(e.target.value))}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-slate-800 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              The total number of votes (upvotes + downvotes) that must be cast
              before the result is considered valid.
            </p>
          </div>
        )}

        {/* Hybrid sub-methods */}
        {meta.usesHybrid && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                First Sub-Strategy
              </label>
              <select
                value={hybrid1}
                onChange={(e) => setHybrid1(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 text-sm"
              >
                {SUB_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Second Sub-Strategy
              </label>
              <select
                value={hybrid2}
                onChange={(e) => setHybrid2(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 text-sm"
              >
                {SUB_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {(hybrid1 === 2 || hybrid2 === 2) && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Minimum Votes Required (for Threshold sub-strategy)
                </label>
                <input
                  type="number"
                  min={1}
                  value={minVotes}
                  onChange={(e) => setMinVotes(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* Proposal duration */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Proposal Validity (Days)
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={durationInDays}
            onChange={(e) => setDurationInDays(Number(e.target.value))}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
          />
        </div>

        {/* Quorum notice */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            This proposal will auto-execute once{" "}
            <strong>majority quorum</strong> of super admins vote Yes. Your vote
            is cast automatically on submission.
          </span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            <>
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Submit Voting Config Proposal
            </>
          )}
        </button>
      </form>
    </div>
  );
}
