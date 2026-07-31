"use client";

import React, { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VotingConfig {
  method: number;       // VotingMethod enum index
  minVotes: number;     // only meaningful for Threshold / Hybrid-with-Threshold
  hybrid0: number;      // first hybrid sub-method
  hybrid1: number;      // second hybrid sub-method
}

const METHOD_META: Record<number, { label: string; icon: string; colorClass: string; bg: string; border: string }> = {
  0: { label: "Simple Majority (51%)", icon: "⚖️", colorClass: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200" },
  1: { label: "Super-Majority (66⅔%)", icon: "🛡️", colorClass: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  2: { label: "Threshold (Quorum Gate)", icon: "🔢", colorClass: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  3: { label: "Hybrid (AND-combined)", icon: "🔗", colorClass: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
};

const methodLabel = (id: number) => METHOD_META[id]?.label ?? "Unknown";
const methodIcon  = (id: number) => METHOD_META[id]?.icon  ?? "❓";

// ─── Props ────────────────────────────────────────────────────────────────────

interface VotingConfigPanelProps {
  reportingContract: any; // ethers.Contract (Reporting.sol)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VotingConfigPanel({ reportingContract }: VotingConfigPanelProps) {
  const [config, setConfig] = useState<VotingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchConfig = async () => {
    if (!reportingContract) return;
    setIsLoading(true);
    try {
      const [methodRaw, minVotesRaw, h0Raw, h1Raw] = await Promise.all([
        reportingContract.currentVotingMethod(),
        reportingContract.minVotesRequired(),
        reportingContract.hybridMethods(0),
        reportingContract.hybridMethods(1),
      ]);
      setConfig({
        method: Number(methodRaw),
        minVotes: Number(minVotesRaw),
        hybrid0: Number(h0Raw),
        hybrid1: Number(h1Raw),
      });
    } catch (err) {
      console.error("Failed to fetch voting config:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportingContract]);

  const meta = config ? METHOD_META[config.method] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Live Voting Config</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Current strategy applied to all voting phases on-chain.
          </p>
        </div>
        <button
          onClick={fetchConfig}
          disabled={isLoading}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <svg className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Config Display */}
      {isLoading && !config ? (
        <div className="flex items-center gap-3 py-4 text-slate-400 text-sm">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
          Loading configuration…
        </div>
      ) : config && meta ? (
        <div className="space-y-3">
          {/* Active method badge */}
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${meta.border} ${meta.bg}`}>
            <span className="text-2xl">{methodIcon(config.method)}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Active Strategy</p>
              <p className={`text-sm font-bold ${meta.colorClass}`}>{meta.label}</p>
            </div>
          </div>

          {/* Threshold detail */}
          {(config.method === 2) && (
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-xs font-semibold text-amber-800">Minimum Votes Required</span>
              <span className="text-lg font-bold text-amber-700">{config.minVotes}</span>
            </div>
          )}

          {/* Hybrid detail */}
          {config.method === 3 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sub-Strategies</p>
              <div className="flex flex-col gap-2">
                {[config.hybrid0, config.hybrid1].map((hm, idx) => {
                  const hMeta = METHOD_META[hm];
                  return (
                    <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${hMeta?.bg} ${hMeta?.border} ${hMeta?.colorClass}`}>
                      <span>{methodIcon(hm)}</span>
                      <span>{methodLabel(hm)}</span>
                    </div>
                  );
                })}
              </div>
              {(config.hybrid0 === 2 || config.hybrid1 === 2) && (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mt-1">
                  <span className="text-xs font-semibold text-amber-800">Threshold Min Votes</span>
                  <span className="text-lg font-bold text-amber-700">{config.minVotes}</span>
                </div>
              )}
            </div>
          )}

          {/* Strategy explainer */}
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">
            <StrategyExplainer config={config} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">Could not load voting configuration.</p>
      )}
    </div>
  );
}

// ─── Strategy Explainer ───────────────────────────────────────────────────────

function StrategyExplainer({ config }: { config: VotingConfig }) {
  switch (config.method) {
    case 0:
      return <>A motion passes if the number of upvotes exceeds downvotes. No participation floor is enforced.</>;
    case 1:
      return <>At least two-thirds of all cast votes must support the motion. Zero-vote outcomes always fail.</>;
    case 2:
      return <>Requires at least <strong>{config.minVotes}</strong> total votes before the result counts. Below that, quorum fails and the validation phase allows a revote (up to 3 cycles).</>;
    case 3:
      return <>
        Both <em>{methodLabel(config.hybrid0)}</em> AND <em>{methodLabel(config.hybrid1)}</em> must independently pass.
        If either quorum fails, the combined outcome is a quorum failure.
        {(config.hybrid0 === 2 || config.hybrid1 === 2) && <> Minimum quorum threshold: <strong>{config.minVotes}</strong> votes.</>}
      </>;
    default:
      return <>Unknown voting strategy.</>;
  }
}
