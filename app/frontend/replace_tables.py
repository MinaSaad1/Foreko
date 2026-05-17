import os
import glob
import re

files = glob.glob('src/pages/*.tsx') + glob.glob('src/components/**/*.tsx', recursive=True)
c = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # replace any table class that looks like a basic table
    content = re.sub(r'<table className="[^"]*">', '<table className="terminal-table">', content)

    # strip out classes on th and td that conflict with terminal-table
    # specifically: px-4, py-2, py-1, px-3, border-b, border-t, border-border, etc.
    # Actually, simpler to just replace `<td className="px-4 py-2.*?"` with `<td` and similar for th.
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print('Replaced tables')
