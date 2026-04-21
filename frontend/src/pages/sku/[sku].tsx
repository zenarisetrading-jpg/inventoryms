import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { SKUDetailResponse, ActionFlag } from '../../types'
import { navigate } from '../../lib/router'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { ActionFlagBadge } from '../../components/shared/ActionFlagBadge'
import { ArrowLeft } from 'lucide-react'

function getActionDescription(detail: SKUDetailResponse): string {
  const flag = detail.action_flag
  if (flag === 'CRITICAL_OOS_RISK') return 'URGENT: Less than 7 days of total stock remaining. Expedite all available supply.'
  if (flag === 'OOS_RISK') return 'WARNING: Less than 14 days total coverage. Ship from warehouse immediately.'
  if (flag === 'SHIP_NOW') {
    const locadAvail = detail.supply.locad_warehouse.available
    const boxes = detail.units_per_box > 0 ? Math.ceil(locadAvail / detail.units_per_box) : 0
    return `Ship ${boxes} boxes from Locad warehouse to Amazon FBA to reach minimum coverage.`
  }
  if (flag === 'REORDER') {
    const targetDays = 90
    const blended_sv = detail.demand?.blended_sv ?? 0
    const suggested = Math.ceil(blended_sv * targetDays)
    return `Reorder recommended. Suggested: ${suggested} units (based on ${targetDays}-day target coverage).`
  }
  if (flag === 'EXCESS') return 'Excess inventory. Consider pausing reorders until coverage normalizes.'
  return 'Coverage is healthy. No action required.'
}

function getTrend(sv7: number, sv90: number): { icon: string; label: string; color: string } {
  if (!sv90 || sv90 === 0) return { icon: '→', label: 'No trend data', color: 'text-zinc-400' }
  const delta = ((sv7 - sv90) / sv90) * 100
  if (delta > 15) return { icon: '↑', label: `+${delta.toFixed(0)}% vs 90d`, color: 'text-green-600' }
  if (delta < -15) return { icon: '↓', label: `${delta.toFixed(0)}% vs 90d`, color: 'text-red-600' }
  return { icon: '→', label: 'Stable', color: 'text-zinc-500' }
}

function coverageColor(days: number): string {
  if (days <= 0) return 'text-red-600'
  if (days <= 7) return 'text-red-600'
  if (days <= 14) return 'text-orange-500'
  if (days <= 30) return 'text-amber-600'
  return 'text-green-600'
}

function CoverageBar({ days }: { days: number }) {
  const pct = Math.min((days / 90) * 100, 100)
  let bg = 'bg-green-500'
  if (days <= 7) bg = 'bg-red-500'
  else if (days <= 14) bg = 'bg-orange-500'
  else if (days <= 30) bg = 'bg-amber-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-data text-xs font-medium ${coverageColor(days)} w-12 text-right`}>
        {typeof days === 'number' && Number.isFinite(days) ? days.toFixed(1) : '—'}d
      </span>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AE', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Card({ title, accent, children }: { title: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className={`px-4 py-3 border-b border-zinc-200 border-l-4 ${accent} bg-zinc-50`}>
        <div className="text-sm font-semibold text-zinc-800">{title}</div>
      </div>
      {children}
    </div>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-100 rounded ${className ?? 'h-4 w-full'}`} />
}

export default function SKUDetail({ sku }: { sku: string }) {
  const [data, setData] = useState<SKUDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getSKU(sku).then(res => {
      const resAny = res as unknown as { error?: string }
      if (resAny.error) setError(resAny.error)
      else setData(res as unknown as SKUDetailResponse)
      setLoading(false)
    })
  }, [sku])

  return (
    <div className="w-full space-y-5 px-4 sm:px-6 lg:px-8 max-w-[1920px] mx-auto py-6">
      {/* Back + Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/skus')}
            className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {loading ? (
            <Skeleton className="h-6 w-64" />
          ) : data ? (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">{data.name}</h1>
              <span className="font-data text-xs font-bold text-muted bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">{data.sku}</span>
              {data.category && (
                <span className="text-[10px] font-black text-white bg-sidebar px-2 py-0.5 rounded uppercase tracking-widest">
                  Cat {data.category}
                </span>
              )}
              <ActionFlagBadge flag={data.action_flag as ActionFlag} />
            </div>
          ) : null}
        </div>
        {data && (
          <button
            onClick={() => navigate('/po/new')}
            className="w-full sm:w-auto px-6 py-2 text-xs font-black bg-brand-amber text-sidebar rounded-lg hover:shadow-lg transition-all uppercase tracking-widest"
          >
            Create PO
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Failed to load SKU: {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data ? (
        <>
          {/* ── DEMAND METRICS ── */}
          <Card title="Demand Metrics" accent="border-l-amber-500">
            {data.demand ? (
              <div className="grid grid-cols-3 divide-x divide-zinc-100">
                {[
                  { label: '7-day avg', value: data.demand.sv_7, note: 'units/day' },
                  { label: '90-day avg', value: data.demand.sv_90, note: 'units/day' },
                  { label: 'Blended SV', value: data.demand.blended_sv, note: 'units/day', accent: true },
                ].map(({ label, value, note, accent }) => {
                  const trend = label === '7-day avg' ? getTrend(data.demand.sv_7, data.demand.sv_90) : null
                  return (
                    <div key={label} className="px-5 py-4">
                      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{label}</div>
                      <div className={`text-3xl font-bold font-data tabular-nums ${accent ? 'text-blue-600' : 'text-zinc-900'}`}>
                        {typeof value === 'number' ? value.toFixed(1) : '—'}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-400">{note}</span>
                        {trend && (
                          <span className={`text-xs font-medium ${trend.color}`}>
                            {trend.icon} {trend.label}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-5 py-4 text-sm text-zinc-400">No demand data — run sync to compute metrics</div>
            )}
          </Card>

          {/* ── SUPPLY BY NODE ── */}
          <Card title="Supply by Node" accent="border-l-blue-500">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 w-28" />
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-zinc-700 uppercase tracking-wider">Amazon FBA</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-zinc-700 uppercase tracking-wider">Noon FBN</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-zinc-700 uppercase tracking-wider">Locad WH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 uppercase tracking-wider">Available</td>
                    <td className="px-4 py-2.5 text-center font-data font-semibold text-zinc-900">{data.supply.amazon_fba.available}</td>
                    <td className="px-4 py-2.5 text-center font-data font-semibold text-zinc-900">{data.supply.noon_fbn.available}</td>
                    <td className="px-4 py-2.5 text-center font-data font-semibold text-zinc-900">{data.supply.locad_warehouse.available}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 uppercase tracking-wider">Inbound</td>
                    <td className="px-4 py-2.5 text-center font-data text-zinc-700">{data.supply.amazon_fba.inbound}</td>
                    <td className="px-4 py-2.5 text-center font-data text-zinc-700">{data.supply.noon_fbn.inbound}</td>
                    <td className="px-4 py-2.5 text-center font-data text-zinc-700">{data.supply.locad_warehouse.inbound}</td>
                  </tr>
                  {'reserved' in data.supply.amazon_fba && (
                    <tr>
                      <td className="px-4 py-2.5 text-xs text-zinc-500 uppercase tracking-wider">Reserved</td>
                      <td className="px-4 py-2.5 text-center font-data text-zinc-500">{data.supply.amazon_fba.reserved}</td>
                      <td className="px-4 py-2.5 text-center text-zinc-300">—</td>
                      <td className="px-4 py-2.5 text-center text-zinc-300">—</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 uppercase tracking-wider">Coverage</td>
                    {[data.supply.amazon_fba.coverage_days, data.supply.noon_fbn.coverage_days, data.supply.locad_warehouse.coverage_days].map((days, i) => (
                      <td key={i} className="px-4 py-3">
                        <CoverageBar days={days} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-4 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center gap-8 flex-wrap">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Coverage</div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold font-data ${coverageColor(data.total_coverage_days)}`}>
                    {typeof data.total_coverage_days === 'number' ? data.total_coverage_days.toFixed(1) : '—'}d
                  </span>
                  <div className="w-32">
                    <CoverageBar days={data.total_coverage_days} />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Projected (incl. POs)</div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold font-data ${coverageColor(data.projected_coverage_days)}`}>
                    {typeof data.projected_coverage_days === 'number' ? data.projected_coverage_days.toFixed(1) : '—'}d
                  </span>
                  <div className="w-32">
                    <CoverageBar days={data.projected_coverage_days} />
                  </div>
                </div>
              </div>
              <div className="ml-auto text-xs text-zinc-500 font-data space-x-3">
                <span>MOQ: <span className="text-zinc-700">{data.moq ?? '—'}</span></span>
                <span>Lead: <span className="text-zinc-700">{data.lead_time_days ?? '—'}d</span></span>
                <span>Units/box: <span className="text-zinc-700">{data.units_per_box}</span></span>
              </div>
            </div>
          </Card>

          {/* ── INCOMING POs ── */}
          <Card title={`Incoming POs (${data.pending_pos.length})`} accent="border-l-green-500">
            {data.pending_pos.length === 0 ? (
              <div className="px-4 py-4 text-sm text-zinc-400">No incoming purchase orders</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">PO #</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-500">Units</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">ETA</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.pending_pos.map(po => (
                    <tr key={po.po_number} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-2.5 font-data text-xs text-zinc-500">{po.po_number}</td>
                      <td className="px-4 py-2.5 text-right font-data font-semibold text-zinc-900">{po.units_incoming}</td>
                      <td className="px-4 py-2.5 font-data text-xs text-zinc-500">{formatDate(po.eta)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={po.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── RECOMMENDED ACTION ── */}
          {(() => {
            const flagColors: Record<string, { border: string; bg: string; text: string }> = {
              CRITICAL_OOS_RISK: { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-900' },
              OOS_RISK: { border: 'border-orange-300', bg: 'bg-orange-50', text: 'text-orange-900' },
              SHIP_NOW: { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-900' },
              REORDER: { border: 'border-blue-300', bg: 'bg-blue-50', text: 'text-blue-900' },
              EXCESS: { border: 'border-zinc-300', bg: 'bg-zinc-50', text: 'text-zinc-700' },
              OK: { border: 'border-green-300', bg: 'bg-green-50', text: 'text-green-900' },
            }
            const { border, bg, text } = flagColors[data.action_flag] ?? flagColors.OK

            return (
              <div className={`border ${border} ${bg} rounded-lg overflow-hidden`}>
                <div className={`px-4 py-3 border-b ${border} flex items-center gap-3`}>
                  <span className="text-sm font-semibold text-zinc-700">Recommended Action</span>
                  <ActionFlagBadge flag={data.action_flag as ActionFlag} />
                </div>
                <div className="px-4 py-4">
                  <p className={`text-sm leading-relaxed ${text}`}>{getActionDescription(data)}</p>
                  {(['SHIP_NOW', 'REORDER', 'CRITICAL_OOS_RISK', 'OOS_RISK'] as ActionFlag[]).includes(data.action_flag) && (
                    <div className="mt-4">
                      <button
                        onClick={() => navigate('/po')}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-4 py-2 transition-colors"
                      >
                        Go to PO Register →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </>
      ) : null}
    </div>
  )
}
