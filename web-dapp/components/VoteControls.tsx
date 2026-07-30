"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { VOTE_PHASE_OPTIONS, getVoteDecisionCopy, type VotePhase } from "@/lib/vote";

export interface VoteControlsProps {
  phase: VotePhase;
  selectedDecision: boolean | null;
  /** Optional — when omitted the phase selector is hidden (phase is auto-detected from status) */
  onPhaseChange?: (phase: VotePhase) => void;
  onVote: (decision: boolean) => void;
  isSubmitting: boolean;
  availableTicketsCount: number;
  className?: string;
}

export function VoteControls({
  phase,
  selectedDecision,
  onPhaseChange,
  onVote,
  isSubmitting,
  availableTicketsCount,
  className = "",
}: VoteControlsProps) {
  const copy = getVoteDecisionCopy(phase);

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Democratic Voting</h3>
          <p className="text-xs text-slate-500 mt-1">Choose the phase before submitting your vote.</p>
        </div>

        <div className="text-right text-xs text-slate-500">
          <p className="font-semibold text-slate-700">
            {availableTicketsCount} ticket{availableTicketsCount === 1 ? "" : "s"} left
          </p>
          <p>Anonymous vote sessions</p>
        </div>
      </div>

      {onPhaseChange && (
        <div className="grid grid-cols-1 gap-2 mb-4">
          {VOTE_PHASE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPhaseChange(option.value)}
              className={`text-left rounded-xl border px-3 py-3 transition-colors ${
                phase === option.value
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-semibold ${
                    phase === option.value ? "text-blue-700" : "text-slate-800"
                  }`}
                >
                  {option.label}
                </span>
                {phase === option.value ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                    Active
                  </span>
                ) : null}
              </div>
              <p
                className={`text-xs mt-1 ${
                  phase === option.value ? "text-blue-700/80" : "text-slate-500"
                }`}
              >
                {option.description}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 font-medium">Current phase</span>
          <span className="text-sm font-bold text-blue-600">{phase}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onVote(true)}
            disabled={isSubmitting}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${
              selectedDecision === true
                ? "bg-blue-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {copy.positiveLabel}
          </button>

          <button
            type="button"
            onClick={() => onVote(false)}
            disabled={isSubmitting}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              selectedDecision === false
                ? "border-slate-400 bg-slate-100 text-slate-900"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <XCircle className="h-4 w-4" />
            {copy.negativeLabel}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-600 space-y-1.5">
        <p>
          <span className="font-semibold text-blue-700">✓ {copy.positiveLabel}:</span> {copy.positiveHint}
        </p>
        <p>
          <span className="font-semibold text-slate-700">✗ {copy.negativeLabel}:</span> {copy.negativeHint}
        </p>
      </div>
    </div>
  );
}