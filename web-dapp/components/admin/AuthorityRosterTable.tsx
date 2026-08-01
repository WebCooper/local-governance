"use client";

import React, { useState } from "react";
import {
  Users,
  Building2,
  Briefcase,
  Search,
  ShieldCheck,
  UserPlus,
  Copy,
  Check,
  UserCheck,
} from "lucide-react";

interface MemberProfile {
  address: string;
  name: string;
  position: string;
  department: string;
  isSet: boolean;
}

interface AuthorityRosterTableProps {
  members: MemberProfile[];
  onSelectForProposal: (
    address: string,
    name: string,
    position: string,
    department: string
  ) => void;
}

export const AuthorityRosterTable: React.FC<AuthorityRosterTableProps> = ({
  members,
  onSelectForProposal,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.department.toLowerCase().includes(q) ||
      m.position.toLowerCase().includes(q) ||
      m.address.toLowerCase().includes(q)
    );
  });

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Table Header Bar */}
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Municipal Authority Roster</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered officials and department officers eligible for civic triage
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, dept, address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
          />
        </div>
      </div>

      {filteredMembers.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          No authority workers match the search query.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/60 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-6">Official Name</th>
                <th className="py-3.5 px-4">Department & Role</th>
                <th className="py-3.5 px-4">Wallet Address</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Quick Proposal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredMembers.map((member) => (
                <tr
                  key={member.address}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Name */}
                  <td className="py-4 px-6 font-bold text-slate-900">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0">
                        {member.name ? member.name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {member.name || "Unnamed Official"}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          {member.address.slice(0, 6)}...{member.address.slice(-4)}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Department & Role */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {member.department || "General Administration"}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        {member.position || "Authority Worker"}
                      </span>
                    </div>
                  </td>

                  {/* Wallet Address */}
                  <td className="py-4 px-4 font-mono text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <span>{member.address}</span>
                      <button
                        onClick={() => copyAddress(member.address)}
                        className="text-slate-400 hover:text-slate-700 transition-colors"
                        title="Copy Address"
                      >
                        {copiedAddress === member.address ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Active Authority</span>
                    </span>
                  </td>

                  {/* Quick Proposal Action */}
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() =>
                        onSelectForProposal(
                          member.address,
                          member.name,
                          member.position,
                          member.department
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 text-xs font-semibold transition-all shadow-sm"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Draft Proposal</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
