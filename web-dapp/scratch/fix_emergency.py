import re

def fix():
    filepath = r'd:\Projects\git\local-governance\web-dapp\app\admin\page.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the start of EMERGENCY REPORTS TAB
    start_idx = content.find('{/* ── EMERGENCY REPORTS TAB')
    if start_idx == -1:
        print("Could not find emergency reports tab start")
        return
        
    # Find the start of POLLS TAB
    end_idx = content.find('{/* ── POLLS TAB', start_idx)
    if end_idx == -1:
        print("Could not find polls tab start")
        return
        
    old_emergency_section = content[start_idx:end_idx]
    
    # We will replace the entire banner part of the emergency section.
    # The banner part is from start_idx to the first `<div className="flex justify-between items-end mb-6">`
    inner_end_idx = old_emergency_section.find('<div className="flex justify-between items-end mb-6">')
    if inner_end_idx == -1:
        print("Could not find the end of the emergency banner")
        return

    new_banner = r'''{/* ── EMERGENCY REPORTS TAB ─────────────────────────────────────────── */}
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

            '''
            
    replaced_section = new_banner + old_emergency_section[inner_end_idx:]
    
    content = content[:start_idx] + replaced_section + content[end_idx:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
