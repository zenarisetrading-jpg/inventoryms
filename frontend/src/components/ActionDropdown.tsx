import React, { useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface ActionDropdownProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  options?: string[];
  colors?: Record<string, string>;
  showArrow?: boolean;
}

const DEFAULT_STATUSES = ['shipped', 'Delivered', 'Closed', 'Cancelled'];
const DEFAULT_COLORS: Record<string, string> = {
  shipped: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
  Delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Closed: 'bg-slate-100 text-slate-500 border-slate-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200'
};

export function ActionDropdown({ 
  currentStatus, 
  onStatusChange, 
  options = DEFAULT_STATUSES, 
  colors = DEFAULT_COLORS,
  showArrow = true
}: ActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const statusLower = currentStatus.toLowerCase();
  // Try to find a matching color key (case-insensitive)
  const colorKey = Object.keys(colors).find(k => k.toLowerCase() === statusLower) || options[0];
  const activeColor = colors[colorKey] || 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div className="relative inline-block">
      <button 
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-black border uppercase tracking-wider transition-all hover:shadow-sm ${activeColor}`}
      >
        {showArrow && statusLower === 'shipped' && <span className="text-[14px] leading-none">→</span>}
        {currentStatus}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in duration-100">
            {options.map(s => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); onStatusChange(s); setIsOpen(false); }}
                className={`w-full text-left px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-colors ${currentStatus === s ? 'text-brand-blue bg-blue-50/50' : 'text-slate-600'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
