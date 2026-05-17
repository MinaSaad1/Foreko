import os
import glob

target = 'className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"'
replacement = 'className="w-full btn-terminal-primary"'

files = glob.glob('src/pages/*.tsx') + glob.glob('src/components/**/*.tsx', recursive=True)
c = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    if target in content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content.replace(target, replacement))
        c += 1
print(f'Replaced in {c} files.')

target2 = 'className="rounded-md bg-accent px-3 py-2 text-sm text-on-accent hover:opacity-90 disabled:opacity-40"'
replacement2 = 'className="btn-terminal-primary"'
c2 = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    if target2 in content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content.replace(target2, replacement2))
        c2 += 1
print(f'Replaced target2 in {c2} files.')

target3 = 'className="rounded-md border border-accent/30 bg-accent-dim px-3 py-2 text-sm text-accent hover:opacity-80 disabled:opacity-40"'
replacement3 = 'className="btn-terminal"'
c3 = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    if target3 in content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content.replace(target3, replacement3))
        c3 += 1
print(f'Replaced target3 in {c3} files.')
