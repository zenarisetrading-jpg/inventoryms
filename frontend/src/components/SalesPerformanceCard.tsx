import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface SalesPerformanceCardProps {
  title: string;
  dateRange: string;
  sales: number;
  orders: number;
  units: number;
  refunds: number;
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
  growth,
  headerColor
}: SalesPerformanceCardProps) {
  const isPositive = growth && growth > 0;
  
  return (
    <div className="flex flex-col bg-[#212121] rounded-lg overflow-hidden shadow-2xl border border-white/5 min-w-[200px] flex-1">
      {/* Header */}
      <div className={`${headerColor} px-4 py-3 text-white`}>
        <h3 className="text-sm font-black tracking-tight">{title}</h3>
        <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider">{dateRange}</p>
      </div>
      
      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Sales Section */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sales</span>
            {growth !== undefined && (
              <span className={`text-[9px] font-black flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}{growth}%
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <h2 className="text-2xl font-black text-white font-data tracking-tighter">
              {sales.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span className="text-lg font-black text-white/40">د.إ</span>
          </div>
        </div>
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Orders / Units</p>
            <p className="text-sm font-black text-white mt-1 font-data">
              {orders} <span className="text-zinc-600 font-normal mx-0.5">/</span> {units}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Refunds</p>
            <p className="text-sm font-black text-blue-400 mt-1 font-data">
              {refunds}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
