export function CoverageBar({ days }: { days: number }) {
  const pct = Math.min((days / 90) * 100, 100)
  const filled = Math.round(pct / 5) // 20 chars total
  const empty = 20 - filled

  let color: string
  if (days < 14) color = 'text-red-500'
  else if (days < 30) color = 'text-orange-500'
  else if (days < 60) color = 'text-amber-500'
  else color = 'text-green-500'

  return (
    <span className="font-data text-xs">
      <span className={color}>{'▓'.repeat(filled)}</span>
      <span className="text-zinc-200">{'░'.repeat(empty)}</span>
      <span className="text-zinc-400 ml-1">{days.toFixed(1)}d</span>
    </span>
  )
}
