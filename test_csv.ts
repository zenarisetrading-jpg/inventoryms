const HEADER_ALIASES = {
  saddl_id: ['saddl_id', 'saddl id', 'saddlid'],
}

function normalizeHeader(v: string): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findColumnIndex(header: string[], logicalCol: keyof typeof HEADER_ALIASES): number {
  const aliases = new Set(HEADER_ALIASES[logicalCol].map(normalizeHeader))
  return header.findIndex((h) => aliases.has(normalizeHeader(h)))
}

function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuote = !inQuote
      continue
    }
    if (ch === ',' && !inQuote) {
      cols.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

const headerLine = "po_number,po_name,supplier,country,order_date,eta,status,po_notes,notes,sku,units_ordered,units_received,saddl_id, saddl_id , saddl id";
const cols = parseCSVLine(headerLine);
console.log("Parsed Columns:", cols);
console.log("Normalized Columns:", cols.map(normalizeHeader));
const idx = findColumnIndex(cols, 'saddl_id');
console.log("saddl_id index:", idx);
