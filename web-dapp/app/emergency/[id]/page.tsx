"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import MapPreview from "@/components/MapPreview";
import { useAdmin, EMERGENCY_REPORTING_ADDRESS, MULTISIG_ADDRESS } from "@/context/AdminContext";
import { EmergencyReportingABI, AuthorityMultiSigABI } from "@/lib/contracts/abis";
import { getEmergencyStatusMeta, shortenAddress, formatLocation, EMERGENCY_STATUS } from "@/lib/reportHelpers";
import {
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  Clock,
  MapPin,
  CheckCircle2,
  RotateCw,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  ExternalLink,
  FileText,
  Activity,
  Layers,
} from "lucide-react";

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
            const res = await fetch(`/api/ipfs/report/${base.ipfsCid}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.data) {
                const payload = data.data;
                setReport({
                  ...base,
                  title: payload.title || "Emergency Alert",
                  description: payload.description || "",
                  category: payload.category || "Emergency",
                  location: payload.location || "",
                  lat: payload.location_lat,
                  lng: payload.location_lng,
                  images: payload.images || [],
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-24 gap-3">
        <RotateCw className="w-10 h-10 text-red-600 animate-spin" />
        <p className="text-sm font-bold text-slate-600">
          Syncing emergency report #{id} from AuraChain...
        </p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 py-16 px-6">
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">
            Alert Not Found
          </h2>
          <p className="text-sm text-slate-600 mb-6">{error || "This report does not exist or has been removed."}</p>
          <Link
            href="/emergency"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Emergency Feed</span>
          </Link>
        </div>
      </div>
    );
  }

  const statusMeta = getEmergencyStatusMeta(report.status);
  const isAssigned =
    report.assignedAuthority &&
    report.assignedAuthority !== ethers.ZeroAddress;

  const createdAtDate = new Date(report.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Top Banner Strip */}
      <div className="h-2 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 w-full" />

      {/* Hero Header Section */}
      <div className="bg-white border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/emergency"
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Emergency Hub</span>
            </Link>

            <span className="text-xs font-mono font-medium text-slate-400">
              AuraChain Report ID: #{report.id}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                  EMERGENCY #{report.id}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                  {statusMeta.label}
                </span>

                {report.category && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                    {report.category}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {report.title || `Emergency Alert #${report.id}`}
              </h1>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-4 py-2 rounded-xl self-start md:self-center">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Submitted: {createdAtDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT 2 COLUMNS: Report Details, Images, Timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Incident Description
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {report.description || "No additional text description provided for this emergency alert."}
              </p>

              {/* Location Tag */}
              {report.location && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                  <span>Reported Location: {formatLocation(report.location)}</span>
                </div>
              )}
            </div>

            {/* Map Preview Component */}
            {report.lat !== undefined && report.lng !== undefined && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2">
                  Geographic Location Coordinates
                </h3>
                <div className="rounded-xl overflow-hidden border border-slate-100">
                  <MapPreview lat={report.lat} lng={report.lng} interactive={true} />
                </div>
              </div>
            )}

            {/* Evidence Image Gallery */}
            {report.images && report.images.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Citizen Photo Evidence ({report.images.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {report.images.map((img, i) => (
                    <div
                      key={i}
                      onClick={() => setActiveImage(img)}
                      className="rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 cursor-pointer hover:opacity-95 transition relative group shadow-sm"
                    >
                      <img
                        src={`data:${img.mimeType || "image/jpeg"};base64,${img.data}`}
                        alt={`Evidence ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <span className="text-white text-xs font-bold px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
                          View Fullsize
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Authority Action Log & Timeline */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-500" />
                Authority Response Timeline & Audit Log
              </h3>

              {actionsHistory.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100">
                  <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-500">
                    No authority actions recorded yet.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Once a local official starts response work or uploads resolution evidence, it will appear here on-chain.
                  </p>
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-8">
                  {actionsHistory.map((act, idx) => {
                    const actMeta = getEmergencyStatusMeta(act.stage);
                    const actionDate = new Date(act.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div key={idx} className="relative">
                        {/* Timeline node */}
                        <span
                          className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white ${actMeta.dot}`}
                        />

                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${actMeta.bg} ${actMeta.text} ${actMeta.border}`}
                            >
                              {actMeta.label}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {actionDate}
                            </span>
                          </div>

                          {/* Authority Name & Official Position */}
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <span>
                              {act.profile ? act.profile.name : shortenAddress(act.authority)}
                            </span>
                            {act.profile && (
                              <span className="text-slate-400 font-medium">
                                ({act.profile.position} &bull; {act.profile.department})
                              </span>
                            )}
                          </div>

                          {/* Action Comment */}
                          {act.commentText && (
                            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200/60 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                              {act.commentText}
                            </p>
                          )}

                          {/* Uploaded Action Evidence Photo */}
                          {act.imageCid && act.imageCid.length > 5 && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-sm aspect-video bg-slate-50">
                              <img
                                src={`/api/ipfs/image/${act.imageCid}`}
                                alt="Authority Proof Photo"
                                className="w-full h-full object-cover"
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

          {/* RIGHT COLUMN: Authority Dispatch & Protocol Info */}
          <div className="space-y-6">
            {/* Rapid Dispatch Status Card */}
            <div className="bg-white rounded-2xl border border-red-200/80 p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-red-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                Dispatch & Authority Status
              </h3>

              <div className="p-4 rounded-xl bg-red-50/50 border border-red-100 mb-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusMeta.dot}`} />
                  <span className="text-sm font-extrabold text-slate-900">
                    {statusMeta.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  {report.status === EMERGENCY_STATUS.Open
                    ? "Alert is logged on AuraChain and broadcasting to local authority dispatch centers."
                    : report.status === EMERGENCY_STATUS.InProgress
                    ? "An authority has initiated on-site response protocols."
                    : "The emergency has been officially verified as resolved."}
                </p>
              </div>

              {/* Assigned Authority Officer */}
              <div className="border-t border-slate-100 pt-4">
                <span className="text-xs font-bold text-slate-400 block mb-2">
                  Assigned Authority Official
                </span>
                {isAssigned ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {report.assignedAuthorityProfile
                          ? report.assignedAuthorityProfile.name
                          : shortenAddress(report.assignedAuthority)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {report.assignedAuthorityProfile
                          ? `${report.assignedAuthorityProfile.position} • ${report.assignedAuthorityProfile.department}`
                          : "Authorized Municipal Responder"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold">
                      Awaiting official authority assignment.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Cryptographic Proof Box */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                On-Chain Cryptographic Audit
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Smart Contract</span>
                  <span className="font-mono text-slate-700 font-semibold">EmergencyReporting</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Report ID</span>
                  <span className="font-mono text-slate-900 font-bold">#{report.id}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 font-medium">IPFS Metadata</span>
                  <span className="font-mono text-slate-700 truncate max-w-[150px]" title={report.ipfsCid}>
                    {report.ipfsCid ? `${report.ipfsCid.slice(0, 10)}...` : "None"}
                  </span>
                </div>
              </div>
            </div>

            {/* Protocol Notice */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-red-400">
                <ShieldAlert className="w-5 h-5" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider">
                  Emergency Protocol
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                To guarantee maximum response speed, Emergency Alerts bypass the 48-hour community validation voting phase. Local authorities are directly accountable for resolution and evidence upload.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-all duration-300"
          onClick={() => setActiveImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full h-full flex items-center justify-center">
            <img
              src={`data:${activeImage.mimeType};base64,${activeImage.data}`}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full px-4 py-2 text-xs font-bold backdrop-blur-sm transition"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
