"use client";

import { useState, useRef } from "react";
import {
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Play,
  XCircle,
  Loader2,
  X,
  UploadCloud,
  MessageSquare,
  ImageIcon,
  ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  type EnrichedReport,
  formatLocation,
  shortenAddress,
  EMERGENCY_STATUS,
  getEmergencyStatusMeta,
} from "@/lib/reportHelpers";

interface EmergencyReportCardProps {
  report: EnrichedReport;
  currentAccount: string;
  emergencyReportingContract: any;
  onActionSuccess: (reportId: number) => void;
}

type EmergencyActionType = "startWork" | "resolve" | "reclassify";

interface ActionModalProps {
  title: string;
  description: string;
  actionType: EmergencyActionType;
  color: "indigo" | "green" | "red";
  onClose: () => void;
  onConfirm: (comment: string, imageFile: File | null) => Promise<void>;
}

function ActionModal({
  title,
  description,
  actionType,
  color,
  onClose,
  onConfirm,
}: ActionModalProps) {
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colorStyles = {
    indigo: {
      btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
      bg: "bg-indigo-50 text-indigo-700",
      border: "border-indigo-200",
    },
    green: {
      btn: "bg-green-600 hover:bg-green-700 text-white",
      bg: "bg-green-50 text-green-700",
      border: "border-green-200",
    },
    red: {
      btn: "bg-red-600 hover:bg-red-700 text-white",
      bg: "bg-red-50 text-red-700",
      border: "border-red-200",
    },
  }[color];

  const handleSubmit = async () => {
    if (!comment.trim() && actionType === "reclassify") {
      toast.error("Please provide a reason for reclassifying this report.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(comment, imageFile);
      onClose();
    } catch (err: any) {
      console.error("Action submission error:", err);
      toast.error(err.message || "Failed to execute transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-300 border border-white">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorStyles.bg}`}>
              {actionType === "startWork" && <Play className="w-5 h-5" />}
              {actionType === "resolve" && <CheckCircle2 className="w-5 h-5" />}
              {actionType === "reclassify" && <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionType === "reclassify" && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800 font-medium">
              <strong>Warning:</strong> Reclassifying as non-emergency will immediately place the submitting citizen in a <strong>30-day penalty box</strong> and mark this report as false alarm.
            </p>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Authority Report / Comment {actionType === "reclassify" && <span className="text-red-600">*</span>}
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                actionType === "reclassify"
                  ? "Explain why this was reclassified as a non-emergency..."
                  : "Add notes on emergency response or resolution..."
              }
              className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50"
            />
          </div>

          {actionType !== "reclassify" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Attach Evidence Photo (Optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setImageFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              {imageFile ? (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-2 text-sm text-slate-700 truncate">
                    <ImageIcon className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="truncate">{imageFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl p-3 text-sm text-slate-500 flex items-center justify-center gap-2 transition-colors bg-slate-50/50"
                >
                  <UploadCloud className="w-4 h-4" />
                  Click to attach image
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`flex-1 px-4 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${colorStyles.btn} disabled:opacity-50`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Confirm & Submit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmergencyReportCard({
  report,
  currentAccount,
  emergencyReportingContract,
  onActionSuccess,
}: EmergencyReportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeModal, setActiveModal] = useState<EmergencyActionType | null>(null);

  const createdAt = new Date(report.createdAt * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const statusMeta = getEmergencyStatusMeta(report.status);

  const executeAction = async (commentText: string, imageFile: File | null) => {
    if (!emergencyReportingContract) return;

    let commentCid = "";
    let imageCid = "";

    // 1. Upload comment text to IPFS if provided
    if (commentText.trim()) {
      const textRes = await fetch("/api/ipfs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentText.trim(),
          title: `Authority emergency comment for report #${report.id}`,
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

    // 3. Execute smart contract call
    let tx;
    if (activeModal === "startWork") {
      tx = await emergencyReportingContract.startWork(report.id, commentCid, imageCid);
    } else if (activeModal === "resolve") {
      tx = await emergencyReportingContract.resolveEmergency(report.id, commentCid, imageCid);
    } else if (activeModal === "reclassify") {
      tx = await emergencyReportingContract.reclassifyEmergency(report.id, commentCid);
    }

    if (tx) {
      await tx.wait();
      toast.success("Emergency report updated successfully!");
      onActionSuccess(report.id);
    }
  };

  return (
    <>
      <div className="bg-white/80 backdrop-blur-xl rounded-[24px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 p-6 flex flex-col justify-between relative overflow-hidden group">
        {/* Top Emergency Indicator Strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-90 group-hover:opacity-100 transition-opacity" />

        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-red-50 text-red-700 border border-red-100 shadow-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                EMERGENCY #{report.id}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase border shadow-sm ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
            </div>
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {createdAt}
            </span>
          </div>

          {/* Category & Location */}
          <div className="mb-4">
            <h3 className="text-xl font-black text-slate-900 mb-1.5 tracking-tight">
              {report.category || "Emergency Incident"}
            </h3>
            {report.location && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                {formatLocation(report.location)}
              </p>
            )}
          </div>

          {/* Description preview */}
          <p className="text-sm text-slate-600 leading-relaxed line-clamp-3 mb-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
            {report.description || (
              <span className="italic text-slate-400">No description available...</span>
            )}
          </p>

          {/* Expanded IPFS Details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
              {report.images && report.images.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Attached Evidence Photos ({report.images.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {report.images.map((img, idx) => (
                      <a
                        key={idx}
                        href={img.data}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity bg-slate-100 aspect-video"
                      >
                        <img
                          src={img.data}
                          alt={img.originalName || `Evidence ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1 font-mono text-slate-600">
                <div>
                  <span className="font-semibold text-slate-700">IPFS CID: </span>
                  <span className="break-all">{report.ipfsCid}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Report Hash: </span>
                  <span className="break-all">{report.reportHash}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-4 pt-5 border-t border-slate-100 flex flex-col gap-4">
          {/* Expand Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show full report &amp; photos
                </>
              )}
            </button>
          </div>

          {/* Authority Action Buttons (Actionable for Open or InProgress) */}
          {report.status === EMERGENCY_STATUS.Open && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => setActiveModal("startWork")}
                className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow"
              >
                <Play className="w-3.5 h-3.5" />
                Mark In Progress
              </button>
              <button
                onClick={() => setActiveModal("resolve")}
                className="px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Resolve Emergency
              </button>
              <button
                onClick={() => setActiveModal("reclassify")}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Reclassify
              </button>
            </div>
          )}

          {report.status === EMERGENCY_STATUS.InProgress && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setActiveModal("resolve")}
                className="px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Resolve Emergency
              </button>
              <button
                onClick={() => setActiveModal("reclassify")}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Reclassify
              </button>
            </div>
          )}

          {(report.status === EMERGENCY_STATUS.Resolved || report.status === EMERGENCY_STATUS.Reclassified) && (
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-center text-xs font-bold text-slate-500">
              {report.status === EMERGENCY_STATUS.Resolved
                ? "This emergency has been successfully handled and resolved."
                : "This incident was reclassified as a false emergency report."}
            </div>
          )}
        </div>
      </div>

      {activeModal && (
        <ActionModal
          title={
            activeModal === "startWork"
              ? "Mark Emergency In Progress"
              : activeModal === "resolve"
              ? "Resolve Emergency Report"
              : "Reclassify as False Alarm"
          }
          description={
            activeModal === "startWork"
              ? "Record dispatch or initial action for this emergency."
              : activeModal === "resolve"
              ? "Confirm that the emergency situation has been handled."
              : "Mark report as false alarm and penalize submitter."
          }
          actionType={activeModal}
          color={activeModal === "startWork" ? "indigo" : activeModal === "resolve" ? "green" : "red"}
          onClose={() => setActiveModal(null)}
          onConfirm={executeAction}
        />
      )}
    </>
  );
}
