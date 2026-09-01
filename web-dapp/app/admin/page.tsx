"use client";
 
import React, { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/context/AdminContext";
import { getPollingContract } from "@/lib/contracts/polling";
import axios from "axios";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useCitizen } from "@/context/CitizenContext";
import { RefreshCw, ChevronLeft, ChevronRight, BarChart2, FileText, Users, CheckCircle, Calendar, Plus, AlertTriangle, Search, Filter, LayoutGrid, Table, ArrowUpDown, Tag , Menu, X, Home } from "lucide-react";
import { ReportCard } from "@/components/admin/ReportCard";
import { EmergencyReportCard } from "@/components/admin/EmergencyReportCard";
import { AdminAnalyticsHeader } from "@/components/admin/AdminAnalyticsHeader";
import { ReportTableView } from "@/components/admin/ReportTableView";
import {
  rawToEnriched,
  enrichReportWithIPFS,
  ADMIN_STATUS_FILTERS,
  STATUS_MAP,
  type EnrichedReport,
  type StatusFilter,
} from "@/lib/reportHelpers";
import {
  getWorkers,
  getTasks,
  getPlankaUsers,
  registerWorker,
} from "@/lib/relayerAPI";


// ─── Poll Type ────────────────────────────────────────────────────────────────
interface PollStructure {
  id: number;
  title: string;
  description: string;
  options: string[];
  pollType: number;
  deadline: number;
  isActive: boolean;
  results?: number[];
}

const PAGE_SIZE = 10;

// ─── Filter tab accent colors ─────────────────────────────────────────────────
const FILTER_COLORS: Record<string, { active: string; border: string }> = {
  actionable:          { active: "text-green-700 border-green-600",  border: "border-green-600" },
  open:                { active: "text-blue-700 border-blue-600",    border: "border-blue-600" },
  inprogress:          { active: "text-indigo-700 border-indigo-600",border: "border-indigo-600" },
  pendingRejection:    { active: "text-orange-700 border-orange-500",border: "border-orange-500" },
  pendingVerification: { active: "text-purple-700 border-purple-600",border: "border-purple-600" },
  reopened:            { active: "text-slate-700 border-slate-600",  border: "border-slate-600" },
  all:                 { active: "text-slate-700 border-slate-600",  border: "border-slate-600" },
};

const ENABLE_WORKFORCE_TRACKING = process.env.NEXT_PUBLIC_ENABLE_WORKFORCE_TRACKING === "true";

import { Suspense } from "react";

// ─── Page Component ───────────────────────────────────────────────────────────
function AuthorityAdminContent() {
  const {
    account,
    isAuthority,
    isSuperAdmin,
    isConnecting,
    provider,
    reportingContract,
    emergencyReportingContract,
    connectWallet,
  } = useAdmin();

  const { wallet } = useCitizen();
  const [isFunding, setIsFunding] = useState(false);

  const handleTopUp = async () => {
    setIsFunding(true);
    const loadToast = toast.loading("Scanning wallet balances & topping up...");
    try {
      const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || "https://relayer.internalbuildtools.online";
      const response = await axios.post(`${relayerUrl}/funding/scan`);
      const { funded, skipped, errors } = response.data.data;

      const fundedCount = funded.length;
      const skippedCount = skipped.length;
      const errorCount = errors.length;

      let msg = `Scan complete. Topped up: ${fundedCount}, Skipped: ${skippedCount}`;
      if (errorCount > 0) {
        msg += `, Errors: ${errorCount}`;
      }

      if (fundedCount > 0) {
        toast.success(msg, { id: loadToast });
      } else {
        toast.success(`${msg} (All wallets have sufficient balance)`, { id: loadToast });
      }
    } catch (error: any) {
      console.error("Failed to trigger top-up scan:", error);
      toast.error(error.response?.data?.message || "Failed to trigger top-up scan.", { id: loadToast });
    } finally {
      setIsFunding(false);
    }
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports" | "polls" | "workforce" | "emergency">("dashboard");

  useEffect(() => {
    if (tabParam === "dashboard" || tabParam === "reports" || tabParam === "polls" || tabParam === "workforce" || tabParam === "emergency") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // ── Reports State ─────────────────────────────────────────────────────────
  const [allReports, setAllReports] = useState<EnrichedReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    ADMIN_STATUS_FILTERS[0] // default: Actionable
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "upvotes" | "duplicates">("newest");

  // ── Polls State ───────────────────────────────────────────────────────────
  const [polls, setPolls] = useState<PollStructure[]>([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [finalizingMap, setFinalizingMap] = useState<Record<number, boolean>>({});

  // ── Workforce State ───────────────────────────────────────────────────────
  const [workers, setWorkers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Record<number, any>>({});
  const [plankaUsers, setPlankaUsers] = useState<any[]>([]);
  const [workforceLoading, setWorkforceLoading] = useState(false);

  // Forms for registering workers
  const [newWorkerAddress, setNewWorkerAddress] = useState("");
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerDept, setNewWorkerDept] = useState("");
  const [newWorkerPlankaId, setNewWorkerPlankaId] = useState("");
  const [isRegisteringWorker, setIsRegisteringWorker] = useState(false);


  // ─── Fetch Reports ─────────────────────────────────────────────────────────
  const fetchReports = useCallback(
    async (pageOffset: number = 0) => {
      if (!reportingContract) return;
      setReportsLoading(true);
      try {
        const [page, total] = await reportingContract.getAllReports(
          pageOffset,
          PAGE_SIZE
        );
        const base: EnrichedReport[] = page.map((r: any) => rawToEnriched(r));
        setTotalReports(Number(total));
        setAllReports(base);

        // Kick off IPFS enrichment for each report in the background
        base.forEach(async (report, i) => {
          const enriched = await enrichReportWithIPFS(report);
          setAllReports((prev) => {
            const updated = [...prev];
            updated[i] = enriched;
            return updated;
          });
        });
      } catch (err) {
        console.error("Error fetching reports", err);
        toast.error("Failed to fetch reports from the blockchain.");
      } finally {
        setReportsLoading(false);
      }
    },
    [reportingContract]
  );

  // ─── Fetch Emergency Reports ───────────────────────────────────────────────
  const [emergencyReports, setEmergencyReports] = useState<EnrichedReport[]>([]);
  const [totalEmergencyReports, setTotalEmergencyReports] = useState(0);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyOffset, setEmergencyOffset] = useState(0);

  const fetchEmergencyReports = useCallback(
    async (pageOffset: number = 0) => {
      if (!emergencyReportingContract) return;
      setEmergencyLoading(true);
      try {
        const [page, total] = await emergencyReportingContract.getAllReports(
          pageOffset,
          PAGE_SIZE
        );
        const base: EnrichedReport[] = page.map((r: any) => rawToEnriched(r, true));
        setTotalEmergencyReports(Number(total));
        setEmergencyReports(base);

        base.forEach(async (report, i) => {
          const enriched = await enrichReportWithIPFS(report);
          setEmergencyReports((prev) => {
            const updated = [...prev];
            updated[i] = enriched;
            return updated;
          });
        });
      } catch (err) {
        console.error("Error fetching emergency reports", err);
        toast.error("Failed to fetch emergency reports from the blockchain.");
      } finally {
        setEmergencyLoading(false);
      }
    },
    [emergencyReportingContract]
  );

  // ─── Fetch Polls ───────────────────────────────────────────────────────────
  const fetchPolls = useCallback(async () => {
    if (!provider) return;
    setPollsLoading(true);
    try {
      const contract = getPollingContract(provider);
      const chainCount = Number(await contract.pollCount());
      const loadedPolls: PollStructure[] = [];

      for (let i = chainCount; i >= 1; i--) {
        const chainPoll = await contract.polls(i);
        let metaTitle = `Opinion Poll #${i}`;
        let metaDesc = "No description.";
        let metaOptions: string[] = ["False", "True"];

        try {
          const ipfsRes = await axios.get(
            `/api/ipfs/poll/${chainPoll.ipfsMetadataCid}`
          );
          if (ipfsRes.data) {
            metaTitle = ipfsRes.data.title;
            metaDesc = ipfsRes.data.description;
            metaOptions = ipfsRes.data.options;
          }
        } catch {}

        const optionCount =
          Number(chainPoll.pollType) === 0 ? 2 : metaOptions.length;
        const tally = await contract.getPollResults(i, optionCount);

        loadedPolls.push({
          id: i,
          title: metaTitle,
          description: metaDesc,
          options: metaOptions,
          pollType: Number(chainPoll.pollType),
          deadline: Number(chainPoll.deadline),
          isActive: chainPoll.isActive,
          results: tally.map((v: any) => Number(v)),
        });
      }

      setPolls(loadedPolls);
    } catch (err) {
      console.error("Error fetching polls", err);
      toast.error("Failed to fetch opinion polls from the blockchain.");
    } finally {
      setPollsLoading(false);
    }
  }, [provider]);

  const fetchWorkforceData = async () => {
    setWorkforceLoading(true);
    try {
      const workersRes = await getWorkers();
      const tasksRes = await getTasks();
      const pUsersRes = await getPlankaUsers();

      if (workersRes.success) setWorkers(workersRes.data);
      if (pUsersRes.success) setPlankaUsers(pUsersRes.data);
      if (tasksRes.success) {
        const taskMap: Record<number, any> = {};
        tasksRes.data.forEach((t: any) => {
          taskMap[t.reportId] = t;
        });
        setTasks(taskMap);
      }
    } catch (e) {
      console.error("Error fetching workforce data:", e);
      toast.error("Failed to load workforce tracking records from the relayer.");
    } finally {
      setWorkforceLoading(false);
    }
  };

  const handleRegisterWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerAddress || !newWorkerPlankaId || !newWorkerName || !newWorkerDept) {
      toast.error("Please fill in all fields.");
      return;
    }
    setIsRegisteringWorker(true);
    const loadToast = toast.loading("Registering workforce member...");
    try {
      const res = await registerWorker(
        newWorkerAddress,
        newWorkerName,
        newWorkerDept,
        newWorkerPlankaId
      );
      if (res.success) {
        toast.success("Worker mapped and registered successfully!", { id: loadToast });
        setNewWorkerAddress("");
        setNewWorkerName("");
        setNewWorkerDept("");
        setNewWorkerPlankaId("");
        fetchWorkforceData();
      } else {
        toast.error(res.message || "Failed to register worker.", { id: loadToast });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to register worker.", { id: loadToast });
    } finally {
      setIsRegisteringWorker(false);
    }
  };

  useEffect(() => {
    if (!isAuthority && !isSuperAdmin) return;
    if (activeTab === "reports" && reportingContract) fetchReports(0);
    else if (activeTab === "emergency" && emergencyReportingContract) fetchEmergencyReports(0);
    else if (activeTab === "polls" && provider) fetchPolls();
    else if (activeTab === "workforce" && ENABLE_WORKFORCE_TRACKING) fetchWorkforceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthority, isSuperAdmin, activeTab, reportingContract, emergencyReportingContract, provider]);



  // ─── Pagination Handlers ───────────────────────────────────────────────────
  const handleNextPage = () => {
    const newOffset = offset + PAGE_SIZE;
    if (newOffset < totalReports) {
      setOffset(newOffset);
      fetchReports(newOffset);
    }
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
    fetchReports(newOffset);
  };

  // ─── Action success handler ────────────────────────────────────────────────
  const handleActionSuccess = (reportId: number) => {
    fetchReports(offset);
  };

  // ─── Finalize Poll ─────────────────────────────────────────────────────────
  const handleFinalizePoll = async (pollId: number) => {
    if (!provider) return;
    setFinalizingMap((p) => ({ ...p, [pollId]: true }));
    const loadToast = toast.loading("Finalizing poll on-chain…");
    try {
      const signer = await provider.getSigner();
      const contract = getPollingContract(signer);
      const tx = await contract.finalizePoll(pollId);
      await tx.wait();
      toast.success("Poll finalized successfully!", { id: loadToast });
      fetchPolls();
    } catch (err: any) {
      toast.error(`Finalization failed: ${err.message}`, { id: loadToast });
    } finally {
      setFinalizingMap((p) => ({ ...p, [pollId]: false }));
    }
  };

  // ─── Filter & Sort reports ──────────────────────────────────────────────────
  const filteredReports = allReports
    .filter((r) => {
      // 1. Status Filter
      if (
        statusFilter.statuses.length > 0 &&
        !statusFilter.statuses.includes(r.status)
      ) {
        return false;
      }
      // 2. Category Filter
      if (
        categoryFilter !== "ALL" &&
        r.category?.toLowerCase() !== categoryFilter.toLowerCase()
      ) {
        return false;
      }
      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = r.title?.toLowerCase().includes(q);
        const matchesDesc = r.description?.toLowerCase().includes(q);
        const matchesLoc = r.location?.toLowerCase().includes(q);
        const matchesCat = r.category?.toLowerCase().includes(q);
        const matchesCid = r.ipfsCid?.toLowerCase().includes(q);
        const matchesId = r.id.toString() === q;
        if (
          !matchesTitle &&
          !matchesDesc &&
          !matchesLoc &&
          !matchesCat &&
          !matchesCid &&
          !matchesId
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "oldest") return a.createdAt - b.createdAt;
      if (sortBy === "upvotes")
        return (b.votes?.validationUpvotes || 0) - (a.votes?.validationUpvotes || 0);
      if (sortBy === "duplicates")
        return (
          (b.potentialDuplicates?.length || 0) -
          (a.potentialDuplicates?.length || 0)
        );
      return b.createdAt - a.createdAt; // "newest" default
    });

  const handleTableStartWork = async (id: number) => {
    if (!reportingContract) return;
    const loadToast = toast.loading("Starting work on report...");
    try {
      const tx = await reportingContract.startWork(id, "", "");
      await tx.wait();
      toast.success("Work started successfully!", { id: loadToast });
      fetchReports(offset);
    } catch (e: any) {
      toast.error(e.message || "Failed to start work", { id: loadToast });
    }
  };

  const handleTableResolve = async (id: number) => {
    if (!reportingContract) return;
    const loadToast = toast.loading("Marking report as solved...");
    try {
      const tx = await reportingContract.markAsSolved(id, "", "");
      await tx.wait();
      toast.success("Report marked as solved!", { id: loadToast });
      fetchReports(offset);
    } catch (e: any) {
      toast.error(e.message || "Failed to mark as solved", { id: loadToast });
    }
  };

  const handleTableReject = async (id: number) => {
    if (!reportingContract) return;
    const loadToast = toast.loading("Rejecting report...");
    try {
      const tx = await reportingContract.rejectIssue(id, "", "");
      await tx.wait();
      toast.success("Report rejected!", { id: loadToast });
      fetchReports(offset);
    } catch (e: any) {
      toast.error(e.message || "Failed to reject report", { id: loadToast });
    }
  };

  const totalPages = Math.ceil(totalReports / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // ─── Access Guards ─────────────────────────────────────────────────────────
  if (wallet) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Please log out of your Citizen session to access the Authority portal.
          </p>
          <Link href="/profile" className="inline-block w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors text-center">
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
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Authority Portal</h1>
          <p className="text-slate-500 mb-8">
            Connect your wallet to access the city administration dashboard and manage civic reports &amp; polls.
          </p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-md transition-all flex justify-center items-center gap-2"
          >
            {isConnecting ? "Connecting…" : "Connect MetaMask"}
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthority && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6 font-mono text-sm break-all bg-slate-50 p-3 rounded">{account}</p>
          <p className="text-slate-500 mb-8">This wallet address is not registered as an Admin or Authority on the blockchain.</p>
        </div>
      </div>
    );
  }


  const topUpAndWalletPills = (
    <>
      <button 
        onClick={handleTopUp}
        disabled={isFunding}
        className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-5 rounded-full transition-all shadow-sm flex items-center gap-2 text-sm disabled:opacity-50">
        <span className="bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold text-[10px]">
          {isFunding ? (
            <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </span>
        {isFunding ? "Scanning..." : "Top-Up Gas Wallets"}
      </button>
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 text-white">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        {account.slice(0, 6)}…{account.slice(-4)}
      </div>
    </>
  );

  // ─── Main Dashboard ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          
        {/* ── DASHBOARD TAB ───────────────────────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-8 md:p-10 text-white relative shadow-lg">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <LayoutGrid className="w-48 h-48" />
              </div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-indigo-300">Overview</p>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
                Global Command Center
              </h1>
              <p className="text-sm text-slate-300 max-w-xl leading-relaxed mb-6">
                Monitor all municipal activity, triage incoming emergencies, and manage civic reports across the district from a single vantage point.
              </p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <button
                  onClick={() => {
                    setOffset(0);
                    fetchReports(0);
                    fetchEmergencyReports(0);
                    fetchPolls();
                  }}
                  className="bg-white text-slate-900 font-bold py-2.5 px-6 rounded-full transition-all flex items-center gap-2 text-sm shadow-md hover:bg-slate-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sync All Data
                </button>
                <button
                  onClick={handleTopUp}
                  disabled={isFunding}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-full transition-all flex items-center gap-2 text-sm shadow-md disabled:opacity-50"
                >
                  {isFunding ? "Scanning..." : "Top-Up Gas"}
                </button>
              </div>
            </div>

            {/* Global Insights */}
            <AdminAnalyticsHeader
              totalReports={allReports.length}
              solvedCount={allReports.filter((r) => r.status === 6).length}
              openCount={allReports.filter((r) => r.status === 2 || r.status === 7).length}
              inProgressCount={allReports.filter((r) => r.status === 3).length}
              emergencyCount={totalEmergencyReports}
              onSelectEmergencyTab={() => setActiveTab("emergency")}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-2 space-y-6">
                  {/* We can put some quick shortcuts or recently actionable items here */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                       <AlertTriangle className="w-5 h-5 text-rose-500" /> Actionable Urgent Items
                    </h2>
                    <p className="text-sm text-slate-500">
                      You have {totalEmergencyReports} total emergency alerts on record. Navigate to the Emergency Alerts tab to resolve them.
                    </p>
                  </div>
               </div>
               <div className="lg:col-span-1">
                  {/* We can move the Map Workforce Member here or just leave a nice summary */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 bg-gradient-to-br from-indigo-50 to-white">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
                       <Users className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-slate-900">Workforce Management</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                       Manage assignments, link Ethereum wallets to Planka accounts, and track resolution teams.
                    </p>
                    <button onClick={() => setActiveTab('workforce')} className="w-full mt-2 bg-indigo-600 text-white font-bold py-2 rounded-xl text-sm shadow-sm hover:bg-indigo-700 transition-colors">
                       Manage Crews
                    </button>
                  </div>
               </div>
            </div>
          </div>
        )}


        {/* ── REPORTS TAB ───────────────────────────────────────────────────── */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            {/* 0. Gradient Banner for Civic Reports */}
            <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-800 p-8 md:p-10 text-white relative shadow-sm flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <FileText className="w-48 h-48" />
              </div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-emerald-200">Civic Reports</p>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
                Community Issues
              </h1>
              <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
                Review, triage, and assign municipal issues reported by citizens. Keep the community informed of resolution progress.
              </p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <button
                  onClick={() => {
                    setOffset(0);
                    fetchReports(0);
                  }}
                  className="bg-white text-emerald-900 font-bold py-2.5 px-6 rounded-full transition-all flex items-center gap-2 text-sm shadow-md hover:bg-emerald-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Data
                </button>
              </div>
            </div>

            {/* Civic Reports Specific Insights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Reports</p>
                <p className="text-2xl font-black text-slate-800">{allReports.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Solved</p>
                <p className="text-2xl font-black text-emerald-700">{allReports.filter((r) => r.status === 6).length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Open / Actionable</p>
                <p className="text-2xl font-black text-blue-700">{allReports.filter((r) => r.status === 2 || r.status === 7).length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">In Progress</p>
                <p className="text-2xl font-black text-indigo-700">{allReports.filter((r) => r.status === 3).length}</p>
              </div>
            </div>

            {/* 2. Advanced Multi-Dimension Filtering & Search Bar */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm mb-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search report title, description, location, ID, or IPFS CID..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Category Dropdown */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="Roads">Roads</option>
                    <option value="Streetlights">Streetlights</option>
                    <option value="Sanitation">Sanitation</option>
                    <option value="Water">Water</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Corruption">Corruption</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Sort By Dropdown */}
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-4 h-4 text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
                  >
                    <option value="newest">Sort: Newest First</option>
                    <option value="oldest">Sort: Oldest First</option>
                    <option value="upvotes">Sort: Highest Upvotes</option>
                    <option value="duplicates">Sort: Most Duplicates</option>
                  </select>
                </div>

                {/* View Mode Switcher (Card vs Table) */}
                <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
                  <button
                    onClick={() => setViewMode("card")}
                    title="Card Grid View"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === "card"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    title="Dense Triage Table View"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === "table"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Status Filter Pills */}
            <div className="flex items-center flex-wrap gap-2 mb-6">
              {ADMIN_STATUS_FILTERS.map((filter) => {
                const isActive = statusFilter.key === filter.key;
                const colors = FILTER_COLORS[filter.key] ?? FILTER_COLORS.all;
                const count =
                  filter.statuses.length === 0
                    ? allReports.length
                    : allReports.filter((r) =>
                        filter.statuses.includes(r.status)
                      ).length;

                return (
                  <button
                    key={filter.key}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      isActive
                        ? `${colors.active} border-current bg-white shadow-sm scale-[1.02]`
                        : "text-slate-500 border-slate-200 bg-white hover:border-slate-300 hover:text-slate-700"
                    }`}
                  >
                    {filter.label}
                    {count > 0 && (
                      <span className="ml-1.5 opacity-70">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 4. Reports View (Card Grid or Triage Table) */}
            {reportsLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-medium">Loading reports…</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400 bg-white rounded-2xl border border-slate-200/80 p-8">
                <FileText className="w-16 h-16 text-slate-300" />
                <p className="font-semibold text-slate-600 text-sm">
                  {allReports.length === 0
                    ? "No reports found on-chain."
                    : `No reports match your active filters (${statusFilter.label}${
                        categoryFilter !== "ALL" ? ` / ${categoryFilter}` : ""
                      }${searchQuery ? ` / "${searchQuery}"` : ""}).`}
                </p>
                {(statusFilter.key !== "all" ||
                  categoryFilter !== "ALL" ||
                  searchQuery) && (
                  <button
                    onClick={() => {
                      setStatusFilter(
                        ADMIN_STATUS_FILTERS[ADMIN_STATUS_FILTERS.length - 1]
                      );
                      setCategoryFilter("ALL");
                      setSearchQuery("");
                    }}
                    className="text-xs text-blue-600 font-bold hover:underline"
                  >
                    Reset all filters & search
                  </button>
                )}
              </div>
            ) : viewMode === "table" ? (
              <ReportTableView
                reports={filteredReports}
              onStartWork={handleTableStartWork}
                onResolve={handleTableResolve}
                onReject={handleTableReject}
                onViewDetails={(report) => {
                  window.location.href = `/admin/reports/${report.id}`;
                }}
              />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredReports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    currentAccount={account}
                    reportingContract={reportingContract}
                    onActionSuccess={handleActionSuccess}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalReports > PAGE_SIZE && (
              <div className="mt-8 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Page <span className="font-bold text-slate-700">{currentPage}</span> of{" "}
                  <span className="font-bold text-slate-700">{totalPages}</span> — {totalReports} total reports
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={offset === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={offset + PAGE_SIZE >= totalReports}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EMERGENCY REPORTS TAB ─────────────────────────────────────────── */}
        {activeTab === "emergency" && (
          <div className="space-y-6">
            <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-br from-rose-600 via-red-700 to-red-900 p-8 md:p-10 text-white relative shadow-sm flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <AlertTriangle className="w-48 h-48 animate-[pulse_2s_ease-in-out_infinite]" />
              </div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-rose-200">Emergency Response</p>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
                Urgent Alerts
              </h1>
              <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
                Direct channel for high-priority incidents, hazards, and infrastructure failures. Immediate action required.
              </p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <button
                  onClick={() => {
                    setEmergencyOffset(0);
                    fetchEmergencyReports(0);
                  }}
                  className="bg-white text-red-900 font-bold py-2.5 px-6 rounded-full transition-all flex items-center gap-2 text-sm shadow-md hover:bg-rose-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Alerts
                </button>
              </div>
            </div>
            
            {/* Emergency Insights */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm bg-gradient-to-br from-rose-50 to-white">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Active Alerts</p>
                <p className="text-2xl font-black text-rose-700">{emergencyReports.filter(r => r.status !== 6).length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Recorded</p>
                <p className="text-2xl font-black text-slate-800">{totalEmergencyReports}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Resolved Threats</p>
                <p className="text-2xl font-black text-emerald-700">{emergencyReports.filter(r => r.status === 6).length}</p>
              </div>
            </div>

            {emergencyLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-medium">Loading emergency reports…</p>
              </div>
            ) : emergencyReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
                <AlertTriangle className="w-16 h-16 text-slate-300" />
                <p className="font-semibold text-slate-500">No emergency reports found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {emergencyReports.map((report) => (
                  <EmergencyReportCard
                    key={report.id}
                    report={report}
                    currentAccount={account}
                    emergencyReportingContract={emergencyReportingContract}
                    onActionSuccess={() => fetchEmergencyReports(emergencyOffset)}
                  />
                ))}
              </div>
            )}

            {totalEmergencyReports > PAGE_SIZE && (
              <div className="mt-8 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Page <span className="font-bold text-slate-700">{Math.floor(emergencyOffset / PAGE_SIZE) + 1}</span> of{" "}
                  <span className="font-bold text-slate-700">{Math.ceil(totalEmergencyReports / PAGE_SIZE)}</span> — {totalEmergencyReports} total emergency reports
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newOffset = Math.max(0, emergencyOffset - PAGE_SIZE);
                      setEmergencyOffset(newOffset);
                      fetchEmergencyReports(newOffset);
                    }}
                    disabled={emergencyOffset === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      const newOffset = emergencyOffset + PAGE_SIZE;
                      if (newOffset < totalEmergencyReports) {
                        setEmergencyOffset(newOffset);
                        fetchEmergencyReports(newOffset);
                      }
                    }}
                    disabled={emergencyOffset + PAGE_SIZE >= totalEmergencyReports}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── POLLS TAB ─────────────────────────────────────────────────────── */}
        {activeTab === "polls" && (
          <div className="space-y-6">
            <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-indigo-900 p-8 md:p-10 text-white relative shadow-sm flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <BarChart2 className="w-48 h-48" />
              </div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-blue-200">Community Polling</p>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
                Opinion Polls
              </h1>
              <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
                Create and manage local governance polls. Measure public sentiment on upcoming projects or budgetary decisions.
              </p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <Link
                  href="/polls/create"
                  className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold px-5 py-2.5 rounded-full transition-all text-sm shadow-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create Poll
                </Link>
                <button
                  onClick={fetchPolls}
                  className="bg-white/20 text-white border border-white/30 font-bold py-2.5 px-6 rounded-full transition-all flex items-center gap-2 text-sm shadow-sm hover:bg-white/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Polls
                </button>
              </div>
            </div>
            
            {/* Polls Insights */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Active Polls</p>
                <p className="text-2xl font-black text-indigo-700">{polls.filter(p => p.isActive).length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Created</p>
                <p className="text-2xl font-black text-slate-800">{polls.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Finalized</p>
                <p className="text-2xl font-black text-emerald-700">{polls.filter(p => !p.isActive).length}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {pollsLoading ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  Syncing poll ledger…
                </div>
              ) : polls.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <BarChart2 className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  No opinion polls found in the system.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                        <th className="p-4 font-medium">ID</th>
                        <th className="p-4 font-medium">Title</th>
                        <th className="p-4 font-medium">Type</th>
                        <th className="p-4 font-medium">Results / Distribution</th>
                        <th className="p-4 font-medium">Deadline</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {polls.map((poll) => {
                        const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
                        const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
                        const isOpen = poll.isActive && !isExpired;

                        return (
                          <tr key={poll.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono text-slate-900">#{poll.id}</td>
                            <td className="p-4 font-medium text-slate-900 max-w-[200px] truncate" title={poll.title}>
                              {poll.title}
                            </td>
                            <td className="p-4 text-sm text-slate-500">
                              {poll.pollType === 0 ? "Yes / No" : "Multi-Choice"}
                            </td>
                            <td className="p-4 min-w-[200px]">
                              {!isOpen ? (
                                <div className="space-y-1.5 w-full">
                                  <div className="flex justify-between text-xs text-slate-600 font-semibold">
                                    <span>Total: {totalVotes} votes</span>
                                  </div>
                                  <div className="flex gap-1 w-full max-w-[180px]">
                                    {poll.options.map((opt, oIdx) => {
                                      const count = poll.results?.[oIdx] || 0;
                                      const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                                      return (
                                        <div
                                          key={oIdx}
                                          style={{ width: `${Math.max(8, pct)}%` }}
                                          title={`${opt}: ${count} votes (${Math.round(pct)}%)`}
                                          className={`h-2.5 rounded-full ${
                                            poll.pollType === 0
                                              ? oIdx === 0 ? "bg-rose-500" : "bg-emerald-500"
                                              : oIdx % 4 === 0 ? "bg-blue-500" : oIdx % 4 === 1 ? "bg-indigo-500" : oIdx % 4 === 2 ? "bg-sky-500" : "bg-violet-500"
                                          }`}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Results hidden until closed</span>
                              )}
                            </td>
                            <td className="p-4 text-xs text-slate-500">
                              {new Date(poll.deadline * 1000).toLocaleString()}
                            </td>
                            <td className="p-4">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                isOpen
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}>
                                {isOpen ? "Active" : "Closed"}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              {poll.isActive && isExpired ? (
                                <button
                                  disabled={finalizingMap[poll.id]}
                                  onClick={() => handleFinalizePoll(poll.id)}
                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
                                >
                                  {finalizingMap[poll.id] ? "Finalizing…" : "Finalize Poll"}
                                </button>
                              ) : poll.isActive ? (
                                <span className="text-xs text-slate-400 italic font-medium">Running…</span>
                              ) : (
                                <span className="text-xs text-green-600 font-bold flex items-center justify-end gap-1">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Completed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── WORKFORCE TAB ─────────────────────────────────────────────────── */}
        {activeTab === "workforce" && ENABLE_WORKFORCE_TRACKING && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 animate-in fade-in duration-300">
            {/* Left: Workers List */}
            <div className="space-y-6">
              <div className="w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-800 p-8 md:p-10 text-white relative shadow-sm flex flex-col justify-center">
                <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                  <svg className="w-48 h-48 animate-[pulse_4s_ease-in-out_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-wider uppercase bg-white/20 text-white border border-white/30 mb-4 shadow-sm w-max backdrop-blur-sm">
                  <Users className="w-3.5 h-3.5" />
                  Workforce Management
                </div>
                <h2 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-[1.15]">
                  Workforce Tracking
                </h2>
                <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
                  Directory of registered workers and their Planka configurations. Link Ethereum addresses to task managers.
                </p>
                <div className="flex items-center gap-4 relative z-10 flex-wrap">
                  <button
                    onClick={fetchWorkforceData}
                    className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-bold py-2.5 px-5 rounded-full transition-all flex items-center gap-2 text-sm shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </button>
                  {topUpAndWalletPills}
                </div>
              </div>

              {workforceLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500 font-medium">Syncing workforce ledger…</p>
                </div>
              ) : workers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-slate-400">
                  <Users className="w-16 h-16 text-slate-300 animate-pulse" />
                  <p className="font-semibold text-slate-500">No registered workers found.</p>
                  <p className="text-sm text-slate-400 text-center max-w-xs">Map a worker wallet address to a Planka user in the panel on the right.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workers.map((worker) => {
                    const assignedTasks = Object.values(tasks).filter(
                      (t) => t.assignedWorkerAddress?.toLowerCase() === worker.walletAddress?.toLowerCase()
                    );

                    return (
                      <div key={worker.walletAddress} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Users className="w-6 h-6 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">{worker.name}</h3>
                            <p className="text-[10px] text-slate-500 font-medium">{worker.department}</p>
                          </div>
                          <span className="ml-auto bg-purple-50 text-purple-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-purple-100">
                            {assignedTasks.length} Active Task{assignedTasks.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                          <div className="flex justify-between">
                            <span className="font-medium text-slate-400">Wallet</span>
                            <span className="font-mono text-slate-800">{worker.walletAddress.slice(0, 8)}...{worker.walletAddress.slice(-6)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-slate-400">Planka User ID</span>
                            <span className="font-mono text-slate-800">{worker.plankaUserId.slice(0, 8)}...</span>
                          </div>
                        </div>

                        {assignedTasks.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Assigned Reports:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {assignedTasks.map((t) => (
                                <Link
                                  key={t.reportId}
                                  href={`/admin/reports/${t.reportId}`}
                                  className="px-2 py-1 bg-slate-50 border border-slate-200 text-[10px] font-bold rounded-lg text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors flex items-center gap-1"
                                >
                                  Report #{t.reportId}
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    t.priority === 'HIGH' ? 'bg-red-500' : t.priority === 'MEDIUM' ? 'bg-orange-400' : 'bg-green-400'
                                  }`} title={`Priority: ${t.priority}`} />
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Map Worker Panel */}
            <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-purple-600" />
                  Map Workforce Member
                </h3>
                <p className="text-slate-500 text-xs">
                  Link a faculty worker&apos;s Ethereum wallet address with their user account in the self-hosted Planka task manager.
                </p>

                <form onSubmit={handleRegisterWorker} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Subodha Gunawardena"
                      value={newWorkerName}
                      onChange={(e) => setNewWorkerName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-800 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Department
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Electrical Engineering"
                      value={newWorkerDept}
                      onChange={(e) => setNewWorkerDept(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-800 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Wallet Address
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="0x..."
                      value={newWorkerAddress}
                      onChange={(e) => setNewWorkerAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-mono text-xs text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Planka User Account
                    </label>
                    <select
                      required
                      value={newWorkerPlankaId}
                      onChange={(e) => setNewWorkerPlankaId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium text-slate-800 font-sans"
                    >
                      <option value="">Select Planka Account</option>
                      {plankaUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isRegisteringWorker}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isRegisteringWorker ? "Mapping..." : "Register & Map Worker"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AuthorityAdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <AuthorityAdminContent />
    </Suspense>
  );
}
