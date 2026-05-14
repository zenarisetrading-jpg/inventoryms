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
  if (days <= 0) return 'text-red-400'
  if (days <= 7) return 'text-red-400'
  if (days <= 14) return 'text-orange-400'
  if (days <= 30) return 'text-amber-400'
  return 'text-emerald-400'
}

function CoverageBar({ days }: { days: number }) {
  const pct = Math.min((days / 90) * 100, 100)
  let bg = 'bg-emerald-500'
  if (days <= 7) bg = 'bg-red-500'
  else if (days <= 14) bg = 'bg-orange-500'
  else if (days <= 30) bg = 'bg-amber-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-data text-xs font-black ${coverageColor(days)} w-12 text-right`}>
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
    <div className="bg-card border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
      <div className={`px-5 py-4 border-b border-white/5 border-l-[6px] ${accent} bg-white/5`}>
        <div className="text-xs font-black text-zinc-400 uppercase tracking-widest">{title}</div>
      </div>
      {children}
    </div>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-xl ${className ?? 'h-4 w-full'}`} />
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/skus')}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          {loading ? (
            <Skeleton className="h-8 w-80" />
          ) : data ? (
            <div className="flex flex-col gap-2">
              <h1 className="text-xl lg:text-3xl font-black text-white uppercase tracking-tight leading-none">{data.name}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-data text-xs font-black text-zinc-400 bg-white/5 px-3 py-1 rounded-full uppercase tracking-wider border border-white/10">{data.sku}</span>
                {data.category && (
                  <span className="text-[10px] font-black text-white bg-brand-blue px-3 py-1 rounded-full uppercase tracking-widest">
                    CAT {data.category}
                  </span>
                )}
                <ActionFlagBadge flag={data.action_flag as ActionFlag} />
              </div>
            </div>
          ) : null}
        </div>
        {data && (
          <button
            onClick={() => navigate('/po/new')}
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-black bg-brand-amber text-sidebar rounded-2xl hover:shadow-xl hover:shadow-brand-amber/20 transition-all uppercase tracking-widest active:scale-95"
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
          <Card title="Demand Metrics" accent="border-l-brand-amber">
            {data.demand ? (
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">
                {[
                  { label: '7-day avg', value: data.demand.sv_7, note: 'units/day' },
                  { label: '90-day avg', value: data.demand.sv_90, note: 'units/day' },
                  { label: 'Blended SV', value: data.demand.blended_sv, note: 'units/day', accent: true },
                ].map(({ label, value, note, accent }) => {
                  const trend = label === '7-day avg' ? getTrend(data.demand.sv_7, data.demand.sv_90) : null
                  return (
                    <div key={label} className="px-6 py-5">
                      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">{label}</div>
                      <div className={`text-4xl font-black font-data tabular-nums ${accent ? 'text-brand-blue' : 'text-white'}`}>
                        {typeof value === 'number' ? value.toFixed(1) : '—'}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold text-zinc-600 uppercase">{note}</span>
                        {trend && (
                          <span className={`text-[10px] font-black uppercase ${trend.color}`}>
                            {trend.icon} {trend.label}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-6 py-5 text-sm text-zinc-500">No demand data — run sync to compute metrics</div>
            )}
          </Card>

          {/* ── SUPPLY BY NODE ── */}
          <Card title="Supply by Node" accent="border-l-brand-blue">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 border-b border-white/5">
                  <tr>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest w-28" />
                    <th className="text-center px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Amazon FBA</th>
                    <th className="text-center px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Noon FBN</th>
                    <th className="text-center px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Locad WH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Available</td>
                    <td className="px-5 py-4 text-center font-data font-black text-white text-base">{data.supply.amazon_fba.available.toLocaleString()}</td>
                    <td className="px-5 py-4 text-center font-data font-black text-white text-base">{data.supply.noon_fbn.available.toLocaleString()}</td>
                    <td className="px-5 py-4 text-center font-data font-black text-white text-base">{data.supply.locad_warehouse.available.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Inbound</td>
                    <td className="px-5 py-4 text-center font-data font-black text-zinc-400 text-sm">{data.supply.amazon_fba.inbound.toLocaleString()}</td>
                    <td className="px-5 py-4 text-center font-data font-black text-zinc-400 text-sm">{data.supply.noon_fbn.inbound.toLocaleString()}</td>
                    <td className="px-5 py-4 text-center font-data font-black text-zinc-400 text-sm">{data.supply.locad_warehouse.inbound.toLocaleString()}</td>
                  </tr>
                  {'reserved' in data.supply.amazon_fba && (
                    <tr>
                      <td className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Reserved</td>
                      <td className="px-5 py-4 text-center font-data font-black text-zinc-500 text-sm">{data.supply.amazon_fba.reserved}</td>
                      <td className="px-5 py-4 text-center text-zinc-700">—</td>
                      <td className="px-5 py-4 text-center text-zinc-700">—</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Coverage</td>
                    {[data.supply.amazon_fba.coverage_days, data.supply.noon_fbn.coverage_days, data.supply.locad_warehouse.coverage_days].map((days, i) => (
                      <td key={i} className="px-5 py-4">
                        <CoverageBar days={days} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-6 py-5 border-t border-white/5 bg-white/5 flex items-center gap-10 flex-wrap">
              <div>
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Total Coverage</div>
                <div className="flex items-center gap-4">
                  <span className={`text-xl font-black font-data ${coverageColor(data.total_coverage_days)}`}>
                    {typeof data.total_coverage_days === 'number' ? data.total_coverage_days.toFixed(1) : '—'}d
                  </span>
                  <div className="w-32 lg:w-40">
                    <CoverageBar days={data.total_coverage_days} />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Projected (incl. POs)</div>
                <div className="flex items-center gap-4">
                  <span className={`text-xl font-black font-data ${coverageColor(data.projected_coverage_days)}`}>
                    {typeof data.projected_coverage_days === 'number' ? data.projected_coverage_days.toFixed(1) : '—'}d
                  </span>
                  <div className="w-32 lg:w-40">
                    <CoverageBar days={data.projected_coverage_days} />
                  </div>
                </div>
              </div>
              <div className="ml-auto text-[10px] font-black text-zinc-400 font-data space-x-6 uppercase tracking-widest">
                <span>MOQ: <span className="text-white ml-1">{data.moq ?? '—'}</span></span>
                <span>Lead: <span className="text-white ml-1">{data.lead_time_days ?? '—'}d</span></span>
                <span>Units/box: <span className="text-white ml-1">{data.units_per_box}</span></span>
              </div>
            </div>
          </Card>

          {/* ── INCOMING POs ── */}
          <Card title={`Incoming POs (${data.pending_pos.length})`} accent="border-l-emerald-500">
            {data.pending_pos.length === 0 ? (
              <div className="px-6 py-6 text-sm text-zinc-500 uppercase font-black tracking-widest opacity-40">No incoming purchase orders</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-white/5 border-b border-white/5">
                  <tr>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">PO #</th>
                    <th className="text-right px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Units</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">ETA</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.pending_pos.map(po => (
                    <tr key={po.po_number} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4 font-data text-xs text-zinc-400 font-black">{po.po_number}</td>
                      <td className="px-5 py-4 text-right font-data font-black text-white text-base">{po.units_incoming.toLocaleString()}</td>
                      <td className="px-5 py-4 font-data text-xs text-zinc-500">{formatDate(po.eta)}</td>
                      <td className="px-5 py-4"><StatusBadge status={po.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── RECOMMENDED ACTION ── */}
          {(() => {
            const flagColors: Record<string, { border: string; bg: string; text: string }> = {
              CRITICAL_OOS_RISK: { border: 'border-red-500/20', bg: 'bg-red-500/10', text: 'text-red-400' },
              OOS_RISK: { border: 'border-orange-500/20', bg: 'bg-orange-500/10', text: 'text-orange-400' },
              SHIP_NOW: { border: 'border-amber-500/20', bg: 'bg-amber-500/10', text: 'text-amber-400' },
              REORDER: { border: 'border-blue-500/20', bg: 'bg-blue-500/10', text: 'text-blue-400' },
              EXCESS: { border: 'border-white/10', bg: 'bg-white/5', text: 'text-zinc-400' },
              OK: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
            }
            const { border, bg, text } = flagColors[data.action_flag] ?? flagColors.OK

            return (
              <div className={`border ${border} ${bg} rounded-2xl overflow-hidden shadow-2xl`}>
                <div className={`px-6 py-4 border-b ${border} flex items-center gap-4`}>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Recommended Action</span>
                  <ActionFlagBadge flag={data.action_flag as ActionFlag} />
                </div>
                <div className="px-6 py-6">
                  <p className={`text-sm lg:text-base font-bold leading-relaxed ${text} uppercase tracking-tight`}>{getActionDescription(data)}</p>
                  {(['SHIP_NOW', 'REORDER', 'CRITICAL_OOS_RISK', 'OOS_RISK'] as ActionFlag[]).includes(data.action_flag) && (
                    <div className="mt-6">
                      <button
                        onClick={() => navigate('/po')}
                        className="text-[10px] font-black text-white bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-6 py-3 transition-all uppercase tracking-widest shadow-xl"
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
