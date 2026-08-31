import re

def fix():
    filepath = r'd:\Projects\git\local-governance\web-dapp\app\admin\page.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix polls tab start
    polls_old = r'''        \{/\* ── POLLS TAB ─────────────────────────────────────────────────────── \*/\}
        \{activeTab === "polls" && \(
          <>
            <div className="w-full rounded-\[32px\] overflow-hidden bg-gradient-to-r from-violet-600 to-purple-900 p-8 md:p-10 text-white relative mb-8 shadow-sm flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                <svg className="w-48 h-48 animate-\[pulse_5s_ease-in-out_infinite\]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth=\{1\} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="inline-flex items-center gap-1\.5 px-3 py-1\.5 rounded-full text-\[11px\] font-black tracking-wider uppercase bg-white/20 text-white border border-white/30 mb-4 shadow-sm w-max backdrop-blur-sm">
                <BarChart2 className="w-3\.5 h-3\.5" />
                Community Voting
              </div>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 max-w-lg leading-\[1\.15\]">
                Decentralized Opinion Polls
              </h1>
              <p className="text-sm text-white/90 max-w-xl leading-relaxed mb-6">
                Monitor, finalize, and publish public policy votes directly to the community ledger\.
              </p>
              <div className="flex items-center gap-4 relative z-10 flex-wrap">
                <Link
                  href="/polls/create"
                  className="bg-white text-purple-700 hover:bg-slate-50 font-bold px-5 py-2\.5 rounded-full transition-all text-sm shadow-sm flex items-center gap-2 hover:shadow-md duration-300"
                >
                  <Plus className="w-4 h-4" /> Create Poll
                </Link>
                <button
                  onClick=\{fetchPolls\}
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-bold py-2\.5 px-5 rounded-full transition-all flex items-center gap-2 text-sm shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                \{topUpAndWalletPills\}
              </div>
            </div>'''
            
    polls_new = r'''        {/* ── POLLS TAB ─────────────────────────────────────────────────────── */}
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
            </div>'''
            
    content = re.sub(polls_old, polls_new, content)

    # 2. Fix closing tags for emergency tab
    content = re.sub(
        r'          </>\n        \)}\n\n        \{\/\* ── POLLS TAB ─────────────────────────────────────────────────────── \*\/\}',
        r'          </div>\n        )}\n\n        {/* ── POLLS TAB ─────────────────────────────────────────────────────── */}',
        content
    )

    # 3. Fix closing tags for polls tab
    content = re.sub(
        r'              \)}\n            </div>\n          </>\n        \)}\n\n        \{\/\* ── WORKFORCE TAB ─────────────────────────────────────────────────── \*\/\}',
        r'              )}\n            </div>\n          </div>\n        )}\n\n        {/* ── WORKFORCE TAB ─────────────────────────────────────────────────── */}',
        content
    )
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
if __name__ == "__main__":
    fix()
