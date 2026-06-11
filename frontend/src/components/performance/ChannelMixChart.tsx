import React from 'react'
import { PieChart as PieIcon } from 'lucide-react'
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { CustomTooltip } from './CustomTooltip'
import { COLORS } from './constants'

export function ChannelMixChart({ data }: { data: any[] }) {
  return (
    <div className="bg-card border-white/5 shadow-2xl p-8 lg:p-10">
      <div className="mb-6 sm:mb-8 flex flex-col items-center justify-center text-center">
        <div className="p-2 sm:p-3 bg-orange-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><PieIcon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" /></div>
        <div>
          <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Channel Mix</h3>
          <p className="text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-widest">Daily sales share %</p>
        </div>
      </div>
      <div className="h-[250px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis unit="%" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent', stroke: '#334155', strokeWidth: 1, strokeDasharray: '5 5' }} />
            <Area type="monotone" dataKey="amz_pct" stackId="1" stroke={COLORS.amazon} fill={COLORS.amazon} fillOpacity={0.1} name="AMAZON" />
            <Area type="monotone" dataKey="noon_pct" stackId="1" stroke={COLORS.noon} fill={COLORS.noon} fillOpacity={0.1} name="NOON" />
            <Area type="monotone" dataKey="min_pct" stackId="1" stroke={COLORS.minutes} fill={COLORS.minutes} fillOpacity={0.1} name="MINUTES" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
