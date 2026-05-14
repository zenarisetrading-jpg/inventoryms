import type { ActionFlag, POStatus } from '../../types'

type BadgeValue = ActionFlag | POStatus | string

const CONFIG: Record<string, string> = {
  // ActionFlag
  CRITICAL_OOS_RISK: 'bg-red-50 text-red-600 border border-red-200',
  OOS_RISK: 'bg-amber-50 text-amber-600 border border-amber-200',
  SHIP_NOW: 'bg-blue-50 text-blue-600 border border-blue-200',
  REORDER: 'bg-amber-50 text-amber-600 border border-amber-200',
  TRANSFER: 'bg-blue-50 text-blue-600 border border-blue-200',
  EXCESS: 'bg-amber-50 text-amber-600 border border-amber-200',
  OK: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  // POStatus
  draft: 'bg-slate-50 text-slate-600 border border-slate-200',
  ordered: 'bg-blue-50 text-blue-600 border border-blue-200',
  shipped: 'bg-blue-50 text-blue-600 border border-blue-200',
  cancelled: 'bg-red-50 text-red-600 border border-red-200',
  arrived: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  closed: 'bg-slate-50 text-slate-600 border border-slate-200',
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
