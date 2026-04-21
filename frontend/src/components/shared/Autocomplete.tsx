import { useState, useRef, useEffect } from 'react'

interface AutocompleteProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  required?: boolean
  label?: string
  note?: string
}

export function Autocomplete({ value, onChange, suggestions, placeholder, className, required, label, note }: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filtered, setFiltered] = useState<string[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = value.toLowerCase()
    const matches = suggestions.filter(s => {
      if (!q) return true
      return s.toLowerCase().includes(q) && s.toLowerCase() !== q
    })
    setFiltered(matches.slice(0, 10))
  }, [value, suggestions])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-zinc-700 mb-1.5 flex items-center justify-between">
          <span>{label} {required && <span className="text-red-500">*</span>}</span>
          {note && <span className="text-[10px] font-normal text-zinc-400">{note}</span>}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        required={required}
        className={className}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-zinc-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              className="w-full px-3 py-2 text-sm text-left text-zinc-700 hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0"
              onClick={() => {
                onChange(suggestion)
                setIsOpen(false)
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
