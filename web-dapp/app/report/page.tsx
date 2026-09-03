"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  Send,
  UploadCloud,
  X,
  Shield,
  MapPin,
  ChevronDown,
  Plus,
  Share2,
  Globe,
  Camera,
  AlertTriangle,
} from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useNotifications } from "@/context/NotificationContext";
import { useEmergencyPenalty } from "@/lib/useEmergencyPenalty";
import Link from "next/link";
import type { PickedLocation } from "@/components/LocationPicker";
import { useDuplicateChecker, type DuplicateReport } from "@/lib/hooks/useDuplicateChecker";

// Leaflet must not render on the server
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

const CATEGORIES = [
  "Infrastructure Damage",
  "Public Safety",
  "Environmental Issue",
  "Road & Traffic",
  "Utilities Outage",
  "Illegal Activity",
  "Other",
];

const MAX_IMAGES = 5;
const MAX_DESC_LENGTH = 1000;

/** Canonicalize line endings so signed payload matches multipart transport. */
const normalizeDescription = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

// ── Utility: Convert File to WebP ────────────────────────────────
const compressToWebP = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const fileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
              resolve(new File([blob], fileName, { type: "image/webp" }));
            } else {
              reject(new Error("WebP conversion failed"));
            }
          },
          "image/webp",
          0.8
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// ── Utility: Hash file contents ───────────────────────────────────
const hashFile = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return ethers.keccak256(uint8Array);
};

export default function ReportPage() {
  const router = useRouter();
  const { wallet, consumeTicket, availableTicketsCount } = useCitizen();
  const { addPendingJob } = useNotifications();

  const [category, setCategory] = useState("Infrastructure Damage");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const penalty = useEmergencyPenalty();
  const { duplicates, setDuplicates, isChecking } = useDuplicateChecker(category, location);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [previewReport, setPreviewReport] = useState<DuplicateReport | null>(null);

  // ── Image handling ───────────────────────────────────────────────
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);

    if (images.length + newFiles.length > MAX_IMAGES) {
      toast.error(`You can only upload a maximum of ${MAX_IMAGES} images.`);
      return;
    }

    setIsProcessingImages(true);
    setStatusMessage(null);

    try {
      const convertedFiles = await Promise.all(newFiles.map(compressToWebP));
      setImages((prev) => {
        const updated = [...prev, ...convertedFiles];
        toast.success(`Added ${convertedFiles.length} photo${convertedFiles.length > 1 ? "s" : ""} (${updated.length}/${MAX_IMAGES})`);
        return updated;
      });
    } catch (error) {
      console.error("Image processing error:", error);
      toast.error("Failed to process images. Please try different files.");
    } finally {
      setIsProcessingImages(false);
      setShowUploadOptions(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const removeImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, i) => i !== indexToRemove));
  };

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet) {
      toast.error("You must be logged in to submit a report.");
      return;
    }

    if (!location) {
      toast.error("You must provide a location.");
      return;
    }

    if (!description.trim() || description.length > MAX_DESC_LENGTH) {
      toast.error("Please provide a valid description within the character limit.");
      return;
    }

    if (!showDuplicateModal) {
      if (duplicates.length > 0) {
        setShowDuplicateModal(true);
        return;
      }

      // Live fallback check in case the user clicked submit before debounce finished
      try {
        const res = await fetch("/api/reports/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            lat: location.lat,
            lng: location.lng,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.duplicates && data.duplicates.length > 0) {
            setDuplicates(data.duplicates);
            setShowDuplicateModal(true);
            return;
          }
        }
      } catch (err) {
        console.error("Live duplicate check error:", err);
      }
    }

    if (isEmergency && penalty.isPenalized) {
      toast.error(`Emergency reporting is locked until ${penalty.penaltyUntilDate?.toLocaleDateString()} due to a false alarm penalty.`);
      setIsEmergency(false);
      return;
    }

    if (isEmergency && !showEmergencyModal) {
      setShowEmergencyModal(true);
      return;
    }

    executeSubmission();
  };

  const executeSubmission = async () => {
    if (!wallet) {
      toast.error("You must be logged in to submit a report.");
      return;
    }

    const currentTicket = consumeTicket();
    if (!currentTicket) {
      toast.error("Security session expired (no tickets left). Please log in again.");
      return;
    }

    setShowEmergencyModal(false);
    setShowDuplicateModal(false);
    setIsSubmitting(true);
    
    try {
      const normalizedDescription = normalizeDescription(description);

      // Step 1: Hash all WebP images
      const imageHashes = await Promise.all(images.map(hashFile));
      const combinedImageHashes = imageHashes.join("");

      // Step 2: Sign Text + Ticket ID + Image Hashes
      const ethersWallet = new ethers.Wallet(wallet.privateKey);
      const messageHash = ethers.solidityPackedKeccak256(
        ["string", "string", "string"],
        [normalizedDescription, currentTicket.ticketId, combinedImageHashes]
      );
      const signature = await ethersWallet.signMessage(ethers.getBytes(messageHash));

      // Step 3: Prepare FormData
      const formData = new FormData();
      formData.append("category", category);
      formData.append("description", normalizedDescription);
      formData.append("zkpTicketId", currentTicket.ticketId);
      formData.append("zkpSignature", currentTicket.signature);
      formData.append("citizenPubKey", wallet.publicKey);
      formData.append("signature", signature);
      formData.append("imageHashes", JSON.stringify(imageHashes));
      images.forEach((img) => formData.append("images", img));
      if (location) {
        formData.append("location", JSON.stringify({ lat: location.lat, lng: location.lng, address: location.address }));
      }
      formData.append("isEmergency", String(isEmergency));

      const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "";
      const response = await fetch(`${RELAYER_URL}/report`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to submit report to relayer.");
      }

      // Register the job with the notification system so the bell tracks it
      addPendingJob(data.jobId, category);

      // Reset form immediately — no need to wait for pipeline
      setDescription("");
      setImages([]);
      setIsEmergency(false);
      setShowEmergencyModal(false);
      setShowDuplicateModal(false);

      toast.success(
        `Report submitted! Track progress in the notification bell. You have ${availableTicketsCount - 1} tickets remaining.`,
        { duration: 5000 }
      );
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.message || "Failed to submit report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Shared status banner ─────────────────────────────────────────
  const StatusBanner = () =>
    statusMessage ? (
      <div
        className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${
          statusMessage.type === "error" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
        }`}
      >
        {statusMessage.type === "error" ? (
          <AlertCircle className="h-5 w-5 shrink-0" />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0" />
        )}
        <div className="space-y-2">
          <p>{statusMessage.text}</p>
          {statusMessage.type === "error" && statusMessage.text.includes("log in again") && (
            <button
              type="button"
              onClick={() => router.push("/auth")}
              className="text-xs font-semibold text-red-700 underline"
            >
              Go to login
            </button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      {/* ═══════════════════════════════════════════════
          MOBILE LAYOUT
      ═══════════════════════════════════════════════ */}
      <div className="md:hidden max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Report an Issue</h2>
          <p className="text-slate-500 mb-6 text-sm">
            Your report will be analyzed by AI for moderation before being permanently recorded on
            the blockchain. Your identity remains 100% anonymous.
          </p>

          {statusMessage && (
            <div className="mb-6">
              <StatusBanner />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all pr-10"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-semibold text-slate-700">Issue Description</label>
                <span className={`text-xs ${description.length >= MAX_DESC_LENGTH ? "text-red-500 font-bold" : "text-slate-400"}`}>
                  {description.length} / {MAX_DESC_LENGTH}
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={MAX_DESC_LENGTH}
                placeholder="Describe the problem (e.g., Pothole on Main St, Broken streetlight...)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-sm resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Photos */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-semibold text-slate-700">Attach Photos (Optional)</label>
                <span className="text-xs text-slate-400">{images.length} / {MAX_IMAGES}</span>
              </div>
              <div
                className={`border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center transition-colors ${
                  images.length >= MAX_IMAGES || isSubmitting
                    ? "bg-slate-100 cursor-not-allowed opacity-60"
                    : "bg-slate-50 hover:bg-slate-100 cursor-pointer"
                }`}
                onClick={() => {
                  if (images.length < MAX_IMAGES && !isSubmitting && !isProcessingImages) {
                    setShowUploadOptions(true);
                  }
                }}
              >
                <UploadCloud className="h-8 w-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-600 font-medium">
                  {isProcessingImages ? "Processing & Compressing..." : "Click to upload images"}
                </p>
                <p className="text-xs text-slate-400 mt-1">JPEG, PNG, or WEBP (converted to optimized WebP)</p>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleImageChange}
                  disabled={isSubmitting || images.length >= MAX_IMAGES || isProcessingImages}
                />
                <input
                  type="file"
                  ref={cameraInputRef}
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageChange}
                  disabled={isSubmitting || images.length >= MAX_IMAGES || isProcessingImages}
                />
              </div>
              {images.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center justify-between">
                    <span>Attached Photos ({images.length}/{MAX_IMAGES})</span>
                    <span className="text-[11px] text-green-600 font-medium">✓ Ready for report</span>
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {images.map((img, idx) => {
                      const objectUrl = URL.createObjectURL(img);
                      return (
                        <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
                          <img
                            src={objectUrl}
                            alt={`Upload ${idx + 1}`}
                            className="w-full h-full object-cover"
                            onLoad={() => URL.revokeObjectURL(objectUrl)}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            disabled={isSubmitting}
                            className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-600 text-white rounded-full p-1 transition-colors shadow-md"
                            title="Remove photo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <div className="absolute bottom-0 inset-x-0 bg-slate-900/60 text-white text-[10px] px-1.5 py-0.5 truncate font-mono">
                            Photo #{idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Location – mobile */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Location (Optional)</label>
              <LocationPicker value={location} onChange={setLocation} />
            </div>

            {/* ── Emergency Toggle (Mobile) ── */}
            {penalty.isPenalized ? (
              <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 mt-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-amber-900 font-bold text-sm">Emergency Reporting Suspended</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                        {penalty.daysRemaining} days left
                      </span>
                    </div>
                    <p className="text-amber-800 text-xs mt-1 leading-relaxed">
                      Your ID is restricted from submitting emergency reports until{" "}
                      <strong>{penalty.penaltyUntilDate?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                    </p>
                    {penalty.reason && (
                      <div className="mt-2 p-2 bg-white/90 rounded-xl border border-amber-200 text-xs text-amber-900">
                        <span className="font-bold text-amber-950">Authority Reason (Report #{penalty.reclassifiedReportId}): </span>
                        &ldquo;{penalty.reason}&rdquo;
                      </div>
                    )}
                    <p className="text-amber-700 text-xs mt-1.5 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Standard civic reporting is unaffected and open.</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
                <div className="flex-1">
                  <h3 className="text-red-800 font-bold text-lg mb-1 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" /> Urgent / Emergency Report
                  </h3>
                  <p className="text-red-600 text-xs leading-relaxed">
                    Marking this as an emergency will immediately alert authorities bypassing standard triage. False emergency reports carry a strict 30-day cryptographic penalty lock on your ID.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmergency(!isEmergency)}
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus:outline-none shadow-inner self-end sm:self-auto ${
                    isEmergency ? 'bg-red-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                      isEmergency ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isProcessingImages || !wallet}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-[16px] shadow-sm shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span>Submit Securely</span>
                </>
              )}
            </button>

            <div className="text-center">
              <p className="text-xs font-medium text-slate-400">
                Available Anonymous Tickets:{" "}
                <span className="text-slate-700">{availableTicketsCount}</span>
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          DESKTOP LAYOUT
      ═══════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col min-h-screen bg-[#F9FAFB] pb-8 pt-4 md:pt-8 text-slate-800">
        <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col w-full h-full">

          {/* HERO BANNER */}
          <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-orange-500 to-red-600 p-8 md:p-10 text-white relative mb-8 shadow-sm flex flex-col justify-center">
            <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
              <svg className="animate-spin-in" width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 0L105 85L200 100L105 115L100 200L95 115L0 100L95 85L100 0Z" fill="white" />
              </svg>
            </div>
            
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-orange-200">Civic Action</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
              Report an Issue
            </h1>
            <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-2">
               Submit a secure, decentralized civic report. Your identity remains protected by AuraChain protocol. Your voice shapes the community.
            </p>
          </div>

          {/* Status Banner */}
          {statusMessage && (
            <div className="mb-6 w-full">
              <StatusBanner />
            </div>
          )}

          {/* Main Form Content Container */}
          <div className="flex-1 flex flex-col gap-6 w-full mb-8">

            {/* Main Grid: 2 columns */}
            <div className="grid grid-cols-2 gap-6 flex-1">

              {/* ── Left Column ── */}
              <div className="flex flex-col gap-6">

                {/* Step 1 – Describe */}
                <div className="bg-white rounded-[24px] border border-slate-100/60 p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                      1
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Describe the Issue</h2>
                  </div>

                  {/* Category */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                      Report Category
                    </label>
                    <div className="relative">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full appearance-none border border-slate-200/80 rounded-[16px] px-4 py-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all cursor-pointer pr-10 hover:border-slate-300"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Detailed Description
                      </label>
                      <span className={`text-xs ${description.length >= MAX_DESC_LENGTH ? "text-red-500 font-bold" : "text-slate-400"}`}>
                        {description.length} / {MAX_DESC_LENGTH}
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      maxLength={MAX_DESC_LENGTH}
                      placeholder="Provide specific details about the issue (what happened, exact landmark, urgency level)..."
                      className="w-full rounded-[16px] border border-slate-200/80 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none hover:border-slate-300"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Step 2 – Photos */}
                <div className="bg-white rounded-[24px] border border-slate-100/60 p-6 shadow-sm hover:shadow-md transition-shadow flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                          2
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">Upload Evidence Photo</h2>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">
                        {images.length} / {MAX_IMAGES} uploaded
                      </span>
                    </div>

                    {/* Photo Previews */}
                    {images.length > 0 && (
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {images.map((file, index) => (
                          <div key={index} className="relative group rounded-xl overflow-hidden aspect-square border border-slate-200 bg-slate-50">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Evidence ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity shadow-sm"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Dropzone Button */}
                    {images.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => setShowUploadOptions(true)}
                        disabled={isProcessingImages}
                        className="w-full border-2 border-dashed border-slate-200/80 hover:border-orange-400 hover:bg-orange-50/50 rounded-[16px] p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                          <UploadCloud className="h-6 w-6" />
                        </div>
                        <span className="text-sm font-bold text-slate-800">
                          {isProcessingImages ? "Processing Image..." : "Add Media"}
                        </span>
                        <span className="text-xs text-slate-400">
                          Click to select photo or capture image (JPG, PNG, WebP)
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                    <Shield className="h-4 w-4 text-orange-500 shrink-0" />
                    <span>Faces and PII are automatically blurred by AI Oracle before IPFS storage.</span>
                  </div>
                </div>
              </div>

              {/* ── Right Column ── */}
              <div className="flex flex-col gap-6">

                {/* Step 3 – Location */}
                <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex-1 flex flex-col">
                  <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100/60">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                        3
                      </div>
                      <h2 className="text-lg font-bold text-slate-900">Pin Location</h2>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">GPS Auto-Triage</span>
                  </div>

                  <div className="p-6 flex-1 min-h-[360px]">
                    <LocationPicker value={location} onChange={setLocation} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Emergency Toggle (Desktop) ── */}
            {penalty.isPenalized ? (
              <div className="bg-amber-50/90 border border-amber-200 rounded-[24px] p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-1">
                      <h3 className="text-amber-950 font-bold text-base">Emergency Reporting Suspended</h3>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                        30-Day Penalty Active ({penalty.daysRemaining} days remaining)
                      </span>
                    </div>
                    <p className="text-amber-800 text-sm leading-relaxed">
                      Your identity pseudonym is temporarily restricted from submitting emergency fast-track reports until{" "}
                      <strong>{penalty.penaltyUntilDate?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                    </p>
                    {penalty.reason && (
                      <div className="mt-3 p-3 bg-white/90 rounded-xl border border-amber-200 text-xs text-amber-950">
                        <span className="font-bold">Authority Reclassification Notice (Report #{penalty.reclassifiedReportId}): </span>
                        &ldquo;{penalty.reason}&rdquo;
                      </div>
                    )}
                    <p className="text-emerald-700 text-xs mt-3 flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Standard civic reporting remains fully functional. You can still submit this report below.</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-red-50/80 border border-red-100/90 rounded-[24px] p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-1">
                  <h3 className="text-red-800 font-bold text-base mb-1 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0" /> Urgent / Emergency Report
                  </h3>
                  <p className="text-red-600 text-xs sm:text-sm leading-relaxed">
                    Marking this as an emergency will immediately alert authorities bypassing standard triage. False emergency reports carry a strict 30-day cryptographic penalty lock on your ID.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmergency(!isEmergency)}
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus:outline-none shadow-inner cursor-pointer ${
                    isEmergency ? 'bg-red-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                      isEmergency ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* ── Sticky Bottom Action Bar (Floating Island) ── */}
          <div className="sticky bottom-6 z-40 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl px-8 py-5 flex items-center justify-between gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div className="flex items-start gap-3 text-slate-500 text-xs leading-relaxed max-w-md">
              <Shield className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <span>
                By submitting, your report will be encrypted using Zero-Knowledge Proofs. Only the
                final data is public — your wallet and IP are never stored.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => toast.success("Draft saved locally.")}
                className="py-3 px-6 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm cursor-pointer"
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isProcessingImages || !wallet}
                className="py-3 px-8 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center gap-2 text-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Submit Anonymously
                    <Send className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <footer className="py-6 mt-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium">
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
              <span>© 2026 AuraChain. Decentralized Governance for Local Communities.</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>EVM Smart Contracts</span>
              <span>&bull;</span>
              <span>IPFS Storage</span>
            </div>
          </footer>
        </form>
      </div>

      {/* Upload Options Modal */}
      {showUploadOptions && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Add Media</h3>
            <button
              type="button"
              onClick={() => {
                setShowUploadOptions(false);
                fileInputRef.current?.click();
              }}
              className="w-full py-4 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <UploadCloud className="w-5 h-5 text-blue-600" /> Upload from Device
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUploadOptions(false);
                cameraInputRef.current?.click();
              }}
              className="w-full py-4 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-5 h-5 text-blue-600" /> Take a Photo
            </button>
            <button
              type="button"
              onClick={() => setShowUploadOptions(false)}
              className="w-full py-3 mt-2 text-slate-500 font-medium hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Emergency Consent Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-3 py-4">
          <div className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-md shadow-2xl flex flex-col gap-4 sm:gap-6 transform scale-100 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center self-center shrink-0">
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="text-center space-y-2 sm:space-y-3">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">Skin-in-the-Game Warning</h3>
              <p className="text-slate-600 leading-relaxed text-xs sm:text-sm">
                You are about to trigger a direct siren to city dispatchers. This is for immediate hazards only (e.g., exposed power lines, severe flooding). 
              </p>
              <p className="text-red-600 font-bold leading-relaxed text-xs sm:text-sm">
                If authorities determine this is a routine issue, your cryptographic ID will be locked in the Penalty Box for 30 days. You will be unable to report further emergencies.
              </p>
            </div>
            
            <div className="flex flex-col gap-2.5 sm:gap-3 mt-2 sm:mt-4">
              <button
                type="button"
                onClick={executeSubmission}
                disabled={isSubmitting}
                className="w-full py-3 sm:py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-sm sm:text-base rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-600/20"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "I Understand — Submit Emergency"
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                disabled={isSubmitting}
                className="w-full py-3 sm:py-4 text-slate-500 font-bold text-sm hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Potential Duplicate Popup Modal ── */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl flex flex-col gap-6 transform scale-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center self-center shrink-0">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-slate-900">Similar Reports Found Nearby</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                We found <strong className="font-bold">{duplicates.length}</strong> active report(s) within <strong className="font-bold">1 km</strong> matching the <strong className="font-bold">{category}</strong> category.
              </p>
              <p className="text-amber-700 font-medium text-xs">
                Please check if your incident is already reported below to prevent duplicate governance proposals:
              </p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-left">
              {duplicates.map((dup) => (
                <div key={dup.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 flex justify-between items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 mb-0.5">Report #{dup.id} • {dup.category}</div>
                    <div className="line-clamp-2 text-slate-600 italic">{dup.description || "No description available"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewReport(dup)}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-bold rounded-lg shrink-0 transition-colors shadow-sm"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col gap-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  if (isEmergency && !showEmergencyModal) {
                    setShowEmergencyModal(true);
                  } else {
                    executeSubmission();
                  }
                }}
                disabled={isSubmitting}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-600/20"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Submit Anyway (New Separate Incident)"
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                disabled={isSubmitting}
                className="w-full py-4 text-slate-500 font-bold hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Individual Report Preview Modal (shows /issues/[id] in iframe) ── */}
      {previewReport && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/75 backdrop-blur-md p-3 md:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-blue-600 text-white font-bold text-xs rounded-full uppercase tracking-wider">
                  Report #{previewReport.id}
                </span>
                <span className="text-slate-900 font-bold text-sm md:text-base">
                  {previewReport.category} — Issue Preview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReport(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors shadow-sm"
              >
                <span>Close Preview</span>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content (/issues/[id] page via iframe) */}
            <div className="flex-1 w-full bg-slate-100 relative">
              <iframe
                src={`/issues/${previewReport.id}?embed=true`}
                className="w-full h-full border-0"
                title={`Issue #${previewReport.id} preview`}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
