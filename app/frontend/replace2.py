import os
import glob
import re

files = glob.glob('src/pages/*.tsx') + glob.glob('src/components/**/*.tsx', recursive=True)
c = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # 1. replace `rounded-md bg-accent px-3 py-2 font-mono text-xs text-on-accent hover:opacity-90 disabled:opacity-40` -> btn-terminal-primary
    content = content.replace('className="rounded-md bg-accent px-3 py-2 font-mono text-xs text-on-accent hover:opacity-90 disabled:opacity-40"', 'className="btn-terminal-primary"')
    
    # 2. replace `rounded-md bg-accent px-3 py-2 font-mono text-xs text-on-accent hover:opacity-90` -> btn-terminal-primary
    content = content.replace('className="rounded-md bg-accent px-3 py-2 font-mono text-xs text-on-accent hover:opacity-90"', 'className="btn-terminal-primary"')
    
    # 3. replace `rounded-md border border-accent/30 bg-accent-dim px-3 py-2 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40` -> btn-terminal
    content = content.replace('className="rounded-md border border-accent/30 bg-accent-dim px-3 py-2 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40"', 'className="btn-terminal"')

    # 4. replace `rounded-md border border-accent/30 bg-accent-dim px-3 py-2 font-mono text-xs text-accent hover:opacity-80` -> btn-terminal
    content = content.replace('className="rounded-md border border-accent/30 bg-accent-dim px-3 py-2 font-mono text-xs text-accent hover:opacity-80"', 'className="btn-terminal"')

    # 5. replace `rounded-md border border-accent/30 bg-accent-dim px-3 py-2 text-sm text-accent hover:opacity-80 disabled:opacity-40` -> btn-terminal
    content = content.replace('className="rounded-md border border-accent/30 bg-accent-dim px-3 py-2 text-sm text-accent hover:opacity-80 disabled:opacity-40"', 'className="btn-terminal"')

    # 6. replace `border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-on-accent hover:opacity-90` -> btn-terminal-primary
    content = content.replace('className="border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-on-accent hover:opacity-90"', 'className="btn-terminal-primary"')

    # 7. replace `border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-on-accent transition-colors hover:bg-accent/90` -> btn-terminal-primary
    content = content.replace('className="border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-on-accent transition-colors hover:bg-accent/90"', 'className="btn-terminal-primary"')

    # 8. replace `border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-on-accent hover:opacity-90` -> btn-terminal-primary
    content = content.replace('className="border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-on-accent hover:opacity-90"', 'className="btn-terminal-primary"')
    
    # 9. replace `border border-accent bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 disabled:opacity-40` -> btn-terminal
    content = content.replace('className="border border-accent bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 disabled:opacity-40"', 'className="btn-terminal"')

    # 10. replace `w-full border border-accent bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 disabled:opacity-40` -> w-full btn-terminal
    content = content.replace('className="w-full border border-accent bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 disabled:opacity-40"', 'className="w-full btn-terminal"')

    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print('Done replace 2')
