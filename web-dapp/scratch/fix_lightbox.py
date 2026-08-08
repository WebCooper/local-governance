import re

files_to_fix = [
    r"d:\Projects\git\local-governance\web-dapp\app\admin\reports\[id]\page.tsx",
    r"d:\Projects\git\local-governance\web-dapp\app\admin\emergency\[id]\page.tsx"
]

for filepath in files_to_fix:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Change state definition
    content = re.sub(
        r"const \[activeImage, setActiveImage\] = useState<\{\s*data: string;\s*mimeType: string;\s*\} \| null>\(null\);",
        "const [selectedImage, setSelectedImage] = useState<string | null>(null);",
        content
    )
    
    # 2. Change onClick for hero/gallery images
    # From: onClick={() => setActiveImage(img)} or setActiveImage(report.images![0])
    # To: onClick={() => setSelectedImage(`data:${img.mimeType || "image/jpeg"};base64,${img.data}`)} 
    # Or for report.images![0]: onClick={() => setSelectedImage(`data:${report.images![0].mimeType || "image/jpeg"};base64,${report.images![0].data}`)}
    content = re.sub(
        r"onClick=\{\(\) => setActiveImage\(report\.images!\[0\]\)\}",
        r"onClick={() => setSelectedImage(`data:${report.images![0].mimeType || \"image/jpeg\"};base64,${report.images![0].data}`)}",
        content
    )
    content = re.sub(
        r"onClick=\{\(\) => setActiveImage\(img\)\}",
        r"onClick={() => setSelectedImage(`data:${img.mimeType || \"image/jpeg\"};base64,${img.data}`)}",
        content
    )
    
    # 3. Change timeline images
    # Find: <img src={`/api/ipfs/image/${act.imageCid}`} ... />
    # Add cursor-pointer and onClick
    content = re.sub(
        r"(<img\s+src=\{`\/api\/ipfs\/image\/\$\{act\.imageCid\}`\}\s+alt=\"Action Attachment\"\s+className=\"[^\"]+)\"",
        r"\1 cursor-pointer\" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}",
        content
    )
    # The alt might be different, let's just find imageCid and className
    content = re.sub(
        r"(<img\s+src=\{`\/api\/ipfs\/image\/\$\{act\.imageCid\}`\}[^>]*className=\"[^\"]+)\"",
        r"\1 cursor-pointer\" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}",
        content
    )
    
    # 4. Replace Modal
    old_modal = r"\{\s*\/\*\s*Image Preview Modal\s*\*\/\s*\}\s*\{activeImage && \([\s\S]*?\}\s*\)\}"
    new_modal = """{/* Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 cursor-zoom-out transition-all duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full max-h-[90vh] flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="Evidence Preview" 
              className="max-w-full max-h-full object-contain rounded-[24px] shadow-2xl" 
            />
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}"""
    content = re.sub(old_modal, new_modal, content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Updated admin lightboxes")
