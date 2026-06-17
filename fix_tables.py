import re, glob, os

files = glob.glob('frontend/src/pages/*.tsx') + glob.glob('frontend/src/components/**/*.tsx', recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    
    # In index.tsx we have things like:
    # <td className="... group-hover:text-[14px] ...">{row.units}</td>
    # We want to change it to:
    # <td className="..."><span className="inline-block transition-transform duration-300 group-hover:scale-110 origin-center">{row.units}</span></td>
    
    # It's safer to just inject a CSS rule globally to target .group:hover td span and .group:hover td div and .group:hover td button
    # Let's wrap bare {variables} or strings inside <td>...</td>
    
    # Actually, we can just replace the group-hover:text-[...] classes with group-hover:scale-110
    content = re.sub(r'group-hover:text-\[1[45]px\]', 'group-hover:scale-[1.15] inline-block transform transition-transform duration-300 origin-center', content)
    
    if content != original_content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
