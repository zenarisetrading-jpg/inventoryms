// Bulletproof date parser supporting YYYY-MM-DD, MM/DD/YYYY, and DD-MM-YYYY with various separators and layouts
export function parseDate(str: string): Date | null {
  if (!str) return null
  
  // Normalize date string by removing spaces, replacing various dashes/dots/slashes with standard hyphens
  const cleanStr = str.trim()
  const normalized = cleanStr
    .replace(/[–—−.]/g, '-') // en-dash, em-dash, minus, dot -> standard hyphen
    .replace(/\s+/g, '')     // remove all whitespaces
  
  const parts = normalized.split('-')
  
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10)
    const p1 = parseInt(parts[1], 10)
    const p2 = parseInt(parts[2], 10)
    
    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      // Prioritize DD-MM-YYYY or DD-MM-YY (where year is the 3rd part)
      if (parts[2].length === 4 || (parts[2].length === 2 && parts[0].length !== 4)) {
        const year = parts[2].length === 2 ? 2000 + p2 : p2
        const d = new Date(year, p1 - 1, p0)
        if (!isNaN(d.getTime())) return d
      }
      
      // Support YYYY-MM-DD or YYYY-MM-D (where year is the 1st part and has 4 digits)
      if (parts[0].length === 4) {
        const d = new Date(p0, p1 - 1, p2)
        if (!isNaN(d.getTime())) return d
      }
    }
  }
  
  // Try native date parser as a last resort fallback
  const d = new Date(cleanStr)
  if (!isNaN(d.getTime())) return d
  
  return null
}

export function formatDateToDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}-${m}-${y}`
}

export function renderVal(val: any): string {
  if (val === undefined || val === null) return '-'
  const str = String(val).trim()
  return str === '' ? '-' : str
}

// Advanced English number-to-words converter optimized for AED/Fils
export function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const scales = ['', 'Thousand', 'Million', 'Billion']

  const convertGroup = (n: number): string => {
    let s = ''
    if (n >= 100) {
      s += ones[Math.floor(n / 100)] + ' Hundred '
      n %= 100
    }
    if (n >= 20) {
      s += tens[Math.floor(n / 10)]
      const unit = n % 10
      if (unit > 0) s += '-' + ones[unit]
      s += ' '
    } else if (n > 0) {
      s += ones[n] + ' '
    }
    return s.trim()
  }

  if (num === 0) return 'Zero Dirhams Only'

  const parts = num.toFixed(2).split('.')
  const integerPart = parseInt(parts[0], 10)
  const decimalPart = parseInt(parts[1], 10)

  let result = ''
  let remaining = integerPart
  let scaleIndex = 0

  while (remaining > 0) {
    const group = remaining % 1000
    if (group > 0) {
      const groupStr = convertGroup(group)
      const scaleStr = scales[scaleIndex]
      result = groupStr + (scaleStr ? ' ' + scaleStr : '') + (result ? ' ' + result : '')
    }
    remaining = Math.floor(remaining / 1000)
    scaleIndex++
  }

  result = result.trim()
  if (!result) result = 'Zero'
  result += ' Dirhams'

  if (decimalPart > 0) {
    const decStr = convertGroup(decimalPart)
    result += ' and ' + decStr + ' Fils'
  }

  return result + ' Only'
}

export interface LineItem {
  id: string
  sno: number
  description: string
  qty: number
  rate: number
}

export function createDefaultLineItems(saved?: LineItem[]): LineItem[] {
  if (saved && Array.isArray(saved) && saved.length > 0) {
    const capped = saved.slice(0, 10)
    return capped.map((item, idx) => ({
      id: item.id || `item-${idx + 1}-${Date.now()}-${idx}`,
      sno: idx + 1,
      description: item.description ?? '',
      qty: Number(item.qty) || 0,
      rate: Number(item.rate) || 0
    }))
  }

  return [
    {
      id: `item-1-${Date.now()}`,
      sno: 1,
      description: '',
      qty: 0,
      rate: 0
    }
  ]
}

/**
 * Automatically computes the next invoice number based on the highest existing invoice number + 1.
 * Supports patterns such as SADL-INV-26-007 -> SADL-INV-26-008.
 * Scans all saved records in invoicesList to avoid duplicates.
 */
export function computeNextInvoiceNumber(currentNo: string, targetDateStr: string, invoicesList?: any[]): string {
  const parsedDate = parseDate(targetDateStr) || new Date()
  const yy = parsedDate.getFullYear().toString().slice(-2)

  const yearSeqMatch = (currentNo || '').trim().match(/^(.*?-)(\d{2})-(\d+)$/)
  const endNumMatch = (currentNo || '').trim().match(/^(.*?)(\d+)$/)

  let basePrefix = 'SADL-INV-'
  let yearPart = yy
  let padLength = 3
  let maxSeq = 0

  if (yearSeqMatch) {
    basePrefix = yearSeqMatch[1]
    yearPart = yy
    padLength = Math.max(3, yearSeqMatch[3].length)
    const currentSeq = parseInt(yearSeqMatch[3], 10)
    if (!isNaN(currentSeq) && currentSeq > maxSeq) {
      maxSeq = currentSeq
    }
  } else if (endNumMatch) {
    basePrefix = endNumMatch[1]
    padLength = Math.max(3, endNumMatch[2].length)
    const currentSeq = parseInt(endNumMatch[2], 10)
    if (!isNaN(currentSeq) && currentSeq > maxSeq) {
      maxSeq = currentSeq
    }
  }

  const fullPrefix = `${basePrefix}${yearPart}-`

  if (Array.isArray(invoicesList)) {
    invoicesList.forEach(inv => {
      const invNo = inv?.invoice_no
      if (typeof invNo === 'string') {
        const clean = invNo.trim()
        if (clean.startsWith(fullPrefix)) {
          const suffix = clean.slice(fullPrefix.length)
          const num = parseInt(suffix, 10)
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num
          }
        } else {
          const m = clean.match(/^SADL-INV-(\d{2})-(\d+)$/)
          if (m && m[1] === yy) {
            const num = parseInt(m[2], 10)
            if (!isNaN(num) && num > maxSeq) {
              maxSeq = num
            }
          }
        }
      }
    })
  }

  const nextSeq = maxSeq + 1
  return `${fullPrefix}${String(nextSeq).padStart(padLength, '0')}`
}

