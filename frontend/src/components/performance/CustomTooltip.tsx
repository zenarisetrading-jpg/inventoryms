import React from 'react'

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Attempt to parse date, fallback to raw label if not a date
    const dateParsed = Date.parse(label);
    const isDate = !isNaN(dateParsed) && label?.toString().includes('-');
    const displayLabel = isDate
      ? new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
      : label?.toString().toUpperCase();

    return (
      <div className="bg-[#0f172a] border border-white/10 p-5 rounded-2xl shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] font-black text-white mb-4 uppercase tracking-[0.2em] border-b border-white/5 pb-3">
          {displayLabel}
        </p>
        <div className="space-y-2.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">{entry.name}</span>
              </div>
              <span className="text-[12px] font-black text-white font-data">
                {entry.value?.toLocaleString()}{entry.unit === '%' ? '%' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};
