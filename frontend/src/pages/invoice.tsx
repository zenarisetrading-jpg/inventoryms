import React, { useState, useEffect } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Plus, Save, Printer, ArrowLeft, RefreshCw, FileText, Eye, Download, X } from 'lucide-react'

import { navigate } from '../lib/router'
import { useInvoiceData } from '../hooks/useInvoiceData'
import { InvoiceEditor } from '../components/invoice/InvoiceEditor'
import { InvoicePreview } from '../components/invoice/InvoicePreview'
import { SavedInvoicesRegistry } from '../components/invoice/SavedInvoicesRegistry'

export default function Invoice({ user }: { user?: any }) {
  // Bring all state and logic via custom hook
  const invoiceData = useInvoiceData(user)
  const {
    authLoading, hasAccess, allowedEmails,
    invoiceTitle, setInvoiceTitle, titleFontSize, setTitleFontSize, invoiceNo, setInvoiceNo,
    invoiceDate, setInvoiceDate, terms, setTerms, dueDate,
    showCalendar, setShowCalendar, calendarYear, setCalendarYear, calendarMonth, setCalendarMonth,
    sellerName, setSellerName, sellerAddress, setSellerAddress, sellerTrn, setSellerTrn,
    buyerName, setBuyerName, buyerAddress, setBuyerAddress, buyerEmail, setBuyerEmail, buyerPhone, setBuyerPhone, buyerTrn, setBuyerTrn,
    lineItems, maxItemsPage1, setMaxItemsPage1,
    bankName, setBankName, bankAccount, setBankAccount, bankIban, setBankIban, bankSwift, setBankSwift, bankType, setBankType, beneficiaryName, setBeneficiaryName,
    remarks, setRemarks, currentInvoiceId, isSaving, saveSuccess,
    invoicesList, isLoadingList, subTotal, vat, total, amountInWords,
    handleSaveToDatabase, handleReset, handleLoadInvoice, handleDeleteInvoice, handleNewInvoice, clearItem, handleAddItem, handleItemChange, fetchInvoices
  } = invoiceData

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleDownloadPDF = async () => {
    setIsExporting(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const page1 = document.getElementById('invoice-page-1')
      const page2 = document.getElementById('invoice-page-2')

      const capturePage = async (el: HTMLElement) => {
        const originalTransform = el.style.transform
        const originalWebkit = (el.style as any).webkitTransform
        
        el.style.transform = 'none'
        ;(el.style as any).webkitTransform = 'none'

        const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false })
        
        el.style.transform = originalTransform
        ;(el.style as any).webkitTransform = originalWebkit

        return canvas.toDataURL('image/jpeg', 1.0)
      }

      if (page1) {
        const imgData = await capturePage(page1)
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }
      
      const isMultiPage = lineItems.length > maxItemsPage1
      if (isMultiPage && page2) {
        pdf.addPage()
        const imgData = await capturePage(page2)
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }
      
      pdf.save(`Saddl-Invoice-${invoiceNo || 'Draft'}.pdf`)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // Responsive scale logic for preview
  const [scale, setScale] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const updateScale = () => {
      const container = document.getElementById('invoice-preview-column')
      if (container) {
        const width = container.clientWidth - (window.innerWidth >= 1024 ? 48 : 32)
        setContainerWidth(width)
        setScale(width / 2480)
      }
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    setTimeout(updateScale, 100)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-10 h-10 text-brand-blue animate-spin" />
        <div className="text-sm font-black text-white uppercase tracking-[0.2em]">Verifying Access...</div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <FileText className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-widest">Access Denied</h1>
        <p className="text-zinc-400 max-w-md mx-auto leading-relaxed text-sm font-medium">
          You do not have permission to view or generate invoices. This module is restricted to Finance/Accounts personnel.
        </p>
        <div className="bg-zinc-900 border border-white/5 rounded-lg p-4 w-full max-w-md">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Authorized Emails</p>
          <div className="flex flex-col gap-1">
            {allowedEmails.map(email => (
              <code key={email} className="text-xs text-zinc-300 font-mono bg-black/50 px-2 py-1 rounded">{email}</code>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand-blue text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </button>
      </div>
    )
  }

  // Derive pages based on limits
  const page1Items = lineItems.slice(0, maxItemsPage1)
  const page2Items = lineItems.slice(maxItemsPage1, 10)
  const isMultiPage = lineItems.length > maxItemsPage1

  return (
    <div className="min-h-screen bg-[#070913] p-4 lg:p-6 space-y-6 font-sans">
      
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0f1322] border border-white/10 rounded-2xl p-4 shadow-2xl print:hidden">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="w-10 h-10 flex items-center justify-center bg-zinc-800/50 hover:bg-brand-blue/20 text-zinc-400 hover:text-brand-blue rounded-xl transition-all border border-white/5 hover:border-brand-blue/30 active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg lg:text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
              <FileText className="w-5 h-5 text-brand-blue" />
              Saddl Invoice Generator
            </h1>
            <p className="text-[10px] lg:text-xs text-zinc-500 font-medium tracking-wide mt-1 uppercase">Automated billing engine & PDF generation</p>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-3">
          <button onClick={handleReset} className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-red-400/80 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all active:scale-95 border border-transparent hover:border-red-500/20">
            Reset All
          </button>
          <button onClick={handleNewInvoice} className="flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-brand-blue hover:text-white border border-brand-blue/30 hover:bg-brand-blue rounded-lg transition-all active:scale-95">
            <Plus className="w-3.5 h-3.5" /> New Invoice
          </button>
          <button
            onClick={handleSaveToDatabase}
            disabled={isSaving || saveSuccess}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all border ${saveSuccess ? 'bg-green-500 text-white border-green-400 shadow-lg shadow-green-500/20' : 'bg-zinc-800 text-white border-white/10 hover:border-white/20 hover:bg-zinc-700 active:scale-95'} disabled:opacity-70`}
          >
            {isSaving ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</>
            ) : saveSuccess ? (
              <><Save className="w-3.5 h-3.5" /> Saved to DB!</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> {currentInvoiceId ? 'Update Invoice' : 'Save Invoice'}</>
            )}
          </button>
          <button onClick={() => setIsPreviewModalOpen(true)} className="flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10 rounded-lg transition-all active:scale-95">
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>

          <button onClick={handleDownloadPDF} disabled={isExporting} className="flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-brand-blue border border-brand-blue/30 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {isExporting ? 'Exporting...' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Editor & Preview Workspace Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
        <InvoiceEditor 
          invoiceTitle={invoiceTitle} setInvoiceTitle={setInvoiceTitle}
          titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize}
          invoiceNo={invoiceNo} setInvoiceNo={setInvoiceNo}
          invoiceDate={invoiceDate} setInvoiceDate={setInvoiceDate}
          showCalendar={showCalendar} setShowCalendar={setShowCalendar}
          calendarYear={calendarYear} setCalendarYear={setCalendarYear}
          calendarMonth={calendarMonth} setCalendarMonth={setCalendarMonth}
          terms={terms} setTerms={setTerms}
          maxItemsPage1={maxItemsPage1} setMaxItemsPage1={setMaxItemsPage1}
          sellerName={sellerName} setSellerName={setSellerName}
          sellerAddress={sellerAddress} setSellerAddress={setSellerAddress}
          sellerTrn={sellerTrn} setSellerTrn={setSellerTrn}
          buyerName={buyerName} setBuyerName={setBuyerName}
          buyerTrn={buyerTrn} setBuyerTrn={setBuyerTrn}
          buyerAddress={buyerAddress} setBuyerAddress={setBuyerAddress}
          buyerEmail={buyerEmail} setBuyerEmail={setBuyerEmail}
          buyerPhone={buyerPhone} setBuyerPhone={setBuyerPhone}
          lineItems={lineItems}
          handleItemChange={handleItemChange}
          clearItem={clearItem}
          handleAddItem={handleAddItem}
          remarks={remarks} setRemarks={setRemarks}
          beneficiaryName={beneficiaryName} setBeneficiaryName={setBeneficiaryName}
          bankName={bankName} setBankName={setBankName}
          bankAccount={bankAccount} setBankAccount={setBankAccount}
          bankType={bankType} setBankType={setBankType}
          bankIban={bankIban} setBankIban={setBankIban}
          bankSwift={bankSwift} setBankSwift={setBankSwift}
        />
        
        <InvoicePreview
          isMultiPage={isMultiPage} scale={scale} containerWidth={containerWidth}
          titleFontSize={titleFontSize} invoiceTitle={invoiceTitle} invoiceNo={invoiceNo}
          sellerName={sellerName} sellerAddress={sellerAddress} sellerTrn={sellerTrn}
          invoiceDate={invoiceDate} terms={terms} dueDate={dueDate}
          buyerName={buyerName} buyerAddress={buyerAddress} buyerTrn={buyerTrn} buyerEmail={buyerEmail} buyerPhone={buyerPhone}
          page1Items={page1Items} page2Items={page2Items}
          subTotal={subTotal} vat={vat} total={total} amountInWords={amountInWords}
          remarks={remarks} beneficiaryName={beneficiaryName} bankName={bankName} bankAccount={bankAccount}
          bankIban={bankIban} bankSwift={bankSwift} bankType={bankType}
        />
      </div>

      {/* Registry Section */}
      <SavedInvoicesRegistry 
        invoicesList={invoicesList}
        isLoadingList={isLoadingList}
        currentInvoiceId={currentInvoiceId}
        fetchInvoices={fetchInvoices}
        handleLoadInvoice={handleLoadInvoice}
        handleDeleteInvoice={handleDeleteInvoice}
      />

      
    </div>
  )
}
