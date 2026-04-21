import type { ActionFlag } from '../../types'

const CONFIG: Record<ActionFlag, { cls: string; label: string }> = {
  CRITICAL_OOS_RISK: { cls: 'bg-red-100 text-red-700 border border-red-200', label: 'CRITICAL' },
  OOS_RISK:          { cls: 'bg-orange-100 text-orange-700 border border-orange-200', label: 'OOS RISK' },
  SHIP_NOW:          { cls: 'bg-amber-100 text-amber-800 border border-amber-200', label: 'SHIP' },
  REORDER:           { cls: 'bg-blue-100 text-blue-700 border border-blue-200', label: 'REORDER' },
  TRANSFER:          { cls: 'bg-purple-100 text-purple-700 border border-purple-200', label: 'TRANSFER' },
  EXCESS:            { cls: 'bg-orange-100 text-orange-700 border border-orange-200', label: 'EXCESS' },
  OK:                { cls: 'bg-green-100 text-green-700 border border-green-200', label: 'OK' },
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
