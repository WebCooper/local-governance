import re

def refactor():
    filepath = r'd:\Projects\git\local-governance\web-dapp\app\admin\page.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update lucide imports
    content = re.sub(
        r'import {([^}]+)} from "lucide-react";',
        r'import {\1, Menu, X, Home } from "lucide-react";',
        content
    )

    # 2. Update activeTab type and default
    content = re.sub(
        r'const \[activeTab, setActiveTab\] = useState<"reports" \| "polls" \| "workforce" \| "emergency">\("reports"\);',
        r'const [activeTab, setActiveTab] = useState<"dashboard" | "reports" | "polls" | "workforce" | "emergency">("dashboard");\n  const [isSidebarOpen, setIsSidebarOpen] = useState(false);',
        content
    )
    content = re.sub(
        r'if \(tabParam === "reports" \|\| tabParam === "polls" \|\| tabParam === "workforce" \|\| tabParam === "emergency"\) \{',
        r'if (tabParam === "dashboard" || tabParam === "reports" || tabParam === "polls" || tabParam === "workforce" || tabParam === "emergency") {',
        content
    )

    # 3. Build the sidebar and layout wrapper
    old_layout_start = r'''  return \(
    <div className="min-h-screen bg-\[\#F9FAFB\] pb-16 pt-4 md:pt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-start">
        <div className="w-full flex flex-col">
          <main className="w-full">'''

    new_layout_start = '''  return (
    <div className="min-h-screen bg-[#F9FAFB] flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-white border-r border-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:static lg:block flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Authority</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Command Center</p>
          </div>
          <button className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg" onClick={() => setIsSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
          <button onClick={() => { setActiveTab("dashboard"); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all ${activeTab === "dashboard" ? "bg-slate-900 text-white shadow-md shadow-slate-900/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <Home className={`w-5 h-5 ${activeTab === "dashboard" ? "text-white" : "text-slate-400"}`} /> Dashboard
          </button>
          <button onClick={() => { setActiveTab("reports"); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all ${activeTab === "reports" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <FileText className={`w-5 h-5 ${activeTab === "reports" ? "text-white" : "text-slate-400"}`} /> Civic Reports
          </button>
          <button onClick={() => { setActiveTab("emergency"); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all ${activeTab === "emergency" ? "bg-rose-600 text-white shadow-md shadow-rose-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <AlertTriangle className={`w-5 h-5 ${activeTab === "emergency" ? "text-white" : "text-slate-400"}`} /> Emergency Alerts
          </button>
          <button onClick={() => { setActiveTab("polls"); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all ${activeTab === "polls" ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <BarChart2 className={`w-5 h-5 ${activeTab === "polls" ? "text-white" : "text-slate-400"}`} /> Opinion Polls
          </button>
          <button onClick={() => { setActiveTab("workforce"); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all ${activeTab === "workforce" ? "bg-purple-600 text-white shadow-md shadow-purple-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <Users className={`w-5 h-5 ${activeTab === "workforce" ? "text-white" : "text-slate-400"}`} /> Workforce
          </button>
        </nav>
        
        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                <span className="text-slate-500 font-bold text-xs">{account.slice(2,4).toUpperCase()}</span>
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-900 truncate">Authority Admin</p>
                <p className="text-[10px] text-slate-500 font-mono truncate">{account}</p>
              </div>
            </div>
            <button 
              onClick={handleTopUp}
              disabled={isFunding}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 text-xs disabled:opacity-50">
              {isFunding ? "Scanning..." : "Top-Up Gas"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-extrabold text-slate-900">Command Center</h2>
          </div>
        </header>

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
'''
    
    content = re.sub(old_layout_start, new_layout_start, content)

    # 4. Remove AdminAnalyticsHeader from Reports tab and update banner
    # In the original, Reports tab has a banner, then AdminAnalyticsHeader, then filters.
    reports_header_old = r'''        \{\/\* ── REPORTS TAB ───────────────────────────────────────────────────── \*\/\}
        \{activeTab === "reports" && \(
          <>
            \{\/\* 0\. Gradient Banner for Civic Reports \*\/\}
            <div className="w-full rounded-\[32px\] overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-800 p-8 md:p-10 text-white relative mb-8 shadow-sm flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <svg className="w-48 h-48 animate-\[pulse_4s_ease-in-out_infinite\]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth=\{1\} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5\.586a1 1 0 01\.707\.293l5\.414 5\.414a1 1 0 01\.293\.707V19a2 2 0 01-2 2z" \/>
                <\/svg>
              <\/div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-emerald-200">Civic Reports Dashboard<\/p>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-\[1\.15\]">
                Manage & Resolve Community Issues
              <\/h1>
              <p className="text-sm text-white\/90 max-w-xl leading-relaxed mb-6">
                Review, triage, and assign municipal issues reported by citizens\. Keep the community informed of resolution progress\.
              <\/p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <button
                  onClick=\{\(\) => \{
                    setOffset\(0\);
                    fetchReports\(0\);
                  \}\}
                  className="bg-white\/10 hover:bg-white\/20 backdrop-blur-sm border border-white\/20 text-white font-bold py-2\.5 px-5 rounded-full transition-all flex items-center gap-2 text-sm shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" \/>
                  Refresh Data
                <\/button>
                \{topUpAndWalletPills\}
              <\/div>
            <\/div>

            \{\/\* 1\. Executive KPI Analytics Header \*\/\}
            <AdminAnalyticsHeader
              totalReports=\{allReports\.length\}
              solvedCount=\{
                allReports\.filter\(\(r\) => r\.status === 6\)\.length
              \}
              openCount=\{
                allReports\.filter\(\(r\) => r\.status === 2 \|\| r\.status === 7\)
                  \.length
              \}
              inProgressCount=\{
                allReports\.filter\(\(r\) => r\.status === 3\)\.length
              \}
              emergencyCount=\{totalEmergencyReports\}
              onSelectEmergencyTab=\{\(\) => setActiveTab\("emergency"\)\}
            \/>'''

    reports_header_new = r'''        {/* ── REPORTS TAB ───────────────────────────────────────────────────── */}
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
            </div>'''
            
    content = re.sub(reports_header_old, reports_header_new, content)

    # 5. Fix closing tag for reports tab since we changed `<>` to `<div className="space-y-6">`
    content = re.sub(
        r'          <\/>\n        \)}',
        r'          </div>\n        )}',
        content
    )

    # 6. Update Emergency Tab banner
    emerg_banner_old = r'''        \{\/\* ── EMERGENCY TAB ─────────────────────────────────────────────────── \*\/\}
        \{activeTab === "emergency" && \(
          <>
            <div className="w-full rounded-\[32px\] overflow-hidden bg-gradient-to-r from-red-600 to-rose-800 p-8 md:p-10 text-white relative mb-8 shadow-sm flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <svg className="w-48 h-48 animate-\[pulse_2s_ease-in-out_infinite\]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth=\{1\} d="M12 9v2m0 4h\.01m-6\.938 4h13\.856c1\.54 0 2\.502-1\.667 1\.732-3L13\.732 4c-\.77-1\.333-2\.694-1\.333-3\.464 0L3\.34 16c-\.77 1\.333\.\ 192 3 1\.732 3z" \/>
                <\/svg>
              <\/div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-red-200">Emergency Command Center<\/p>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-\[1\.15\]">
                Urgent Threat Monitoring
              <\/h1>
              <p className="text-sm text-white\/90 max-w-xl leading-relaxed mb-6">
                Direct channel for high-priority incidents, hazards, and infrastructure failures\. Action required immediately\.
              <\/p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <button
                  onClick=\{\(\) => \{
                    setEmergencyOffset\(0\);
                    fetchEmergencyReports\(0\);
                  \}\}
                  className="bg-white\/20 hover:bg-white\/30 backdrop-blur-sm border border-white\/20 text-white font-bold py-2\.5 px-5 rounded-full transition-all flex items-center gap-2 text-sm shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" \/>
                  Refresh Alerts
                <\/button>
              <\/div>
            <\/div>'''

    emerg_banner_new = r'''        {/* ── EMERGENCY TAB ─────────────────────────────────────────────────── */}
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
            </div>'''
            
    # Need to be careful with the exact old banner text. I will just match a smaller portion to replace the banner.
    # Actually, I can use regex to replace everything from `        {/* ── EMERGENCY TAB ─────────────────────────────────────────────────── */}` to `            <div className="flex justify-between items-end mb-6">`
    content = re.sub(
        r'\{\/\* ── EMERGENCY TAB ─────────────────────────────────────────────────── \*\/\}[\s\S]*?className="flex justify-between items-end mb-6">',
        emerg_banner_new + '\n            <div className="flex justify-between items-end mb-6">',
        content
    )

    # 7. Update Polls Tab banner
    polls_banner_new = r'''        {/* ── POLLS TAB ─────────────────────────────────────────────────────── */}
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
                <button
                  onClick={fetchPolls}
                  className="bg-white text-indigo-900 font-bold py-2.5 px-6 rounded-full transition-all flex items-center gap-2 text-sm shadow-md hover:bg-indigo-50"
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
            </div>'''
            
    content = re.sub(
        r'\{\/\* ── POLLS TAB ─────────────────────────────────────────────────────── \*\/\}[\s\S]*?className="flex flex-col lg:flex-row gap-8">',
        polls_banner_new + '\n            <div className="flex flex-col lg:flex-row gap-8">',
        content
    )

    # 8. Close layout properly at the end
    content = re.sub(
        r'          <\/main>\n        <\/div>\n      <\/div>\n    <\/div>\n  \);',
        r'        </main>\n      </div>\n    </div>\n  );',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
if __name__ == "__main__":
    refactor()
