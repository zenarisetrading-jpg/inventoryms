import React, { useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface ActionDropdownProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  options?: string[];
  colors?: Record<string, string>;
  showArrow?: boolean;
  placeholder?: string;
  direction?: 'up' | 'down';
  isMulti?: boolean;
}

const DEFAULT_STATUSES = ['Shipment planning', 'Sent to FBA', 'Sent to FBN', 'Sent to Minutes'];
const DEFAULT_COLORS: Record<string, string> = {
  'Shipment planning': 'bg-slate-100 text-slate-700 border-slate-200',
  'Sent to FBA': 'bg-blue-100 text-blue-700 border-blue-200',
  'Sent to FBN': 'bg-amber-100 text-amber-700 border-amber-200',
  'Sent to Minutes': 'bg-teal-100 text-teal-700 border-teal-200'
};

export function ActionDropdown({ 
  currentStatus, 
  onStatusChange, 
  options = DEFAULT_STATUSES, 
  colors = DEFAULT_COLORS,
  showArrow = true,
  placeholder = 'Select Status',
  direction = 'down',
  isMulti = false
}: ActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const selectedStatuses = isMulti 
    ? (currentStatus ? currentStatus.split(',').map(s => s.trim()).filter(Boolean) : [])
    : [currentStatus].filter(Boolean);

  const statusLower = selectedStatuses.length > 0 ? selectedStatuses[0].toLowerCase() : '';
  // Try to find a matching color key (case-insensitive)
  const colorKey = statusLower ? (Object.keys(colors).find(k => k.toLowerCase() === statusLower) || options[0]) : '';
  let activeColor = colorKey ? (colors[colorKey] || 'bg-slate-100 text-slate-500 border-slate-200') : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white';

  if (isMulti && selectedStatuses.length > 1) {
    activeColor = 'bg-indigo-100 text-indigo-700 border-indigo-200';
  }

  let displayText = currentStatus || placeholder;
  if (isMulti && selectedStatuses.length > 1) {
    displayText = `${selectedStatuses.length} Selected`;
  }

  return (
    <div className={`relative inline-block ${isOpen ? 'z-50' : ''}`}>
      <button 
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`flex items-center justify-between gap-1.5 px-3 py-1.5 w-36 rounded-md text-[10px] font-black border uppercase tracking-wider transition-all hover:shadow-sm ${activeColor}`}
      >
        <div className="flex items-center gap-1.5 truncate mr-1">
          {showArrow && (statusLower.startsWith('sent to') || statusLower === 'shipment planning') && <span className="text-[14px] leading-none shrink-0">→</span>}
          <span className="truncate">{displayText}</span>
        </div>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`absolute right-0 w-36 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in duration-100 ${
            direction === 'up' 
              ? 'bottom-full mb-1 origin-bottom slide-in-from-bottom-2' 
              : 'top-full mt-1 origin-top zoom-in'
          }`}>
            {options.map(s => {
              const isSelected = selectedStatuses.includes(s);
              return (
                <button
                  key={s}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (isMulti) {
                      let nextSelected = [...selectedStatuses];
                      if (isSelected) {
                        nextSelected = nextSelected.filter(item => item !== s);
                      } else {
                        nextSelected.push(s);
                      }
                      onStatusChange(nextSelected.join(', '));
                    } else {
                      onStatusChange(s); 
                      setIsOpen(false); 
                    }
                  }}
                  className={`w-full text-left px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-colors flex items-center justify-between ${isSelected ? 'text-brand-blue bg-blue-50/50' : 'text-slate-600'}`}
                >
                  <span>{s}</span>
                  {isMulti && (
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      readOnly 
                      className="ml-2 w-3 h-3 text-brand-blue border-slate-300 rounded focus:ring-brand-blue cursor-pointer" 
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
