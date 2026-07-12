"use client";

import { useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
  UploadCloud,
  MessageSquare,
  ImageIcon,
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
  comment: string;
  hasImage: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  actionLabel,
  color,
  comment,
  hasImage,
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
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{message}</p>

        {/* Action payload summary */}
        {(comment.trim() || hasImage) && (
          <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 mb-6 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-700">Payload to be stored on IPFS:</p>
            {comment.trim() && (
              <p className="italic">
                "{(comment.length > 80 ? comment.slice(0, 80) + "..." : comment)}"
              </p>
            )}
            {hasImage && (
              <p className="flex items-center gap-1 text-indigo-600 font-semibold">
                <ImageIcon className="w-3.5 h-3.5" />
                Evidence Image attached
              </p>
            )}
          </div>
        )}

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
  addUpdate: <MessageSquare className="w-3.5 h-3.5" />,
};

const ACTION_STYLES: Record<AuthorityAction, string> = {
  startWork: "bg-green-600 hover:bg-green-700 text-white border-transparent",
  markAsSolved: "bg-slate-900 hover:bg-slate-800 text-white border-transparent",
  rejectIssue: "border border-red-200 text-red-600 hover:bg-red-50 bg-white",
  addUpdate: "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent",
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

  // Form states
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleConfirm = async () => {
    if (!pendingAction || !reportingContract) return;
    const meta = getActionMeta(pendingAction);

    setExecutingAction(pendingAction);
    setPendingAction(null);

    const loadingToast = toast.loading(`Uploading to IPFS & executing transaction...`);

    try {
      let commentCid = "";
      let imageCid = "";

      // 1. Upload comment text to IPFS if provided
      if (comment.trim()) {
        const textRes = await fetch("/api/ipfs/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: comment.trim(),
            title: `Authority comment for report #${report.id}`,
          }),
        });
        const textData = await textRes.json();
        if (!textRes.ok || !textData.success) {
          throw new Error(textData.error || "Failed to upload comment to IPFS.");
        }
        commentCid = textData.cid;
      }

      // 2. Upload image file to IPFS if attached
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);

        const imgRes = await fetch("/api/ipfs/upload", {
          method: "POST",
          body: formData,
        });
        const imgData = await imgRes.json();
        if (!imgRes.ok || !imgData.success) {
          throw new Error(imgData.error || "Failed to upload image to IPFS.");
        }
        imageCid = imgData.cid;
      }

      // 3. Call corresponding smart contract transition function
      let tx;
      switch (pendingAction) {
        case "startWork":
          tx = await reportingContract.startWork(report.id, commentCid, imageCid);
          break;
        case "markAsSolved":
          tx = await reportingContract.markAsSolved(report.id, commentCid, imageCid);
          break;
        case "rejectIssue":
          tx = await reportingContract.rejectIssue(report.id, commentCid, imageCid);
          break;
        case "addUpdate":
          tx = await reportingContract.addAuthorityUpdate(report.id, commentCid, imageCid);
          break;
      }

      await tx.wait();

      toast.success(
        pendingAction === "addUpdate"
          ? `Report update logged on-chain!`
          : `Report #${report.id}: ${meta.label} confirmed on-chain!`,
        { id: loadingToast }
      );

      // Reset form fields
      setComment("");
      handleClearImage();

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
      ? "flex flex-col gap-2.5 w-full"
      : "flex flex-wrap gap-2.5";

  return (
    <>
      <div className="space-y-4">
        {/* Comment & Image Upload Form */}
        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Add Note / Comment
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Explain details of the action or update being taken..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Evidence / Supporting Image
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              >
                <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
                Choose Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
              {imageFile && (
                <span className="text-xs text-slate-500 font-medium truncate max-w-[150px]">
                  {imageFile.name}
                </span>
              )}
            </div>

            {/* Image Preview */}
            {imagePreview && (
              <div className="relative mt-3 w-full h-32 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white">
                <img
                  src={imagePreview}
                  alt="Attachment Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

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
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
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
      </div>

      {/* Confirm Dialog */}
      {pendingAction && (
        <ConfirmDialog
          title={getActionMeta(pendingAction).confirmTitle}
          message={getActionMeta(pendingAction).confirmMessage}
          actionLabel={getActionMeta(pendingAction).label}
          color={getActionMeta(pendingAction).color}
          comment={comment}
          hasImage={imageFile !== null}
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}
