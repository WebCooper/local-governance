"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  deadline: number; // timestamp in milliseconds
  compact?: boolean;
}

export default function CountdownTimer({ deadline, compact = false }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const calculateTimeLeft = () => {
      const difference = deadline - Date.now();
      setTimeLeft(difference > 0 ? difference : 0);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  if (!mounted) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-405 font-mono text-xs">
        <Clock className="h-3.5 w-3.5" />
        --:--:--
      </span>
    );
  }

  if (timeLeft === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400 font-medium text-xs">
        <Clock className="h-3.5 w-3.5 text-slate-400" />
        Voting Closed
      </span>
    );
  }

  const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
  const seconds = Math.floor((timeLeft / 1000) % 60);

  const formatted = [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-600 font-mono text-xs font-bold">
        {formatted}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-blue-600 font-mono text-sm font-bold bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
      <Clock className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
      {formatted}
    </span>
  );
}
