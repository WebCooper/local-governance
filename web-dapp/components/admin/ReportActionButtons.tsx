"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import {
  getAvailableActions,
  getActionMeta,
  type AuthorityAction,
  type EnrichedReport,
} from "@/lib/reportHelpers";

interface ConfirmDialogProps {
  title: string;
  message: string;
  actionLabel: string;
  color: "green" | "red" | "slate";
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  actionLabel,
  color,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const colorMap = {
    green: {
      btn: "bg-green-600 hover:bg-green-700 text-white",
      icon: "text-green-600",
      iconBg: "bg-green-100",
    },
    red: {
      btn: "bg-red-600 hover:bg-red-700 text-white",
      icon: "text-red-600",
      iconBg: "bg-red-100",
    },
    slate: {
      btn: "bg-slate-900 hover:bg-slate-800 text-white",
      icon: "text-slate-600",
      iconBg: "bg-slate-100",
    },
  };
  const c = colorMap[color];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.iconBg}`}>
              <AlertTriangle className={`w-5 h-5 ${c.icon}`} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-slate-600 leading-relaxed mb-6">{message}</p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${c.btn}`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action Button Icon Map ───────────────────────────────────────────────────
const ACTION_ICONS: Record<AuthorityAction, React.ReactNode> = {
  startWork: <Play className="w-3.5 h-3.5" />,
  markAsSolved: <CheckCircle2 className="w-3.5 h-3.5" />,
  rejectIssue: <XCircle className="w-3.5 h-3.5" />,
};

const ACTION_STYLES: Record<AuthorityAction, string> = {
  startWork:
    "bg-green-600 hover:bg-green-700 text-white border-transparent",
  markAsSolved:
    "bg-slate-900 hover:bg-slate-800 text-white border-transparent",
  rejectIssue:
    "border border-red-200 text-red-600 hover:bg-red-50 bg-white",
};

// ─── Main Component ───────────────────────────────────────────────────────────
interface ReportActionButtonsProps {
  report: EnrichedReport;
  currentAccount: string;
  reportingContract: any; // ethers.Contract with signer
  onActionSuccess: (reportId: number) => void;
  layout?: "row" | "column";
}

export function ReportActionButtons({
  report,
  currentAccount,
  reportingContract,
  onActionSuccess,
  layout = "row",
}: ReportActionButtonsProps) {
  const [pendingAction, setPendingAction] = useState<AuthorityAction | null>(null);
  const [executingAction, setExecutingAction] = useState<AuthorityAction | null>(null);

  const availableActions = getAvailableActions(
    report.status,
    report.assignedAuthority,
    currentAccount
  );

  if (availableActions.length === 0) {
    return (
      <span className="text-xs text-slate-400 italic font-medium">
        No actions available
      </span>
    );
  }

  const handleConfirm = async () => {
    if (!pendingAction || !reportingContract) return;
    const meta = getActionMeta(pendingAction);

    setExecutingAction(pendingAction);
    setPendingAction(null);

    const loadingToast = toast.loading(`Processing: ${meta.label}…`);

    try {
      let tx;
      switch (pendingAction) {
        case "startWork":
          tx = await reportingContract.startWork(report.id);
          break;
        case "markAsSolved":
          tx = await reportingContract.markAsSolved(report.id);
          break;
        case "rejectIssue":
          tx = await reportingContract.rejectIssue(report.id);
          break;
      }

      await tx.wait();

      toast.success(`Report #${report.id}: ${meta.label} confirmed on-chain!`, {
        id: loadingToast,
      });
      onActionSuccess(report.id);
    } catch (error: any) {
      console.error(`Authority action failed [${pendingAction}]:`, error);
      const msg = error?.reason || error?.message || "Transaction failed.";
      toast.error(`Failed: ${msg}`, { id: loadingToast });
    } finally {
      setExecutingAction(null);
    }
  };

  const layoutClass =
    layout === "column"
      ? "flex flex-col gap-2 w-full"
      : "flex flex-wrap gap-2";

  return (
    <>
      {/* Action Buttons */}
      <div className={layoutClass}>
        {availableActions.map((action) => {
          const meta = getActionMeta(action);
          const isLoading = executingAction === action;

          return (
            <button
              key={action}
              disabled={isLoading || executingAction !== null}
              onClick={() => setPendingAction(action)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                layout === "column" ? "w-full justify-center" : ""
              } ${ACTION_STYLES[action]}`}
              title={meta.description}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                ACTION_ICONS[action]
              )}
              {isLoading ? "Processing…" : meta.label}
            </button>
          );
        })}
      </div>

      {/* Confirm Dialog */}
      {pendingAction && (
        <ConfirmDialog
          title={getActionMeta(pendingAction).confirmTitle}
          message={getActionMeta(pendingAction).confirmMessage}
          actionLabel={getActionMeta(pendingAction).label}
          color={getActionMeta(pendingAction).color}
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}
