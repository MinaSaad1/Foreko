import os
import glob
import re

files = glob.glob('src/pages/*.tsx') + glob.glob('src/components/**/*.tsx', recursive=True)
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # regex to remove padding classes from th and td
    content = re.sub(r'(<th[^>]*className="[^"]*)(?:\bpx-[0-9]+\b\s*|\bpy-[0-9]+\b\s*|\bfont-mono\b\s*|\btext-xs\b\s*|\btext-sm\b\s*|\buppercase\b\s*|\btracking-widest\b\s*|\bborder-b\b\s*|\bborder-border/40\b\s*|\btext-text-primary\b\s*|\btext-text-muted\b\s*)', r'\1', content)
    content = re.sub(r'(<td[^>]*className="[^"]*)(?:\bpx-[0-9]+\b\s*|\bpy-[0-9]+\b\s*|\bfont-mono\b\s*|\btext-xs\b\s*|\btext-sm\b\s*|\buppercase\b\s*|\btracking-widest\b\s*|\bborder-b\b\s*|\bborder-border/40\b\s*|\btext-text-primary\b\s*|\btext-text-muted\b\s*)', r'\1', content)

    # Some classes might be left with just `className=""` or with double spaces, clean it up
    content = re.sub(r'className="\s+', 'className="', content)
    content = re.sub(r'\s+"', '"', content)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print('Cleaned up table padding and fonts')
