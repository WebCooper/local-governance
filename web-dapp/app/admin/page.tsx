"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";

export default function AuthorityAdminPage() {
  const { account, isAuthority, isConnecting, reportingContract, connectWallet } = useAdmin();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReports = async () => {
    if (!reportingContract) return;
    setIsLoading(true);
    try {
      // Fetch latest 20 reports
      const [page] = await reportingContract.getAllReports(0, 20);
      setReports(page);
    } catch (error) {
      console.error("Error fetching reports", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthority && reportingContract) {
      fetchReports();
    }
  }, [isAuthority, reportingContract]);

  const handleResolve = async (reportId: number) => {
    // Placeholder for resolving a report
    alert("Resolving functionality will be implemented soon!");
  };

  // If wallet is not connected
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
          <p className="text-slate-500 mb-8">Connect your wallet to access the city administration dashboard and manage civic reports.</p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-md transition-all flex justify-center items-center gap-2"
          >
            {isConnecting ? "Connecting..." : "Connect MetaMask"}
          </button>
        </div>
      </div>
    );
  }

  // If connected but NOT an authority
  if (!isAuthority) {
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
          <p className="text-slate-500 mb-8">This wallet address is not registered as an Authority on the blockchain.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Authority Dashboard</h1>
            <p className="text-sm text-slate-500">Manage City Infrastructure Reports</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 py-2 px-4 rounded-full border border-slate-200">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-mono text-slate-700">
            Authority: {account.slice(0, 6)}...{account.slice(-4)}
          </span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Active Civic Reports</h2>
            <p className="text-slate-500 mt-1">Review and manage issues reported by citizens.</p>
          </div>
          <button 
            onClick={fetchReports}
            className="text-green-600 hover:text-green-700 font-medium text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              No reports found in the system.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                    <th className="p-4 font-medium">ID</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Report Hash</th>
                    <th className="p-4 font-medium">Created</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono text-slate-900">#{Number(report.id)}</td>
                      <td className="p-4">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          Status: {Number(report.status)}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-sm text-slate-500 truncate max-w-[200px]">
                        {report.reportHash}
                      </td>
                      <td className="p-4 text-sm text-slate-500">
                        {new Date(Number(report.createdAt) * 1000).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleResolve(Number(report.id))}
                          className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
                        >
                          Resolve Issue
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
