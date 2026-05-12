import React, { useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface ActionDropdownProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  options?: string[];
  colors?: Record<string, string>;
  showArrow?: boolean;
}

const DEFAULT_STATUSES = ['Shipment planning', 'Sent to FBA', 'Sent to FBN', 'Sent to Both'];
const DEFAULT_COLORS: Record<string, string> = {
  'Shipment planning': 'bg-slate-100 text-slate-700 border-slate-200',
  'Sent to FBA': 'bg-blue-100 text-blue-700 border-blue-200',
  'Sent to FBN': 'bg-amber-100 text-amber-700 border-amber-200',
  'Sent to Both': 'bg-purple-100 text-purple-700 border-purple-200'
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
        className={`flex items-center justify-between gap-1.5 px-3 py-1.5 w-36 rounded-md text-[10px] font-black border uppercase tracking-wider transition-all hover:shadow-sm ${activeColor}`}
      >
        <div className="flex items-center gap-1.5 truncate mr-1">
          {showArrow && (statusLower.startsWith('sent to') || statusLower === 'shipment planning') && <span className="text-[14px] leading-none shrink-0">→</span>}
          <span className="truncate">{currentStatus}</span>
        </div>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in duration-100">
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
