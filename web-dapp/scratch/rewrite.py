import re
import sys
import os

emergency_path = r"d:\Projects\git\local-governance\web-dapp\app\emergency\[id]\page.tsx"
issues_path = r"d:\Projects\git\local-governance\web-dapp\app\issues\[id]\page.tsx"

with open(emergency_path, 'r', encoding='utf-8') as f:
    e_code = f.read()
with open(issues_path, 'r', encoding='utf-8') as f:
    i_code = f.read()

# Find the LAST return ( in the file.
e_returns = list(re.finditer(r"return \([\s\S]*?\);\n\}", e_code))
i_returns = list(re.finditer(r"return \([\s\S]*?\);\n\}", i_code))

if not e_returns or not i_returns:
    print("Failed to find return block")
    sys.exit(1)

# Get the last one
e_match = e_returns[-1].group(0)[:-2] # removing the \n}
i_match = i_returns[-1].group(0)[:-2] 

new_return = i_match

# 1. Status replacements
new_return = new_return.replace("status.label", "statusMeta.label")
new_return = new_return.replace("status.bg", "statusMeta.bg")
new_return = new_return.replace("status.text", "statusMeta.text")

# 2. Remove vote logic
new_return = re.sub(r"\{\/\* Active Voting Phase Countdown \*\/\}[\s\S]*?(?=\{\/\* Consensus Mini-Card \*\/})", "", new_return)
new_return = re.sub(r"\{\/\* Consensus Mini-Card \*\/\}[\s\S]*?(?=\{\/\* Description \*\/})", "", new_return)
new_return = re.sub(r"\{\/\* Voting Phase Explanations \*\/\}[\s\S]*?(?=\{\/\* Description \*\/})", "", new_return)
new_return = re.sub(r"\{\/\* Glassmorphic Vote Controls \*\/\}[\s\S]*?(?=\{\/\* Redesigned Consensus Card \*\/})", "", new_return)
new_return = re.sub(r"\{\/\* Redesigned Consensus Card \*\/\}[\s\S]*?(?=\{\/\* Assigned Authority \*\/})", "", new_return)
new_return = re.sub(r"\{\(report\.status === 0 \|\| report\.status === 4 \|\| report\.status === 5\)[\s\S]*?\<\/\div\>\n\s*\}", "", new_return)

# 3. Nav link
new_return = new_return.replace("Back to Feed", "Back to Emergency Hub")

# 4. Status in timeline
new_return = new_return.replace("getStatusMeta(act.stage)", "getEmergencyStatusMeta(act.stage)")

# 5. Title
new_return = re.sub(r"\{report\.category \? \`\$\{report\.category\.replace\(\/ Issue\$\/i, \'\'\)\} Issue Reported\` \: \`Civic Report #\$\{report\.id\}\`\}", "{report.title || `Emergency Alert #${report.id}`}", new_return)

# 6. Insert Protocol block
protocol_block = """
              {/* Protocol Notice */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden mb-6">
                <div className="flex items-center gap-2 mb-2 text-red-400">
                  <ShieldAlert className="w-5 h-5" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider">
                    Emergency Protocol
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed relative z-10">
                  To guarantee maximum response speed, Emergency Alerts bypass the 48-hour community validation voting phase. Local authorities are directly accountable for resolution and evidence upload.
                </p>
                <div className="absolute -right-6 -bottom-6 opacity-10">
                  <AlertCircle className="w-32 h-32" />
                </div>
              </div>
"""
new_return = new_return.replace("{/* Assigned Authority */}", protocol_block + "              {/* Assigned Authority */}")

# 7. Add required vars
vars_block = """const statusMeta = getEmergencyStatusMeta(report.status);
  const reportedAt = new Date(report.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const coordinates = report.lat !== undefined && report.lng !== undefined ? { lat: report.lat, lng: report.lng } : null;
  const hasImages = report.images && report.images.length > 0;
  const heroImage = hasImages ? `data:${report.images[0].mimeType || "image/jpeg"};base64,${report.images[0].data}` : null;

  return ("""
final_code = e_code.replace(e_match, new_return)
final_code = final_code.replace("return (", vars_block, 1)

# Fix imports
final_code = re.sub(r"import \{[\s\S]*?\} from \"lucide-react\";", "import { ArrowLeft, MapPin, Clock, RotateCw, AlertCircle, ImageIcon, Bell, Settings, Landmark, Shield, ShieldAlert } from \"lucide-react\";", final_code)

# Ensure state selectedImage exists
if "const [selectedImage, setSelectedImage] = useState<string | null>(null);" not in final_code:
    final_code = final_code.replace("const [activeImage, setActiveImage]", "const [selectedImage, setSelectedImage] = useState<string | null>(null);\n  const [activeImage, setActiveImage]")

with open(emergency_path, 'w', encoding='utf-8') as f:
    f.write(final_code)
print("Rewrite successful")
