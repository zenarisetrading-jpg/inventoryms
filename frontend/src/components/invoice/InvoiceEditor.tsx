import React, { useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { parseDate } from './utils'
import type { LineItem } from './utils'

interface InvoiceEditorProps {
  invoiceTitle: string; setInvoiceTitle: (v: string) => void;
  titleFontSize: number; setTitleFontSize: (v: number) => void;
  invoiceNo: string; setInvoiceNo: (v: string) => void;
  invoiceDate: string; setInvoiceDate: (v: string) => void;
  showCalendar: boolean; setShowCalendar: (v: boolean) => void;
  calendarYear: number; setCalendarYear: (v: number | ((prev: number) => number)) => void;
  calendarMonth: number; setCalendarMonth: (v: number | ((prev: number) => number)) => void;
  terms: number; setTerms: (v: number) => void;
  maxItemsPage1: number; setMaxItemsPage1: (v: number) => void;
  sellerName: string; setSellerName: (v: string) => void;
  sellerAddress: string; setSellerAddress: (v: string) => void;
  sellerTrn: string; setSellerTrn: (v: string) => void;
  buyerName: string; setBuyerName: (v: string) => void;
  buyerTrn: string; setBuyerTrn: (v: string) => void;
  buyerAddress: string; setBuyerAddress: (v: string) => void;
  buyerEmail: string; setBuyerEmail: (v: string) => void;
  buyerPhone: string; setBuyerPhone: (v: string) => void;
  lineItems: LineItem[];
  handleItemChange: (id: string, field: keyof LineItem, value: any) => void;
  clearItem: (id: string) => void;
  handleAddItem: () => void;
  remarks: string; setRemarks: (v: string) => void;
  beneficiaryName: string; setBeneficiaryName: (v: string) => void;
  bankName: string; setBankName: (v: string) => void;
  bankAccount: string; setBankAccount: (v: string) => void;
  bankType: string; setBankType: (v: string) => void;
  bankIban: string; setBankIban: (v: string) => void;
  bankSwift: string; setBankSwift: (v: string) => void;
}

export function InvoiceEditor(props: InvoiceEditorProps) {
  const datepickerRef = useRef<HTMLDivElement>(null)

  // Calendar logic helpers
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const generateCalendarDays = () => {
    const days = []
    const daysInMonth = getDaysInMonth(props.calendarYear, props.calendarMonth)
    const firstDay = getFirstDayOfMonth(props.calendarYear, props.calendarMonth)
    const daysInPrevMonth = getDaysInMonth(props.calendarYear, props.calendarMonth - 1)

    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, date: new Date(props.calendarYear, props.calendarMonth - 1, daysInPrevMonth - i) })
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true, date: new Date(props.calendarYear, props.calendarMonth, i) })
    }
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ day: i, isCurrentMonth: false, date: new Date(props.calendarYear, props.calendarMonth + 1, i) })
    }
    return days
  }

  const days = generateCalendarDays()

  const handleSelectDay = (date: Date) => {
    const d = String(date.getDate()).padStart(2, '0')
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const y = date.getFullYear()
    props.setInvoiceDate(`${d}-${m}-${y}`)
    props.setShowCalendar(false)
  }

  // Close calendar if clicked outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datepickerRef.current && !datepickerRef.current.contains(event.target as Node)) {
        props.setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [props])

  return (
    <div className="lg:col-span-5 print:hidden">
      <div className="space-y-4">
        
        {/* Invoice Settings */}
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
                  value={props.invoiceTitle}
                  onChange={e => props.setInvoiceTitle(e.target.value)}
                  className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold transition-all"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Size (px)</label>
                <input
                  type="number"
                  value={props.titleFontSize}
                  onChange={e => props.setTitleFontSize(Math.max(10, Math.min(150, Number(e.target.value))))}
                  className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Number</label>
              <input
                type="text"
                value={props.invoiceNo}
                onChange={e => props.setInvoiceNo(e.target.value)}
                className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div ref={datepickerRef} className="relative">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Date</label>
                <div className="relative">
                  <input
                    type="text"
                    value={props.invoiceDate}
                    onChange={e => props.setInvoiceDate(e.target.value)}
                    placeholder="DD-MM-YYYY"
                    onFocus={() => props.setShowCalendar(true)}
                    className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all"
                  />
                </div>
                {props.showCalendar && (
                  <div className="absolute left-0 mt-1.5 w-[250px] bg-[#0f1322] border border-white/10 rounded-xl p-3 shadow-2xl z-50 animate-fade-in font-sans">
                    <div className="flex items-center justify-between mb-2.5 px-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (props.calendarMonth === 0) {
                            props.setCalendarMonth(11)
                            props.setCalendarYear(prev => prev - 1)
                          } else {
                            props.setCalendarMonth(prev => prev - 1)
                          }
                        }}
                        className="text-[10px] font-black text-zinc-400 hover:text-white transition-colors"
                      >
                        &larr;
                      </button>
                      <span className="text-[9px] font-black uppercase text-white tracking-widest">
                        {new Date(props.calendarYear, props.calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (props.calendarMonth === 11) {
                            props.setCalendarMonth(0)
                            props.setCalendarYear(prev => prev + 1)
                          } else {
                            props.setCalendarMonth(prev => prev + 1)
                          }
                        }}
                        className="text-[10px] font-black text-zinc-400 hover:text-white transition-colors"
                      >
                        &rarr;
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-1">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{day}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {days.map((item, idx) => {
                        const parsedCurrent = parseDate(props.invoiceDate)
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
                              ${isSelected ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/30' : item.isCurrentMonth ? 'text-zinc-200 hover:bg-white/5' : 'text-zinc-600 hover:text-zinc-400'}
                              ${isToday && !isSelected ? 'border border-brand-blue/40 text-brand-blue' : ''}
                            `}
                          >
                            {item.day}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 mt-2.5 pt-2">
                      <button type="button" onClick={() => handleSelectDay(new Date())} className="text-[9px] font-black uppercase text-brand-blue hover:text-brand-blue/80 transition-colors">Today</button>
                      <button type="button" onClick={() => props.setShowCalendar(false)} className="text-[9px] font-black uppercase text-zinc-400 hover:text-zinc-200 transition-colors">Close</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Payment Terms</label>
                <select
                  value={props.terms}
                  onChange={e => props.setTerms(Number(e.target.value))}
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
                  value={props.maxItemsPage1}
                  onChange={e => props.setMaxItemsPage1(Number(e.target.value))}
                  className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all"
                >
                  {[1,2,3,4,5].map(v => <option key={v} value={v}>{v} Item{v>1?'s':''}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Details (Seller) */}
        <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Supplier Details (Seller)</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Supplier Name</label>
              <input type="text" value={props.sellerName} onChange={e => props.setSellerName(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Supplier Address</label>
              <textarea value={props.sellerAddress} onChange={e => props.setSellerAddress(e.target.value)} rows={2} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all resize-none font-sans overflow-hidden" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Supplier TRN</label>
              <input type="text" value={props.sellerTrn} onChange={e => props.setSellerTrn(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
            </div>
          </div>
        </div>

        {/* Client Details (Bill To) */}
        <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Client Details (Bill To)</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Company Name</label>
              <input type="text" value={props.buyerName} onChange={e => props.setBuyerName(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">TRN No</label>
              <input type="text" value={props.buyerTrn} onChange={e => props.setBuyerTrn(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Add Client Address :</label>
              <textarea value={props.buyerAddress} onChange={e => props.setBuyerAddress(e.target.value)} rows={2} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all resize-none font-sans overflow-hidden" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Contact Email</label>
              <input type="email" value={props.buyerEmail} onChange={e => props.setBuyerEmail(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Contact Number</label>
              <input type="text" value={props.buyerPhone} onChange={e => props.setBuyerPhone(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
            </div>
          </div>
        </div>

        {/* Line Items Manager */}
        <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Line Items (Max 10 Rows)</h3>
          </div>
          <div className="p-4">
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
              {props.lineItems.map(item => (
                <div key={item.id} className="bg-[#070913] border border-white/10 rounded-lg p-3 space-y-2 relative group hover:border-white/20 transition-colors">
                  <button onClick={() => props.clearItem(item.id)} title="Delete Line Item" className="absolute top-2.5 right-2.5 text-red-500/50 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Item #{item.sno}</div>
                  <div>
                    <textarea value={item.description} onChange={e => props.handleItemChange(item.id, 'description', e.target.value)} placeholder="Description" rows={3} className="w-full bg-[#0b0e1a] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded px-2.5 py-1.5 text-[13px] text-white font-medium resize-none font-sans overflow-hidden" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-black text-zinc-400 uppercase mb-0.5">Qty</label>
                      <input type="number" value={item.qty} onChange={e => props.handleItemChange(item.id, 'qty', Math.max(1, Number(e.target.value)))} className="w-full bg-[#0b0e1a] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded px-2.5 py-1 text-[13px] text-white font-bold" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-zinc-400 uppercase mb-0.5">Rate (AED)</label>
                      <input type="number" value={item.rate} onChange={e => props.handleItemChange(item.id, 'rate', Math.max(0, Number(e.target.value)))} className="w-full bg-[#0b0e1a] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded px-2.5 py-1 text-[13px] text-white font-bold font-mono" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {props.lineItems.length < 10 ? (
              <button onClick={props.handleAddItem} className="w-full mt-4 flex items-center justify-center gap-1.5 py-2 text-xs font-black uppercase tracking-wider text-brand-blue border border-brand-blue/20 hover:bg-brand-blue/10 rounded-lg transition-all active:scale-[0.98]">
                <Plus className="w-3.5 h-3.5" />
                Add Line Item ({props.lineItems.length}/10)
              </button>
            ) : (
              <div className="w-full mt-4 text-center py-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 border border-white/5 bg-white/[0.01] rounded-lg">
                Maximum of 10 line items reached
              </div>
            )}
          </div>
        </div>

        {/* Note / Remarks */}
        <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Note / Remarks</h3>
          </div>
          <div className="p-4">
            <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Invoice Note</label>
            <textarea value={props.remarks} onChange={e => props.setRemarks(e.target.value)} rows={2} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all resize-none font-sans overflow-hidden" />
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="bg-[#161b2e] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Account Details</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Beneficiary Name</label>
              <input type="text" value={props.beneficiaryName} onChange={e => props.setBeneficiaryName(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Bank Name</label>
              <input type="text" value={props.bankName} onChange={e => props.setBankName(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Account Number</label>
                <input type="text" value={props.bankAccount} onChange={e => props.setBankAccount(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">Account Type</label>
                <input type="text" value={props.bankType} onChange={e => props.setBankType(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-medium transition-all" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">IBAN</label>
                <input type="text" value={props.bankIban} onChange={e => props.setBankIban(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1.5">SWIFT Code</label>
                <input type="text" value={props.bankSwift} onChange={e => props.setBankSwift(e.target.value)} className="w-full bg-[#070913] border border-zinc-700 hover:border-zinc-500 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 outline-none rounded-lg px-3 py-2 text-[13px] text-white font-semibold font-mono transition-all" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
