import React from 'react'
import { ListFilter, ChevronUp, ChevronDown } from 'lucide-react'

interface DetailedPerformanceTableProps {
  filteredAndSortedSales: any[]
  sortField: string
  sortOrder: 'asc' | 'desc'
  toggleSort: (field: string) => void
}

export function DetailedPerformanceTable({ filteredAndSortedSales, sortField, sortOrder, toggleSort }: DetailedPerformanceTableProps) {
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4 ml-2 inline" /> : <ChevronDown className="w-4 h-4 ml-2 inline" />
  }

  return (
    <div className="relative z-10 bg-card border-white/5 shadow-2xl overflow-hidden">
      <div className="p-8 lg:p-10 border-b border-white/5">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="p-3 bg-brand-amber/10 rounded-2xl mb-4"><ListFilter className="w-6 h-6 text-brand-amber" /></div>
          <div>
            <h3 className="text-sm font-black text-primary uppercase tracking-wider">Detailed Performance Audit</h3>
            <p className="text-[10px] font-bold text-white uppercase tracking-widest">SKU-level channel metrics • Data Explorer</p>
          </div>
        </div>
      </div>

      <div className="overflow-auto max-h-[420px] custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead className="sticky top-0 z-20 bg-[#111827] shadow-none border-white/10">
            <tr className="border-b border-zinc-200 group">
              <th onClick={() => toggleSort('total_units')} className="px-6 py-5 text-[11px] font-black text-white uppercase tracking-widest w-16 cursor-pointer hover:text-brand-blue text-center">
                # <SortIcon field="total_units" />
              </th>
              <th onClick={() => toggleSort('category')} className="px-8 py-5 text-[11px] font-black text-white uppercase tracking-widest cursor-pointer hover:text-brand-blue">
                Class <SortIcon field="category" />
              </th>
              <th onClick={() => toggleSort('product_category')} className="px-8 py-5 text-[11px] font-black text-white uppercase tracking-widest cursor-pointer hover:text-brand-blue">
                Category <SortIcon field="product_category" />
              </th>
              <th onClick={() => toggleSort('sub_category')} className="px-8 py-5 text-[11px] font-black text-white uppercase tracking-widest cursor-pointer hover:text-brand-blue">
                Sub-Category <SortIcon field="sub_category" />
              </th>
              <th onClick={() => toggleSort('sku')} className="px-8 py-5 text-[11px] font-black text-white uppercase tracking-widest cursor-pointer hover:text-brand-blue">
                SKU <SortIcon field="sku" />
              </th>
              <th onClick={() => toggleSort('amazon_units')} className="px-8 py-5 text-[11px] font-black text-brand-amber uppercase tracking-widest cursor-pointer hover:text-primary text-right">
                Amazon <SortIcon field="amazon_units" />
              </th>
              <th onClick={() => toggleSort('noon_units')} className="px-8 py-5 text-[11px] font-black text-brand-blue uppercase tracking-widest cursor-pointer hover:text-primary text-right">
                Noon <SortIcon field="noon_units" />
              </th>
              <th onClick={() => toggleSort('minutes_units')} className="px-8 py-5 text-[11px] font-black text-indigo-600 uppercase tracking-widest cursor-pointer hover:text-primary text-right">
                Minutes <SortIcon field="minutes_units" />
              </th>
              <th onClick={() => toggleSort('total_units')} className="px-8 py-5 text-[11px] font-black text-primary uppercase tracking-widest cursor-pointer hover:text-brand-blue text-right">
                Total <SortIcon field="total_units" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredAndSortedSales.length === 0 && (
              <tr className="group hover:bg-white/10 transition-colors">
                <td colSpan={9} className="px-8 py-20 text-center text-white font-black uppercase tracking-widest"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">No performance data found matching your current filters.</span></td>
              </tr>
            )}
            {filteredAndSortedSales.map((row, i) => (
              <tr className="group hover:bg-white/10 transition-colors" key={i}>
                <td className="px-6 py-5 text-center text-[11px] font-black text-white"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{i + 1}</span></td>
                <td className="px-8 py-5 text-[12px] font-black text-white uppercase"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.category}</span></td>
                <td className="px-8 py-5 text-[12px] font-black text-white uppercase"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.product_category}</span></td>
                <td className="px-8 py-5 text-[12px] font-black text-white uppercase"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.sub_category}</span></td>
                <td className="px-8 py-5 text-[12px] font-black text-white font-data uppercase"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.sku}</span></td>
                <td className="px-8 py-5 text-right font-data text-[13px] font-black text-brand-amber"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.amazon_units?.toLocaleString()}</span></td>
                <td className="px-8 py-5 text-right font-data text-[13px] font-black text-brand-blue"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.noon_units?.toLocaleString()}</span></td>
                <td className="px-8 py-5 text-right font-data text-[13px] font-black text-indigo-600"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.minutes_units?.toLocaleString()}</span></td>
                <td className="px-8 py-5 text-right font-data text-[15px] font-black text-primary"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.total_units?.toLocaleString()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
