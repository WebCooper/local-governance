"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { useAdmin, EMERGENCY_REPORTING_ADDRESS, MULTISIG_ADDRESS } from "@/context/AdminContext";
import { EmergencyReportingABI, AuthorityMultiSigABI } from "@/lib/contracts/abis";
import { getEmergencyStatusMeta, shortenAddress, formatLocation, EMERGENCY_STATUS } from "@/lib/reportHelpers";
import { ArrowLeft, MapPin, Clock, RotateCw, AlertCircle, ImageIcon, Bell, Settings, Landmark, Shield, ShieldAlert, UserCheck, AlertTriangle } from "lucide-react";

const MapPreview = dynamic(() => import("@/components/MapPreview"), {
  ssr: false,
});
interface EmergencyReportDetail {
  id: string;
  ipfsCid: string;
  status: number;
  createdAt: number;
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
  images?: Array<{ data: string; mimeType: string; cid?: string }>;
}

interface ActionLogEntry {
  authority: string;
  stage: number;
  commentCid: string;
  imageCid: string;
  timestamp: number;
  commentText?: string;
  profile?: {
    name: string;
    position: string;
    department: string;
  } | null;
}

export default function EmergencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { provider } = useAdmin();

  const [report, setReport] = useState<EmergencyReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionLogEntry[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<{
    data: string;
    mimeType: string;
  } | null>(null);

  useEffect(() => {
    async function fetchEmergencyReport() {
      setLoading(true);
      setError(null);
      try {
        const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
        const contractAddress =
          EMERGENCY_REPORTING_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";
        const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);

        const contract = new ethers.Contract(
          contractAddress,
          EmergencyReportingABI,
          rpcProvider
        );

        const r = await contract.getReport(Number(id));

        // Fetch assigned authority profile if set
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
          assignedAuthority: r.assignedAuthority,
          assignedAuthorityProfile: assignedProfile,
        };

        // Fetch authority actions history
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
        } catch (e) {
          console.error("Error fetching emergency report actions history:", e);
        }
        setActionsHistory(enrichedActions);

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
                setReport({
                  ...base,
                  title: data.title || "Emergency Alert",
                  description: data.description || "",
                  category: data.category || "Emergency",
                  location: data.location || "",
                  images: data.images || [],
                });
                return;
              }
            }
          } catch (err) {
            console.error("IPFS fetch failed for emergency report:", err);
          }
        }

        setReport(base);
      } catch (err: any) {
        console.error("Failed to fetch emergency report:", err);
        setError(
          err.message || "Failed to retrieve emergency report from AuraChain."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchEmergencyReport();
  }, [id]);


  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <RotateCw className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-slate-500 font-medium">
            Retrieving block payload…
          </p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-red-400" />

        <h2 className="text-xl font-bold text-slate-900">
          Report Not Found
        </h2>

        <p className="text-slate-500 text-sm text-center max-w-sm">
          {error ??
            "The requested report could not be found on the ledger."}
        </p>

        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const statusMeta = getEmergencyStatusMeta(report.status);
  const reportedAt = new Date(report.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const coordinates = report.lat !== undefined && report.lng !== undefined ? { lat: report.lat, lng: report.lng } : null;
  const hasImages = report.images && report.images.length > 0;
  const heroImage = hasImages ? `data:${report.images![0].mimeType || "image/jpeg"};base64,${report.images![0].data}` : null;
  const isEmbed = false;


  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden min-h-screen bg-[#F9FAFB] pb-[160px] relative">
        
        {/* HERO */}
        <div className="relative h-80 w-full rounded-b-[32px] overflow-hidden shadow-sm mb-6">
          {hasImages ? (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/30 to-slate-900/10 z-10" />
              <img
                src={heroImage!}
                alt={`Report ${report.id}`}
                className="w-full h-full object-cover absolute inset-0"
              />
            </>
          ) : coordinates ? (
            <div className="absolute inset-0 w-full h-full">
              <MapPreview
                lat={coordinates.lat}
                lng={coordinates.lng}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent pointer-events-none z-10" />
            </div>
          ) : (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
              <AlertCircle className="h-16 w-16 text-white/10" />
            </div>
          )}

          {!isEmbed && (
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 z-20 shadow-sm"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          )}

          <div className="absolute bottom-5 left-5 right-5 z-20">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${statusMeta.bg} ${statusMeta.text} bg-opacity-90 backdrop-blur-md`}>
                {statusMeta.label}
              </span>
              {report.category && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-sm">
                  {report.category}
                </span>
              )}
            </div>
            
            <h1 className="text-2xl font-extrabold text-white leading-tight drop-shadow-md mb-2">
              {report.category ? `${report.category} Issue` : `Report #${report.id}`}
            </h1>
            
            <div className="flex items-center gap-4 text-white/80 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {reportedAt}
              </span>
              {report.location && (
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3 w-3" />
                  {formatLocation(report.location)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-600 rounded-full inline-block"></span>
              Description
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed font-medium">
              {report.description ?? "No description provided."}
            </p>
          </div>

          {/* Evidence Gallery Mobile */}
          {report.images && report.images.length > 0 && (
            <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-400" />
                Evidence Gallery
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {report.images.map((img, i) => {
                  const imgSrc = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedImage(imgSrc)}
                      className="rounded-[16px] overflow-hidden border border-slate-100 shadow-sm aspect-square bg-slate-100 cursor-pointer"
                    >
                      <img
                        src={imgSrc}
                        alt="Evidence Photo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assigned Authority Mobile */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[24px] p-5 text-white shadow-md relative overflow-hidden flex gap-4 items-center">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 backdrop-blur-sm relative z-10 border border-white/10">
              <Landmark className="h-5 w-5 text-blue-200" />
            </div>
            <div className="relative z-10">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                Assigned Authority
              </p>
              {report.assignedAuthority === "0x0000000000000000000000000000000000000000" ? (
                <p className="text-sm font-bold text-white/90">Pending</p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-white">
                    {report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : "Official Representative"}
                  </p>
                  {report.assignedAuthorityProfile && (
                    <p className="text-[10px] text-blue-300 font-medium">
                      {report.assignedAuthorityProfile.department}
                    </p>
                  )}
                </div>
              )}
            </div>
            <Landmark className="absolute -right-2 -bottom-2 w-20 h-20 text-white/5 z-0" />
          </div>

          {/* Authority Action Log Mobile */}
          <div className="bg-white rounded-[24px] border border-slate-100/60 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              Action Log
            </h3>
            {actionsHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 bg-slate-50 rounded-[16px] border border-slate-100 border-dashed">
                <Clock className="h-6 w-6 text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium text-xs">No official actions recorded.</p>
              </div>
            ) : (
              <div className="relative ml-2">
                <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-slate-100" />
                <div className="space-y-6 relative">
                  {actionsHistory.map((act, index) => {
                    const actionDate = new Date(act.timestamp * 1000).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });
                    const statusMeta = getEmergencyStatusMeta(act.stage);

                    return (
                      <div key={index} className="relative pl-8 group">
                        <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center z-10 ${statusMeta.bg} ${statusMeta.text}`}>
                          <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        </div>

                        <div className="bg-slate-50 rounded-[16px] p-4 border border-slate-100/60">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusMeta.bg} ${statusMeta.text}`}>
                              {statusMeta.label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {actionDate}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-800 mb-2">
                            {act.profile ? act.profile.name : "Official"}
                          </div>

                          {act.commentText && (
                            <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-3 leading-relaxed whitespace-pre-wrap shadow-sm">
                              {act.commentText}
                            </p>
                          )}

                          {act.imageCid && act.imageCid.length > 5 && (
                            <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white">
                              <img src={`/api/ipfs/image/${act.imageCid}`} alt="Attachment" className="w-full h-auto object-cover cursor-pointer" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>


      </div>
      
      {/* DESKTOP */}
      <div className="hidden md:flex flex-col w-full min-h-screen bg-[#F9FAFB] pb-20">
        
        {/* Top Bar */}
        {!isEmbed && (
          <div className="w-full bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-slate-700 font-bold text-sm hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Emergency Hub
              </button>

              <div className="flex items-center gap-4 text-slate-500">
                <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <Bell className="h-5 w-5" />
                </button>
                <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-12 flex-1 flex flex-col">
          
          {/* IMMERSIVE HERO HEADER */}
          <div className="relative w-full h-[400px] rounded-[32px] overflow-hidden shadow-sm mb-10 group">
            {hasImages ? (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-900/10 z-10 transition-opacity duration-500" />
                <img
                  src={heroImage!}
                  alt={`Report ${report.id}`}
                  className="w-full h-full object-cover absolute inset-0 transition-transform duration-700 group-hover:scale-105"
                />
              </>
            ) : coordinates ? (
              <div className="absolute inset-0 w-full h-full">
                <MapPreview
                  lat={coordinates.lat}
                  lng={coordinates.lng}
                  interactive={true}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-900/10 pointer-events-none z-10" />
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
                <AlertCircle className="h-32 w-32 text-white/10" />
              </div>
            )}

            {/* Overlay Content */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end p-10 md:p-12 text-white">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div className="flex items-center gap-3">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${statusMeta.bg} ${statusMeta.text} bg-opacity-90 backdrop-blur-md`}>
                    {statusMeta.label}
                  </span>
                  {report.category && (
                    <span className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-sm">
                      {report.category}
                    </span>
                  )}
                  <span className="text-white/60 text-sm font-mono tracking-widest uppercase">
                    ID: #{report.id}
                  </span>
                </div>


              </div>

              <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight drop-shadow-md max-w-4xl">
                {report.title || `Emergency Alert #${report.id}`}
              </h1>

              <div className="flex items-center gap-6 text-white/80 font-medium text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Reported {reportedAt}
                </span>
                {report.location && (
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {formatLocation(report.location)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* GRID LAYOUT */}
          <div className="grid grid-cols-[1fr_360px] gap-10">
            
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-8">
              
              {/* Description */}
              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100/60">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-blue-600 rounded-full inline-block"></span>
                  Detailed Description
                </h2>
                <p className="text-slate-600 text-base leading-relaxed whitespace-pre-wrap font-medium">
                  {report.description ?? "No description provided."}
                </p>
              </div>

              {/* Evidence Gallery */}
              {report.images && report.images.length > 0 && (
                <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100/60">
                  <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-slate-400" />
                    Evidence Gallery
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    {report.images.map((img, i) => {
                      const imgSrc = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedImage(imgSrc)}
                          className="rounded-[20px] overflow-hidden border border-slate-100 shadow-sm aspect-video bg-slate-100 group cursor-pointer relative"
                        >
                          <img
                            src={imgSrc}
                            alt="Evidence Photo"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors duration-300 flex items-center justify-center pointer-events-none" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Elegant Timeline (Authority Action Log) */}
              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100/60">
                <h2 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-slate-400" />
                  Authority Action Log
                </h2>
                
                {actionsHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-[20px] border border-slate-100 border-dashed">
                    <Clock className="h-8 w-8 text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium text-sm">No official actions recorded yet.</p>
                  </div>
                ) : (
                  <div className="relative ml-4">
                    {/* Continuous vertical line */}
                    <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-100" />
                    
                    <div className="space-y-8 relative">
                      {actionsHistory.map((act, index) => {
                        const actionDate = new Date(act.timestamp * 1000).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        });
                        const statusMeta = getEmergencyStatusMeta(act.stage);

                        return (
                          <div key={index} className="relative pl-12 group">
                            {/* Animated Timeline Node */}
                            <div className={`absolute left-0 top-1 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${statusMeta.bg} ${statusMeta.text}`}>
                              <div className="w-2 h-2 rounded-full bg-current" />
                            </div>

                            <div className="bg-slate-50 rounded-[20px] p-5 border border-slate-100/60 transition-colors group-hover:bg-slate-50/80 group-hover:border-slate-200">
                              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusMeta.bg} ${statusMeta.text}`}>
                                  {statusMeta.label}
                                </span>
                                <span className="text-xs text-slate-400 font-medium tracking-wide">
                                  {actionDate}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                                  <Landmark className="w-3.5 h-3.5 text-slate-500" />
                                </div>
                                {act.profile ? act.profile.name : "Official Representative"}
                                {act.profile && (
                                  <span className="text-slate-400 font-medium text-xs ml-1">
                                    &bull; {act.profile.position}, {act.profile.department}
                                  </span>
                                )}
                              </div>

                              {act.commentText && (
                                <p className="text-sm text-slate-600 bg-white border border-slate-100 rounded-xl p-4 leading-relaxed whitespace-pre-wrap shadow-sm">
                                  {act.commentText}
                                </p>
                              )}

                              {act.imageCid && act.imageCid.length > 5 && (
                                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-sm aspect-video bg-white">
                                  <img
                                    src={`/api/ipfs/image/${act.imageCid}`}
                                    alt="Action Attachment"
                                    className="w-full h-full object-cover cursor-pointer" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-6 sticky top-24 self-start">
              
              
              {/* Protocol Notice */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden mb-6">
                <div className="flex items-center gap-2 mb-2 text-red-400">
                  <ShieldAlert className="w-5 h-5" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider">
                    Emergency Protocol
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed relative z-10">
                  To guarantee maximum response speed, Emergency Alerts bypass the 48-hour community validation voting phase. Local authorities are directly accountable for resolution and evidence upload.
                </p>
                <div className="absolute -right-6 -bottom-6 opacity-10">
                  <AlertCircle className="w-32 h-32" />
                </div>
              </div>
              {/* Assigned Authority */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-6 -top-6 opacity-10">
                  <Landmark className="w-32 h-32" />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 relative z-10">
                  Assigned Authority
                </p>
                <div className="relative z-10">
                  {report.assignedAuthority === "0x0000000000000000000000000000000000000000" ? (
                    <p className="text-base font-bold text-white/90">Pending Assignment</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-white">
                        {report.assignedAuthorityProfile ? report.assignedAuthorityProfile.name : "Official Representative"}
                      </p>
                      {report.assignedAuthorityProfile && (
                        <p className="text-sm text-blue-300 font-medium">
                          {report.assignedAuthorityProfile.position} &bull; {report.assignedAuthorityProfile.department}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </>
  );
}
