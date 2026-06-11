import React from 'react'
import { BarChart3 } from 'lucide-react'
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { CustomTooltip } from './CustomTooltip'

export function SubCategoryPerformance({ data }: { data: any[] }) {
  return (
    <div className="bg-card border-white/5 shadow-2xl p-8 lg:p-10">
      <div className="mb-6 sm:mb-10 flex flex-col items-center justify-center text-center">
        <div className="p-2 sm:p-3 bg-emerald-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" /></div>
        <div>
          <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Sub-category Performance</h3>
          <p className="text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-widest">Volume breakdown by type</p>
        </div>
      </div>
      <div className="h-[300px] sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 120 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="sub_category"
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={(props: any) => {
                const { x, y, payload } = props;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={16}
                      textAnchor="start"
                      fill="#475569"
                      fontSize={9}
                      fontWeight={900}
                      transform="rotate(90)"
                    >
                      {payload.value?.toString().toUpperCase()}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Bar dataKey="total_units" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} label={{ position: 'top', fill: '#0f172a', fontSize: 11, fontWeight: 900, offset: 10, formatter: (v: any) => v?.toLocaleString() }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
