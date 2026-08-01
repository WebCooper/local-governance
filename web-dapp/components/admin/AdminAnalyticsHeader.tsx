"use client";

import React from "react";
import { CheckCircle, AlertTriangle, Clock, TrendingUp, ShieldAlert, Layers } from "lucide-react";

interface AdminAnalyticsHeaderProps {
  totalReports: number;
  solvedCount: number;
  openCount: number;
  inProgressCount: number;
  emergencyCount: number;
  onSelectEmergencyTab: () => void;
}

export const AdminAnalyticsHeader: React.FC<AdminAnalyticsHeaderProps> = ({
  totalReports,
  solvedCount,
  openCount,
  inProgressCount,
  emergencyCount,
  onSelectEmergencyTab,
}) => {
  const resolutionRate =
    totalReports > 0 ? Math.round((solvedCount / totalReports) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* 1. Resolution Rate Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Resolution Rate
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-slate-900">
              {resolutionRate}%
            </h3>
            <span className="text-xs font-semibold text-emerald-600 flex items-center">
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
              {solvedCount} solved
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            out of {totalReports} total civic reports
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <CheckCircle className="w-6 h-6" />
        </div>
      </div>

      {/* 2. Actionable Queue Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Actionable Queue
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-slate-900">{openCount}</h3>
            <span className="text-xs font-semibold text-blue-600">
              Open / Reopened
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Needs authority assignment or triage
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <Layers className="w-6 h-6" />
        </div>
      </div>

      {/* 3. In Progress Workload Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            In Progress
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-slate-900">
              {inProgressCount}
            </h3>
            <span className="text-xs font-semibold text-indigo-600">
              Active Crews
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Currently undergoing resolution
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Clock className="w-6 h-6" />
        </div>
      </div>

      {/* 4. Active Emergency Alerts Card */}
      <div
        onClick={emergencyCount > 0 ? onSelectEmergencyTab : undefined}
        className={`bg-white rounded-2xl border p-5 shadow-sm flex items-center justify-between transition-all ${
          emergencyCount > 0
            ? "border-red-300 bg-red-50/30 cursor-pointer hover:shadow-md hover:border-red-400"
            : "border-slate-200/80"
        }`}
      >
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Emergency Alerts
            </p>
            {emergencyCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <h3
              className={`text-3xl font-black ${
                emergencyCount > 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {emergencyCount}
            </h3>
            <span
              className={`text-xs font-semibold ${
                emergencyCount > 0 ? "text-red-600" : "text-slate-500"
              }`}
            >
              {emergencyCount > 0 ? "Active Alerts" : "All Clear"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {emergencyCount > 0
              ? "Click to open Emergency Command Center"
              : "No urgent municipal alerts"}
          </p>
        </div>
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            emergencyCount > 0
              ? "bg-red-100 text-red-600"
              : "bg-slate-50 text-slate-400"
          }`}
        >
          <ShieldAlert className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
