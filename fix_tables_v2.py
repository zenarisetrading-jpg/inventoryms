import re, glob

files = glob.glob('frontend/src/pages/*.tsx') + glob.glob('frontend/src/components/**/*.tsx', recursive=True)

def process_file(file):
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # First, let's remove the broken inline-block and scale on <td> tags that we just added to index.tsx
    content = content.replace(' group-hover:scale-[1.15] inline-block transform transition-transform duration-300 origin-center', '')
    content = content.replace(' group-hover:text-[14px]', '')
    content = content.replace(' group-hover:text-[15px]', '')
    content = content.replace(' group-hover:font-bold', '')
    
    # Ensure <tr> has the group class
    content = re.sub(r'(<tr[^>]*className="[^"]*)"', r'\1 group"', content)
    
    if content != original:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

for file in files:
    process_file(file)
