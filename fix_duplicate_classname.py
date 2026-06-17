import re, glob

files = glob.glob('frontend/src/pages/*.tsx') + glob.glob('frontend/src/components/**/*.tsx', recursive=True)

def process_file(file):
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # We want to fix duplicate classNames on <tr> tags.
    # Like: <tr className="group hover:bg-white/10 transition-colors" key={idx} className="group hover:bg-white/5 transition-colors group">
    
    def fix_duplicate(m):
        full_tag = m.group(0)
        # Find all className attributes
        classNames = re.findall(r'className="([^"]*)"', full_tag)
        if len(classNames) > 1:
            # Merge them
            merged = " ".join(classNames)
            # Remove duplicates from the merged string
            unique_classes = []
            for cls in merged.split():
                if cls not in unique_classes:
                    unique_classes.append(cls)
            merged_str = " ".join(unique_classes)
            
            # Remove all className="..." from the tag
            clean_tag = re.sub(r'\s*className="[^"]*"', '', full_tag)
            # Add back a single className
            # The clean tag looks like <tr key={idx}>
            # We want <tr className="..." key={idx}>
            return clean_tag.replace('<tr', f'<tr className="{merged_str}"')
        return full_tag

    content = re.sub(r'<tr[^>]*>', fix_duplicate, content)
    
    if content != original:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

for file in files:
    process_file(file)
