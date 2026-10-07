import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseDate, formatDateToDDMMYYYY, createDefaultLineItems, numberToWords, LineItem, computeNextInvoiceNumber } from '../components/invoice/utils'

export function useInvoiceData(user?: any) {
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

  const allowedEmails: string[] = ['irfaan.a@zenarise.org']
  const userEmail = currentUser?.email?.toLowerCase() || ''
  const userRole = currentUser?.user_metadata?.role || currentUser?.app_metadata?.role || ''
  const hasAccess = ['Administrator', 'Finance', 'finance'].includes(userRole) || allowedEmails.includes(userEmail)

  // Form Fields
  const [invoiceTitle, setInvoiceTitle] = useState(() => localStorage.getItem('s2c_inv_title') || 'TAX INVOICE')
  const [titleFontSize, setTitleFontSize] = useState(() => Number(localStorage.getItem('s2c_inv_title_size')) || 72)
  const [invoiceNo, setInvoiceNo] = useState(() => localStorage.getItem('s2c_inv_no') || 'SADL-INV-26-001')
  
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const saved = localStorage.getItem('s2c_inv_date')
    if (saved) return saved
    const today = new Date()
    return formatDateToDDMMYYYY(today)
  })
  
  const [terms, setTerms] = useState(() => Number(localStorage.getItem('s2c_inv_terms')) || 5)
  const [dueDate, setDueDate] = useState('')

  // Calendar
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

  // Seller Details
  const [sellerName, setSellerName] = useState(() => {
    const saved = localStorage.getItem('s2c_inv_seller_name')
    if (!saved || saved === 'Zenarise Trading LLC FZ') {
      localStorage.setItem('s2c_inv_seller_name', 'Zenarise Trading L.L.C-FZ')
      return 'Zenarise Trading L.L.C-FZ'
    }
    return saved
  })
  const [sellerAddress, setSellerAddress] = useState(() => localStorage.getItem('s2c_inv_seller_address') || 'Meydan Grandstand, 6th floor, Meydan Road,\nNad Al Sheba, Dubai, U.A.E.')
  const [sellerTrn, setSellerTrn] = useState(() => localStorage.getItem('s2c_inv_seller_trn') || '104554276600003')

  // Buyer Details
  const [buyerName, setBuyerName] = useState(() => localStorage.getItem('s2c_inv_buyer_name') || '')
  const [buyerAddress, setBuyerAddress] = useState(() => localStorage.getItem('s2c_inv_buyer_address') || '')
  const [buyerEmail, setBuyerEmail] = useState(() => localStorage.getItem('s2c_inv_buyer_email') || '')
  const [buyerPhone, setBuyerPhone] = useState(() => localStorage.getItem('s2c_inv_buyer_phone') || '')
  const [buyerTrn, setBuyerTrn] = useState(() => localStorage.getItem('s2c_inv_buyer_trn') || '')

  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    const saved = localStorage.getItem('s2c_inv_items')
    if (saved) {
      try { return createDefaultLineItems(JSON.parse(saved)) } catch { /* fallback */ }
    }
    return createDefaultLineItems()
  })

  const [maxItemsPage1, setMaxItemsPage1] = useState(() => Number(localStorage.getItem('s2c_inv_max_items_p1')) || 5)

  // DB integration
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [invoicesList, setInvoicesList] = useState<any[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)

  // Bank
  const [bankName, setBankName] = useState(() => localStorage.getItem('s2c_inv_bank_name') || 'WIO Bank PJSC (UAE)')
  const [bankAccount, setBankAccount] = useState(() => localStorage.getItem('s2c_inv_bank_account') || '9854848878')
  const [bankIban, setBankIban] = useState(() => localStorage.getItem('s2c_inv_bank_iban') || 'AE460860000009854848878')
  const [bankSwift, setBankSwift] = useState(() => localStorage.getItem('s2c_inv_bank_swift') || 'WIOBAEADXXX')
  const [bankType, setBankType] = useState(() => localStorage.getItem('s2c_inv_bank_type') || 'Current Account')
  const [beneficiaryName, setBeneficiaryName] = useState(() => {
    const saved = localStorage.getItem('s2c_inv_beneficiary_name')
    if (!saved || saved === 'Zenarise Trading LLC FZ') {
      localStorage.setItem('s2c_inv_beneficiary_name', 'Zenarise Trading L.L.C-FZ')
      return 'Zenarise Trading L.L.C-FZ'
    }
    return saved
  })
  
  const [remarks, setRemarks] = useState(() => localStorage.getItem('s2c_inv_remarks') || 'Kindly send proof of payments to accounts@saddl.io with email subject "INV# - Proof of Payment"')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Derived Values
  const subTotal = lineItems.reduce((acc, curr) => acc + (curr.qty * curr.rate), 0)
  const vat = subTotal * 0.05
  const total = subTotal + vat
  const amountInWords = numberToWords(total)

  useEffect(() => {
    if (!invoiceDate) { setDueDate(''); return }
    const parsed = parseDate(invoiceDate)
    if (parsed) {
      const date = new Date(parsed.getTime())
      date.setDate(date.getDate() + terms)
      setDueDate(formatDateToDDMMYYYY(date))
    } else {
      setDueDate('')
    }
  }, [invoiceDate, terms])

  const isLoadingInvoiceRef = useRef(false)
  const [newInvoiceNotice, setNewInvoiceNotice] = useState<string | null>(null)

  useEffect(() => {
    if (isLoadingInvoiceRef.current) return
    if (!invoiceDate) return
    try {
      const parsed = parseDate(invoiceDate)
      if (parsed) {
        const year = parsed.getFullYear()
        const yy = year.toString().slice(-2)
        const match = invoiceNo.match(/^SADL-INV-(\d{2})-(\d+)$/)
        if (match) {
          const currentYY = match[1]
          const seq = match[2]
          if (currentYY !== yy) setInvoiceNo(`SADL-INV-${yy}-${seq}`)
        } else if (!invoiceNo || invoiceNo === 'SADL-INV-YY-001') {
          setInvoiceNo(`SADL-INV-${yy}-001`)
        }
      }
    } catch (e) { console.error(e) }
  }, [invoiceDate])

  useEffect(() => {
    const parsed = parseDate(invoiceDate)
    if (parsed) {
      setCalendarYear(parsed.getFullYear())
      setCalendarMonth(parsed.getMonth())
    }
  }, [invoiceDate])

  const fetchInvoices = async () => {
    setIsLoadingList(true)
    try {
      const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setInvoicesList(data || [])
    } catch (err) {
      console.error('Error fetching invoices:', err)
    } finally {
      setIsLoadingList(false)
    }
  }

  useEffect(() => { fetchInvoices() }, [])

  const generateNewInvoiceNumber = () => {
    const nextNo = computeNextInvoiceNumber(invoiceNo, invoiceDate, invoicesList)
    setInvoiceNo(nextNo)
    localStorage.setItem('s2c_inv_no', nextNo)
    return nextNo
  }

  const handleSaveToDatabase = async () => {
    setIsSaving(true)
    try {
      let finalInvoiceNo = invoiceNo

      // If creating a new record (currentInvoiceId is null) and the invoice number matches an existing saved invoice,
      // prompt to optionally auto-generate the next number
      if (!currentInvoiceId) {
        const isDuplicate = invoicesList.some(inv => inv.invoice_no?.trim().toLowerCase() === invoiceNo.trim().toLowerCase())
        if (isDuplicate) {
          const autoNext = generateNewInvoiceNumber()
          const confirmGenerate = window.confirm(
            `Invoice number "${invoiceNo}" already exists in the Saved Invoices Registry.\n\nClick "OK" to save as new invoice "${autoNext}".\nClick "Cancel" to return and edit the invoice number manually.`
          )
          if (!confirmGenerate) {
            setIsSaving(false)
            return
          }
          finalInvoiceNo = autoNext
        }
      }

      const invoiceData = {
        invoice_title: invoiceTitle, title_font_size: titleFontSize, invoice_no: finalInvoiceNo, invoice_date: invoiceDate, terms, due_date: dueDate,
        seller_name: sellerName, seller_address: sellerAddress, seller_trn: sellerTrn,
        buyer_name: buyerName, buyer_address: buyerAddress, buyer_trn: buyerTrn || '-', buyer_email: buyerEmail || '-', buyer_phone: buyerPhone || '-',
        bank_name: bankName, bank_account: bankAccount, bank_iban: bankIban, bank_swift: bankSwift, bank_type: bankType, beneficiary_name: beneficiaryName,
        remarks, sub_total: subTotal, vat, total, amount_in_words: amountInWords, line_items: lineItems, max_items_page1: maxItemsPage1
      }
      if (currentInvoiceId) {
        const { error } = await supabase.from('invoices').update({ ...invoiceData, updated_at: new Date().toISOString() }).eq('id', currentInvoiceId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('invoices').insert([invoiceData]).select()
        if (error) throw error
        if (data && data[0]) setCurrentInvoiceId(data[0].id)
      }
      
      // Update local storage
      localStorage.setItem('s2c_inv_title', invoiceTitle); localStorage.setItem('s2c_inv_title_size', String(titleFontSize))
      localStorage.setItem('s2c_inv_no', finalInvoiceNo); localStorage.setItem('s2c_inv_date', invoiceDate)
      localStorage.setItem('s2c_inv_terms', String(terms)); localStorage.setItem('s2c_inv_seller_name', sellerName)
      localStorage.setItem('s2c_inv_seller_address', sellerAddress); localStorage.setItem('s2c_inv_seller_trn', sellerTrn)
      localStorage.setItem('s2c_inv_buyer_name', buyerName); localStorage.setItem('s2c_inv_buyer_address', buyerAddress)
      localStorage.setItem('s2c_inv_buyer_email', buyerEmail); localStorage.setItem('s2c_inv_buyer_phone', buyerPhone)
      localStorage.setItem('s2c_inv_buyer_trn', buyerTrn); localStorage.setItem('s2c_inv_items', JSON.stringify(lineItems))
      localStorage.setItem('s2c_inv_max_items_p1', String(maxItemsPage1)); localStorage.setItem('s2c_inv_bank_name', bankName)
      localStorage.setItem('s2c_inv_bank_account', bankAccount); localStorage.setItem('s2c_inv_bank_iban', bankIban)
      localStorage.setItem('s2c_inv_bank_swift', bankSwift); localStorage.setItem('s2c_inv_bank_type', bankType)
      localStorage.setItem('s2c_inv_beneficiary_name', beneficiaryName); localStorage.setItem('s2c_inv_remarks', remarks)

      setNewInvoiceNotice(null)
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000)
      fetchInvoices()
    } catch (err: any) {
      console.error('Error saving invoice:', err); alert('Error saving invoice: ' + err.message)
    } finally { setIsSaving(false) }
  }

  const handleReset = () => {
    if (window.confirm('Reset invoice fields to default template?')) {
      const keys = ['s2c_inv_title', 's2c_inv_title_size', 's2c_inv_no', 's2c_inv_date', 's2c_inv_terms', 's2c_inv_seller_name', 's2c_inv_seller_address', 's2c_inv_seller_trn', 's2c_inv_buyer_name', 's2c_inv_buyer_address', 's2c_inv_buyer_email', 's2c_inv_buyer_phone', 's2c_inv_buyer_trn', 's2c_inv_items', 's2c_inv_max_items_p1', 's2c_inv_bank_name', 's2c_inv_bank_account', 's2c_inv_bank_iban', 's2c_inv_bank_swift', 's2c_inv_bank_type', 's2c_inv_beneficiary_name', 's2c_inv_remarks']
      keys.forEach(k => localStorage.removeItem(k))
      window.location.reload()
    }
  }

  const handleLoadInvoice = (inv: any) => {
    isLoadingInvoiceRef.current = true
    setCurrentInvoiceId(inv.id)
    setInvoiceTitle(inv.invoice_title ?? 'TAX INVOICE'); setTitleFontSize(inv.title_font_size ?? 72)
    setInvoiceNo(inv.invoice_no ?? ''); setInvoiceDate(inv.invoice_date ?? ''); setTerms(inv.terms ?? 5)
    setSellerName(inv.seller_name ?? ''); setSellerAddress(inv.seller_address ?? ''); setSellerTrn(inv.seller_trn ?? '')
    setBuyerName(inv.buyer_name ?? ''); setBuyerAddress(inv.buyer_address ?? '')
    setBuyerEmail(inv.buyer_email === '-' ? '' : (inv.buyer_email ?? ''))
    setBuyerPhone(inv.buyer_phone === '-' ? '' : (inv.buyer_phone ?? ''))
    setBuyerTrn(inv.buyer_trn === '-' ? '' : (inv.buyer_trn ?? ''))

    let items = inv.line_items
    if (typeof items === 'string') {
      try { items = JSON.parse(items) } catch { items = [] }
    }
    setLineItems(createDefaultLineItems(items)); setMaxItemsPage1(inv.max_items_page1 ?? 5)
    setBankName(inv.bank_name ?? ''); setBankAccount(inv.bank_account ?? ''); setBankIban(inv.bank_iban ?? '')
    setBankSwift(inv.bank_swift ?? ''); setBankType(inv.bank_type ?? 'Current Account'); setBeneficiaryName(inv.beneficiary_name ?? '')
    setRemarks(inv.remarks ?? '')
    setNewInvoiceNotice(null)

    // Sync to local storage
    localStorage.setItem('s2c_inv_title', inv.invoice_title ?? 'TAX INVOICE')
    localStorage.setItem('s2c_inv_title_size', String(inv.title_font_size ?? 72))
    localStorage.setItem('s2c_inv_no', inv.invoice_no ?? '')
    localStorage.setItem('s2c_inv_date', inv.invoice_date ?? '')
    localStorage.setItem('s2c_inv_terms', String(inv.terms ?? 5))
    localStorage.setItem('s2c_inv_seller_name', inv.seller_name ?? '')
    localStorage.setItem('s2c_inv_seller_address', inv.seller_address ?? '')
    localStorage.setItem('s2c_inv_seller_trn', inv.seller_trn ?? '')
    localStorage.setItem('s2c_inv_buyer_name', inv.buyer_name ?? '')
    localStorage.setItem('s2c_inv_buyer_address', inv.buyer_address ?? '')
    localStorage.setItem('s2c_inv_buyer_email', inv.buyer_email === '-' ? '' : (inv.buyer_email ?? ''))
    localStorage.setItem('s2c_inv_buyer_phone', inv.buyer_phone === '-' ? '' : (inv.buyer_phone ?? ''))
    localStorage.setItem('s2c_inv_buyer_trn', inv.buyer_trn === '-' ? '' : (inv.buyer_trn ?? ''))
    localStorage.setItem('s2c_inv_items', JSON.stringify(items || []))
    localStorage.setItem('s2c_inv_max_items_p1', String(inv.max_items_page1 ?? 5))
    localStorage.setItem('s2c_inv_bank_name', inv.bank_name ?? '')
    localStorage.setItem('s2c_inv_bank_account', inv.bank_account ?? '')
    localStorage.setItem('s2c_inv_bank_iban', inv.bank_iban ?? '')
    localStorage.setItem('s2c_inv_bank_swift', inv.bank_swift ?? '')
    localStorage.setItem('s2c_inv_bank_type', inv.bank_type ?? 'Current Account')
    localStorage.setItem('s2c_inv_beneficiary_name', inv.beneficiary_name ?? '')
    localStorage.setItem('s2c_inv_remarks', inv.remarks ?? '')

    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => {
      isLoadingInvoiceRef.current = false
    }, 200)
  }

  const handleDeleteInvoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to permanently delete this invoice from the database?')) {
      try {
        const { error } = await supabase.from('invoices').delete().eq('id', id)
        if (error) throw error
        if (currentInvoiceId === id) setCurrentInvoiceId(null)
        fetchInvoices()
      } catch (err: any) { console.error('Error deleting invoice:', err); alert('Error deleting invoice: ' + err.message) }
    }
  }

  const handleNewInvoice = () => {
    isLoadingInvoiceRef.current = true

    // 1 & 2. Keep currently loaded invoice data as working copy/cache
    // Disconnect currentInvoiceId so saving creates a brand new record without overwriting original
    setCurrentInvoiceId(null)

    // 5. Update invoice date to current date
    const todayStr = formatDateToDDMMYYYY(new Date())
    setInvoiceDate(todayStr)
    localStorage.setItem('s2c_inv_date', todayStr)

    // 4. Automatically increment invoice number based on highest existing invoice number + 1
    const nextNo = computeNextInvoiceNumber(invoiceNo, todayStr, invoicesList)
    setInvoiceNo(nextNo)
    localStorage.setItem('s2c_inv_no', nextNo)

    setNewInvoiceNotice(`Started new invoice ${nextNo} from loaded copy. Modify details and click Save to create a new record.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    setTimeout(() => {
      isLoadingInvoiceRef.current = false
    }, 200)
  }

  const clearItem = (id: string) => setLineItems(prev => prev.filter(item => item.id !== id).map((item, idx) => ({ ...item, sno: idx + 1 })))
  
  const handleAddItem = () => {
    setLineItems(prev => {
      if (prev.length >= 10) return prev
      const nextSno = prev.length + 1
      return [...prev, { id: `item-${nextSno}-${Date.now()}`, sno: nextSno, description: '', qty: 0, rate: 0 }]
    })
  }

  const handleItemChange = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, [field]: value } : item)
      const modifiedIdx = prev.findIndex(item => item.id === id)
      if (modifiedIdx === prev.length - 1 && prev.length < 10) {
        const modifiedItem = updated[modifiedIdx]
        if (modifiedItem.description.trim() !== '' || modifiedItem.qty > 0 || modifiedItem.rate > 0) {
          const nextSno = updated.length + 1
          return [...updated, { id: `item-${nextSno}-${Date.now()}`, sno: nextSno, description: '', qty: 0, rate: 0 }]
        }
      }
      return updated
    })
  }

  return {
    currentUser, authLoading, hasAccess, allowedEmails,
    invoiceTitle, setInvoiceTitle, titleFontSize, setTitleFontSize, invoiceNo, setInvoiceNo,
    invoiceDate, setInvoiceDate, terms, setTerms, dueDate,
    showCalendar, setShowCalendar, calendarYear, setCalendarYear, calendarMonth, setCalendarMonth,
    sellerName, setSellerName, sellerAddress, setSellerAddress, sellerTrn, setSellerTrn,
    buyerName, setBuyerName, buyerAddress, setBuyerAddress, buyerEmail, setBuyerEmail, buyerPhone, setBuyerPhone, buyerTrn, setBuyerTrn,
    lineItems, setLineItems, maxItemsPage1, setMaxItemsPage1,
    bankName, setBankName, bankAccount, setBankAccount, bankIban, setBankIban, bankSwift, setBankSwift, bankType, setBankType, beneficiaryName, setBeneficiaryName,
    remarks, setRemarks, currentInvoiceId, isSaving, saveSuccess,
    invoicesList, isLoadingList, subTotal, vat, total, amountInWords,
    handleSaveToDatabase, handleReset, handleLoadInvoice, handleDeleteInvoice, handleNewInvoice, clearItem, handleAddItem, handleItemChange, fetchInvoices,
    generateNewInvoiceNumber, newInvoiceNotice
  }
}
