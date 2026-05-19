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
    <div className="flex flex-col bg-[#1A1A1A] rounded-2xl overflow-hidden shadow-2xl border border-white/5 w-full min-w-0 transition-all hover:border-white/10">
      {/* Header */}
      <div className={`${headerColor} px-4 py-3.5 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-[13px] font-black uppercase tracking-tight text-white">{title}</h3>
              <p className="text-[10px] font-bold opacity-90 uppercase tracking-wider">{dateRange}</p>
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
          <span className="text-[10px] font-black text-white uppercase tracking-widest block mb-1">Total Sales</span>
          <div className="flex items-baseline gap-1">
            <h2 className="text-3xl font-black text-white font-data tracking-tighter">
              {formatCurrency(sales)}
            </h2>
            <span className="text-sm font-black text-white">AED</span>
          </div>
        </div>
        
        {/* Secondary Metrics Grid */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
          <MetricBox label="Orders / Units" value={`${orders} / ${units}`} />
          <MetricBox label="Refunds" value={refunds} valueColor="text-blue-400" />
        </div>

        {/* Channel Breakdown */}
        {breakdown && breakdown.length > 0 && (
          <div className="pt-4 border-t border-white/5 space-y-3">
            <span className="text-[9px] font-black text-white uppercase tracking-widest block mb-1">Marketplace Split</span>
            
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 items-center">
              {/* Table Headers */}
              <div className="text-[9px] font-black text-white uppercase tracking-wider text-left">Marketplace</div>
              <div className="text-[9px] font-black text-white uppercase tracking-wider text-right">Sales (AED)</div>
              <div className="text-[9px] font-black text-white uppercase tracking-wider text-right">Units</div>

              {breakdown.map((item, idx) => (
                <React.Fragment key={idx}>
                  {/* Col 1: Channel */}
                  <div className="flex items-center gap-2 text-left min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.color}`} />
                    <span className="text-[10px] font-bold text-white uppercase truncate">{item.label}</span>
                  </div>

                  {/* Col 2: Sales */}
                  <div className="text-[12px] font-black text-white font-data text-right">
                    {formatCurrency(item.sales)}
                  </div>

                  {/* Col 3: Units */}
                  <div className="text-[12px] font-black text-white font-data text-right">
                    {item.units.toLocaleString()}
                  </div>
                </React.Fragment>
              ))}
            </div>
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
      <p className="text-[10px] font-bold text-white uppercase tracking-widest">{label}</p>
      <p className={`text-sm font-black font-data ${valueColor}`}>
        {value} {isCurrency && <span className="text-[10px] opacity-70 ml-0.5">AED</span>}
      </p>
    </div>
  );
}

