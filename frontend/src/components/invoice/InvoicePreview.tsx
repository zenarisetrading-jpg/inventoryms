import React from 'react'
import saddlLogo from '../../assets/saddl_main_both.png'
import { renderVal } from './utils'
import type { LineItem } from './utils'

interface InvoicePreviewProps {
  isMultiPage: boolean; scale: number; containerWidth: number;
  titleFontSize: number; invoiceTitle: string; invoiceNo: string;
  sellerName: string; sellerAddress: string; sellerTrn: string;
  invoiceDate: string; terms: number; dueDate: string;
  buyerName: string; buyerAddress: string; buyerTrn: string; buyerEmail: string; buyerPhone: string;
  page1Items: LineItem[]; page2Items: LineItem[];
  subTotal: number; vat: number; total: number; amountInWords: string;
  remarks: string; beneficiaryName: string; bankName: string; bankAccount: string;
  bankIban: string; bankSwift: string; bankType: string;
}

export function InvoicePreview({
  isMultiPage, scale, containerWidth, titleFontSize, invoiceTitle, invoiceNo,
  sellerName, sellerAddress, sellerTrn, invoiceDate, terms, dueDate,
  buyerName, buyerAddress, buyerTrn, buyerEmail, buyerPhone,
  page1Items, page2Items, subTotal, vat, total, amountInWords,
  remarks, beneficiaryName, bankName, bankAccount, bankIban, bankSwift, bankType
}: InvoicePreviewProps) {
  return (
    <div id="invoice-preview-column" className="lg:col-span-7 flex flex-col items-center bg-zinc-950 p-4 lg:p-6 rounded-2xl border border-white/5 overflow-hidden shadow-2xl print:bg-white print:border-none print:p-0 print:shadow-none print:rounded-none w-full print:!overflow-visible print:!block">
      <div 
        id="invoice-preview-container" 
        className="w-full relative overflow-hidden select-text bg-[#C5C5C5] border border-zinc-600 rounded-lg print:bg-transparent print:border-none print:rounded-none print:!h-auto print:!overflow-visible"
        style={{ height: `var(--print-height, ${isMultiPage ? `${containerWidth * (3508 / 2480) * 2 + 20}px` : `${containerWidth * (3508 / 2480)}px`})` }}
      >
        <div 
          id="invoice-page-1"
          className="invoice-sheet bg-white text-zinc-900 font-sans p-[100px] border border-zinc-400 shadow-md flex flex-col justify-between absolute top-0 left-0 origin-top-left print:border-none print:p-[100px] print:!relative print:!transform-none print:!top-auto print:!left-auto print:!shadow-none print:break-after-page"
          style={{ width: '2480px', height: '3508px', transform: `var(--print-transform, scale(${scale}))`, WebkitTransform: `var(--print-transform, scale(${scale}))` }}
        >
          <div>
            <div className="flex justify-between items-center border-b-[6px] border-zinc-800 pb-[40px] mb-[60px]">
              <div className="flex flex-col items-start">
                <img src={saddlLogo} alt="Saddl Logo" className="h-[320px] w-auto object-contain" />
              </div>
              <div className="text-right">
                <h1 className="font-black tracking-[0.05em] uppercase" style={{ fontSize: `${titleFontSize}px` }}>{renderVal(invoiceTitle)}</h1>
                <div className="text-[32px] font-bold text-zinc-600 mt-[10px]">
                  Invoice No : <span className="font-mono text-zinc-900 font-bold">{renderVal(invoiceNo)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-[40px] border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
              <div className="col-span-7 border-r-[3px] border-zinc-400 pr-[40px]">
                <div className="font-black text-zinc-900 uppercase text-[38px] mb-[10px]">{renderVal(sellerName)}</div>
                <div className="text-zinc-600 leading-relaxed whitespace-pre-line">{renderVal(sellerAddress)}</div>
                <div className="font-semibold text-zinc-700 mt-[20px]">
                  TRN No : <span className="font-mono">{renderVal(sellerTrn)}</span>
                </div>
              </div>
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

            <div className="border-[3px] border-zinc-400 rounded-[10px] overflow-hidden mb-[40px] text-[32px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-700 border-b-[3px] border-zinc-400 font-bold uppercase tracking-wider text-[30px] group">
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
                      <tr className="group hover:bg-white/10 transition-colors hover:bg-zinc-50/50 min-h-[90px]" key={item.id}>
                        <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-bold text-zinc-600"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.sno}</span></td>
                        <td className="px-[40px] py-[25px] border-r-[3px] border-zinc-400 font-medium leading-relaxed text-zinc-800"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent ? renderVal(item.description) : '-'}</span></td>
                        <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-semibold text-zinc-800"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent && item.qty > 0 ? item.qty : '-'}</span></td>
                        <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right font-mono text-zinc-700 font-semibold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent && item.rate > 0 ? item.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span></td>
                        <td className="px-[40px] py-[25px] text-right font-mono text-zinc-900 font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent && (item.qty * item.rate) > 0 ? (item.qty * item.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span></td>
                      </tr>
                    )
                  })}
                  {isMultiPage && (
                    <tr className="min-h-[90px] group">
                      <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-bold text-zinc-400"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">-</span></td>
                      <td className="px-[40px] py-[25px] border-r-[3px] border-zinc-400 font-black leading-relaxed text-zinc-400 italic text-center uppercase tracking-[0.2em] bg-zinc-50/40"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">--- Continued on Page 2 ---</span></td>
                      <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-semibold text-zinc-400"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">-</span></td>
                      <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right font-mono text-zinc-400 font-semibold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">-</span></td>
                      <td className="px-[40px] py-[25px] text-right font-mono text-zinc-400 font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">-</span></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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

            {!isMultiPage && (
              <div className="border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                <div className="font-semibold text-zinc-700">
                  <span className="font-bold text-zinc-900 uppercase">Amount in Words:</span> {amountInWords}
                </div>
              </div>
            )}
          </div>

          {!isMultiPage ? (
            <div className="space-y-[40px]">
              <div className="text-zinc-600 text-[30px] leading-relaxed border-b-[3px] border-zinc-400 pb-[20px]">
                <span className="font-bold text-zinc-800">Note :</span> {renderVal(remarks)}
              </div>
              <div className="border-[3px] border-zinc-400 rounded-[10px] p-[40px] bg-zinc-50/50 text-[30px] space-y-[10px]">
                <div className="font-black text-zinc-800 uppercase tracking-wider mb-[20px]">Account Details</div>
                <div className="grid grid-cols-12 gap-y-[15px]">
                  <div className="col-span-4 font-bold text-zinc-500">Beneficiary Name</div><div className="col-span-8 font-semibold text-zinc-900">{renderVal(beneficiaryName)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Bank Name</div><div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankName)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Account Number</div><div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankAccount)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">IBAN</div><div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankIban)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Bank / SWIFT Code</div><div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankSwift)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Account Type</div><div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankType)}</div>
                </div>
              </div>
              <div className="border-[3px] border-zinc-400 p-[20px] bg-zinc-100 rounded-[10px] text-center text-[28px] font-bold uppercase tracking-wider text-zinc-600">
                This is a computer-generated invoice and does not require a signature.
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center text-[28px] font-bold text-zinc-400 border-t-[3px] border-zinc-300 pt-[20px]">
              <div>Page 1 of 2</div>
              <div className="uppercase tracking-[0.1em]">{renderVal(sellerName)}</div>
            </div>
          )}
        </div>

        {isMultiPage && (
          <div 
            id="invoice-page-2"
            className="invoice-sheet bg-white text-zinc-900 font-sans p-[100px] border border-zinc-400 shadow-md flex flex-col justify-between absolute left-0 origin-top-left print:border-none print:p-[100px] print:!relative print:!transform-none print:!top-auto print:!left-auto print:!shadow-none print:break-before-page"
            style={{ width: '2480px', height: '3508px', transform: `var(--print-transform, scale(${scale}))`, WebkitTransform: `var(--print-transform, scale(${scale}))`, top: `var(--print-top, ${3508 * scale + 20}px)` }}
          >
            <div>
              <div className="flex justify-between items-center border-b-[6px] border-zinc-800 pb-[40px] mb-[60px]">
                <div className="flex flex-col items-start"><img src={saddlLogo} alt="Saddl Logo" className="h-[320px] w-auto object-contain" /></div>
                <div className="text-right">
                  <h1 className="font-black tracking-[0.05em] uppercase" style={{ fontSize: `${titleFontSize}px` }}>{renderVal(invoiceTitle)}</h1>
                  <div className="text-[32px] font-bold text-zinc-600 mt-[10px]">
                    Invoice No : <span className="font-mono text-zinc-900 font-bold">{renderVal(invoiceNo)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-[40px] border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                <div className="col-span-7 border-r-[3px] border-zinc-400 pr-[40px]">
                  <div className="font-black text-zinc-900 uppercase text-[38px] mb-[10px]">{renderVal(sellerName)}</div>
                  <div className="text-zinc-600 leading-relaxed whitespace-pre-line">{renderVal(sellerAddress)}</div>
                  <div className="font-semibold text-zinc-700 mt-[20px]">
                    TRN No : <span className="font-mono">{renderVal(sellerTrn)}</span>
                  </div>
                </div>
                <div className="col-span-5 pl-[20px] flex flex-col justify-between">
                  <div className="grid grid-cols-3 gap-y-[20px]">
                    <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Date</div><div className="col-span-2 font-mono text-zinc-800 font-bold text-right">{renderVal(invoiceDate)}</div>
                    <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Terms</div><div className="col-span-2 text-zinc-800 font-semibold text-right">{terms ? `${terms} Days` : '-'}</div>
                    <div className="col-span-1 font-bold text-zinc-500 uppercase tracking-wider">Due Date</div><div className="col-span-2 font-mono text-zinc-800 font-bold text-right">{renderVal(dueDate)}</div>
                  </div>
                </div>
              </div>

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

              <div className="border-[3px] border-zinc-400 rounded-[10px] overflow-hidden mb-[40px] text-[32px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-100 text-zinc-700 border-b-[3px] border-zinc-400 font-bold uppercase tracking-wider text-[30px] group">
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
                        <tr className="group hover:bg-white/10 transition-colors hover:bg-zinc-50/50 min-h-[90px]" key={item.id}>
                          <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-bold text-zinc-600"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.sno}</span></td>
                          <td className="px-[40px] py-[25px] border-r-[3px] border-zinc-400 font-medium leading-relaxed text-zinc-800"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent ? renderVal(item.description) : '-'}</span></td>
                          <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-center font-semibold text-zinc-800"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent && item.qty > 0 ? item.qty : '-'}</span></td>
                          <td className="px-[30px] py-[25px] border-r-[3px] border-zinc-400 text-right font-mono text-zinc-700 font-semibold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent && item.rate > 0 ? item.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span></td>
                          <td className="px-[40px] py-[25px] text-right font-mono text-zinc-900 font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{hasContent && (item.qty * item.rate) > 0 ? (item.qty * item.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

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

              <div className="border-[3px] border-zinc-400 p-[40px] rounded-[10px] bg-zinc-50/50 mb-[60px] text-[32px]">
                <div className="font-semibold text-zinc-700">
                  <span className="font-bold text-zinc-900 uppercase">Amount in Words:</span> {amountInWords}
                </div>
              </div>
            </div>

            <div className="space-y-[40px]">
              <div className="text-zinc-600 text-[30px] leading-relaxed border-b-[3px] border-zinc-400 pb-[20px]">
                <span className="font-bold text-zinc-800">Note :</span> {renderVal(remarks)}
              </div>
              <div className="border-[3px] border-zinc-400 rounded-[10px] p-[40px] bg-zinc-50/50 text-[30px] space-y-[10px]">
                <div className="font-black text-zinc-800 uppercase tracking-wider mb-[20px]">Account Details</div>
                <div className="grid grid-cols-12 gap-y-[15px]">
                  <div className="col-span-4 font-bold text-zinc-500">Beneficiary Name</div><div className="col-span-8 font-semibold text-zinc-900">{renderVal(beneficiaryName)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Bank Name</div><div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankName)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Account Number</div><div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankAccount)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">IBAN</div><div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankIban)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Bank / SWIFT Code</div><div className="col-span-8 font-mono text-zinc-900 font-bold">{renderVal(bankSwift)}</div>
                  <div className="col-span-4 font-bold text-zinc-500">Account Type</div><div className="col-span-8 font-semibold text-zinc-900">{renderVal(bankType)}</div>
                </div>
              </div>
              <div className="border-[3px] border-zinc-400 p-[20px] bg-zinc-100 rounded-[10px] text-center text-[28px] font-bold uppercase tracking-wider text-zinc-600">
                This is a computer-generated invoice and does not require a signature.
              </div>
              <div className="flex justify-between items-center text-[28px] font-bold text-zinc-400 border-t-[3px] border-zinc-300 pt-[20px]">
                <div>Page 2 of 2</div>
                <div className="uppercase tracking-[0.1em]">{renderVal(sellerName)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
