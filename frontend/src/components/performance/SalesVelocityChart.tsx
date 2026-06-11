import React from 'react'
import { LineChart as LineIcon } from 'lucide-react'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Legend, ResponsiveContainer, Tooltip } from 'recharts'
import { CustomTooltip } from './CustomTooltip'
import { COLORS } from './constants'

export function SalesVelocityChart({ data }: { data: any[] }) {
  return (
    <div className="bg-card border-white/5 shadow-2xl relative overflow-hidden p-8 lg:p-10">
      <div className="mb-6 sm:mb-10 flex flex-col items-center justify-center text-center relative z-10">
        <div className="p-2 sm:p-3 bg-indigo-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><LineIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" /></div>
        <div>
          <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Sales Velocity Trend</h3>
          <p className="text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-widest">Daily units per channel</p>
        </div>
      </div>
      <div className="h-[300px] sm:h-[450px] relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 900 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent', stroke: '#334155', strokeWidth: 1, strokeDasharray: '5 5' }} />
            <Legend
              verticalAlign="top"
              height={window.innerWidth < 640 ? 100 : 60}
              iconType="circle"
              wrapperStyle={{
                fontSize: window.innerWidth < 640 ? '8px' : '10px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                paddingBottom: '20px'
              }}
            />
            <Line type="monotone" dataKey="amazon" stroke={COLORS.amazon} strokeWidth={4} dot={false} name="AMAZON" />
            <Line type="monotone" dataKey="noon" stroke={COLORS.noon} strokeWidth={4} dot={false} name="NOON FBN" />
            <Line type="monotone" dataKey="minutes" stroke={COLORS.minutes} strokeWidth={4} dot={false} name="NOON MINUTES" />
            <Line type="monotone" dataKey="total" stroke={COLORS.total} strokeWidth={2} strokeDasharray="8 8" dot={false} name="TOTAL UNITS" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
