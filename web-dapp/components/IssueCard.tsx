"use client";

import Link from "next/link";
import { ThumbsUp, ThumbsDown, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLocation } from "@/lib/reportHelpers";

// ── Status mapping definitions ──────────────────────────────────────────
const STATUS_LABELS: Record<number, string> = {
  0: "Pending Validation",
  1: "Community Rejected",
  2: "Open",
  3: "In Progress",
  4: "Pending Rejection Review",
  5: "Pending Verification",
  6: "Closed / Solved",
  7: "Reopened",
};

const STATUS_BADGE_VARIANT: Record<number, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  0: "warning",
  1: "destructive",
  2: "secondary",
  3: "default",
  4: "warning",
  5: "secondary",
  6: "success",
  7: "outline",
};

export interface VoteCounters {
  validationUpvotes: number;
  validationDownvotes: number;
  verificationAcceptVotes: number;
  verificationRejectVotes: number;
  rejectionUpholdVotes: number;
  rejectionAppealVotes: number;
}

export interface Issue {
  id: number;
  ipfsCid: string;
  status: number;
  createdAt: number;
  votes: VoteCounters;
  description?: string;
  category?: string;
  location?: string;
}

export function getPhaseVotes(votes: VoteCounters, status: number) {
  switch (status) {
    case 0: // PendingValidation
      return {
        agree: votes.validationUpvotes,
        disagree: votes.validationDownvotes,
        agreeLabel: "Agree",
        disagreeLabel: "Disagree",
        phaseLabel: "Validation",
      };
    case 5: // PendingVerification
      return {
        agree: votes.verificationAcceptVotes,
        disagree: votes.verificationRejectVotes,
        agreeLabel: "Accepted",
        disagreeLabel: "Rejected",
        phaseLabel: "Verification",
      };
    case 4: // PendingRejectionReview
      return {
        agree: votes.rejectionUpholdVotes,
        disagree: votes.rejectionAppealVotes,
        agreeLabel: "Upheld",
        disagreeLabel: "Appealed",
        phaseLabel: "Rejection Review",
      };
    default:
      // Inactive window — surface the most-recent phase that has data
      if (votes.verificationAcceptVotes + votes.verificationRejectVotes > 0) {
        return {
          agree: votes.verificationAcceptVotes,
          disagree: votes.verificationRejectVotes,
          agreeLabel: "Accepted",
          disagreeLabel: "Rejected",
          phaseLabel: "Verification",
        };
      }
      if (votes.rejectionUpholdVotes + votes.rejectionAppealVotes > 0) {
        return {
          agree: votes.rejectionUpholdVotes,
          disagree: votes.rejectionAppealVotes,
          agreeLabel: "Upheld",
          disagreeLabel: "Appealed",
          phaseLabel: "Rejection Review",
        };
      }
      return {
        agree: votes.validationUpvotes,
        disagree: votes.validationDownvotes,
        agreeLabel: "Agree",
        disagreeLabel: "Disagree",
        phaseLabel: "Validation",
      };
  }
}

interface IssueCardProps {
  issue: Issue;
}

export function IssueCard({ issue }: IssueCardProps) {
  const phaseVotes = getPhaseVotes(issue.votes, issue.status);
  const total = phaseVotes.agree + phaseVotes.disagree;
  const pct = total === 0 ? 0 : Math.round((phaseVotes.agree / total) * 100);
  const statusLabel = STATUS_LABELS[issue.status] ?? "Unknown";
  const badgeVariant = STATUS_BADGE_VARIANT[issue.status] ?? "outline";

  return (
    <Card className="flex flex-col hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm border border-border/80 hover:border-primary/30 group">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2 gap-2">
          <Badge variant={badgeVariant}>{statusLabel}</Badge>
          {issue.category && (
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {issue.category}
            </span>
          )}
        </div>
        <Link
          href={`/issues/${issue.id}`}
          className="text-xl font-bold leading-tight text-foreground hover:text-primary transition-colors line-clamp-2"
        >
          {issue.category ? `${issue.category} Issue` : `Report #${issue.id}`}
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4">
        <div className="space-y-3">
          {issue.description && (
            <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">
              {issue.description}
            </p>
          )}

          <div className="flex flex-col gap-1.5 mt-2 text-xs text-muted-foreground">
            {issue.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                <span>{formatLocation(issue.location)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Phase-aware vote bar + counts */}
          <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {phaseVotes.phaseLabel} votes
              </span>
              <span className="text-xs font-bold text-primary">{pct}% agree</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ThumbsUp className="h-3.5 w-3.5" />
                <span>{phaseVotes.agree} {phaseVotes.agreeLabel}</span>
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                <ThumbsDown className="h-3.5 w-3.5" />
                <span>{phaseVotes.disagree} {phaseVotes.disagreeLabel}</span>
              </span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t border-border/50 flex justify-end items-center bg-muted/10 rounded-b-xl">
        <Link href={`/issues/${issue.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-primary font-bold hover:bg-primary/10 transition-colors"
          >
            View Details
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
