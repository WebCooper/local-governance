import re

files_to_fix = [
    r"d:\Projects\git\local-governance\web-dapp\app\issues\[id]\page.tsx",
    r"d:\Projects\git\local-governance\web-dapp\app\emergency\[id]\page.tsx"
]

for filepath in files_to_fix:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 3. Change timeline images
    # Find: <img src={`/api/ipfs/image/${act.imageCid}`} ... />
    # Add cursor-pointer and onClick
    # The alt might be different, let's just find imageCid and className
    content = re.sub(
        r"(<img\s+src=\{`\/api\/ipfs\/image\/\$\{act\.imageCid\}`\}[^>]*className=\"[^\"]+)\"",
        r"\1 cursor-pointer\" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}",
        content
    )
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Updated citizen lightboxes")
