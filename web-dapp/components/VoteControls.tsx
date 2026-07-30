"use client";

import { ThumbsUp, ThumbsDown } from "lucide-react";
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
            className={`group relative w-full py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 border transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
              selectedDecision === true
                ? "bg-blue-600 border-blue-600 text-white ring-4 ring-blue-500/20 scale-[1.02] shadow-md shadow-blue-600/20"
                : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 active:bg-blue-600 active:text-white active:scale-[0.98]"
            }`}
          >
            <ThumbsUp className={`h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-125 group-hover:-rotate-12 shrink-0 ${
              selectedDecision === true ? "scale-110 -rotate-12" : ""
            }`} />
            <span className="truncate">{copy.positiveLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => onVote(false)}
            disabled={isSubmitting}
            className={`group relative w-full py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 border transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
              selectedDecision === false
                ? "bg-red-600 border-red-600 text-white ring-4 ring-red-500/20 scale-[1.02] shadow-md shadow-red-600/20"
                : "border-slate-200 bg-white text-slate-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600 active:bg-red-600 active:text-white active:scale-[0.98]"
            }`}
          >
            <ThumbsDown className={`h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-125 group-hover:rotate-12 shrink-0 ${
              selectedDecision === false ? "scale-110 rotate-12" : ""
            }`} />
            <span className="truncate">{copy.negativeLabel}</span>
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