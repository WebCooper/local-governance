import re

def fix():
    filepath = r'd:\Projects\git\local-governance\web-dapp\app\admin\page.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # The block we want to replace starts at `  return (\n    <div className="min-h-screen bg-[#F9FAFB] flex">`
    # and ends at `        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">`

    # We want to replace it with just:
    #   return (
    #     <div className="min-h-screen bg-[#F9FAFB]">
    #       <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">

    pattern_start = r'  return \(\n    <div className="min-h-screen bg-\[#F9FAFB\] flex">.*?<main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">'
    
    match = re.search(pattern_start, content, re.DOTALL)
    if not match:
        print("Could not find start block")
        return

    replacement_start = '''  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">'''
      
    content = content[:match.start()] + replacement_start + content[match.end():]
    
    # We also need to fix the closing tags at the very end of the file.
    # Currently it is:
    #       </main>
    #     </div>
    #   </div>
    # );
    
    # We should change it to:
    #       </main>
    #     </div>
    #   );
    
    pattern_end = r'      </main>\n    </div>\n  </div>\n\);\n}'
    
    match_end = re.search(pattern_end, content, re.DOTALL)
    if not match_end:
        print("Could not find end block")
        return
        
    replacement_end = '''      </main>
    </div>
  );
}'''

    content = content[:match_end.start()] + replacement_end + content[match_end.end():]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Success")

if __name__ == "__main__":
    fix()
