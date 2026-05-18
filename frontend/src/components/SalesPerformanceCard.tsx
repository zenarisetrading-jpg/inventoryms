import React from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

interface ChannelBreakdown {
  label: string;
  sales: number;
  units: number;
  color: string;
}

interface SalesPerformanceCardProps {
  title: string;
  dateRange: string;
  sales: number;
  orders: number;
  units: number;
  refunds: number;
  breakdown?: ChannelBreakdown[];
  growth?: number;
  headerColor: string;
}

export function SalesPerformanceCard({
  title,
  dateRange,
  sales,
  orders,
  units,
  refunds,
  breakdown,
  growth,
  headerColor
}: SalesPerformanceCardProps) {
  const isPositive = growth && growth > 0;
  
  const formatCurrency = (val: number) => 
    val.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col bg-[#1A1A1A] rounded-2xl overflow-hidden shadow-2xl border border-white/5 min-w-[260px] flex-1 transition-all hover:border-white/10">
      {/* Header */}
      <div className={`${headerColor} px-4 py-3 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-[11px] font-black tracking-tight">{title}</h3>
              <p className="text-[9px] font-bold opacity-70 uppercase tracking-wider">{dateRange}</p>
            </div>
          </div>
          {growth !== undefined && (
            <div className={`px-2 py-1 rounded-full text-[10px] font-black flex items-center gap-0.5 bg-black/20 ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(growth)}%
            </div>
          )}
        </div>
      </div>
      
      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Main Sales Metric */}
        <div>
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Total Sales</span>
          <div className="flex items-baseline gap-1">
            <h2 className="text-2xl font-black text-white font-data tracking-tighter">
              {formatCurrency(sales)}
            </h2>
            <span className="text-sm font-black text-white/40">AED</span>
          </div>
        </div>
        
        {/* Secondary Metrics Grid */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
          <MetricBox label="Orders / Units" value={`${orders} / ${units}`} />
          <MetricBox label="Refunds" value={refunds} valueColor="text-blue-400" />
        </div>

        {/* Channel Breakdown */}
        {breakdown && breakdown.length > 0 && (
          <div className="pt-4 border-t border-white/5 space-y-2">
            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Marketplace Split</span>
            {breakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between group/item">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                  <span className="text-[9px] font-bold text-zinc-400 group-hover/item:text-white transition-colors uppercase">{item.label}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-white font-data leading-none mb-0.5">
                    {formatCurrency(item.sales)} <span className="text-[7px] text-zinc-600 ml-0.5">AED</span>
                  </p>
                  <p className="text-[8px] font-bold text-zinc-500 leading-none">
                    {item.units} <span className="text-[7px] opacity-40 lowercase">units</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function MetricBox({ label, value, isCurrency, valueColor = "text-white" }: { 
  label: string; 
  value: string | number; 
  isCurrency?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className={`text-xs font-black font-data ${valueColor}`}>
        {value} {isCurrency && <span className="text-[9px] opacity-40 ml-0.5">AED</span>}
      </p>
    </div>
  );
}

