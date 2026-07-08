"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { useCitizen } from "@/context/CitizenContext";
import {
  Shield, FileText, RotateCw, AlertCircle, ChevronRight,
  Bell, Globe, Moon, HelpCircle, LogOut, MapPin, Calendar,
  Plus, Share2, Lock, CheckCircle2, Clock, RefreshCw,
} from "lucide-react";

const REPORTING_ABI = [
  "function getReportsByCitizen(bytes32 citizenPseudonym, uint256 offset, uint256 limit) view returns (tuple(uint256 id, string ipfsCid, bytes32 reportHash, bytes32 submissionNullifier, bytes32 citizenPseudonym, address submittedByRelayer, uint8 status, uint256 createdAt, uint256 updatedAt, uint256 phaseDeadline, address assignedAuthority, tuple(uint256 validationUpvotes, uint256 validationDownvotes, uint256 verificationAcceptVotes, uint256 verificationRejectVotes, uint256 rejectionUpholdVotes, uint256 rejectionAppealVotes) votes)[] page, uint256 total)",
];

interface FetchedReport {
  id: string;
  ipfsCid: string;
  status: number;
  timestamp: number;
  description?: string;
  category?: string;
}

function extractCid(raw: string): string | null {
  if (!raw || raw === "ipfs://none") return null;
  const first = raw.split(",")[0].trim();
  return first.startsWith("ipfs://") ? first.slice(7) : first;
}

async function fetchIpfsMetadata(
  report: FetchedReport
): Promise<Partial<FetchedReport>> {
  const cid = extractCid(report.ipfsCid);
  if (!cid) return {};
  try {
    const res = await fetch(`/api/ipfs/${cid}`);
    if (!res.ok) return {};
    const data = await res.json();
    if (!data.success) return {};
    return {
      description: data.description ?? "No description",
      category: data.category ?? "GENERAL",
    };
  } catch {
    return {};
  }
}

function getCitizenLevel(count: number) {
  if (count >= 21) return { level: 5, label: "Elite Guardian" };
  if (count >= 11) return { level: 4, label: "Gold Guardian" };
  if (count >= 6)  return { level: 3, label: "Active Citizen" };
  if (count >= 3)  return { level: 2, label: "Contributor" };
  return { level: 1, label: "New Citizen" };
}

function getStatusLabel(status: number) {
  const map: Record<number, { label: string; color: string; bg: string }> = {
    0: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100" },
    1: { label: "Rejected", color: "text-red-700", bg: "bg-red-100" },
    2: { label: "Open", color: "text-blue-700", bg: "bg-blue-100" },
    3: { label: "In Progress", color: "text-indigo-700", bg: "bg-indigo-100" },
    4: { label: "Under Review", color: "text-orange-700", bg: "bg-orange-100" },
    5: { label: "In Review", color: "text-purple-700", bg: "bg-purple-100" },
    6: { label: "Resolved", color: "text-green-700", bg: "bg-green-100" },
    7: { label: "Reopened", color: "text-slate-700", bg: "bg-slate-100" },
  };
  return map[status] ?? { label: "Unknown", color: "text-slate-600", bg: "bg-slate-100" };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function ProfilePage() {
  const { wallet, availableTicketsCount, logout } = useCitizen();
  const [pseudonym, setPseudonym] = useState<string | null>(null);
  const [reports, setReports] = useState<FetchedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const ethersWallet = new ethers.Wallet(wallet.privateKey);
        const timestamp = Date.now();
        const challenge = `get-pseudonym:${wallet.publicKey}:${timestamp}`;
        const signature = await ethersWallet.signMessage(challenge);
        const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "https://relayer.internalbuildtools.online";
        const res = await fetch(`${RELAYER_URL}/report/my-pseudonym`, {
          headers: { Authorization: `${wallet.publicKey}:${timestamp}:${signature}` },
        });
        if (!res.ok) throw new Error("Failed to retrieve pseudonym");
        const data = await res.json();
        setPseudonym(data.pseudonym);
        const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
        const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
        if (CONTRACT_ADDRESS) {
          const provider = new ethers.JsonRpcProvider(RPC_URL);
          const contract = new ethers.Contract(CONTRACT_ADDRESS, REPORTING_ABI, provider);
          const [arr] = await contract.getReportsByCitizen(data.pseudonym, 0, 50);
          const baseReports: FetchedReport[] = arr.map((r: any) => ({
            id: r.id.toString(),
            ipfsCid: r.ipfsCid,
            status: Number(r.status),
            timestamp: Number(r.createdAt) * 1000,
          }));
          
          const reversedBase = baseReports.reverse();
          const enriched = await Promise.all(
            reversedBase.map(async (r) => ({
              ...r,
              ...(await fetchIpfsMetadata(r)),
            }))
          );
          
          setReports(enriched);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet]);

  const citizenInfo = getCitizenLevel(reports.length);
  const resolved   = reports.filter(r => r.status === 6).length;
  const recentTwo  = reports.slice(0, 2);
  const joinDate   = reports.length > 0 ? formatDate(reports[reports.length - 1].timestamp) : "—";
  const shortAddr  = wallet ? `${wallet.publicKey.slice(0, 6)}...${wallet.publicKey.slice(-4)}` : "—";
  const shortPseud = pseudonym ? `aura_${pseudonym.slice(2, 8)}_node` : "—";
  const repScore   = Math.min(100, reports.length * 4 + resolved * 2);

  // ── Not logged in ──────────────────────────────────────────────
  if (!wallet && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4 text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
          <Shield className="h-8 w-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Not Authenticated</h2>
        <p className="text-slate-500 text-sm mb-6">Log in with your GovID to view your citizen profile.</p>
        <Link href="/auth" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* ══════════════════════════════════════════════
          MOBILE LAYOUT
      ══════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen bg-slate-50 pb-28">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <h1 className="text-lg font-bold text-slate-900">Citizen Profile</h1>
          <button className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <Shield className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Avatar + Identity */}
        <div className="flex flex-col items-center px-4 py-6">
          <div className="relative mb-4">
            <img src="/avatar_1.png" alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md" />
            <div className="absolute bottom-1 right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Anonymous Citizen</h2>
          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full uppercase tracking-wide mb-2">
            {citizenInfo.label}
          </span>
          <p className="text-slate-500 text-sm">Digital Identity ID: {shortAddr}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RotateCw className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="mx-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3 text-sm text-red-600">
            <AlertCircle className="h-5 w-5 shrink-0" /> {error}
          </div>
        ) : (
          <div className="px-4 space-y-4">
            {/* Personal Info Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900">Personal Information</h3>
                <button className="text-slate-400 hover:text-slate-600 transition-colors">
                  <Shield className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                {[
                  { label: "ANONYMOUS ID", value: shortPseud },
                  { label: "CITIZENSHIP TIER", value: `${citizenInfo.label} (Lvl ${citizenInfo.level})` },
                  { label: "ZK TICKETS LEFT", value: `${availableTicketsCount} remaining` },
                  { label: "JOIN DATE", value: joinDate },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{item.label}</p>
                    <p className="text-sm font-semibold text-slate-800">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* My Reports CTA */}
            <Link href="/my-reports" className="block bg-blue-600 rounded-2xl p-5 text-white hover:bg-blue-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <ChevronRight className="h-5 w-5 opacity-70" />
              </div>
              <h3 className="text-lg font-bold mb-1">My Reports</h3>
              <p className="text-blue-100 text-sm leading-relaxed">
                Manage and track your active governance submissions and community feedback.
              </p>
            </Link>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Submitted", value: reports.length },
                { label: "Resolved", value: resolved },
                { label: "Rep Score", value: `${repScore}%` },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Menu items */}
            {[
              { icon: <Shield className="h-5 w-5 text-blue-600" />, label: "Privacy & Security", desc: "Encryption keys, biometric auth, and ledger transparency." },
              { icon: <Bell className="h-5 w-5 text-blue-600" />, label: "Notification Settings", desc: "Configure alerts for voting windows and report updates." },
              { icon: <HelpCircle className="h-5 w-5 text-blue-600" />, label: "Help & Support", desc: "Citizen guidelines, technical docs, and direct support." },
            ].map(item => (
              <button key={item.label} className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{item.label}</p>
                  <p className="text-xs text-slate-400 leading-relaxed mt-0.5 line-clamp-1">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </button>
            ))}

            {/* Logout */}
            <button
              onClick={logout}
              className="w-full bg-white rounded-2xl border border-red-100 shadow-sm p-4 flex items-center gap-4 text-left hover:bg-red-50 transition-colors"
            >
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                <LogOut className="h-5 w-5 text-red-500" />
              </div>
              <p className="font-semibold text-red-600 text-sm">Sign Out</p>
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          DESKTOP LAYOUT
      ══════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col w-full min-h-screen">
        <div className="px-8 pt-6 pb-4">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-1">Profile Dashboard</h1>
          <p className="text-slate-500 text-sm">Your anonymous civic identity and governance activity.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <RotateCw className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <p className="text-slate-500 text-sm">Verifying cryptographic session…</p>
          </div>
        ) : error ? (
          <div className="mx-8 p-5 bg-red-50 border border-red-100 rounded-2xl flex gap-3 text-sm text-red-600">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /> {error}
          </div>
        ) : (
          <div className="px-8 pb-8 space-y-5">

            {/* ── Profile Header Card ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center gap-6">
              <div className="relative shrink-0">
                <img src="/avatar_1.png" alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow" />
                <div className="absolute bottom-1 right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-extrabold text-slate-900">Anonymous Citizen</h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                    Citizen Level {citizenInfo.level}
                  </span>
                </div>
                <p className="text-slate-500 text-sm mb-3">
                  Zero-knowledge identity active. Contributing to decentralized governance protocols via AuraChain.
                </p>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">
                    <Shield className="h-3.5 w-3.5 text-blue-500" /> AURA-{shortAddr}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-blue-500" /> ZK Protected
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">
                    <Calendar className="h-3.5 w-3.5 text-blue-500" /> Since {joinDate}
                  </span>
                </div>
              </div>
              <button className="px-5 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm shrink-0">
                Edit Public Profile
              </button>
            </div>

            {/* ── Middle Row ── */}
            <div className="grid grid-cols-2 gap-5">

              {/* Account Summary */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-xl font-bold text-slate-900 mb-5">Account Summary</h3>
                <div className="space-y-4 mb-5">
                  {[
                    {
                      icon: <FileText className="h-5 w-5 text-slate-500" />,
                      label: "Reports Submitted", value: reports.length,
                      badge: reports.length > 0 ? `+${Math.min(3, reports.length)} this month` : null,
                    },
                    {
                      icon: <CheckCircle2 className="h-5 w-5 text-slate-500" />,
                      label: "Resolved", value: resolved,
                      badge: resolved > 0 ? "Community impact" : null,
                    },
                    {
                      icon: <Lock className="h-5 w-5 text-slate-500" />,
                      label: "ZK Tickets Left", value: availableTicketsCount,
                      badge: "Anonymous submissions",
                    },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-400 font-medium">{item.label}</p>
                        <p className="text-2xl font-extrabold text-slate-900">{item.value}</p>
                      </div>
                      {item.badge && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{item.badge}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
                    <span>Governance Participation</span>
                    <span className="font-bold text-blue-600">{repScore}% Reputation Score</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${repScore}%` }} />
                  </div>
                </div>
              </div>

              {/* Recent Reports */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-bold text-slate-900">Recent Reports</h3>
                  <Link href="/my-reports" className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1">
                    View Archive <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>

                {recentTwo.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                    <FileText className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-slate-500 text-sm">No reports submitted yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 mb-5 flex-1">
                    {recentTwo.map(r => {
                      const s = getStatusLabel(r.status);
                      return (
                        <div key={r.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.bg} ${s.color}`}>{s.label}</span>
                            <span className="text-[10px] text-slate-400">{timeAgo(r.timestamp)}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 mb-1 line-clamp-1">{r.category || "Loading..."}</p>
                          <p className="text-xs text-slate-500 line-clamp-2">{r.description || "Loading..."}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Link
                  href="/report"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <Plus className="h-4 w-4" /> Submit New Report
                </Link>
              </div>
            </div>

            {/* ── Bottom Row ── */}
            <div className="grid grid-cols-2 gap-5">

              {/* Security Settings */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
                    <Lock className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Security Settings</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">ZKP Verification Status</p>
                        <p className="text-xs text-slate-400">Zero-Knowledge Proof active for all interactions</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wide">● Encrypted</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Anonymous Citizen ID</p>
                        <p className="text-xs text-slate-400">Proxy: {shortPseud}</p>
                      </div>
                    </div>
                    <div className="w-11 h-6 bg-blue-600 rounded-full flex items-center justify-end px-1 cursor-pointer">
                      <div className="w-4 h-4 bg-white rounded-full shadow" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Preferences */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-5">Preferences</h3>
                <div className="divide-y divide-slate-100">
                  {[
                    { icon: <Bell className="h-4 w-4 text-slate-500" />, label: "Notification Channels", value: null },
                    { icon: <Globe className="h-4 w-4 text-slate-500" />, label: "Protocol Language", value: "English (US)" },
                    { icon: <Moon className="h-4 w-4 text-slate-500" />, label: "Interface Theme", value: "Light (Auto)" },
                    { icon: <Share2 className="h-4 w-4 text-slate-500" />, label: "Data Sharing", value: "Private" },
                  ].map(item => (
                    <button key={item.label} className="w-full flex items-center justify-between py-3.5 text-sm hover:bg-slate-50 transition-colors -mx-1 px-1 rounded-lg">
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span className="font-medium text-slate-700">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        {item.value && <span className="text-xs font-semibold text-blue-600">{item.value}</span>}
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={logout}
                  className="mt-4 w-full py-2.5 border border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-auto px-8 py-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-4">
            <span className="font-bold text-blue-600 text-base">AuraChain</span>
            <span>© 2024 AuraChain. Decentralized Governance for the People.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="#" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Whitepaper</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">Support</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
