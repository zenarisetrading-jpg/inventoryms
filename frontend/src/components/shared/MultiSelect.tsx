import { useState, useEffect, useRef } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'

interface MultiSelectProps {
  label: string
  options: { label: string; value: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
  icon?: any
  placeholder?: string
}

export function MultiSelect({ label, options, selected, onChange, icon: Icon, placeholder = 'Select...' }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localSelected, setLocalSelected] = useState<string[]>(selected)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync with external selected state when it changes
  useEffect(() => {
    setLocalSelected(selected)
  }, [selected])

  // Handle clicking outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Apply changes when dropdown closes OR after a 2.5s debounce while open
  useEffect(() => {
    let timer: NodeJS.Timeout
    
    if (!isOpen) {
      // Instantly apply when closed
      if (JSON.stringify(localSelected) !== JSON.stringify(selected)) {
        onChange(localSelected)
      }
    } else {
      // Wait 2.5 seconds while open before auto-applying
      timer = setTimeout(() => {
        if (JSON.stringify(localSelected) !== JSON.stringify(selected)) {
          onChange(localSelected)
        }
      }, 2500)
    }
    
    return () => clearTimeout(timer)
  }, [isOpen, localSelected, selected, onChange])

  const toggleOption = (val: string) => {
    if (localSelected.includes(val)) {
      setLocalSelected(localSelected.filter(s => s !== val))
    } else {
      setLocalSelected([...localSelected, val])
    }
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLocalSelected([])
    onChange([])
  }

  return (
    <div ref={containerRef} className="relative w-full lg:w-auto lg:min-w-[160px]">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-4 py-2 lg:py-2.5 bg-zinc-50 border border-zinc-100 rounded-lg lg:rounded-xl cursor-pointer hover:border-brand-blue transition-all shadow-inner group"
      >
        {Icon && <Icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 transition-colors ${selected.length > 0 ? 'text-brand-blue' : 'text-zinc-400'}`} />}
        <div className="flex-1 flex items-center gap-1 overflow-hidden">
          {localSelected.length === 0 ? (
            <span className="text-[10px] lg:text-sm font-bold text-zinc-400 uppercase truncate">{placeholder}</span>
          ) : (
            <span className="text-[10px] lg:text-sm font-black text-zinc-900 uppercase truncate">
              {localSelected.length === 1 ? options.find(o => o.value === localSelected[0])?.label : `${localSelected.length} SELECTED`}
            </span>
          )}
        </div>
        {localSelected.length > 0 && (
          <button onClick={clearAll} className="p-0.5 hover:bg-zinc-200 rounded-md transition-colors shrink-0">
            <X className="w-3 h-3 text-zinc-400" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 lg:w-4 lg:h-4 text-zinc-300 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-2 w-full min-w-[200px] bg-white border border-zinc-200 rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150">
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-0.5">
            {options.map(opt => {
              const isActive = localSelected.includes(opt.value)
              return (
                <div
                  key={opt.value}
                  onClick={() => toggleOption(opt.value)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-brand-blue/5' : 'hover:bg-zinc-50'}`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors border ${isActive ? 'bg-brand-blue border-brand-blue' : 'border-zinc-300 bg-white'}`}>
                    {isActive && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                  </div>
                  <span className={`text-[12px] font-black uppercase tracking-tight ${isActive ? 'text-brand-blue' : 'text-zinc-600'}`}>
                    {opt.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
