import { useEffect, useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
import { api } from '../lib/api'
import type { AnalyticsResponse, CoverageNodeHealth } from '../types'

// ---------------------------------------------------------------------------
// Colour palette (consistent across all charts)
// ---------------------------------------------------------------------------
const C = {
  amazon: '#f59e0b',       // amber-500
  noon: '#3b82f6',         // blue-500
  noon_minutes: '#8b5cf6', // purple-500
  critical: '#ef4444',     // red-500
  warning: '#f97316',      // orange-500
  healthy: '#22c55e',      // green-500
  muted: '#d1d5db',        // zinc-300
}

const FLAG_COLORS: Record<string, string> = {
  CRITICAL_OOS_RISK: '#ef4444',
  OOS_RISK: '#f97316',
  SHIP_NOW: '#f59e0b',
  REORDER: '#3b82f6',
  TRANSFER: '#8b5cf6',
  EXCESS: '#6366f1',
  OK: '#22c55e',
}

const NODE_COLORS: Record<string, string> = {
  amazon_fba: '#f59e0b',
  noon_fbn: '#3b82f6',
  locad_warehouse: '#10b981',
}

const NODE_LABELS: Record<string, string> = {
  amazon_fba: 'Amazon FBA',
  noon_fbn: 'Noon FBN',
  locad_warehouse: 'Locad Warehouse',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: any) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function aed(n: any) {
  const v = Number(n || 0)
  return `AED ${v.toLocaleString()}`
}

function coverageColor(days: number | null): string {
  if (days === null) return 'bg-zinc-100 text-zinc-400'
  if (days < 14) return 'bg-red-50 text-red-700'
  if (days < 30) return 'bg-amber-50 text-amber-700'
  return 'bg-green-50 text-green-700'
}

function coverageDotColor(days: number | null): string {
  if (days === null) return '#d1d5db'
  if (days < 14) return '#ef4444'
  if (days < 30) return '#f97316'
  return '#22c55e'
}

function shortDate(d: string) {
  if (!d) return ''
  // YYYY-MM-DD → MMM DD
  const [, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m) - 1]} ${parseInt(day)}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-zinc-200 rounded-lg ${className}`}>
      {title && (
        <div className="px-4 pt-4 pb-2 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-100 rounded ${className}`} />
}

// Coverage gauge — simple stat block with distribution bar
function CoverageGauge({ label, data }: {
  label: string
  data: CoverageNodeHealth
}) {
  const tracked = data.critical + data.warning + data.healthy
  const total = tracked + data.no_data
  const critPct = total > 0 ? (data.critical / total) * 100 : 0
  const warnPct = total > 0 ? (data.warning / total) * 100 : 0
  const healthPct = total > 0 ? (data.healthy / total) * 100 : 0
  const noPct = total > 0 ? (data.no_data / total) * 100 : 0

  const hasData = data.median_days > 0
  const medColor = !hasData ? 'text-zinc-400' : data.median_days < 14 ? 'text-red-600' : data.median_days < 30 ? 'text-amber-600' : 'text-green-600'

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-bold font-data ${medColor}`}>
        {hasData ? data.median_days : '–'}
        <span className="text-sm font-normal text-zinc-400 ml-1">{hasData ? 'days median' : 'no data'}</span>
      </div>
      {/* Distribution bar */}
      <div className="h-2 rounded-full overflow-hidden flex bg-zinc-100">
        <div style={{ width: `${critPct}%`, background: C.critical }} />
        <div style={{ width: `${warnPct}%`, background: C.warning }} />
        <div style={{ width: `${healthPct}%`, background: C.healthy }} />
        <div style={{ width: `${noPct}%`, background: C.muted }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
        {data.critical > 0 && <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: C.critical }} />{data.critical} critical</span>}
        {data.warning > 0 && <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: C.warning }} />{data.warning} warning</span>}
        {data.healthy > 0 && <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: C.healthy }} />{data.healthy} healthy</span>}
        {data.no_data > 0 && <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: C.muted }} />{data.no_data} no data</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getAnalytics(days).then(res => {
      if ('error' in res && res.error) {
        setError(String((res as { error: string }).error))
      } else {
        setData(res)
      }
      setLoading(false)
    })
  }, [days])

  // 7-day rolling average for sales trend
  const salesTrendWithMA = useMemo(() => {
    if (!data) return []
    return data.sales_trend.map((row, i, arr) => {
      const window = arr.slice(Math.max(0, i - 6), i + 1)
      const total = window.reduce((s, r) => s + r.amazon + r.noon + r.noon_minutes, 0)
      return { ...row, ma7: Math.round(total / window.length) }
    })
  }, [data])

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 max-w-[1920px] mx-auto">
      {/* Header + range picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">Analytics</h1>
          <p className="text-xs font-bold text-muted uppercase tracking-wider opacity-60 mt-1">Velocity, health, and exposure</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 shrink-0 overflow-x-auto custom-scrollbar">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-1.5 rounded-lg text-[10px] lg:text-xs font-black transition-all uppercase tracking-widest whitespace-nowrap ${
                days === d ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* ── Row 1: Sales Velocity Trend ── */}
      <Card title="Sales Velocity Trend">
        {loading ? <Skeleton className="h-56 w-full" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={salesTrendWithMA} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(salesTrendWithMA.length / 6)}
              />
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: '1px solid #e4e4e7', borderRadius: 6 }}
                labelFormatter={(d) => shortDate(String(d ?? ''))}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line type="monotone" dataKey="amazon" name="Amazon" stroke={C.amazon} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="noon" name="Noon FBN" stroke={C.noon} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="noon_minutes" name="Noon Minutes" stroke={C.noon_minutes} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="ma7" name="7d avg (all)" stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Row 2: Coverage Gauges + Channel Mix ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card title="Coverage Health" className="lg:col-span-3">
          {loading ? <Skeleton className="h-28 w-full" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-6">
                <CoverageGauge label="Amazon FBA" data={data!.coverage_health.amazon_fba} />
                <CoverageGauge label="Noon FBN" data={data!.coverage_health.noon_fbn} />
                <CoverageGauge label="Warehouse" data={data!.coverage_health.locad_warehouse} />
              </div>
              {(data!.no_data_skus ?? []).length > 0 && (
                <details className="border border-zinc-100 rounded-lg">
                  <summary className="px-3 py-2 text-xs text-zinc-500 cursor-pointer hover:bg-zinc-50 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-zinc-300" />
                    {data!.no_data_skus.length} SKUs have no coverage data (no inventory synced for any node)
                  </summary>
                  <div className="px-3 pb-3 pt-1 grid grid-cols-1 gap-0.5 max-h-48 overflow-y-auto">
                    {data!.no_data_skus.map(s => (
                      <div key={s.sku} className="flex items-center gap-3 text-xs py-0.5">
                        <span className="font-data text-zinc-500 w-32 shrink-0">{s.sku}</span>
                        <span className="text-zinc-700 flex-1 truncate">{s.name}</span>
                        {s.asin && <span className="font-data text-zinc-400 text-[10px]">{s.asin}</span>}
                        {!s.asin && <span className="text-red-400 text-[10px]">no ASIN</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </Card>

        <Card title="Channel Mix" className="lg:col-span-2">
          {loading ? <Skeleton className="h-28 w-full" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data!.channel_mix} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} interval={Math.floor((data!.channel_mix.length || 1) / 4)} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} width={28} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid #e4e4e7', borderRadius: 6 }} labelFormatter={(d) => shortDate(String(d ?? ''))} formatter={(v) => `${v ?? 0}%`} />
                <Area type="monotone" dataKey="amazon_pct" name="Amazon" stackId="1" stroke={C.amazon} fill={C.amazon} fillOpacity={0.15} />
                <Area type="monotone" dataKey="noon_pct" name="Noon FBN" stackId="2" stroke={C.noon} fill={C.noon} fillOpacity={0.15} />
                <Area type="monotone" dataKey="noon_minutes_pct" name="Noon Min" stackId="3" stroke={C.noon_minutes} fill={C.noon_minutes} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Row 3: SKU Coverage Heatmap ── */}
      <Card title="SKU Coverage Heatmap (top 80 by velocity)">
        {loading ? <Skeleton className="h-48 w-full" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-400 font-medium border-b border-zinc-100">
                  <th className="text-left py-1.5 pr-3 font-medium w-32">SKU</th>
                  <th className="text-left py-1.5 pr-3 font-medium w-40">Name</th>
                  <th className="text-left py-1.5 pr-2 font-medium">Flag</th>
                  <th className="text-center py-1.5 px-2 font-medium">Amazon FBA</th>
                  <th className="text-center py-1.5 px-2 font-medium">Noon FBN</th>
                  <th className="text-center py-1.5 px-2 font-medium">Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {(data!.sku_coverage).map(row => (
                  <tr key={row.sku} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="py-1 pr-3 font-data text-zinc-600 truncate max-w-[7rem]">{row.sku}</td>
                    <td className="py-1 pr-3 text-zinc-700 truncate max-w-[10rem]">{row.name}</td>
                    <td className="py-1 pr-2">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded-full text-white text-[10px] font-medium"
                        style={{ background: FLAG_COLORS[row.action_flag] ?? '#94a3b8' }}
                      >
                        {row.action_flag?.replace('_', ' ')}
                      </span>
                    </td>
                    {(['amazon_fba', 'noon_fbn', 'locad_warehouse'] as const).map(node => {
                      const val = row[node]
                      return (
                        <td key={node} className="py-1 px-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-data font-medium ${coverageColor(val)}`}
                          >
                            {val !== null ? `${val}d` : '–'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {data!.sku_coverage.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-6">No coverage data yet — sync Amazon data first</p>
            )}
          </div>
        )}
      </Card>

      {/* ── Row 4: Top 20 SKUs + Category Performance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Top 20 SKUs by Revenue (last ${days}d)`}>
          {loading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data!.top_skus.slice(0, 20)}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={fmt} />
                <YAxis
                  type="category"
                  dataKey="sku"
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, border: '1px solid #e4e4e7', borderRadius: 6 }}
                  formatter={(v, name) => [name === 'revenue_aed' ? aed(Number(v ?? 0)) : fmt(Number(v ?? 0)), name === 'revenue_aed' ? 'Revenue' : 'Units']}
                />
                <Bar dataKey="revenue_aed" name="Revenue (AED)" fill={C.amazon} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title={`Category Performance (last ${days}d)`}>
          {loading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data!.category_performance.slice(0, 12)}
                margin={{ top: 0, right: 8, bottom: 32, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid #e4e4e7', borderRadius: 6 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="amazon" name="Amazon" fill={C.amazon} radius={[2, 2, 0, 0]} />
                <Bar dataKey="noon" name="Noon FBN" fill={C.noon} radius={[2, 2, 0, 0]} />
                <Bar dataKey="noon_minutes" name="Noon Min" fill={C.noon_minutes} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Row 4.5: Category & Sub-Category Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subcategory Sales */}
        <Card title={`Sub-Category Sales (last ${days}d)`}>
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 font-medium border-b border-zinc-100">
                    <th className="text-left py-1.5 pr-2">Sub-Category</th>
                    <th className="text-right py-1.5 px-2">Amazon</th>
                    <th className="text-right py-1.5 px-2">Noon</th>
                    <th className="text-right py-1.5 px-2">Total</th>
                    <th className="text-right py-1.5 pl-2">Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const grandTotal = (data!.subcategory_sales ?? []).reduce((s, r) => s + r.total, 0)
                    return (data!.subcategory_sales ?? []).map(row => (
                      <tr key={row.sub_category} className="border-b border-zinc-50 hover:bg-zinc-50">
                        <td className="py-1.5 pr-2 text-zinc-700 font-medium">{row.sub_category}</td>
                        <td className="py-1.5 px-2 text-right font-data text-amber-600">{fmt(row.amazon)}</td>
                        <td className="py-1.5 px-2 text-right font-data text-blue-600">{fmt(row.noon + (row.noon_minutes ?? 0))}</td>
                        <td className="py-1.5 px-2 text-right font-data font-semibold text-zinc-800">{fmt(row.total)}</td>
                        <td className="py-1.5 pl-2 text-right">
                          <div className="inline-flex items-center gap-0.5">
                            <div className="h-2 rounded-l" style={{ width: `${grandTotal > 0 ? Math.round((row.total / grandTotal) * 60) : 0}px`, minWidth: 2, background: C.amazon }} />
                            <span className="text-zinc-400 text-[10px]">{grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
              {(data!.subcategory_sales ?? []).length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">No sales data in range</p>
              )}
            </div>
          )}
        </Card>

        {/* Subcategory Inventory Value */}
        <Card title="Sub-Category Inventory Value">
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 font-medium border-b border-zinc-100">
                    <th className="text-left py-1.5 pr-2">Sub-Category</th>
                    <th className="text-right py-1.5 px-2">Amazon</th>
                    <th className="text-right py-1.5 px-2">Noon</th>
                    <th className="text-right py-1.5 px-2">Warehouse</th>
                    <th className="text-right py-1.5 pl-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(data!.subcategory_inventory ?? []).map(row => (
                    <tr key={row.sub_category} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="py-1.5 pr-2 text-zinc-700 font-medium">{row.sub_category}</td>
                      <td className="py-1.5 px-2 text-right font-data text-amber-600">{aed(row.amazon_aed)}</td>
                      <td className="py-1.5 px-2 text-right font-data text-blue-600">{aed(row.noon_aed)}</td>
                      <td className="py-1.5 px-2 text-right font-data text-emerald-600">{aed(row.warehouse_aed)}</td>
                      <td className="py-1.5 pl-2 text-right font-data font-semibold text-zinc-800">{aed(row.total_aed)}</td>
                    </tr>
                  ))}
                </tbody>
                {(data!.subcategory_inventory ?? []).length > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-200">
                      <td className="py-1.5 pr-2 text-zinc-500 font-medium">Total</td>
                      <td className="py-1.5 px-2 text-right font-data font-semibold text-zinc-700">{aed((data!.subcategory_inventory ?? []).reduce((s, r) => s + r.amazon_aed, 0))}</td>
                      <td className="py-1.5 px-2 text-right font-data font-semibold text-zinc-700">{aed((data!.subcategory_inventory ?? []).reduce((s, r) => s + r.noon_aed, 0))}</td>
                      <td className="py-1.5 px-2 text-right font-data font-semibold text-zinc-700">{aed((data!.subcategory_inventory ?? []).reduce((s, r) => s + r.warehouse_aed, 0))}</td>
                      <td className="py-1.5 pl-2 text-right font-data font-semibold text-zinc-900">{aed(data!.inventory_value.total_aed)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {(data!.subcategory_inventory ?? []).length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">No inventory data yet</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 4.75: ABC Category Performance ── */}
      <Card title="ABC Category Performance">
        {loading ? <Skeleton className="h-24 w-full" /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* ABC inventory tiles */}
            {(data!.abc_inventory ?? []).map(row => {
              const labelColor: Record<string, string> = { A: 'bg-amber-100 text-amber-700', B: 'bg-blue-100 text-blue-700', C: 'bg-zinc-100 text-zinc-600', Unclassified: 'bg-zinc-50 text-zinc-400' }
              const color = labelColor[row.category] ?? labelColor.Unclassified
              return (
                <div key={row.category} className="border border-zinc-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
                      {row.category === 'Unclassified' ? 'N/A' : `Cat ${row.category}`}
                    </span>
                    <span className="text-xs font-data font-semibold text-zinc-800">{aed(row.total_aed)}</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-zinc-500">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Amazon</span>
                      <span className="font-data">{aed(row.amazon_aed)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Noon</span>
                      <span className="font-data">{aed(row.noon_aed)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Warehouse</span>
                      <span className="font-data">{aed(row.warehouse_aed)}</span>
                    </div>
                  </div>
                  {/* Sales performance for this category */}
                  {(data!.abc_performance ?? []).find(p => p.category === row.category) && (() => {
                    const perf = (data!.abc_performance ?? []).find(p => p.category === row.category)!
                    return (
                      <div className="pt-1 border-t border-zinc-100 text-[11px] text-zinc-500 space-y-0.5">
                        <div className="flex justify-between">
                          <span>Sales ({days}d)</span>
                          <span className="font-data">{fmt(perf.units_sold)} units</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Revenue</span>
                          <span className="font-data">{aed(perf.revenue_aed)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SKUs</span>
                          <span className="font-data">{perf.sku_count}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
            {(data!.abc_inventory ?? []).length === 0 && (
              <p className="text-xs text-zinc-400 col-span-4 text-center py-4">No data — set ABC categories in SKU Catalog first</p>
            )}
          </div>
        )}
      </Card>

      {/* ── Row 5: PO Pipeline Timeline ── */}
      <Card title="PO Pipeline">
        {loading ? <Skeleton className="h-32 w-full" /> : (
          <>
            {data!.po_pipeline.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">No open POs</p>
            ) : (
              <div className="space-y-1">
                {/* Gantt-style bars */}
                {(() => {
                  const dates = data!.po_pipeline.map(p => p.eta).filter(Boolean).sort()
                  if (dates.length === 0) return null
                  const minDate = new Date(data!.po_pipeline.map(p => p.order_date).filter(Boolean).sort()[0] ?? dates[0])
                  const maxDate = new Date(dates[dates.length - 1])
                  const rangeMs = maxDate.getTime() - minDate.getTime() || 1

                  const statusColors: Record<string, string> = {
                    draft: '#94a3b8',
                    ordered: '#3b82f6',
                    shipped: '#f59e0b',
                    arrived: '#22c55e',
                    closed: '#d1d5db',
                    cancelled: '#ef4444',
                  }

                  return (
                    <div className="space-y-2 pt-1">
                      {data!.po_pipeline.map(po => {
                        const start = po.order_date ? new Date(po.order_date) : minDate
                        const end = po.eta ? new Date(po.eta) : start
                        const leftPct = ((start.getTime() - minDate.getTime()) / rangeMs) * 100
                        const widthPct = Math.max(1, ((end.getTime() - start.getTime()) / rangeMs) * 100)
                        const color = statusColors[po.status] ?? '#94a3b8'
                        return (
                          <div key={po.po_number} className="flex items-center gap-2 text-xs">
                            <span className="font-data text-zinc-500 w-24 shrink-0 truncate">{po.po_number}</span>
                            <div className="flex-1 h-5 relative bg-zinc-100 rounded">
                              <div
                                className="absolute h-full rounded flex items-center px-1.5 overflow-hidden"
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  background: color,
                                }}
                                title={`${po.supplier} — ETA ${po.eta} — ${po.total_units} units`}
                              >
                                <span className="text-white text-[10px] truncate font-medium">{po.total_units}u</span>
                              </div>
                            </div>
                            <span className="text-zinc-400 w-16 text-right shrink-0">{shortDate(po.eta)}</span>
                          </div>
                        )
                      })}
                      {/* Legend */}
                      <div className="flex gap-3 pt-1 flex-wrap">
                        {Object.entries(statusColors).map(([s, c]) => (
                          <span key={s} className="text-[10px] text-zinc-400 flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded" style={{ background: c }} />
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Row 6: Inventory Value + Reorder Cash ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inventory value donut */}
        <Card title="Inventory Value by Node">
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-zinc-400">Total: <span className="font-semibold text-zinc-700 font-data">{aed(data!.inventory_value.total_aed)}</span></div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={data!.inventory_value.by_node}
                    dataKey="value_aed"
                    nameKey="node"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {data!.inventory_value.by_node.map((entry) => (
                      <Cell key={entry.node} fill={NODE_COLORS[entry.node] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 11, border: '1px solid #e4e4e7', borderRadius: 6 }}
                    formatter={(v, name) => [aed(Number(v ?? 0)), NODE_LABELS[String(name)] ?? String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1 w-full">
                {data!.inventory_value.by_node.map(n => (
                  <div key={n.node} className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5 text-zinc-500">
                      <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[n.node] ?? '#94a3b8' }} />
                      {NODE_LABELS[n.node] ?? n.node}
                    </span>
                    <span className="font-data text-zinc-700">{aed(n.value_aed)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Flag distribution */}
        <Card title="SKU Flag Distribution">
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="space-y-2 pt-1">
              {data!.flag_distribution
                .sort((a, b) => {
                  const ord: Record<string, number> = { CRITICAL_OOS_RISK: 0, OOS_RISK: 1, SHIP_NOW: 2, REORDER: 3, TRANSFER: 4, EXCESS: 5, OK: 6 }
                  return (ord[a.flag] ?? 9) - (ord[b.flag] ?? 9)
                })
                .map(({ flag, count }) => {
                  const total = data!.flag_distribution.reduce((s, r) => s + r.count, 0)
                  const pct = total > 0 ? (count / total) * 100 : 0
                  return (
                    <div key={flag} className="flex items-center gap-2 text-xs">
                      <span
                        className="shrink-0 inline-block px-2 py-0.5 rounded-full text-white font-medium text-[10px] w-36 text-center truncate"
                        style={{ background: FLAG_COLORS[flag] ?? '#94a3b8' }}
                      >
                        {flag.replace('_', ' ')}
                      </span>
                      <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: FLAG_COLORS[flag] ?? '#94a3b8' }}
                        />
                      </div>
                      <span className="font-data text-zinc-600 w-6 text-right">{count}</span>
                    </div>
                  )
                })}
            </div>
          )}
        </Card>

        {/* Reorder cash waterfall */}
        <Card title="Reorder Cash Requirement">
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {data!.reorder_cash.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-4">No reorder-flagged SKUs</p>
              ) : (
                <>
                  {data!.reorder_cash.slice(0, 20).map(r => (
                    <div key={r.sku} className="flex items-center justify-between text-xs gap-2">
                      <span className="font-data text-zinc-500 w-24 truncate shrink-0">{r.sku}</span>
                      <span className="text-zinc-600 flex-1 truncate">{r.name}</span>
                      <span
                        className="shrink-0 inline-block w-2 h-2 rounded-full"
                        style={{ background: FLAG_COLORS[r.urgency] ?? '#94a3b8' }}
                      />
                      <span className="font-data text-zinc-700 shrink-0">{aed(r.cost_aed)}</span>
                    </div>
                  ))}
                  <div className="border-t border-zinc-100 pt-2 mt-1 flex justify-between text-xs font-semibold">
                    <span className="text-zinc-500">Total</span>
                    <span className="font-data text-zinc-900">
                      {aed(data!.reorder_cash.reduce((s, r) => s + r.cost_aed, 0))}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {data && data.generated_at && (
        <p className="text-[10px] text-zinc-300 text-right">
          Generated {new Date(data.generated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
