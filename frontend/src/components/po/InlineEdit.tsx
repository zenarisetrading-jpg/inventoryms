import React, { useState } from 'react'
import { X, Check, Edit2 } from 'lucide-react'
import { Autocomplete } from '../shared/Autocomplete'

export interface InlineEditProps {
  value: string | number | null | undefined
  onSave: (val: string) => Promise<void>
  type?: 'text' | 'number' | 'date'
  placeholder?: string
  className?: string
  inputClassName?: string
  displayValue?: string
  suggestions?: string[]
  autoEdit?: boolean
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder = '—',
  className = '',
  inputClassName = 'w-16 text-xs',
  suggestions = [],
  autoEdit = false,
  displayValue
}: InlineEditProps) {
  const [editing, setEditing] = useState(autoEdit)
  let initialVal = ''
  if (type === 'date' && value) {
    try {
      const d = new Date(value.toString())
      if (!isNaN(d.getTime())) {
        initialVal = d.toISOString().split('T')[0]
      }
    } catch {
      initialVal = ''
    }
  } else {
    initialVal = value?.toString() ?? ''
  }
  const [val, setVal] = useState(initialVal)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setSaving(true)
    try {
      let finalVal = val
      // If selecting from suggestions, extract the SKU part
      if (suggestions.length > 0 && finalVal.includes(' - ')) {
        finalVal = finalVal.split(' - ')[0].trim()
      }
      await onSave(finalVal)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onClick={e => e.stopPropagation()} onSubmit={handleSave} className="flex items-center gap-1 relative z-10 bg-card rounded-md shadow-lg ring-1 ring-black/5 -ml-1 p-1">
        {suggestions.length > 0 ? (
          <div className={inputClassName}>
            <Autocomplete
              value={val}
              onChange={setVal}
              suggestions={suggestions}
              placeholder={placeholder}
              className={`px-1.5 py-0.5 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-zinc-800 text-white ${inputClassName}`}
            />
          </div>
        ) : (
          <input
            autoFocus
            type={type}
            step={type === 'number' ? 'any' : undefined}
            className={`px-1.5 py-0.5 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-zinc-800 text-white ${inputClassName}`}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setVal(value?.toString() ?? '') } }}
          />
        )}
        <button type="submit" disabled={saving} className="p-0.5 text-emerald-400 hover:bg-emerald-500/20 rounded shrink-0 transition-colors">
          {saving ? <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin block" /> : <Check className="h-3 w-3" />}
        </button>
        <button type="button" onClick={() => { setEditing(false); setVal(value?.toString() ?? '') }} className="p-0.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 rounded shrink-0 transition-colors">
          <X className="h-3 w-3" />
        </button>
      </form>
    )
  }

  return (
    <div 
      className={`group/edit cursor-pointer flex items-center gap-1 w-full ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
        let clickVal = ''
        if (type === 'date' && value) {
          try {
            const d = new Date(value.toString())
            if (!isNaN(d.getTime())) {
              clickVal = d.toISOString().split('T')[0]
            }
          } catch {
            clickVal = ''
          }
        } else {
          clickVal = value?.toString() ?? ''
        }
        setVal(clickVal)
      }}
    >
      <span className="text-white">{displayValue || (value !== null && value !== undefined && value !== '' ? value : <span className="text-white/80 italic font-semibold">{placeholder}</span>)}</span>
      <Edit2 className="h-2.5 w-2.5 text-zinc-300 opacity-0 group-hover/edit:opacity-100 transition-opacity hover:text-amber-500 shrink-0" />
    </div>
  )
}
