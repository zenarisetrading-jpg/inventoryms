import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseDate, formatDateToDDMMYYYY, createDefaultLineItems, numberToWords, LineItem } from '../components/invoice/utils'

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
  const [sellerName, setSellerName] = useState(() => localStorage.getItem('s2c_inv_seller_name') || 'Zenarise Trading LLC FZ')
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
  const [beneficiaryName, setBeneficiaryName] = useState(() => localStorage.getItem('s2c_inv_beneficiary_name') || 'Zenarise Trading LLC FZ')
  
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

  useEffect(() => {
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

  const handleSaveToDatabase = async () => {
    setIsSaving(true)
    try {
      const invoiceData = {
        invoice_title: invoiceTitle, title_font_size: titleFontSize, invoice_no: invoiceNo, invoice_date: invoiceDate, terms, due_date: dueDate,
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
      localStorage.setItem('s2c_inv_no', invoiceNo); localStorage.setItem('s2c_inv_date', invoiceDate)
      localStorage.setItem('s2c_inv_terms', String(terms)); localStorage.setItem('s2c_inv_seller_name', sellerName)
      localStorage.setItem('s2c_inv_seller_address', sellerAddress); localStorage.setItem('s2c_inv_seller_trn', sellerTrn)
      localStorage.setItem('s2c_inv_buyer_name', buyerName); localStorage.setItem('s2c_inv_buyer_address', buyerAddress)
      localStorage.setItem('s2c_inv_buyer_email', buyerEmail); localStorage.setItem('s2c_inv_buyer_phone', buyerPhone)
      localStorage.setItem('s2c_inv_buyer_trn', buyerTrn); localStorage.setItem('s2c_inv_items', JSON.stringify(lineItems))
      localStorage.setItem('s2c_inv_max_items_p1', String(maxItemsPage1)); localStorage.setItem('s2c_inv_bank_name', bankName)
      localStorage.setItem('s2c_inv_bank_account', bankAccount); localStorage.setItem('s2c_inv_bank_iban', bankIban)
      localStorage.setItem('s2c_inv_bank_swift', bankSwift); localStorage.setItem('s2c_inv_bank_type', bankType)
      localStorage.setItem('s2c_inv_beneficiary_name', beneficiaryName); localStorage.setItem('s2c_inv_remarks', remarks)

      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000)
      fetchInvoices()
    } catch (err: any) {
      console.error('Error saving invoice:', err); alert('Error saving invoice: ' + err.message)
    } finally { setIsSaving(false) }
  }

  const handleReset = () => {
    if (window.confirm('Reset invoice fields to default?')) {
      const keys = ['s2c_inv_title', 's2c_inv_title_size', 's2c_inv_no', 's2c_inv_date', 's2c_inv_terms', 's2c_inv_seller_name', 's2c_inv_seller_address', 's2c_inv_seller_trn', 's2c_inv_buyer_name', 's2c_inv_buyer_address', 's2c_inv_buyer_email', 's2c_inv_buyer_phone', 's2c_inv_buyer_trn', 's2c_inv_items', 's2c_inv_max_items_p1', 's2c_inv_bank_name', 's2c_inv_bank_account', 's2c_inv_bank_iban', 's2c_inv_bank_swift', 's2c_inv_bank_type', 's2c_inv_beneficiary_name', 's2c_inv_remarks']
      keys.forEach(k => localStorage.removeItem(k))
      window.location.reload()
    }
  }

  const handleLoadInvoice = (inv: any) => {
    setCurrentInvoiceId(inv.id)
    setInvoiceTitle(inv.invoice_title || 'TAX INVOICE'); setTitleFontSize(inv.title_font_size || 72)
    setInvoiceNo(inv.invoice_no || ''); setInvoiceDate(inv.invoice_date || ''); setTerms(inv.terms || 5)
    setSellerName(inv.seller_name || ''); setSellerAddress(inv.seller_address || ''); setSellerTrn(inv.seller_trn || '')
    setBuyerName(inv.buyer_name || ''); setBuyerAddress(inv.buyer_address || ''); setBuyerEmail(inv.buyer_email || '')
    setBuyerPhone(inv.buyer_phone || ''); setBuyerTrn(inv.buyer_trn || '')
    setLineItems(createDefaultLineItems(inv.line_items)); setMaxItemsPage1(inv.max_items_page1 || 5)
    setBankName(inv.bank_name || 'Wio Bank'); setBankAccount(inv.bank_account || '9854848878'); setBankIban(inv.bank_iban || 'AE460860000009854848878')
    setBankSwift(inv.bank_swift || 'WIOBAEADXXX'); setBankType(inv.bank_type || 'Current Account'); setBeneficiaryName(inv.beneficiary_name || '')
    setRemarks(inv.remarks || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    if (window.confirm('Start a new invoice? This will clear the canvas.')) {
      setCurrentInvoiceId(null); setInvoiceTitle('TAX INVOICE'); setTitleFontSize(72)
      setInvoiceNo(`INV-26-${String(invoicesList.length + 1).padStart(3, '0')}`)
      setInvoiceDate(formatDateToDDMMYYYY(new Date())); setTerms(5)
      setSellerName('Zenarise Trading LLC FZ'); setSellerAddress('Building Name, Floor, Street,\nCity, Country')
      setSellerTrn('104554276600003')
      setBuyerName(''); setBuyerAddress(''); setBuyerEmail(''); setBuyerPhone(''); setBuyerTrn('')
      setLineItems(createDefaultLineItems()); setMaxItemsPage1(5)
      setBankName('WIO Bank PJSC (UAE)'); setBankAccount('9854848878'); setBankIban('AE460860000009854848878')
      setBankSwift('BANKXXXXX'); setBankType('Current Account'); setBeneficiaryName('Zenarise Trading LLC FZ')
      setRemarks('Kindly send proof of payments to accounts@example.com with email subject "INV# - Proof of Payment"')
    }
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
    handleSaveToDatabase, handleReset, handleLoadInvoice, handleDeleteInvoice, handleNewInvoice, clearItem, handleAddItem, handleItemChange, fetchInvoices
  }
}
