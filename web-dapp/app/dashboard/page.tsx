"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ethers } from "ethers";
import { getIssues, updateIssueStatus, type Issue } from "@/lib/api";
import { OpinionPollingABI } from "@/lib/contracts/abis";
import { POLLING_ADDRESS } from "@/lib/contracts/polling";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, FileText, CheckCircle2, RotateCw, PenBox, Vote } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";

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

export default function AuthorityDashboard() {
  const { wallet } = useCitizen();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [polls, setPolls] = useState<PollStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPolls, setLoadingPolls] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"reports" | "polls">("reports");
  const [filter, setFilter] = useState<"All" | "Pending">("Pending");
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

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
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">Please log out of your Citizen session to access the Authority portal.</p>
          <Link href="/profile" className="inline-block w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors text-center">
            Go to Profile (Sign Out)
          </Link>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (activeTab === "reports") {
      fetchIssues();
    } else {
      fetchPolls();
    }
  }, [activeTab]);

  const fetchIssues = async () => {
    setLoading(true);
    const data = await getIssues();
    setIssues(data);
    setLoading(false);
  };

  const fetchPolls = async () => {
    setLoadingPolls(true);
    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(POLLING_ADDRESS, OpinionPollingABI, provider);
      
      const chainCount = Number(await contract.pollCount());
      const loadedPolls: PollStructure[] = [];

      if (chainCount > 0) {
        for (let i = chainCount; i >= 1; i--) {
          const chainPoll = await contract.polls(i);
          
          let metaTitle = `Opinion Poll #${i}`;
          let metaDesc = "Loading metadata...";
          let metaOptions: string[] = ["False", "True"];

          try {
            const ipfsRes = await axios.get(`/api/ipfs/poll/${chainPoll.ipfsMetadataCid}`);
            if (ipfsRes.data) {
              metaTitle = ipfsRes.data.title;
              metaDesc = ipfsRes.data.description;
              metaOptions = ipfsRes.data.options;
            }
          } catch (e) {
            console.error(`Failed to resolve IPFS metadata for poll ${i}`, e);
          }

          const optionCount = Number(chainPoll.pollType) === 0 ? 2 : metaOptions.length;
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
      }
      setPolls(loadedPolls);
    } catch (error) {
      console.error("Error fetching polls for dashboard", error);
    } finally {
      setLoadingPolls(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setUpdating(id);
    const note = newStatus === "Resolved" || newStatus === "Closed" ? resolutionNotes[id] : undefined;
    
    const success = await updateIssueStatus(id, newStatus, note);
    if (success) {
      setIssues(issues.map(i => i.id === id ? { ...i, status: newStatus as any, resolutionNote: note ?? i.resolutionNote } : i));
    }
    setUpdating(null);
  };

  const filteredIssues = issues.filter(issue => {
    if (filter === "Pending") return issue.status === "Submitted" || issue.status === "Verified" || issue.status === "In Progress";
    return true;
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case "Submitted": return "outline";
      case "Verified": return "secondary";
      case "In Progress": return "warning";
      case "Resolved": return "success";
      case "Closed": return "default";
      default: return "outline";
    }
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-primary/5 p-6 rounded-2xl border border-primary/20">
        <div className="flex items-center gap-4">
          <div className="bg-primary/20 p-3 rounded-full">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Authority Portal (Simulated)</h1>
            <p className="text-muted-foreground">Preview dashboard and read active on-chain metrics.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium px-3 py-1 bg-background rounded-full border shadow-sm">
            Node: Validator-Sim
          </span>
          <span className="text-sm font-medium px-3 py-1 bg-success/20 text-success rounded-full border border-success/30 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span> Read-Only Sync
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/60 mb-6 gap-6">
        <Button 
          variant="ghost"
          onClick={() => setActiveTab("reports")}
          className={`pb-4 pt-2 font-bold px-0 rounded-none border-b-2 hover:bg-transparent ${
            activeTab === "reports" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          Civic Reports Explorer
        </Button>
        <Button 
          variant="ghost"
          onClick={() => setActiveTab("polls")}
          className={`pb-4 pt-2 font-bold px-0 rounded-none border-b-2 hover:bg-transparent ${
            activeTab === "polls" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          Opinion Polls Explorer
        </Button>
      </div>

      {activeTab === "reports" ? (
        <>
          <div className="flex gap-2 mb-6 border-b pb-4">
            <Button 
              variant={filter === "Pending" ? "default" : "ghost"} 
              onClick={() => setFilter("Pending")}
            >
              Action Required
              {filter === "Pending" && <span className="ml-2 bg-primary-foreground/20 text-primary-foreground px-2 py-0.5 rounded-full text-xs">{filteredIssues.length}</span>}
            </Button>
            <Button 
              variant={filter === "All" ? "default" : "ghost"} 
              onClick={() => setFilter("All")}
            >
              All Records
            </Button>
            <Button variant="outline" size="icon" onClick={fetchIssues} className="ml-auto">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loading && issues.length === 0 ? (
            <div className="py-20 text-center">
              <RotateCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Syncing state with local simulator...</p>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-xl border border-dashed">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-lg font-medium text-foreground">No pending reports</p>
              <p className="text-muted-foreground">All civic reports have been addressed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {filteredIssues.map(issue => (
                <Card key={issue.id} className="border shadow-sm flex flex-col md:flex-row overflow-hidden bg-card">
                  <div className="flex-1 p-6">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">ID: {issue.id}</span>
                        <Badge variant={getStatusColor(issue.status) as any}>{issue.status}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(issue.dateSubmitted).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mt-2 mb-2">
                      <Link href={`/issues/${issue.id}`} className="hover:text-primary transition-colors hover:underline">
                        {issue.title}
                      </Link>
                    </h3>
                    <p className="text-sm text-foreground/80 mb-4">{issue.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs font-medium text-muted-foreground bg-muted/30 p-3 rounded-lg">
                      <span>Category: {issue.category}</span>
                      <span>Location: {issue.location}</span>
                      <span className="text-accent flex items-center gap-1">Community Score: {issue.upvotes - issue.downvotes}</span>
                    </div>
                  </div>
                  
                  <div className="bg-muted/10 p-6 md:w-80 border-t md:border-t-0 md:border-l flex flex-col justify-center gap-4">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 border-b pb-2">
                      <PenBox className="h-4 w-4" /> Official Actions
                    </h4>
                    
                    {issue.status === "Submitted" && (
                      <Button 
                        className="w-full" 
                        disabled={updating === issue.id}
                        onClick={() => handleStatusUpdate(issue.id, "Verified")}
                      >
                        Verify Report Legitimacy
                      </Button>
                    )}
                    
                    {issue.status === "Verified" && (
                      <Button 
                        variant="secondary" 
                        className="w-full" 
                        disabled={updating === issue.id}
                        onClick={() => handleStatusUpdate(issue.id, "In Progress")}
                      >
                        Mark as In Progress
                      </Button>
                    )}
                    
                    {issue.status === "In Progress" && (
                      <div className="space-y-3">
                        <Input 
                          placeholder="Resolution notes... (Required)" 
                          className="text-sm bg-background"
                          value={resolutionNotes[issue.id] || ""}
                          onChange={(e) => setResolutionNotes(prev => ({ ...prev, [issue.id]: e.target.value }))}
                        />
                        <Button 
                          className="w-full bg-success text-success-foreground hover:bg-success/90" 
                          disabled={updating === issue.id || !resolutionNotes[issue.id]}
                          onClick={() => handleStatusUpdate(issue.id, "Resolved")}
                        >
                          Resolve Issue
                        </Button>
                      </div>
                    )}
                    
                    {(issue.status === "Resolved" || issue.status === "Closed") && (
                      <div className="flex items-center justify-center p-3 bg-success/10 text-success rounded-lg border border-success/20">
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        <span className="text-sm font-medium">Issue handled</span>
                      </div>
                    )}
                    
                    {updating === issue.id && (
                      <div className="text-xs text-center text-muted-foreground animate-pulse">
                        Broadcasting to network...
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-6 border-b pb-4">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Active On-Chain Polls</h2>
            <Button variant="outline" size="icon" onClick={fetchPolls} className="ml-auto">
              <RotateCw className={`h-4 w-4 ${loadingPolls ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loadingPolls && polls.length === 0 ? (
            <div className="py-20 text-center">
              <RotateCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Fetching live opinion polls from contract...</p>
            </div>
          ) : polls.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-xl border border-dashed">
              <Vote className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-lg font-medium text-foreground">No opinion polls created</p>
              <p className="text-muted-foreground">All policy polls will appear here once submitted on-chain.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {polls.map((poll) => {
                const totalVotes = poll.results?.reduce((a, b) => a + b, 0) || 0;
                const isExpired = Math.floor(Date.now() / 1000) >= poll.deadline;
                const isOpen = poll.isActive && !isExpired;

                return (
                  <Card key={poll.id} className="border shadow-sm bg-card hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3 border-b bg-muted/10">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">ID: #{poll.id}</span>
                        <Badge variant={isOpen ? "success" : "secondary"}>
                          {isOpen ? "Active" : "Closed"}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg font-bold">{poll.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{poll.description}</CardDescription>
                    </CardHeader>
                    
                    <CardContent className="pt-4 space-y-4">
                      {/* Distribution visualization */}
                      {!isOpen ? (
                        <div className="space-y-3">
                          <div className="text-xs font-semibold text-muted-foreground flex justify-between">
                            <span>Tally Breakdown</span>
                            <span>{totalVotes} total votes</span>
                          </div>
                          
                          <div className="space-y-2">
                            {poll.options.map((opt, oIdx) => {
                              const count = poll.results?.[oIdx] || 0;
                              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                              return (
                                <div key={oIdx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-medium text-foreground">
                                    <span className="truncate max-w-[70%]">{opt}</span>
                                    <span>{count} votes ({pct}%)</span>
                                  </div>
                                  <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        poll.pollType === 0 
                                          ? oIdx === 0 ? "bg-rose-500" : "bg-emerald-500"
                                          : "bg-blue-500"
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center border rounded bg-slate-50 text-slate-500 text-xs italic">
                          Results hidden until poll is closed
                        </div>
                      )}
                      
                      <div className="flex justify-between text-xs text-muted-foreground border-t pt-3 mt-2">
                        <span>Type: {poll.pollType === 0 ? "Yes / No" : "Multi-Choice"}</span>
                        <span>Deadline: {new Date(poll.deadline * 1000).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
