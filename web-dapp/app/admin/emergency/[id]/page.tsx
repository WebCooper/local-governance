"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Landmark,
  Shield,
  RotateCw,
  AlertCircle,
  ImageIcon,
  Play,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAdmin, EMERGENCY_REPORTING_ADDRESS, MULTISIG_ADDRESS } from "@/context/AdminContext";
import { useCitizen } from "@/context/CitizenContext";
import { ActionModal, EmergencyActionType } from "@/components/admin/EmergencyReportCard";
import { EmergencyReportingABI, AuthorityMultiSigABI } from "@/lib/contracts/abis";
import {
  formatLocation,
  shortenAddress,
  getEmergencyStatusMeta,
  EMERGENCY_STATUS,
  extractCoordinates,
} from "@/lib/reportHelpers";
import Link from "next/link";
import toast from "react-hot-toast";

const MapPreview = dynamic(() => import("@/components/MapPreview"), {
  ssr: false,
});

interface EmergencyReportDetail {
  id: string;
  ipfsCid: string;
  status: number;
  createdAt: number;
  updatedAt?: number;
  assignedAuthority: string;
  assignedAuthorityProfile?: {
    name: string;
    position: string;
    department: string;
  } | null;
  title?: string;
  description?: string;
  category?: string;
  location?: string;
  lat?: number;
  lng?: number;
  images?: Array<{ data: string; mimeType: string; originalName?: string }>;
  ipfsLoaded?: boolean;
}

interface ActionLogEntry {
  authority: string;
  stage: number;
  commentCid: string;
  imageCid: string;
  timestamp: number;
  commentText: string;
  profile: {
    name: string;
    position: string;
    department: string;
  } | null;
}

export default function AdminEmergencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { account, isAuthority, isSuperAdmin, isConnecting, connectWallet } = useAdmin();
  const { wallet } = useCitizen();

  const [report, setReport] = useState<EmergencyReportDetail | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<EmergencyActionType | null>(null);

  const handleActionSuccess = async (comment: string, imageFile: File | null) => {
    if (!report) return;
    try {
      let imageCid = "";
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        const uploadRes = await fetch("/api/ipfs/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || "Failed to upload image to IPFS");
        }
        imageCid = uploadData.cid;
      }

      let commentCid = "";
      if (comment.trim()) {
        const textRes = await fetch("/api/ipfs/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: comment.trim(),
            title: `Authority emergency comment for report #${report.id}`,
          }),
        });
        const textData = await textRes.json();
        if (!textRes.ok || !textData.success) {
          throw new Error(textData.error || "Failed to upload comment to IPFS");
        }
        commentCid = textData.cid;
      }

      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const contractAddress = EMERGENCY_REPORTING_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";
      const rpcProvider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await rpcProvider.getSigner();
      const emergencyReportingContract = new ethers.Contract(
        contractAddress,
        EmergencyReportingABI,
        signer
      );

      let tx;
      if (activeModal === "startWork") {
        tx = await emergencyReportingContract.startWork(report.id, commentCid, imageCid);
      } else if (activeModal === "resolve") {
        tx = await emergencyReportingContract.resolveEmergency(report.id, commentCid, imageCid);
      } else if (activeModal === "reclassify") {
        tx = await emergencyReportingContract.reclassifyEmergency(report.id, commentCid);
      }

      if (tx) {
        const loadToast = toast.loading("Confirming action on AuraChain...");
        await tx.wait();
        toast.success("Action confirmed on-chain!", { id: loadToast });
        setActiveModal(null);
        window.location.reload();
      }
    } catch (err: any) {
      console.error("Action error:", err);
      toast.error(err.reason || err.message || "Transaction failed");
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const contractAddress = EMERGENCY_REPORTING_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";
      const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);

      const contract = new ethers.Contract(
        contractAddress,
        EmergencyReportingABI,
        rpcProvider
      );

      const r = await contract.getReport(Number(id));

      let assignedProfile = null;
      if (
        MULTISIG_ADDRESS &&
        r.assignedAuthority &&
        r.assignedAuthority !== ethers.ZeroAddress
      ) {
        try {
          const multiSigContract = new ethers.Contract(
            MULTISIG_ADDRESS,
            AuthorityMultiSigABI,
            rpcProvider
          );
          const prof = await multiSigContract.getProfile(r.assignedAuthority);
          if (prof.isSet) {
            assignedProfile = {
              name: prof.name,
              position: prof.position,
              department: prof.department,
            };
          }
        } catch (e) {
          console.error("Error fetching authority profile:", e);
        }
      }

      const base: EmergencyReportDetail = {
        id: r.id.toString(),
        ipfsCid: r.ipfsCid,
        status: Number(r.status),
        createdAt: Number(r.createdAt) * 1000,
        updatedAt: Number(r.createdAt) * 1000, // Fallback if no actions
        assignedAuthority: r.assignedAuthority,
        assignedAuthorityProfile: assignedProfile,
        ipfsLoaded: false,
      };

      let enrichedActions: ActionLogEntry[] = [];
      try {
        const rawActions = await contract.getReportActions(Number(id));
        const multiSigContract = new ethers.Contract(
          MULTISIG_ADDRESS,
          AuthorityMultiSigABI,
          rpcProvider
        );

        enrichedActions = await Promise.all(
          rawActions.map(async (act: any) => {
            const authority = act.authority;
            const stage = Number(act.stage);
            const commentCid = act.comment;
            const imageCid = act.imageCid;
            const timestamp = Number(act.timestamp) * 1000;

            if (timestamp > (base.updatedAt || 0)) {
              base.updatedAt = timestamp;
            }

            let commentText = "";
            if (commentCid && commentCid.trim().length > 5) {
              try {
                const textRes = await fetch(`/api/ipfs/text/${commentCid}`);
                if (textRes.ok) {
                  const textData = await textRes.json();
                  if (textData.success && textData.content) {
                    commentText = textData.content;
                  }
                }
              } catch (e) {
                console.error("Error resolving action comment:", e);
              }
            }

            let profile = null;
            if (MULTISIG_ADDRESS) {
              try {
                const prof = await multiSigContract.getProfile(authority);
                if (prof.isSet) {
                  profile = {
                    name: prof.name,
                    position: prof.position,
                    department: prof.department,
                  };
                }
              } catch (e) {
                console.error("Error fetching action authority profile:", e);
              }
            }

            return {
              authority,
              stage,
              commentCid,
              imageCid,
              timestamp,
              commentText,
              profile,
            };
          })
        );
        setActionsHistory(enrichedActions.reverse());
      } catch (err) {
        console.error("Failed to load actions history:", err);
      }

      // Fetch IPFS content
      if (base.ipfsCid && base.ipfsCid.length > 5) {
        try {
          const cidToFetch = base.ipfsCid.startsWith("ipfs://")
            ? base.ipfsCid.slice(7)
            : base.ipfsCid;
            
          const res = await fetch(`/api/ipfs/${cidToFetch}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              base.title = data.title || "Emergency Alert";
              base.description = data.description || "";
              base.category = data.category || "Emergency";
              base.location = data.location || "";
              base.images = data.images || [];
              base.ipfsLoaded = true;
            }
          }
        } catch (err) {
          console.error("IPFS fetch failed for emergency report:", err);
        }
      }

      setReport(base);
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch report from AuraChain.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (wallet) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 text-sm mb-6">
            Please log out of your Citizen session to access the Authority portal.
          </p>
          <Link
            href="/profile"
            className="inline-block w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors text-center"
          >
            Go to Profile (Sign Out)
          </Link>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Authority Required</h1>
          <p className="text-slate-500 mb-6 text-sm">
            Connect your authority wallet to view this report.
          </p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-md transition-all"
          >
            {isConnecting ? "Connecting…" : "Connect MetaMask"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RotateCw className="w-10 h-10 animate-spin text-red-600" />
          <p className="text-slate-500 font-medium">Loading emergency alert from ledger…</p>
        </div>
      </div>
    );
  }

  if (!isAuthority && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 text-sm mb-4">
            This wallet is not registered as an Admin or Authority on-chain.
          </p>
          <p className="font-mono text-xs text-slate-600 bg-slate-50 p-3 rounded-lg break-all">
            {account}
          </p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-bold text-slate-900">Report Not Found</h2>
        <p className="text-slate-500 text-sm text-center max-w-sm">
          {error ?? "The requested emergency could not be found on the ledger."}
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const createdAtDate = new Date(report.createdAt).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const updatedAtDate = new Date(report.updatedAt || report.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const coordinates = extractCoordinates(report.location);
  const hasImages = report.images && report.images.length > 0;
  const heroImage = hasImages
    ? `data:${report.images![0].mimeType || "image/jpeg"};base64,${report.images![0].data}`
    : null;

  const isAssigned =
    report.assignedAuthority && report.assignedAuthority !== ethers.ZeroAddress;

  const statusMeta = getEmergencyStatusMeta(report.status);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Top Banner Strip */}
      <div className="h-1 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 w-full" />

      {/* Top Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-red-600 font-bold text-sm hover:text-red-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin Dashboard
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-500 font-medium">
            Emergency #{report.id}
          </span>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 py-2 px-4 rounded-full border border-slate-200">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-mono text-slate-700">
            {account.slice(0, 6)}…{account.slice(-4)}
          </span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-6">
            {/* Hero */}
            <div className="relative w-full h-80 rounded-2xl overflow-hidden bg-slate-100 shadow-sm">
              {hasImages ? (
                <img
                  src={heroImage!}
                  alt={`Emergency ${report.id}`}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImage(`data:${report.images![0].mimeType || "image/jpeg"};base64,${report.images![0].data}`)}
                />
              ) : coordinates ? (
                <MapPreview lat={coordinates.lat} lng={coordinates.lng} interactive />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  No Preview Available
                </div>
              )}

              {/* Overlay badges */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white border shadow-sm ${statusMeta.text} ${statusMeta.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                  {statusMeta.label}
                </span>
                {isAssigned && report.assignedAuthority.toLowerCase() === account.toLowerCase() && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-600/90 text-white backdrop-blur-sm shadow-sm border border-indigo-700/50">
                    Assigned to you
                  </span>
                )}
              </div>
            </div>

            {/* Title / Category */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-100 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  EMERGENCY
                </span>
                {report.category && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    {report.category}
                  </span>
                )}
                <span className="text-sm text-slate-400 font-mono">ID: #{report.id}</span>
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">
                {report.title || `Emergency Alert #${report.id}`}
              </h1>
            </div>

            {/* Meta */}
            <div className="flex items-center flex-wrap gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Reported {createdAtDate}
              </span>
              {report.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {formatLocation(report.location)}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-3">
                Detailed Description
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                {report.description || (
                  <span className="text-slate-400 italic">
                    {report.ipfsLoaded
                      ? "No additional description provided for this alert."
                      : "Loading IPFS metadata…"}
                  </span>
                )}
              </p>
            </div>

            {/* Evidence Images */}
            {hasImages && report.images!.length > 1 && (
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-slate-500" />
                  Evidence ({report.images!.length} images)
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {report.images!.map((img, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedImage(`data:${img.mimeType || "image/jpeg"};base64,${img.data}`)}
                      className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm aspect-video bg-slate-100 cursor-pointer hover:opacity-90 transition group relative"
                    >
                      <img
                        src={`data:${img.mimeType || "image/jpeg"};base64,${img.data}`}
                        alt={img.originalName || `Evidence ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <span className="text-white text-xs font-bold px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
                          View Fullsize
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Authority Action Log / Timeline */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-5">
                Authority Activity History
              </h2>
              {actionsHistory.length === 0 ? (
                <p className="text-slate-400 italic text-sm text-center py-4">
                  No authority response actions recorded yet.
                </p>
              ) : (
                <div className="relative border-l border-slate-200 ml-4 pl-6 space-y-8">
                  {actionsHistory.map((act, index) => {
                    const actionDate = new Date(act.timestamp).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });

                    const actMeta = getEmergencyStatusMeta(act.stage);

                    return (
                      <div key={index} className="relative">
                        {/* Timeline dot */}
                        <span className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white ${actMeta.dot}`} />

                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${actMeta.bg} ${actMeta.text} ${actMeta.border}`}>
                              {actMeta.label}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {actionDate}
                            </span>
                          </div>

                          {/* Authority Name / Role */}
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <span className="text-slate-800">
                              {act.profile ? act.profile.name : shortenAddress(act.authority)}
                            </span>
                            {act.profile && (
                              <span className="text-slate-400 font-medium">
                                ({act.profile.position} &bull; {act.profile.department})
                              </span>
                            )}
                          </div>

                          {/* Comment Content */}
                          {act.commentText && (
                            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100/50 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                              {act.commentText}
                            </p>
                          )}

                          {/* Uploaded Evidence Image */}
                          {act.imageCid && act.imageCid.length > 5 && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-sm aspect-video bg-slate-50">
                              <img
                                src={`/api/ipfs/image/${act.imageCid}`}
                                alt="Response Attachment"
                                className="w-full h-full object-cover hover:scale-[1.02] transition-all cursor-pointer" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            
            {/* Authority Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-red-600" />
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Authority Actions
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Execute rapid state updates and coordinate field dispatch.
              </p>
              
              <div className="grid grid-cols-1 gap-2">
                {(report.status === EMERGENCY_STATUS.Open || report.status === EMERGENCY_STATUS.InProgress) && (
                  <button
                    onClick={() => setActiveModal("resolve")}
                    className="px-3 py-3 w-full bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Resolve Emergency
                  </button>
                )}
                {report.status === EMERGENCY_STATUS.Open && (
                  <button
                    onClick={() => setActiveModal("startWork")}
                    className="px-3 py-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
                  >
                    <Play className="w-4 h-4 shrink-0" />
                    Mark In Progress
                  </button>
                )}
                {(report.status === EMERGENCY_STATUS.Open || report.status === EMERGENCY_STATUS.InProgress) && (
                  <button
                    onClick={() => setActiveModal("reclassify")}
                    className="px-3 py-3 w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    Reclassify as Non-Emergency
                  </button>
                )}
                
                {report.status === EMERGENCY_STATUS.Resolved && (
                  <div className="p-3 bg-green-50 text-green-700 rounded-xl border border-green-100 text-center">
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-xs font-bold">Emergency Resolved</span>
                  </div>
                )}
                {report.status === EMERGENCY_STATUS.Reclassified && (
                  <div className="p-3 bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-center">
                    <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-slate-500" />
                    <span className="text-xs font-bold">Alert Reclassified</span>
                  </div>
                )}
              </div>
            </div>

            {/* Report Info */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Report Info</h3>

              <div className="space-y-3 text-sm">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                    Status
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-white ${statusMeta.text} ${statusMeta.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                    {statusMeta.label}
                  </span>
                </div>

                {/* Assigned Authority */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">
                    Assigned To
                  </span>
                  <div className="flex items-center gap-1.5 text-right">
                    <Landmark className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono text-xs text-slate-700 break-all">
                      {isAssigned
                        ? (report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : shortenAddress(report.assignedAuthority))
                        : "Awaiting Dispatch"}
                    </span>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">
                    Submitted
                  </span>
                  <span className="text-xs text-slate-600 text-right">{createdAtDate}</span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">
                    Last Update
                  </span>
                  <span className="text-xs text-slate-600 text-right">{updatedAtDate}</span>
                </div>
              </div>
            </div>
            
            {/* Protocol Notice */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-red-400">
                <Shield className="w-4 h-4" />
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider">
                  Emergency Protocol
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                To guarantee maximum response speed, Emergency Alerts bypass standard community voting. Local authorities are directly accountable for rapid resolution and evidence upload.
              </p>
            </div>
            
          </div>
        </div>
      </main>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 cursor-zoom-out transition-all duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full max-h-[90vh] flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="Evidence Preview" 
              className="max-w-full max-h-full object-contain rounded-[24px] shadow-2xl" 
            />
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Admin Action Modal */}
      {activeModal && (
        <ActionModal
          title={
            activeModal === "startWork"
              ? "Mark Emergency In-Progress"
              : activeModal === "resolve"
              ? "Resolve Emergency"
              : "Reclassify Alert"
          }
          description={
            activeModal === "startWork"
              ? "Confirm that authorities are actively responding to this emergency on-site."
              : activeModal === "resolve"
              ? "Confirm this emergency has been successfully handled and resolved."
              : "Mark this report as a non-emergency or false alarm."
          }
          actionType={activeModal}
          color={
            activeModal === "startWork"
              ? "indigo"
              : activeModal === "resolve"
              ? "green"
              : "red"
          }
          onClose={() => setActiveModal(null)}
          onConfirm={handleActionSuccess}
        />
      )}
    </div>
  );
}
