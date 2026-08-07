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
    <div className="bg-white/80 backdrop-blur-xl rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      {/* Table Header Bar */}
      <div className="p-6 lg:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <span>Municipal Authority Roster</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered officials and department officers eligible for civic triage
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, dept, address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-slate-200/60 bg-slate-50 pl-11 pr-4 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:bg-white transition-all shadow-sm"
          />
        </div>
      </div>

      {filteredMembers.length === 0 ? (
        <div className="py-20 text-center text-slate-500 flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
            <Search className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-bold text-lg text-slate-700">No Authorities Found</p>
          <p className="text-sm font-medium mt-1">No authority workers match the search query.</p>
        </div>
      ) : (
        <div className="overflow-x-auto p-4 lg:p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6 pb-4 border-b border-slate-100">Official Name</th>
                <th className="py-4 px-4 pb-4 border-b border-slate-100">Department & Role</th>
                <th className="py-4 px-4 pb-4 border-b border-slate-100">Wallet Address</th>
                <th className="py-4 px-4 pb-4 border-b border-slate-100">Status</th>
                <th className="py-4 px-6 pb-4 border-b border-slate-100 text-right">Quick Proposal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {filteredMembers.map((member) => (
                <tr
                  key={member.address}
                  className="hover:bg-slate-50/50 transition-colors group"
                >
                  {/* Name */}
                  <td className="py-5 px-6 font-bold text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[12px] bg-blue-50 border border-blue-100 text-blue-600 font-black flex items-center justify-center text-sm shrink-0 group-hover:scale-110 transition-transform">
                        {member.name ? member.name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900 text-base leading-tight">
                          {member.name || "Unnamed Official"}
                        </p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          {member.address.slice(0, 6)}...{member.address.slice(-4)}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Department & Role */}
                  <td className="py-5 px-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        {member.department || "General Administration"}
                      </span>
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        {member.position || "Authority Worker"}
                      </span>
                    </div>
                  </td>

                  {/* Wallet Address */}
                  <td className="py-5 px-4 font-mono text-[11px] text-slate-600 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">{member.address}</span>
                      <button
                        onClick={() => copyAddress(member.address)}
                        className="text-slate-400 hover:text-slate-700 transition-colors bg-slate-50 p-1.5 rounded-lg border border-slate-100 hover:bg-slate-100"
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
                  <td className="py-5 px-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Active Authority</span>
                    </span>
                  </td>

                  {/* Quick Proposal Action */}
                  <td className="py-5 px-6 text-right">
                    <button
                      onClick={() =>
                        onSelectForProposal(
                          member.address,
                          member.name,
                          member.position,
                          member.department
                        )
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white text-xs font-bold transition-all shadow-sm hover:shadow-md group-hover:-translate-y-0.5"
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
