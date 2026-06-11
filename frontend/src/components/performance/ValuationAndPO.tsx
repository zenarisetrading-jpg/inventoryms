import React, { useState } from 'react'
import { TrendingUp, ShoppingCart } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip, Legend } from 'recharts'
import { VAL_COLORS, PO_STATUS_COLORS, aed } from './constants'

export function ValuationChart({ valuationData, totalValuation }: { valuationData: any[], totalValuation: number }) {
  const [hoverValuation, setHoverValuation] = useState<string | null>(null)

  return (
    <div className="bg-card border-white/5 shadow-2xl flex flex-col p-8">
      <div className="mb-10 flex flex-col items-center justify-center text-center">
        <div className="p-3 bg-brand-blue/10 rounded-2xl shrink-0 mb-4"><TrendingUp className="w-6 h-6 text-brand-blue" /></div>
        <div>
          <h3 className="text-sm font-black text-primary uppercase tracking-wider">Inventory Valuation</h3>
          <p className="text-[10px] font-bold text-white uppercase tracking-widest">Asset value per node</p>
        </div>
      </div>
      <div className="h-[350px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={valuationData}
              dataKey="value_aed"
              nameKey="node"
              cx="50%"
              cy="50%"
              innerRadius={100}
              outerRadius={130}
              paddingAngle={6}
              stroke="none"
              onMouseEnter={(_, i) => setHoverValuation(valuationData[i].node)}
              onMouseLeave={() => setHoverValuation(null)}
            >
              {valuationData.map((entry, i) => <Cell key={i} fill={VAL_COLORS[entry.node] || '#e2e8f0'} />)}
            </Pie>
            <ChartTooltip contentStyle={{ display: 'none' }} />
            <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', paddingTop: '30px', color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
          <span className="text-[18px] font-black text-white font-data tracking-tight">
            {hoverValuation
              ? aed(valuationData.find(d => d.node === hoverValuation)?.value_aed)
              : aed(totalValuation)}
          </span>
          <span className="text-[8px] font-black text-white uppercase tracking-widest mt-1">
            {hoverValuation || 'Total Assets'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function PoStatusChart({ poStatusData }: { poStatusData: any[] }) {
  const [hoverPo, setHoverPo] = useState<string | null>(null)

  return (
    <div className="bg-card border-white/5 shadow-2xl flex flex-col p-8">
      <div className="mb-10 flex flex-col items-center justify-center text-center">
        <div className="p-3 bg-purple-50 rounded-2xl shrink-0 mb-4"><ShoppingCart className="w-6 h-6 text-purple-600" /></div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Purchase Order Status</h3>
          <p className="text-[10px] font-bold text-white uppercase tracking-widest">Procurement lifecycle breakdown</p>
        </div>
      </div>
      <div className="h-[350px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={poStatusData}
              dataKey="total_units"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={100}
              outerRadius={130}
              paddingAngle={6}
              stroke="none"
              onMouseEnter={(_, i) => setHoverPo(poStatusData[i].status)}
              onMouseLeave={() => setHoverPo(null)}
            >
              {poStatusData.map((entry, i) => <Cell key={i} fill={PO_STATUS_COLORS[entry.status] || '#e2e8f0'} />)}
            </Pie>
            <ChartTooltip contentStyle={{ display: 'none' }} />
            <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', paddingTop: '30px', color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
          <span className="text-[20px] font-black text-white font-data leading-none">
            {hoverPo
              ? (poStatusData.find(d => d.status === hoverPo)?.total_units || 0).toLocaleString()
              : poStatusData.reduce((acc, curr) => acc + (curr.total_units || 0), 0).toLocaleString()}
          </span>
          <span className="text-[8px] font-black text-white uppercase tracking-widest mt-1">
            {hoverPo || 'Total Units'}
          </span>
          <div className="w-8 h-px bg-white/10 my-1" />
          <span className="text-[14px] font-black text-white font-data leading-none">
            {hoverPo
              ? (poStatusData.find(d => d.status === hoverPo)?.po_count || 0)
              : poStatusData.reduce((acc, curr) => acc + curr.po_count, 0)}
          </span>
          <span className="text-[8px] font-black text-white uppercase tracking-widest mt-1">
            {hoverPo ? 'Orders' : 'Total Orders'}
          </span>
        </div>
      </div>
    </div>
  )
}
