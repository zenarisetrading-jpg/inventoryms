import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Printer, Save, RefreshCw, FileText, CheckCircle, Settings, Users, CreditCard, List, ShieldAlert } from 'lucide-react'
import saddlLogo from '../assets/saddl_main_both.png'
import { supabase } from '../lib/supabase'


// Bulletproof date parser supporting YYYY-MM-DD, MM/DD/YYYY, and DD-MM-YYYY with various separators and layouts
function parseDate(str: string): Date | null {
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


function formatDateToDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}-${m}-${y}`
}

function renderVal(val: any): string {
  if (val === undefined || val === null) return '-'
  const str = String(val).trim()
  return str === '' ? '-' : str
}

interface LineItem {
  id: string
  sno: number
  description: string
  qty: number
  rate: number
}

function createDefaultLineItems(saved?: LineItem[]): LineItem[] {
  if (saved) {
    // For saved lists, preserve user-deleted rows (do not auto-pad)
    const capped = saved.slice(0, 10)
    return capped.map((item, idx) => ({ ...item, sno: idx + 1 }))
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


// Advanced English number-to-words converter optimized for AED/Fils
function numberToWords(num: number): string {
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

export default function InvoicePage({ user }: { user?: any }) {
  const [currentUser, setCurrentUser] = useState<any>(user || null)
  const [authLoading, setAuthLoading] = useState(!user)

  useEffect(() => {
    if (!user) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setCurrentUser(session?.user ?? null)
        setAuthLoading(false)
      })
    }
  }, [user])

  const allowedEmails = [
    'irfaan.a@zenarise.org',
    'thasbihak@zenarise.org',
    'siraj.kamaluddin@zenarise.org'
  ]
  const userEmail = currentUser?.email?.toLowerCase() || ''
  const hasAccess = allowedEmails.includes(userEmail)

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-white">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mb-4" />
        <span className="text-sm font-black uppercase tracking-widest text-zinc-400">Verifying Credentials...</span>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto p-8 text-center animate-fade-in font-sans">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-6 shadow-xl shadow-red-950/20 flex flex-col items-center max-w-md w-full relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none" />
          <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center mb-4 border border-red-500/30 shadow-lg shadow-red-500/10 relative">
            <ShieldAlert className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-lg font-black text-white uppercase tracking-widest mb-2">ACCESS RESTRICTED</h2>
          <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider mb-4 leading-relaxed">
            The Interactive Billing Invoice Engine is reserved exclusively for Authorized Financial Personnel.
          </p>
          <div className="w-full bg-slate-950/80 border border-white/5 rounded-xl p-4 text-left">
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2.5">Authorized Accounts:</div>
            <div className="space-y-1.5 font-mono text-[11px] text-zinc-300 font-semibold">
              {allowedEmails.map(email => (
                <div key={email} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
                  <span>{email}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-widest text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl shadow-md transition-all active:scale-[0.98]"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  // LocalStorage state persistence for premium user experience
  const [invoiceTitle, setInvoiceTitle] = useState(() => localStorage.getItem('s2c_inv_title') || 'TAX INVOICE')
  const [titleFontSize, setTitleFontSize] = useState(() => Number(localStorage.getItem('s2c_inv_title_size')) || 72)
  const [invoiceNo, setInvoiceNo] = useState(() => localStorage.getItem('s2c_inv_no') || 'SADL-INV-26-001')
  
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const saved = localStorage.getItem('s2c_inv_date')
    if (saved) return saved
    // Format today as DD-MM-YYYY
    const today = new Date()
    const d = String(today.getDate()).padStart(2, '0')
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const y = today.getFullYear()
    return `${d}-${m}-${y}`
  })
  
  const [terms, setTerms] = useState(() => Number(localStorage.getItem('s2c_inv_terms')) || 5)
  const [dueDate, setDueDate] = useState('')

  // Calendar states
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarYear, setCalendarYear] = useState(() => {
    const saved = localStorage.getItem('s2c_inv_date') || ''
    const parsed = parseDate(saved)
    return parsed ? parsed.getFullYear() : 2026
  })
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const saved = localStorage.getItem('s2c_inv_date') || ''
    const parsed = parseDate(saved)
    return parsed ? parsed.getMonth() : 4
  })

  const datepickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datepickerRef.current && !datepickerRef.current.contains(event.target as Node)) {
        setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Seller Details
  const [sellerName, setSellerName] = useState(() => localStorage.getItem('s2c_inv_seller_name') || 'Zenarise Trading L.L.C-FZ')
  const [sellerAddress, setSellerAddress] = useState(() => localStorage.getItem('s2c_inv_seller_address') || 'Meydan Grandstand, 6th floor, Meydan Road,\nNad Al Sheba, Dubai, U.A.E.')
  const [sellerTrn, setSellerTrn] = useState(() => localStorage.getItem('s2c_inv_seller_trn') || '104554276600003')

  // Buyer Details
  const [buyerName, setBuyerName] = useState(() => localStorage.getItem('s2c_inv_buyer_name') || '')
  const [buyerAddress, setBuyerAddress] = useState(() => localStorage.getItem('s2c_inv_buyer_address') || '')
  const [buyerEmail, setBuyerEmail] = useState(() => localStorage.getItem('s2c_inv_buyer_email') || '')
  const [buyerPhone, setBuyerPhone] = useState(() => localStorage.getItem('s2c_inv_buyer_phone') || '')
  const [buyerTrn, setBuyerTrn] = useState(() => localStorage.getItem('s2c_inv_buyer_trn') || '')

  // Line items pre-populated with exactly 10 slots
  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    const saved = localStorage.getItem('s2c_inv_items')
    if (saved) {
      try { return createDefaultLineItems(JSON.parse(saved)) } catch { /* fallback */ }
    }
    return createDefaultLineItems()
  })

  // Multi-page A4 sheet layout settings
  const [maxItemsPage1, setMaxItemsPage1] = useState(() => Number(localStorage.getItem('s2c_inv_max_items_p1')) || 5)

  // Database integration state hooks
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [invoicesList, setInvoicesList] = useState<any[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)

  // Bank details
  const [bankName, setBankName] = useState(() => localStorage.getItem('s2c_inv_bank_name') || 'WIO Bank PJSC (UAE)')
  const [bankAccount, setBankAccount] = useState(() => localStorage.getItem('s2c_inv_bank_account') || '9854848878')
  const [bankIban, setBankIban] = useState(() => localStorage.getItem('s2c_inv_bank_iban') || 'AE460860000009854848878')
  const [bankSwift, setBankSwift] = useState(() => localStorage.getItem('s2c_inv_bank_swift') || 'WIOBAEADXXX')
  const [bankType, setBankType] = useState(() => localStorage.getItem('s2c_inv_bank_type') || 'Current Account')
  const [beneficiaryName, setBeneficiaryName] = useState(() => localStorage.getItem('s2c_inv_beneficiary_name') || 'Zenarise Trading L.L.C-FZ')
  
  // Note/remarks
  const [remarks, setRemarks] = useState(() => localStorage.getItem('s2c_inv_remarks') || 'Kindly send proof of payments to accounts@saddl.io with email subject "INV# - Proof of Payment"')

  const [saveSuccess, setSaveSuccess] = useState(false)

  // Responsive dynamic scaling for the high-res 2480x3508px visual sheet
  const [scale, setScale] = useState(0.3)
  const [containerWidth, setContainerWidth] = useState(850)

  useEffect(() => {
    const container = document.getElementById('invoice-preview-container')
    if (!container) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          setContainerWidth(width)
          setScale(width / 2480)
        }
      }
    })

    resizeObserver.observe(container)

    // Initial measurement
    const initialWidth = container.clientWidth
    if (initialWidth > 0) {
      setContainerWidth(initialWidth)
      setScale(initialWidth / 2480)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Calculate Due Date based on Invoice Date + Terms days
  useEffect(() => {
    if (!invoiceDate) {
      setDueDate('')
      return
    }
    const parsed = parseDate(invoiceDate)
    if (parsed) {
      const date = new Date(parsed.getTime())
      date.setDate(date.getDate() + terms)
      setDueDate(formatDateToDDMMYYYY(date))
    } else {
      setDueDate('')
    }
  }, [invoiceDate, terms])

  // Auto-generate invoice number based on invoiceDate
  useEffect(() => {
    if (!invoiceDate) return
    try {
      const parsed = parseDate(invoiceDate)
      if (parsed) {
        const year = parsed.getFullYear()
        const yy = year.toString().slice(-2)
        // Check if we should update invoiceNo
        // Only auto-generate if it matches the SADL-INV-YY-001 format pattern
        const match = invoiceNo.match(/^SADL-INV-(\d{2})-(\d+)$/)
        if (match) {
          const currentYY = match[1]
          const seq = match[2]
          if (currentYY !== yy) {
            setInvoiceNo(`SADL-INV-${yy}-${seq}`)
          }
        } else if (!invoiceNo || invoiceNo === 'SADL-INV-YY-001') {
          setInvoiceNo(`SADL-INV-${yy}-001`)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, [invoiceDate])

  // Whenever invoiceDate changes and is valid, sync the calendar view month/year
  useEffect(() => {
    const parsed = parseDate(invoiceDate)
    if (parsed) {
      setCalendarYear(parsed.getFullYear())
      setCalendarMonth(parsed.getMonth())
    }
  }, [invoiceDate])

  const handleSelectDay = (date: Date) => {
    const formatted = formatDateToDDMMYYYY(date)
    setInvoiceDate(formatted)
    setShowCalendar(false)
  }

  // Generate days for calendar grid
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const startDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay()

  const days = []
  const prevMonthDays = new Date(calendarYear, calendarMonth, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({
      day: prevMonthDays - i,
      isCurrentMonth: false,
      date: new Date(calendarYear, calendarMonth - 1, prevMonthDays - i)
    })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      day: i,
      isCurrentMonth: true,
      date: new Date(calendarYear, calendarMonth, i)
    })
  }
  const totalCells = days.length <= 35 ? 35 : 42
  const nextPadding = totalCells - days.length
  for (let i = 1; i <= nextPadding; i++) {
    days.push({
      day: i,
      isCurrentMonth: false,
      date: new Date(calendarYear, calendarMonth + 1, i)
    })
  }

  // Dynamic auto-resizing textareas to show all text instead of scrolling
  useEffect(() => {
    const textareas = document.querySelectorAll('textarea')
    textareas.forEach(textarea => {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    })
  }, [sellerAddress, buyerAddress, remarks, lineItems])

  // Save to LocalStorage
  const handleSave = () => {
    localStorage.setItem('s2c_inv_title', invoiceTitle)
    localStorage.setItem('s2c_inv_title_size', String(titleFontSize))
    localStorage.setItem('s2c_inv_no', invoiceNo)
    localStorage.setItem('s2c_inv_date', invoiceDate)
    localStorage.setItem('s2c_inv_terms', String(terms))
    localStorage.setItem('s2c_inv_seller_name', sellerName)
    localStorage.setItem('s2c_inv_seller_address', sellerAddress)
    localStorage.setItem('s2c_inv_seller_trn', sellerTrn)
    localStorage.setItem('s2c_inv_buyer_name', buyerName)
    localStorage.setItem('s2c_inv_buyer_address', buyerAddress)
    localStorage.setItem('s2c_inv_buyer_email', buyerEmail)
    localStorage.setItem('s2c_inv_buyer_phone', buyerPhone)
    localStorage.setItem('s2c_inv_buyer_trn', buyerTrn)
    localStorage.setItem('s2c_inv_items', JSON.stringify(lineItems))
    localStorage.setItem('s2c_inv_max_items_p1', String(maxItemsPage1))
    localStorage.setItem('s2c_inv_bank_name', bankName)
    localStorage.setItem('s2c_inv_bank_account', bankAccount)
    localStorage.setItem('s2c_inv_bank_iban', bankIban)
    localStorage.setItem('s2c_inv_bank_swift', bankSwift)
    localStorage.setItem('s2c_inv_bank_type', bankType)
    localStorage.setItem('s2c_inv_beneficiary_name', beneficiaryName)
    localStorage.setItem('s2c_inv_remarks', remarks)
    
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  // Reset to default
  const handleReset = () => {
    if (window.confirm('Reset invoice fields to default?')) {
      localStorage.removeItem('s2c_inv_title')
      localStorage.removeItem('s2c_inv_title_size')
      localStorage.removeItem('s2c_inv_no')
      localStorage.removeItem('s2c_inv_date')
      localStorage.removeItem('s2c_inv_terms')
      localStorage.removeItem('s2c_inv_seller_name')
      localStorage.removeItem('s2c_inv_seller_address')
      localStorage.removeItem('s2c_inv_seller_trn')
      localStorage.removeItem('s2c_inv_buyer_name')
      localStorage.removeItem('s2c_inv_buyer_address')
      localStorage.removeItem('s2c_inv_buyer_email')
      localStorage.removeItem('s2c_inv_buyer_phone')
      localStorage.removeItem('s2c_inv_buyer_trn')
      localStorage.removeItem('s2c_inv_items')
      localStorage.removeItem('s2c_inv_max_items_p1')
      localStorage.removeItem('s2c_inv_bank_name')
      localStorage.removeItem('s2c_inv_bank_account')
      localStorage.removeItem('s2c_inv_bank_iban')
      localStorage.removeItem('s2c_inv_bank_swift')
      localStorage.removeItem('s2c_inv_bank_type')
      localStorage.removeItem('s2c_inv_beneficiary_name')
      localStorage.removeItem('s2c_inv_remarks')
      window.location.reload()
    }
  }

  // Fetch all invoices from Database
  const fetchInvoices = async () => {
    setIsLoadingList(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setInvoicesList(data || [])
    } catch (err) {
      console.error('Error fetching invoices:', err)
    } finally {
      setIsLoadingList(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

  // Save/Update to Database
  const handleSaveToDatabase = async () => {
    setIsSaving(true)
    try {
      const invoiceData = {
        invoice_title: invoiceTitle,
        title_font_size: titleFontSize,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        terms: terms,
        due_date: dueDate,
        seller_name: sellerName,
        seller_address: sellerAddress,
        seller_trn: sellerTrn,
        buyer_name: buyerName,
        buyer_address: buyerAddress,
        buyer_trn: buyerTrn || '-',
        buyer_email: buyerEmail || '-',
        buyer_phone: buyerPhone || '-',
        bank_name: bankName,
        bank_account: bankAccount,
        bank_iban: bankIban,
        bank_swift: bankSwift,
        bank_type: bankType,
        beneficiary_name: beneficiaryName,
        remarks: remarks,
        sub_total: subTotal,
        vat: vat,
        total: total,
        amount_in_words: amountInWords,
        line_items: lineItems,
        max_items_page1: maxItemsPage1
      }

      if (currentInvoiceId) {
        // Update existing invoice
        const { error } = await supabase
          .from('invoices')
          .update({
            ...invoiceData,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentInvoiceId)
        if (error) throw error
      } else {
        // Insert new invoice
        const { data, error } = await supabase
          .from('invoices')
          .insert([invoiceData])
          .select()
        if (error) throw error
        if (data && data[0]) {
          setCurrentInvoiceId(data[0].id)
        }
      }
      
      // Save local storage cache as well
      localStorage.setItem('s2c_inv_title', invoiceTitle)
      localStorage.setItem('s2c_inv_title_size', String(titleFontSize))
      localStorage.setItem('s2c_inv_no', invoiceNo)
      localStorage.setItem('s2c_inv_date', invoiceDate)
      localStorage.setItem('s2c_inv_terms', String(terms))
      localStorage.setItem('s2c_inv_seller_name', sellerName)
      localStorage.setItem('s2c_inv_seller_address', sellerAddress)
      localStorage.setItem('s2c_inv_seller_trn', sellerTrn)
      localStorage.setItem('s2c_inv_buyer_name', buyerName)
      localStorage.setItem('s2c_inv_buyer_address', buyerAddress)
      localStorage.setItem('s2c_inv_buyer_email', buyerEmail)
      localStorage.setItem('s2c_inv_buyer_phone', buyerPhone)
      localStorage.setItem('s2c_inv_buyer_trn', buyerTrn)
      localStorage.setItem('s2c_inv_items', JSON.stringify(lineItems))
      localStorage.setItem('s2c_inv_max_items_p1', String(maxItemsPage1))
      localStorage.setItem('s2c_inv_bank_name', bankName)
      localStorage.setItem('s2c_inv_bank_account', bankAccount)
      localStorage.setItem('s2c_inv_bank_iban', bankIban)
      localStorage.setItem('s2c_inv_bank_swift', bankSwift)
      localStorage.setItem('s2c_inv_bank_type', bankType)
      localStorage.setItem('s2c_inv_beneficiary_name', beneficiaryName)
      localStorage.setItem('s2c_inv_remarks', remarks)

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      fetchInvoices()
    } catch (err: any) {
      console.error('Error saving invoice:', err)
      alert('Error saving invoice: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Load Invoice
  const handleLoadInvoice = (inv: any) => {
    setCurrentInvoiceId(inv.id)
    setInvoiceTitle(inv.invoice_title || 'TAX INVOICE')
    setTitleFontSize(inv.title_font_size || 72)
    setInvoiceNo(inv.invoice_no || '')
    setInvoiceDate(inv.invoice_date || '')
    setTerms(inv.terms || 5)
    setSellerName(inv.seller_name || '')
    setSellerAddress(inv.seller_address || '')
    setSellerTrn(inv.seller_trn || '')
    setBuyerName(inv.buyer_name || '')
    setBuyerAddress(inv.buyer_address || '')
    setBuyerEmail(inv.buyer_email || '')
    setBuyerPhone(inv.buyer_phone || '')
    setBuyerTrn(inv.buyer_trn || '')
    setLineItems(createDefaultLineItems(inv.line_items))
    setMaxItemsPage1(inv.max_items_page1 || 5)
    setBankName(inv.bank_name || 'Wio Bank')
    setBankAccount(inv.bank_account || '9854848878')
    setBankIban(inv.bank_iban || 'AE460860000009854848878')
    setBankSwift(inv.bank_swift || 'WIOBAEADXXX')
    setBankType(inv.bank_type || 'Current Account')
    setBeneficiaryName(inv.beneficiary_name || '')
    setRemarks(inv.remarks || '')
    
    // Smooth scroll to top of page/editor
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Delete Invoice
  const handleDeleteInvoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to permanently delete this invoice from the database?')) {
      try {
        const { error } = await supabase
          .from('invoices')
          .delete()
          .eq('id', id)
        if (error) throw error
        
        if (currentInvoiceId === id) {
          setCurrentInvoiceId(null)
        }
        
        fetchInvoices()
      } catch (err: any) {
        console.error('Error deleting invoice:', err)
        alert('Error deleting invoice: ' + err.message)
      }
    }
  }

  // New Invoice
  const handleNewInvoice = () => {
    if (window.confirm('Start a new invoice? This will clear the canvas.')) {
      setCurrentInvoiceId(null)
      setInvoiceTitle('TAX INVOICE')
      setTitleFontSize(72)
      setInvoiceNo(`SADL-INV-26-${String(invoicesList.length + 1).padStart(3, '0')}`)
      
      const today = new Date()
      const d = String(today.getDate()).padStart(2, '0')
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const y = today.getFullYear()
      setInvoiceDate(`${d}-${m}-${y}`)
      
      setTerms(5)
      setSellerName('Zenarise Trading L.L.C-FZ')
      setSellerAddress('Meydan Grandstand, 6th floor, Meydan Road,\nNad Al Sheba, Dubai, U.A.E.')
      setSellerTrn('104554276600003')
      setBuyerName('')
      setBuyerAddress('')
      setBuyerEmail('')
      setBuyerPhone('')
      setBuyerTrn('')
      setLineItems(createDefaultLineItems())
      setMaxItemsPage1(5)
      setBankName('WIO Bank PJSC (UAE)')
      setBankAccount('9854848878')
      setBankIban('AE460860000009854848878')
      setBankSwift('WIOBAEADXXX')
      setBankType('Current Account')
      setBeneficiaryName('Zenarise Trading L.L.C-FZ')
      setRemarks('Kindly send proof of payments to accounts@saddl.io with email subject "INV# - Proof of Payment"')
    }
  }

  // Clear specific line item (actually deletes it from the array)
  const clearItem = (id: string) => {
    setLineItems(prev => {
      const filtered = prev.filter(item => item.id !== id)
      // Re-index serial numbers (SNO) to keep them sequential
      return filtered.map((item, idx) => ({ ...item, sno: idx + 1 }))
    })
  }

  // Add a new line item (capped at maximum 10 items)
  const handleAddItem = () => {
    setLineItems(prev => {
      if (prev.length >= 10) return prev
      const nextSno = prev.length + 1
      return [
        ...prev,
        {
          id: `item-${nextSno}-${Date.now()}`,
          sno: nextSno,
          description: '',
          qty: 0,
          rate: 0
        }
      ]
    })
  }

  // Items handlers
  const handleItemChange = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = prev.map(item => {
        if (item.id !== id) return item
        return { ...item, [field]: value }
      })

      // Auto-append a new blank item if:
      // 1. The modified item is the last one in the current list
      // 2. The current list length is less than 10
      // 3. The modified item now has content entered (description is non-empty, OR qty > 0, OR rate > 0)
      const modifiedIdx = prev.findIndex(item => item.id === id)
      if (modifiedIdx === prev.length - 1 && prev.length < 10) {
        const modifiedItem = updated[modifiedIdx]
        const hasContent = modifiedItem.description.trim() !== '' || modifiedItem.qty > 0 || modifiedItem.rate > 0
        if (hasContent) {
          const nextSno = updated.length + 1
          return [
            ...updated,
            {
              id: `item-${nextSno}-${Date.now()}`,
              sno: nextSno,
              description: '',
              qty: 0,
              rate: 0
            }
          ]
        }
      }

      return updated
    })
  }


  // Totals calculations
  const subTotal = lineItems.reduce((acc, curr) => acc + (curr.qty * curr.rate), 0)
  const vat = subTotal * 0.05
  const total = subTotal + vat
  const amountInWords = numberToWords(total)

  // Multi-page split layout logic
  const isMultiPage = lineItems.length > maxItemsPage1
  const page1Items = isMultiPage ? lineItems.slice(0, maxItemsPage1) : lineItems
  const page2Items = isMultiPage ? lineItems.slice(maxItemsPage1) : []

  return (
    <div className="w-full max-w-[1700px] mx-auto space-y-6 px-4 py-4 print:p-0 print:m-0 animate-fade-in">
      {/* Control Board - Hidden in Printing */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-card border border-white/5 rounded-xl shadow-2xl print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg animate-pulse">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight">Interactive Billing Invoice Engine</h1>
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider opacity-60 mt-1.5">
            Create, edit, customize and print standard invoices matching Saddl's tax layout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-zinc-400 border border-white/10 hover:bg-white/5 rounded-lg transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={handleNewInvoice}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 rounded-lg transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            New Invoice
          </button>
          <button
            onClick={handleSaveToDatabase}
            disabled={isSaving}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-green-400 border border-green-500/20 hover:bg-green-500/10 rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-green-400 animate-bounce" />
                Saved to DB!
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                {currentInvoiceId ? 'Update Invoice' : 'Save Invoice'}
              </>
            )}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg shadow-lg shadow-brand-blue/20 transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Editor & Preview Workspace Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
        
        {/* Left Side: Parameters Editor Panel - Hidden in Printing */}
        {/* Left Side: Parameters Editor Panel - Hidden in Printing */}
        <div className="lg:col-span-5 print:hidden">
          <div className="space-y-4">
            
            {/* Card 1: Invoice Settings */}
            <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Invoice Settings</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Title / Document Header</label>
                    <input
                      type="text"
                      value={invoiceTitle}
                      onChange={e => setInvoiceTitle(e.target.value)}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold transition-all"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Size (px)</label>
                    <input
                      type="number"
                      value={titleFontSize}
                      onChange={e => setTitleFontSize(Math.max(10, Math.min(150, Number(e.target.value))))}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Number</label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={e => setInvoiceNo(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div ref={datepickerRef} className="relative">
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Date</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={invoiceDate}
                        onChange={e => setInvoiceDate(e.target.value)}
                        placeholder="DD-MM-YYYY"
                        onFocus={() => setShowCalendar(true)}
                        className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                      />
                    </div>

                    {/* Premium Calendar Sheet Dropdown */}
                    {showCalendar && (
                      <div className="absolute left-0 mt-1.5 w-[250px] bg-[#0f1322] border border-white/10 rounded-xl p-3 shadow-2xl z-50 animate-fade-in font-sans">
                          {/* Calendar Header */}
                          <div className="flex items-center justify-between mb-2.5 px-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (calendarMonth === 0) {
                                  setCalendarMonth(11)
                                  setCalendarYear(prev => prev - 1)
                                } else {
                                  setCalendarMonth(prev => prev - 1)
                                }
                              }}
                              className="text-[10px] font-black text-zinc-400 hover:text-white transition-colors"
                            >
                              &larr;
                            </button>
                            <span className="text-[9px] font-black uppercase text-white tracking-widest">
                              {new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (calendarMonth === 11) {
                                  setCalendarMonth(0)
                                  setCalendarYear(prev => prev + 1)
                                } else {
                                  setCalendarMonth(prev => prev + 1)
                                }
                              }}
                              className="text-[10px] font-black text-zinc-400 hover:text-white transition-colors"
                            >
                              &rarr;
                            </button>
                          </div>

                          {/* Weekdays */}
                          <div className="grid grid-cols-7 gap-1 text-center mb-1">
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                              <div key={day} className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                {day}
                              </div>
                            ))}
                          </div>

                          {/* Days Grid */}
                          <div className="grid grid-cols-7 gap-1 text-center">
                            {days.map((item, idx) => {
                              const parsedCurrent = parseDate(invoiceDate)
                              const isSelected = parsedCurrent && 
                                parsedCurrent.getDate() === item.date.getDate() &&
                                parsedCurrent.getMonth() === item.date.getMonth() &&
                                parsedCurrent.getFullYear() === item.date.getFullYear()

                              const isToday = new Date().getDate() === item.date.getDate() &&
                                new Date().getMonth() === item.date.getMonth() &&
                                new Date().getFullYear() === item.date.getFullYear()

                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSelectDay(item.date)}
                                  className={`
                                    h-6 w-6 text-[10px] font-bold rounded flex items-center justify-center transition-all cursor-pointer mx-auto
                                    ${isSelected 
                                      ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/30' 
                                      : item.isCurrentMonth
                                        ? 'text-zinc-200 hover:bg-white/5'
                                        : 'text-zinc-600 hover:text-zinc-400'
                                    }
                                    ${isToday && !isSelected ? 'border border-brand-blue/40 text-brand-blue' : ''}
                                  `}
                                >
                                  {item.day}
                                </button>
                              )
                            })}
                          </div>

                          {/* Footer */}
                          <div className="flex items-center justify-between border-t border-white/5 mt-2.5 pt-2">
                            <button
                              type="button"
                              onClick={() => handleSelectDay(new Date())}
                              className="text-[9px] font-black uppercase text-brand-blue hover:text-brand-blue/80 transition-colors"
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCalendar(false)}
                              className="text-[9px] font-black uppercase text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Payment Terms</label>
                    <select
                      value={terms}
                      onChange={e => setTerms(Number(e.target.value))}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                    >
                      <option value={5}>5 Days</option>
                      <option value={7}>7 Days</option>
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={45}>45 Days</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Max Items P1</label>
                    <select
                      value={maxItemsPage1}
                      onChange={e => setMaxItemsPage1(Number(e.target.value))}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                    >
                      <option value={1}>1 Item</option>
                      <option value={2}>2 Items</option>
                      <option value={3}>3 Items</option>
                      <option value={4}>4 Items</option>
                      <option value={5}>5 Items</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Supplier Details (Seller) */}
            <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Supplier Details (Seller)</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Supplier Name</label>
                  <input
                    type="text"
                    value={sellerName}
                    onChange={e => setSellerName(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Supplier Address</label>
                  <textarea
                    value={sellerAddress}
                    onChange={e => setSellerAddress(e.target.value)}
                    rows={2}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all resize-none font-sans overflow-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Supplier TRN</label>
                  <input
                    type="text"
                    value={sellerTrn}
                    onChange={e => setSellerTrn(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Client Details (Bill To) */}
            <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Client Details (Bill To)</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Company Name</label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={e => setBuyerName(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">TRN No</label>
                  <input
                    type="text"
                    value={buyerTrn}
                    onChange={e => setBuyerTrn(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Add Client Address :</label>
                  <textarea
                    value={buyerAddress}
                    onChange={e => setBuyerAddress(e.target.value)}
                    rows={2}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all resize-none font-sans overflow-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Contact Email</label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={e => setBuyerEmail(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Contact Number</label>
                  <input
                    type="text"
                    value={buyerPhone}
                    onChange={e => setBuyerPhone(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Line Items Manager */}
            <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Line Items (Max 10 Rows)</h3>
              </div>
              <div className="p-4">
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                  {lineItems.map(item => (
                    <div key={item.id} className="bg-[#070913] border border-white/10 rounded-lg p-3 space-y-2 relative group hover:border-white/20 transition-colors">
                      <button
                        onClick={() => clearItem(item.id)}
                        title="Delete Line Item"
                        className="absolute top-2.5 right-2.5 text-red-500/50 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Item #{item.sno}</div>
                      <div>
                        <textarea
                          value={item.description}
                          onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                          placeholder="Description"
                          rows={3}
                          className="w-full bg-[#0b0e1a] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded px-2.5 py-1.5 text-[13px] text-white font-medium resize-none font-sans overflow-hidden"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] font-black text-zinc-400 uppercase mb-0.5">Qty</label>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={e => handleItemChange(item.id, 'qty', Math.max(1, Number(e.target.value)))}
                            className="w-full bg-[#0b0e1a] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded px-2.5 py-1 text-[13px] text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-zinc-400 uppercase mb-0.5">Rate (AED)</label>
                          <input
                            type="number"
                            value={item.rate}
                            onChange={e => handleItemChange(item.id, 'rate', Math.max(0, Number(e.target.value)))}
                            className="w-full bg-[#0b0e1a] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded px-2.5 py-1 text-[13px] text-white font-bold font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dynamic Add Item Controller */}
                {lineItems.length < 10 ? (
                  <button
                    onClick={handleAddItem}
                    className="w-full mt-4 flex items-center justify-center gap-1.5 py-2 text-xs font-black uppercase tracking-wider text-brand-blue border border-brand-blue/20 hover:bg-brand-blue/10 rounded-lg transition-all active:scale-[0.98]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Line Item ({lineItems.length}/10)
                  </button>
                ) : (
                  <div className="w-full mt-4 text-center py-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 border border-white/5 bg-white/[0.01] rounded-lg">
                    Maximum of 10 line items reached
                  </div>
                )}
              </div>
            </div>

            {/* Card 5: Note / Remarks */}
            <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Note / Remarks</h3>
              </div>
              <div className="p-4">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Note</label>
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  rows={2}
                  className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all resize-none font-sans overflow-hidden"
                />
              </div>
            </div>

            {/* Card 6: Account Details */}
            <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Account Details</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Beneficiary Name</label>
                  <input
                    type="text"
                    value={beneficiaryName}
                    onChange={e => setBeneficiaryName(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Account Number</label>
                    <input
                      type="text"
                      value={bankAccount}
                      onChange={e => setBankAccount(e.target.value)}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Account Type</label>
                    <input
                      type="text"
                      value={bankType}
                      onChange={e => setBankType(e.target.value)}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">IBAN</label>
                    <input
                      type="text"
                      value={bankIban}
                      onChange={e => setBankIban(e.target.value)}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">SWIFT Code</label>
                    <input
                      type="text"
                      value={bankSwift}
                      onChange={e => setBankSwift(e.target.value)}
                      className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Right Side: The Tax Invoice Visual Sheet */}
        <div id="invoice-preview-column" className="lg:col-span-7 flex flex-col items-center bg-zinc-950 p-4 lg:p-6 rounded-2xl border border-white/5 overflow-hidden shadow-2xl print:bg-white print:border-none print:p-0 print:shadow-none print:rounded-none w-full">
          
          {/* Scroll/Scale Container using exactly A4 aspect ratio 2480 x 3508 */}
          <div 
            id="invoice-preview-container" 
            className="w-full relative overflow-hidden select-text bg-[#C5C5C5] border border-zinc-600 rounded-lg print:bg-white print:border-none print:rounded-none"
            style={{ 
              height: isMultiPage 
                ? `${containerWidth * (3508 / 2480) * 2 + 20}px` 
                : `${containerWidth * (3508 / 2480)}px` 
            }}
          >
            {/* Page 1: The Actual Invoice White Page with exactly 2480 x 3508 px coordinates */}
            <div 
              id="invoice-page-1"
              className="invoice-sheet bg-white text-zinc-900 font-sans p-[100px] border border-zinc-400 shadow-md flex flex-col justify-between absolute top-0 left-0 origin-top-left print:border-none print:p-[60px]"
              style={{ 
                width: '2480px', 
                height: '3508px', 
                transform: `scale(${scale})`,
                WebkitTransform: `scale(${scale})`,
              }}
            >
              
              {/* Top Section */}
              <div>
                <div className="flex justify-between items-center border-b-[6px] border-zinc-800 pb-[40px] mb-[60px]">
                  {/* Logo Container */}
                  <div className="flex flex-col items-start">
                    <img 
                      src={saddlLogo} 
                      alt="Saddl Logo" 
                      className="h-[200px] w-auto object-contain"
                    />
                  </div>
                  {/* Header Title */}
                  <div className="text-right">
                    <h1 
                      className="font-black tracking-[0.05em] uppercase"
                      style={{ fontSize: `${titleFontSize}px` }}
                    >
                      {renderVal(invoiceTitle)}
                    </h1>
                    <div className="text-[32px] font-bold text-zinc-600 mt-[10px]">
                      Invoice No : <span className="font-mono text-zinc-900 font-bold">{renderVal(invoiceNo)}</span>
                    </div>
                  </div>
                </div>

                {/* Seller & Details Metadata Matrix */}
                <div className="grid grid-cols-12 gap-[40px] border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                  {/* Company Details (Seller) */}
                  <div className="col-span-7 border-r-[3px] border-zinc-400 pr-[40px]">
                    <div className="font-black text-zinc-900 uppercase text-[38px] mb-[10px]">{renderVal(sellerName)}</div>
                    <div className="text-zinc-600 leading-relaxed whitespace-pre-line">{renderVal(sellerAddress)}</div>
                    <div className="font-semibold text-zinc-700 mt-[20px]">
                      TRN No : <span className="font-mono">{renderVal(sellerTrn)}</span>
                    </div>
                  </div>
                  {/* Invoice Metadata (Right block) */}
                  <div className="col-span-5 pl-[20px] flex flex-col justify-between">
                    <div className="grid grid-cols-3 gap-y-[20px]">
                      <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Date</div>
                      <div className="col-span-2 font-mono text-zinc-800 font-bold text-right">{renderVal(invoiceDate)}</div>

                      <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Terms</div>
                      <div className="col-span-2 text-zinc-800 font-semibold text-right">{terms ? `${terms} Days` : '-'}</div>

                      <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Due Date</div>
                      <div className="col-span-2 font-mono text-zinc-800 font-bold text-right">{renderVal(dueDate)}</div>
                    </div>
                  </div>
                </div>

                {/* Bill To Block */}
                <div className="border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                  <div className="font-bold text-zinc-500 uppercase tracking-wider mb-[15px] border-b-[3px] border-zinc-400 pb-[10px]">Bill To</div>
                  <div className="font-black text-zinc-900 text-[38px] uppercase">{renderVal(buyerName)}</div>
                  <div className="text-zinc-600 leading-relaxed mt-[10px] whitespace-pre-line">{renderVal(buyerAddress)}</div>
                  <div className="text-zinc-600 font-semibold mt-[20px] space-y-[10px]">
                    <div>TRN No: <span className="font-mono text-zinc-800">{renderVal(buyerTrn)}</span></div>
                    <div>Contact Email: <span className="underline font-mono text-zinc-800">{renderVal(buyerEmail)}</span></div>
                    <div>Contact Number: <span className="font-mono text-zinc-800">{renderVal(buyerPhone)}</span></div>
                  </div>
                </div>

                {/* Main Line Items Table */}
                <div className="border-[3px] border-zinc-400 rounded-[10px] overflow-hidden mb-[40px] text-[32px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-100 text-zinc-700 border-b-[3px] border-zinc-400 font-bold uppercase tracking-wider text-[30px]">
                        <th className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center w-[120px]">S.NO</th>
                        <th className="px-[40px] py-[25px] border-r-[3px] border-zinc-400">DESCRIPTION</th>
                        <th className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center w-[160px]">QTY</th>
                        <th className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right w-[260px]">RATE</th>
                        <th className="px-[40px] py-[25px] text-right w-[320px]">AMOUNT (AED)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-[3px] divide-zinc-400">
                      {page1Items.map(item => {
                        const hasContent = item.description.trim() !== '' || item.qty > 0 || item.rate > 0
                        return (
                          <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors min-h-[90px]">
                            <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-bold text-zinc-600">{item.sno}</td>
                            <td className="px-[40px] py-[25px] border-r-[3px] border-zinc-400 font-medium leading-relaxed text-zinc-800">
                              {hasContent ? renderVal(item.description) : '-'}
                            </td>
                            <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-semibold text-zinc-800">
                              {hasContent && item.qty > 0 ? item.qty : '-'}
                            </td>
                            <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right font-mono text-zinc-700 font-semibold">
                              {hasContent && item.rate > 0 ? item.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                            </td>
                            <td className="px-[40px] py-[25px] text-right font-mono text-zinc-900 font-bold">
                              {hasContent && (item.qty * item.rate) > 0 ? (item.qty * item.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                            </td>
                          </tr>
                        )
                      })}
                      {isMultiPage && (
                        <tr className="min-h-[90px]">
                          <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-bold text-zinc-400">-</td>
                          <td className="px-[40px] py-[25px] border-r-[3px] border-zinc-400 font-black leading-relaxed text-zinc-400 italic text-center uppercase tracking-[0.2em] bg-zinc-50/40">
                            --- Continued on Page 2 ---
                          </td>
                          <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-semibold text-zinc-400">-</td>
                          <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right font-mono text-zinc-400 font-semibold">-</td>
                          <td className="px-[40px] py-[25px] text-right font-mono text-zinc-400 font-bold">-</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Sub Total / VAT / Total Breakdown Panel */}
                {!isMultiPage && (
                  <div className="flex justify-end mb-[60px]">
                    <div className="w-[740px] border-[3px] border-zinc-400 rounded-[10px] overflow-hidden text-[32px]">
                      <div className="flex border-b-[3px] border-zinc-400">
                        <div className="w-[420px] px-[40px] py-[20px] font-bold text-zinc-600 uppercase bg-zinc-50 border-r-[3px] border-zinc-400 text-right">SUB TOTAL</div>
                        <div className="w-[320px] px-[40px] py-[20px] text-right font-mono font-bold text-zinc-800">{subTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="flex border-b-[3px] border-zinc-400">
                        <div className="w-[420px] px-[40px] py-[20px] font-bold text-zinc-600 uppercase bg-zinc-50 border-r-[3px] border-zinc-400 text-right">VAT(5%)</div>
                        <div className="w-[320px] px-[40px] py-[20px] text-right font-mono font-bold text-zinc-800">{vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="flex bg-zinc-100/80">
                        <div className="w-[420px] px-[40px] py-[20px] font-black text-zinc-700 uppercase border-r-[3px] border-zinc-400 text-right">TOTAL</div>
                        <div className="w-[320px] px-[40px] py-[20px] text-right font-mono font-black text-zinc-900 text-[36px]">{total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Words Translation block */}
                {!isMultiPage && (
                  <div className="border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                    <div className="font-semibold text-zinc-700">
                      <span className="font-bold text-zinc-900 uppercase">Amount in Words:</span> {amountInWords}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Section */}
              {!isMultiPage ? (
                <div className="space-y-[40px]">
                  {/* Note block */}
                  <div className="text-zinc-600 text-[30px] leading-relaxed border-b-[3px] border-zinc-400 pb-[20px]">
                    <span className="font-bold text-zinc-800">Note :</span> {renderVal(remarks)}
                  </div>

                  {/* Account Details block */}
                  <div className="border-[3px] border-zinc-400 rounded-[10px] p-[40px] bg-zinc-50/50 text-[30px] space-y-[10px]">
                    <div className="font-black text-zinc-800 uppercase tracking-wider mb-[20px]">Account Details</div>
                    <div className="grid grid-cols-12 gap-y-[15px]">
                      <div className="col-span-4 font-bold text-zinc-500">Beneficiary Name</div>
                      <div className="col-span-8 font-semibold text-zinc-900">{renderVal(beneficiaryName)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Bank Name</div>
                      <div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankName)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Account Number</div>
                      <div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankAccount)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">IBAN</div>
                      <div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankIban)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Bank / SWIFT Code</div>
                      <div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankSwift)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Account Type</div>
                      <div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankType)}</div>
                    </div>
                  </div>

                  {/* Footer block */}
                  <div className="border-[3px] border-zinc-400 p-[20px] bg-zinc-100 rounded-[10px] text-center text-[28px] font-bold uppercase tracking-wider text-zinc-600">
                    This is a computer-generated invoice and does not require a signature.
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center text-[28px] font-bold text-zinc-400 border-t-[3px] border-zinc-300 pt-[20px]">
                  <div>Page 1 of 2</div>
                  <div className="uppercase tracking-[0.1em]">Zenarise Trading L.L.C-FZ</div>
                </div>
              )}

            </div>

            {/* Page 2: Conditional Second Page Canvas */}
            {isMultiPage && (
              <div 
                id="invoice-page-2"
                className="invoice-sheet bg-white text-zinc-900 font-sans p-[100px] border border-zinc-400 shadow-md flex flex-col justify-between absolute left-0 origin-top-left print:border-none print:p-[60px]"
                style={{ 
                  width: '2480px', 
                  height: '3508px', 
                  transform: `scale(${scale})`,
                  WebkitTransform: `scale(${scale})`,
                  top: `${3508 * scale + 20}px`,
                }}
              >
                
                {/* Top Section */}
                <div>
                  <div className="flex justify-between items-center border-b-[6px] border-zinc-800 pb-[40px] mb-[60px]">
                    {/* Logo Container */}
                    <div className="flex flex-col items-start">
                      <img 
                        src={saddlLogo} 
                        alt="Saddl Logo" 
                        className="h-[200px] w-auto object-contain"
                      />
                    </div>
                    {/* Header Title */}
                    <div className="text-right">
                      <h1 
                        className="font-black tracking-[0.05em] uppercase"
                        style={{ fontSize: `${titleFontSize}px` }}
                      >
                        {renderVal(invoiceTitle)}
                      </h1>
                      <div className="text-[32px] font-bold text-zinc-600 mt-[10px]">
                        Invoice No : <span className="font-mono text-zinc-900 font-bold">{renderVal(invoiceNo)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Seller & Details Metadata Matrix */}
                  <div className="grid grid-cols-12 gap-[40px] border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                    {/* Company Details (Seller) */}
                    <div className="col-span-7 border-r-[3px] border-zinc-400 pr-[40px]">
                      <div className="font-black text-zinc-900 uppercase text-[38px] mb-[10px]">{renderVal(sellerName)}</div>
                      <div className="text-zinc-600 leading-relaxed whitespace-pre-line">{renderVal(sellerAddress)}</div>
                      <div className="font-semibold text-zinc-700 mt-[20px]">
                        TRN No : <span className="font-mono">{renderVal(sellerTrn)}</span>
                      </div>
                    </div>
                    {/* Invoice Metadata (Right block) */}
                    <div className="col-span-5 pl-[20px] flex flex-col justify-between">
                      <div className="grid grid-cols-3 gap-y-[20px]">
                        <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Date</div>
                        <div className="col-span-2 font-mono text-zinc-800 font-bold text-right">{renderVal(invoiceDate)}</div>

                        <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Terms</div>
                        <div className="col-span-2 text-zinc-800 font-semibold text-right">{terms ? `${terms} Days` : '-'}</div>

                        <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Due Date</div>
                        <div className="col-span-2 font-mono text-zinc-800 font-bold text-right">{renderVal(dueDate)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Bill To Block */}
                  <div className="border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                    <div className="font-bold text-zinc-500 uppercase tracking-wider mb-[15px] border-b-[3px] border-zinc-400 pb-[10px]">Bill To</div>
                    <div className="font-black text-zinc-900 text-[38px] uppercase">{renderVal(buyerName)}</div>
                    <div className="text-zinc-600 leading-relaxed mt-[10px] whitespace-pre-line">{renderVal(buyerAddress)}</div>
                    <div className="text-zinc-600 font-semibold mt-[20px] space-y-[10px]">
                      <div>TRN No: <span className="font-mono text-zinc-800">{renderVal(buyerTrn)}</span></div>
                      <div>Contact Email: <span className="underline font-mono text-zinc-800">{renderVal(buyerEmail)}</span></div>
                      <div>Contact Number: <span className="font-mono text-zinc-800">{renderVal(buyerPhone)}</span></div>
                    </div>
                  </div>

                  {/* Main Line Items Table */}
                  <div className="border-[3px] border-zinc-400 rounded-[10px] overflow-hidden mb-[40px] text-[32px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-100 text-zinc-700 border-b-[3px] border-zinc-400 font-bold uppercase tracking-wider text-[30px]">
                          <th className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center w-[120px]">S.NO</th>
                          <th className="px-[40px] py-[25px] border-r-[3px] border-zinc-400">DESCRIPTION</th>
                          <th className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center w-[160px]">QTY</th>
                          <th className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right w-[260px]">RATE</th>
                          <th className="px-[40px] py-[25px] text-right w-[320px]">AMOUNT (AED)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-[3px] divide-zinc-400">
                        {page2Items.map(item => {
                          const hasContent = item.description.trim() !== '' || item.qty > 0 || item.rate > 0
                          return (
                            <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors min-h-[90px]">
                              <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-bold text-zinc-600">{item.sno}</td>
                              <td className="px-[40px] py-[25px] border-r-[3px] border-zinc-400 font-medium leading-relaxed text-zinc-800">
                                {hasContent ? renderVal(item.description) : '-'}
                              </td>
                              <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-semibold text-zinc-800">
                                {hasContent && item.qty > 0 ? item.qty : '-'}
                              </td>
                              <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right font-mono text-zinc-700 font-semibold">
                                {hasContent && item.rate > 0 ? item.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                              </td>
                              <td className="px-[40px] py-[25px] text-right font-mono text-zinc-900 font-bold">
                                {hasContent && (item.qty * item.rate) > 0 ? (item.qty * item.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Sub Total / VAT / Total Breakdown Panel */}
                  <div className="flex justify-end mb-[60px]">
                    <div className="w-[740px] border-[3px] border-zinc-400 rounded-[10px] overflow-hidden text-[32px]">
                      <div className="flex border-b-[3px] border-zinc-400">
                        <div className="w-[420px] px-[40px] py-[20px] font-bold text-zinc-600 uppercase bg-zinc-50 border-r-[3px] border-zinc-400 text-right">SUB TOTAL</div>
                        <div className="w-[320px] px-[40px] py-[20px] text-right font-mono font-bold text-zinc-800">{subTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="flex border-b-[3px] border-zinc-400">
                        <div className="w-[420px] px-[40px] py-[20px] font-bold text-zinc-600 uppercase bg-zinc-50 border-r-[3px] border-zinc-400 text-right">VAT(5%)</div>
                        <div className="w-[320px] px-[40px] py-[20px] text-right font-mono font-bold text-zinc-800">{vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="flex bg-zinc-100/80">
                        <div className="w-[420px] px-[40px] py-[20px] font-black text-zinc-700 uppercase border-r-[3px] border-zinc-400 text-right">TOTAL</div>
                        <div className="w-[320px] px-[40px] py-[20px] text-right font-mono font-black text-zinc-900 text-[36px]">{total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>

                  {/* Words Translation block */}
                  <div className="border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                    <div className="font-semibold text-zinc-700">
                      <span className="font-bold text-zinc-900 uppercase">Amount in Words:</span> {amountInWords}
                    </div>
                  </div>
                </div>

                {/* Bottom Section */}
                <div className="space-y-[40px]">
                  {/* Note block */}
                  <div className="text-zinc-600 text-[30px] leading-relaxed border-b-[3px] border-zinc-400 pb-[20px]">
                    <span className="font-bold text-zinc-800">Note :</span> {renderVal(remarks)}
                  </div>

                  {/* Account Details block */}
                  <div className="border-[3px] border-zinc-400 rounded-[10px] p-[40px] bg-zinc-50/50 text-[30px] space-y-[10px]">
                    <div className="font-black text-zinc-800 uppercase tracking-wider mb-[20px]">Account Details</div>
                    <div className="grid grid-cols-12 gap-y-[15px]">
                      <div className="col-span-4 font-bold text-zinc-500">Beneficiary Name</div>
                      <div className="col-span-8 font-semibold text-zinc-900">{renderVal(beneficiaryName)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Bank Name</div>
                      <div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankName)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Account Number</div>
                      <div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankAccount)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">IBAN</div>
                      <div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankIban)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Bank / SWIFT Code</div>
                      <div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankSwift)}</div>

                      <div className="col-span-4 font-bold text-zinc-500">Account Type</div>
                      <div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankType)}</div>
                    </div>
                  </div>

                  {/* Footer block */}
                  <div className="border-[3px] border-zinc-400 p-[20px] bg-zinc-100 rounded-[10px] text-center text-[28px] font-bold uppercase tracking-wider text-zinc-600">
                    This is a computer-generated invoice and does not require a signature.
                  </div>

                  {/* Page numbering footer for Page 2 */}
                  <div className="flex justify-between items-center text-[28px] font-bold text-zinc-400 border-t-[3px] border-zinc-300 pt-[20px]">
                    <div>Page 2 of 2</div>
                    <div className="uppercase tracking-[0.1em]">Zenarise Trading L.L.C-FZ</div>
                  </div>
                </div>

              </div>
            )}
          </div>
          </div>

        </div>

      {/* Saved Invoices Registry Section */}
      <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-6 print:hidden">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <List className="w-5 h-5 text-brand-blue" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Saved Invoices Registry</h2>
            <span className="bg-[#1e293b] text-zinc-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
              {invoicesList.length} total
            </span>
          </div>
          <button
            onClick={fetchInvoices}
            disabled={isLoadingList}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 border border-white/10 hover:bg-white/5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
        </div>

        {isLoadingList ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <RefreshCw className="w-8 h-8 text-brand-blue animate-spin" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Loading Invoices...</p>
          </div>
        ) : invoicesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/10 rounded-lg bg-zinc-950/20">
            <FileText className="w-10 h-10 text-zinc-600 mb-2.5" />
            <p className="text-sm font-black text-zinc-400 uppercase tracking-wider">No Saved Invoices Found</p>
            <p className="text-xs text-zinc-500 mt-1">Create an invoice and click the Save button to persist it in the database.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-black">Invoice No</th>
                  <th className="py-3 px-4 font-black">Date</th>
                  <th className="py-3 px-4 font-black">Client (Bill To)</th>
                  <th className="py-3 px-4 font-black text-right">Total Amount</th>
                  <th className="py-3 px-4 font-black text-center w-[200px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoicesList.map((inv) => {
                  const isCurrent = currentInvoiceId === inv.id
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => handleLoadInvoice(inv)}
                      className={`group hover:bg-white/[0.02] cursor-pointer transition-all duration-150 ${
                        isCurrent ? 'bg-blue-500/[0.03] border-l-2 border-l-brand-blue' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-white group-hover:text-brand-blue transition-colors flex items-center gap-2">
                        {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse shrink-0" />}
                        {inv.invoice_no || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300 font-medium font-mono">{inv.invoice_date || '-'}</td>
                      <td className="py-3.5 px-4 text-zinc-300">
                        <div className="font-semibold truncate max-w-[280px]">{inv.buyer_name || '-'}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[280px]">{inv.buyer_email || '-'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleLoadInvoice(inv)}
                            className="flex items-center justify-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-blue hover:text-white border border-brand-blue/30 hover:bg-brand-blue rounded transition-all"
                          >
                            Load
                          </button>
                          <button
                            onClick={(e) => handleDeleteInvoice(inv.id, e)}
                            className="flex items-center justify-center p-1 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                            title="Delete permanently from database"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Global CSS Inject to customize printable output */}
      <style>{`
        .invoice-sheet, .invoice-sheet * {
          font-family: Arial, Helvetica, sans-serif !important;
          color: #000000 !important;
          border-color: #000000 !important;
        }
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          /* Hide all UI elements outside the invoice wrapper */
          body, html {
            background-color: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 210mm !important;
            height: ${isMultiPage ? '594mm' : '297mm'} !important;
            overflow: hidden !important;
          }
          header, aside, .print\\:hidden, button, input, select, label {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          #invoice-preview-column {
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: white !important;
            width: 100% !important;
          }
          #invoice-preview-container {
            width: 210mm !important;
            height: ${isMultiPage ? '594mm' : '297mm'} !important;
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            overflow: hidden !important;
            position: relative !important;
          }
          .invoice-sheet {
            width: 2480px !important;
            height: 3508px !important;
            transform: scale(0.318) !important; /* Mathematically scales 2480px down to ~793.7px (210mm) */
            transform-origin: top left !important;
            border: none !important;
            box-shadow: none !important;
            position: absolute !important;
            left: 0 !important;
            padding: 100px !important;
            box-sizing: border-box !important;
            background: white !important;
          }
          #invoice-page-1 {
            top: 0 !important;
          }
          #invoice-page-2 {
            top: 3508px !important;
          }
        }
      `}</style>
    </div>
  )
}
