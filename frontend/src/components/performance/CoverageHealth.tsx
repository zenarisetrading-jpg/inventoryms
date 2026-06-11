import React from 'react'
import { HeartPulse } from 'lucide-react'
import { COLORS } from './constants'

export function CoverageHealth({ coverageData }: { coverageData: any }) {
  return (
    <div className="bg-card border-white/5 shadow-2xl p-8 lg:p-10">
      <div className="mb-6 sm:mb-8 flex flex-col items-center justify-center text-center">
        <div className="p-2 sm:p-3 bg-emerald-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><HeartPulse className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" /></div>
        <div>
          <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Coverage Health</h3>
          <p className="text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-widest">Median days of stock • Global Audit</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-2">
        {[
          { label: 'AMAZON FBA', val: coverageData?.amazon, color: COLORS.amazon },
          { label: 'NOON FBN', val: coverageData?.noon, color: COLORS.noon },
          { label: 'NOON MINUTES', val: coverageData?.minutes, color: COLORS.minutes },
          { label: 'LOCAD WAREHOUSE', val: coverageData?.locad, color: '#10b981' }
        ].map(node => (
          <div key={node.label} className="bg-white/5 border border-white/5 shadow-2xl p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center">
            <span className="text-[8px] sm:text-[9px] font-black text-white uppercase tracking-widest mb-1 sm:mb-2 leading-tight">{node.label}</span>
            <span className="text-lg sm:text-2xl font-black text-primary font-data">
              {node.val ? Math.round(node.val) : '-'}
            </span>
            <span className="text-[8px] font-bold text-white uppercase mt-1">Days</span>
            <div className="w-full h-1 mt-4 bg-zinc-200 rounded-full overflow-hidden">
              <div className="h-full transition-all duration-1000" style={{ width: `${Math.min(node.val || 0, 100)}%`, backgroundColor: node.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
