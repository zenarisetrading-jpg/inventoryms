import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
  ComposedChart, Area
} from 'recharts'
import { api } from '../lib/api'
import type { AnalyticsResponse } from '../types'
import { Activity, TrendingUp, DollarSign, Package, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Design System
// ---------------------------------------------------------------------------
const COLORS = {
  primary: '#3b82f6', // Blue
  secondary: '#10b981', // Emerald
  accent: '#f59e0b', // Amber
  danger: '#ef4444', // Red
  purple: '#8b5cf6',
  slate: '#64748b',
  light: '#f8fafc',
  border: '#e2e8f0'
}

const CHANNEL_COLORS: Record<string, string> = {
  amazon: '#f59e0b',
  noon: '#3b82f6',
  noon_minutes: '#8b5cf6',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n: any) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}

const aed = (n: any) => `AED ${Number(n || 0).toLocaleString()}`

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function KpiCard({ title, value, subtext, icon: Icon, trend }: { 
  title: string; 
  value: string | number; 
  subtext?: string; 
  icon: any;
  trend?: { val: string; isUp: boolean }
}) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1 font-data">{value}</h3>
          {(subtext || trend) && (
            <div className="flex items-center gap-2 mt-2">
              {trend && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${trend.isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {trend.isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {trend.val}
                </span>
              )}
              {subtext && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{subtext}</p>}
            </div>
          )}
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <Icon className="w-5 h-5 text-slate-400" />
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">{title}</h2>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{subtitle}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function PerformanceInsightsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<7 | 30 | 90>(30)

  useEffect(() => {
    setLoading(true)
    api.getAnalytics(days).then(res => {
      setData(res)
      setLoading(false)
    })
  }, [days])

  const totals = useMemo(() => {
    if (!data) return null
    // Use abc_performance for more reliable total revenue if available
    const revenue = data.abc_performance.length > 0 
      ? data.abc_performance.reduce((sum, r) => sum + r.revenue_aed, 0)
      : data.top_skus.reduce((sum, s) => sum + s.revenue_aed, 0)
      
    const units = data.top_skus.reduce((sum, s) => sum + s.units_sold, 0)
    const inventory = data.inventory_value.total_aed
    const reorder = data.reorder_cash.reduce((sum, s) => sum + s.cost_aed, 0)
    return { revenue, units, inventory, reorder }
  }, [data])

  // Logic to pad missing dates with zeros to ensure full 7/30/90 day view
  const paddedSalesTrend = useMemo(() => {
    if (!data) return []
    const results = []
    const now = new Date()
    
    // Create map of existing data keyed by pure YYYY-MM-DD
    const existing = new Map(data.sales_trend.map(r => [r.date.split('T')[0], r]))

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      
      // Force YYYY-MM-DD in browser local time
      const dateStr = d.toLocaleDateString('en-CA') 
      
      if (existing.has(dateStr)) {
        results.push(existing.get(dateStr))
      } else {
        results.push({ date: dateStr, amazon: 0, noon: 0, noon_minutes: 0 })
      }
    }
    return results
  }, [data, days])

  // 7-day rolling average Logic (now using padded data)
  const salesTrendWithMA = useMemo(() => {
    if (paddedSalesTrend.length === 0) return []
    return paddedSalesTrend.map((row: any, i: number, arr: any[]) => {
      const window = arr.slice(Math.max(0, i - 6), i + 1)
      const total = window.reduce((s, r) => s + r.amazon + r.noon + r.noon_minutes, 0)
      return { ...row, ma7: Math.round(total / window.length) }
    })
  }, [paddedSalesTrend])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Performance Insights</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Strategic Intelligence & Commercial Analytics</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                days === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {d}D View
            </button>
          ))}
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Mix Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <SectionHeader title="Sales Velocity Trend" subtitle="Daily units dispatched with 7d running average" />
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrendWithMA}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" hide />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="amazon" name="Amazon" stroke={CHANNEL_COLORS.amazon} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="noon" name="Noon FBN" stroke={CHANNEL_COLORS.noon} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="noon_minutes" name="Noon Minutes" stroke={CHANNEL_COLORS.noon_minutes} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="ma7" name="7d avg (all)" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 mt-6 justify-center">
              {Object.entries(CHANNEL_COLORS).map(([name, color]) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{name.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <SectionHeader title="Commercial Velocity Heatmap" subtitle="Top performing categories by marketplace share" />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="text-right pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amazon</th>
                    <th className="text-right pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Noon</th>
                    <th className="text-right pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.category_performance.map(cat => {
                    const total = cat.amazon + cat.noon + cat.noon_minutes
                    return (
                      <tr key={cat.category} className="group hover:bg-slate-50 transition-colors">
                        <td className="py-2.5">
                          <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{cat.category}</p>
                          <div className="w-32 h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (total / (totals?.units || 1)) * 500)}%` }} />
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <p className="text-xs font-bold text-slate-600 font-data">{fmt(cat.amazon)}</p>
                          <p className="text-[10px] text-slate-400 font-bold font-data">{Math.round((cat.amazon / (total || 1)) * 100)}% MIX</p>
                        </td>
                        <td className="py-2.5 text-right">
                          <p className="text-xs font-bold text-slate-600 font-data">{fmt(cat.noon + cat.noon_minutes)}</p>
                          <p className="text-[10px] text-slate-400 font-bold font-data">{Math.round(((cat.noon + cat.noon_minutes) / (total || 1)) * 100)}% MIX</p>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded">
                            N/A
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Side Panels */}
        <div className="space-y-8">
          {/* Inventory Valuation */}
          <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl shadow-slate-200">
            <SectionHeader title="Capital Allocation" subtitle="Inventory valuation by fulfillment node" />
            <div className="h-[200px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.inventory_value.by_node}
                    dataKey="value_aed"
                    nameKey="node"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                  >
                    {data.inventory_value.by_node.map((entry, index) => (
                      <Cell key={index} fill={Object.values(CHANNEL_COLORS)[index % 3]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', color: '#000' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4 mt-6">
              {data.inventory_value.by_node.map((n, i) => (
                <div key={n.node} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: Object.values(CHANNEL_COLORS)[i % 3] }} />
                    <span className="font-bold text-slate-400 uppercase tracking-widest">{n.node.replace('_', ' ')}</span>
                  </div>
                  <span className="font-black font-data tracking-tight">{aed(n.value_aed)}</span>
                </div>
              ))}
              <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Value</span>
                <span className="text-lg font-black font-data text-amber-400">{aed(data.inventory_value.total_aed)}</span>
              </div>
            </div>
          </div>

          {/* Ranking / Velocity */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <SectionHeader title="SKU Rank Evolution" subtitle="Top 5 products by revenue contribution" />
            <div className="space-y-6 mt-6">
              {data.top_skus.slice(0, 5).map((sku, i) => (
                <div key={sku.sku} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black
                    ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-900 truncate uppercase tracking-tight">{sku.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase font-data">{sku.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-900 font-data">{aed(sku.revenue_aed)}</p>
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">{fmt(sku.units_sold)} units</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-8 py-3 rounded-xl bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:bg-slate-100 transition-colors">
              View All Rankings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
