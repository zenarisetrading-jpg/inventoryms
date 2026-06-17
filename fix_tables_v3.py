import re, glob

files = glob.glob('frontend/src/pages/*.tsx') + glob.glob('frontend/src/components/**/*.tsx', recursive=True)

def process_file(file):
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Let's find all <td ...>...</td>
    # and if the inside is just text or a variable (no HTML tags), wrap it in a span
    # and add a class to the <tr>
    
    # Actually, the simplest way is to find <tr> and add ' group hover:bg-white/10 transition-colors'
    content = re.sub(r'<tr(?!\s*className)(.*?)>', r'<tr className="group hover:bg-white/10 transition-colors"\1>', content)
    content = re.sub(r'<tr\s+className="([^"]*)"(.*?)>', lambda m: '<tr className="' + m.group(1) + (' group' if 'group' not in m.group(1) else '') + '"' + m.group(2) + '>', content)
    
    # Find all <td> tags and wrap their contents with span if not already wrapped by a block level element
    # A simple regex for <td>content</td> where content does not start with <div or <span
    def wrap_td(m):
        td_open = m.group(1)
        td_content = m.group(2).strip()
        if not td_content.startswith('<') and td_content != '':
            return f'{td_open}<span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{td_content}</span></td>'
        # If it has a span or div inside, we should add the classes to it
        if td_content.startswith('<span') and 'inline-block transition-transform' not in td_content:
            td_content = re.sub(r'<span\s+className="([^"]*)"', r'<span className="\1 inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center"', td_content, count=1)
            # If no className
            td_content = re.sub(r'<span(?!\s+className)(.*?)>', r'<span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center"\1>', td_content, count=1)
        return f'{td_open}{td_content}</td>'

    content = re.sub(r'(<td[^>]*>)(.*?)(</td>)', wrap_td, content, flags=re.DOTALL)
    
    if content != original:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

for file in files:
    process_file(file)
