import glob
import re
import os

files = glob.glob(r"d:\Projects\git\local-governance\web-dapp\app\**\page.tsx", recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Fix the double replacement in admin reports
    content = re.sub(
        r'cursor-pointer\\ cursor-pointer\\" onClick=\{\(\) => setSelectedImage\(`\/api\/ipfs\/image\/\$\{act\.imageCid\}`\)\} onClick=\{\(\) => setSelectedImage\(`\/api\/ipfs\/image\/\$\{act\.imageCid\}`\)\}',
        r'cursor-pointer" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}',
        content
    )
    
    # Fix the single replacement with bad quote in other files
    content = re.sub(
        r'cursor-pointer\\" onClick=\{\(\) => setSelectedImage\(`\/api\/ipfs\/image\/\$\{act\.imageCid\}`\)\}',
        r'cursor-pointer" onClick={() => setSelectedImage(`/api/ipfs/image/${act.imageCid}`)}',
        content
    )
    
    # Just in case there is a `cursor-pointer\` left
    content = re.sub(
        r'cursor-pointer\\ cursor-pointer"',
        r'cursor-pointer"',
        content
    )

    if content != original:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {file}")

print("Done")
