import os
import glob
import re

files = glob.glob('src/pages/*.tsx') + glob.glob('src/components/**/*.tsx', recursive=True) + glob.glob('src/*.tsx')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # regex to remove `rounded-md`
    content = re.sub(r'\brounded-md\b\s*', '', content)
    # clean up empty trailing/leading space in className
    content = re.sub(r'className="\s+', 'className="', content)
    content = re.sub(r'\s+"', '"', content)

    # Some empty classNames could happen: `className=""`
    # That's fine, React ignores empty classNames

    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print('Removed rounded-md')
