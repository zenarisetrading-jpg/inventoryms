import type { ActionFlag, POStatus } from '../../types'

type BadgeValue = ActionFlag | POStatus | string

const CONFIG: Record<string, string> = {
  // ActionFlag
  CRITICAL_OOS_RISK: 'bg-red-100 text-red-700 border border-red-200',
  OOS_RISK: 'bg-orange-100 text-orange-700 border border-orange-200',
  SHIP_NOW: 'bg-amber-100 text-amber-800 border border-amber-200',
  REORDER: 'bg-blue-100 text-blue-700 border border-blue-200',
  TRANSFER: 'bg-purple-100 text-purple-700 border border-purple-200',
  EXCESS: 'bg-orange-100 text-orange-700 border border-orange-200',
  OK: 'bg-green-100 text-green-700 border border-green-200',
  // POStatus
  draft: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  ordered: 'bg-blue-100 text-blue-700 border border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border border-purple-200',
  cancelled: 'bg-red-100 text-red-700 border border-red-200',
  arrived: 'bg-green-100 text-green-700 border border-green-200',
  closed: 'bg-zinc-100 text-zinc-400 border border-zinc-200',
}

export function StatusBadge({ status }: { status: BadgeValue }) {
  const cls = CONFIG[status] ?? 'bg-zinc-100 text-zinc-600 border border-zinc-200'
  const label = status.replace(/_/g, ' ')
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
