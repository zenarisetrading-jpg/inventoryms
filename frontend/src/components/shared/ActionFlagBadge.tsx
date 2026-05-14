import type { ActionFlag } from '../../types'

const CONFIG: Record<ActionFlag, { cls: string; label: string }> = {
  CRITICAL_OOS_RISK: { cls: 'bg-red-50 text-red-600 border border-red-200', label: 'CRITICAL' },
  OOS_RISK:          { cls: 'bg-amber-50 text-amber-600 border border-amber-200', label: 'OOS RISK' },
  SHIP_NOW:          { cls: 'bg-blue-50 text-blue-600 border border-blue-200', label: 'SHIP' },
  REORDER:           { cls: 'bg-amber-50 text-amber-600 border border-amber-200', label: 'REORDER' },
  TRANSFER:          { cls: 'bg-blue-50 text-blue-600 border border-blue-200', label: 'TRANSFER' },
  EXCESS:            { cls: 'bg-amber-50 text-amber-600 border border-amber-200', label: 'EXCESS' },
  OK:                { cls: 'bg-emerald-50 text-emerald-600 border border-emerald-200', label: 'OK' },
}

export function ActionFlagBadge({ flag }: { flag: ActionFlag | null | undefined }) {
  if (!flag) return <span className="text-zinc-300 text-xs">—</span>
  const { cls, label } = CONFIG[flag] ?? { cls: 'bg-zinc-100 text-zinc-600 border border-zinc-200', label: flag }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
