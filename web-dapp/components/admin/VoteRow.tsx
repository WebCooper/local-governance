import { ThumbsUp, ThumbsDown } from "lucide-react";

interface VoteRowProps {
  label: string;
  yes: number;
  no: number;
  yesLabel?: string;
  noLabel?: string;
}

export function VoteRow({
  label,
  yes,
  no,
  yesLabel = "Yes",
  noLabel = "No",
}: VoteRowProps) {
  const total = yes + no;
  const pct = total === 0 ? 0 : Math.round((yes / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
        <span>{label}</span>
        <span className="font-bold text-slate-700">{pct}% {yesLabel}</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1 text-green-600 font-semibold">
          <ThumbsUp className="w-3.5 h-3.5" />
          {yes} {yesLabel}
        </span>
        <span className="flex items-center gap-1 text-red-500 font-semibold">
          <ThumbsDown className="w-3.5 h-3.5" />
          {no} {noLabel}
        </span>
        <span className="ml-auto">{total} total votes</span>
      </div>
    </div>
  );
}
