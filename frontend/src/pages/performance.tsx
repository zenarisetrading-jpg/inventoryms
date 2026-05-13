import { useEffect, useState, useMemo, useRef } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend, AreaChart, Area
} from 'recharts'
import { TrendingUp, BarChart3, Package, Calendar, ListFilter, Search, ChevronUp, ChevronDown, Filter, X, Check, Hash, LineChart as LineIcon, ShoppingCart, HeartPulse, PieChart as PieIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Design System
// ---------------------------------------------------------------------------
const COLORS: Record<string, string> = {
  amazon: '#f59e0b',        // Amber
  noon: '#3b82f6',          // Blue
  minutes: '#8b5cf6',       // Purple
  total: '#64748b',         // Slate
}

const VAL_COLORS: Record<string, string> = {
  'AMAZON FBA': '#f59e0b',
  'NOON FBN': '#3b82f6',
  'NOON MINUTES': '#8b5cf6',
  'LOCAD WAREHOUSE': '#10b981',
}
const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  ORDERED: '#3b82f6',
  SHIPPED: '#f59e0b',
  CLOSED: '#10b981',
  CANCELLED: '#ef4444',
}

const aed = (n: any) => `AED ${Number(n || 0).toLocaleString()}`

const TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '16px',
  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
  padding: '12px 16px',
}

const ITEM_STYLE = {
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}

// ---------------------------------------------------------------------------
// Multi-Select Component
// ---------------------------------------------------------------------------
function MultiSelect({ label, options, selected, onChange }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (option: string) => {
    if (selected.includes(option)) onChange(selected.filter(item => item !== option))
    else onChange([...selected, option])
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-lg px-5 py-2.5 min-w-[200px] text-[10px] font-black text-sidebar uppercase tracking-widest hover:bg-zinc-100 transition-all shadow-sm"
      >
        <span className="truncate max-w-[140px]">{selected.length === 0 ? label : `${selected.length} SELECTED`}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-zinc-200 rounded-xl shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">{label}</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-[9px] font-black text-brand-blue hover:text-brand-blue/80 uppercase tracking-widest">Clear All</button>}
          </div>
          <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => toggleOption(opt)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${selected.includes(opt) ? 'bg-brand-blue/10 text-brand-blue' : 'text-zinc-500 hover:bg-zinc-50 hover:text-sidebar'}`}
              >
                {opt}
                {selected.includes(opt) && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PerformancePage() {
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [valuationData, setValuationData] = useState<any[]>([])
  const [subcategoryData, setSubcategoryData] = useState<any[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [coverageData, setCoverageData] = useState<any>(null)
  const [poStatusData, setPoStatusData] = useState<any[]>([])
  const [detailedSales, setDetailedSales] = useState<any[]>([])
  const [totalValuation, setTotalValuation] = useState(0)
  const [hoverValuation, setHoverValuation] = useState<string | null>(null)
  const [hoverPo, setHoverPo] = useState<string | null>(null)

  // Filters & Sorting
  const [search, setSearch] = useState('')
  const [selCategories, setSelCategories] = useState<string[]>([])
  const [selSubCategories, setSelSubCategories] = useState<string[]>([])
  const [sortField, setSortField] = useState<string>('total_units')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  async function fetchData() {
    setLoading(true)
    try {
      const { data: valResult } = await supabase.rpc('get_final_valuation')
      if (valResult) {
        setValuationData([
          { node: 'AMAZON FBA', value_aed: Math.round(valResult.fba || 0) },
          { node: 'NOON FBN', value_aed: Math.round(valResult.fbn || 0) },
          { node: 'NOON MINUTES', value_aed: Math.round(valResult.min || 0) },
          { node: 'LOCAD WAREHOUSE', value_aed: Math.round(valResult.loc || 0) }
        ])
        setTotalValuation(Math.round((valResult.fba || 0) + (valResult.fbn || 0) + (valResult.min || 0) + (valResult.loc || 0)))
      }

      const [subResult, trendResult, detailedResult, poResult, covResult] = await Promise.all([
        supabase.rpc('get_subcategory_performance', { days_count: days }),
        supabase.rpc('get_sales_velocity_trend', { days_count: days }),
        supabase.rpc('get_detailed_sales_performance', { days_count: days }),
        supabase.rpc('get_po_status_distribution'),
        supabase.rpc('get_coverage_health')
      ])

      if (subResult.data) setSubcategoryData(subResult.data)
      if (trendResult.data) setTrendData(trendResult.data)
      if (detailedResult.data) setDetailedSales(detailedResult.data)
      if (poResult.data) setPoStatusData(poResult.data)
      if (covResult.data) setCoverageData(covResult.data)

    } catch (err) { console.error('Fetch error:', err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [days])

  // Channel Mix Data Calculation
  const channelMixData = useMemo(() => {
    return trendData.map(d => {
      const total = (d.amazon || 0) + (d.noon || 0) + (d.minutes || 0)
      if (total === 0) return { ...d, amz_pct: 0, noon_pct: 0, min_pct: 0 }
      return {
        ...d,
        amz_pct: Math.round((d.amazon / total) * 100),
        noon_pct: Math.round((d.noon / total) * 100),
        min_pct: Math.round((d.minutes / total) * 100)
      }
    })
  }, [trendData])

  const categories = useMemo(() => [...new Set(detailedSales.map(s => s.category))].sort(), [detailedSales])
  const subCategories = useMemo(() => {
    let list = detailedSales
    if (selCategories.length > 0) list = list.filter(s => selCategories.includes(s.category))
    return [...new Set(list.map(s => s.sub_category))].sort()
  }, [detailedSales, selCategories])

  const filteredAndSortedSales = useMemo(() => {
    let result = [...detailedSales]
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(r => r.sku.toLowerCase().includes(s) || r.category.toLowerCase().includes(s) || r.sub_category.toLowerCase().includes(s))
    }
    if (selCategories.length > 0) result = result.filter(r => selCategories.includes(r.category))
    if (selSubCategories.length > 0) result = result.filter(r => selSubCategories.includes(r.sub_category))

    result.sort((a, b) => {
      const valA = a[sortField], valB = b[sortField]
      if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      return sortOrder === 'asc' ? valA - valB : valB - valA
    })
    return result
  }, [detailedSales, search, selCategories, selSubCategories, sortField, sortOrder])

  const toggleSort = (field: string) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortOrder('desc'); }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />
  }

  return (
    <div className="w-full space-y-8 px-4 sm:px-6 lg:px-8 max-w-[1920px] mx-auto pb-20">

      {/* Header & Global Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pt-4">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-brand-blue/10 rounded-2xl">
            <LineIcon className="w-8 h-8 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">Performance Analytics</h1>
            <p className="text-xs font-bold text-muted uppercase tracking-wider opacity-60 mt-1">Commercial Intelligence Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-200 shadow-sm">
          {([7, 30, 90] as const).map(v => (
            <button
              key={v}
              onClick={() => setDays(v)}
              className={`px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${days === v ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'text-zinc-500 hover:text-brand-blue hover:bg-zinc-50'}`}
            >
              {v}D
            </button>
          ))}
        </div>
      </div>

      {/* ROW 1: Sales Velocity Trend (FULL WIDTH) */}
      <div className="bg-white p-8 lg:p-10 rounded-2xl border border-zinc-200 shadow-sm relative overflow-hidden">
        <div className="mb-10 flex items-center justify-center gap-4 relative z-10">
          <div className="p-3 bg-indigo-50 rounded-xl shrink-0"><LineIcon className="w-6 h-6 text-indigo-600" /></div>
          <div className="text-center md:text-left">
            <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Sales Velocity Trend</h3>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Daily units per channel</p>
          </div>
        </div>
        <div className="h-[450px] relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 13, fontWeight: 900 }} />
              <ChartTooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                itemStyle={{ fontSize: '12px', fontWeight: 900 }}
                labelStyle={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}
                labelFormatter={(value) => `DATE: ${value}`}
              />
              <Legend verticalAlign="top" height={60} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }} />
              <Line type="monotone" dataKey="amazon" stroke={COLORS.amazon} strokeWidth={4} dot={false} name="AMAZON" />
              <Line type="monotone" dataKey="noon" stroke={COLORS.noon} strokeWidth={4} dot={false} name="NOON FBN" />
              <Line type="monotone" dataKey="minutes" stroke={COLORS.minutes} strokeWidth={4} dot={false} name="NOON MINUTES" />
              <Line type="monotone" dataKey="total" stroke={COLORS.total} strokeWidth={2} strokeDasharray="8 8" dot={false} name="TOTAL UNITS" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROW 2: Coverage Health & Channel Mix */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        {/* Coverage Health */}
        <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm flex flex-col">
          <div className="mb-8 flex items-center justify-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl shrink-0"><HeartPulse className="w-6 h-6 text-emerald-600" /></div>
            <div className="text-center md:text-left">
              <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Coverage Health</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Median days of stock</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
            {[
              { label: 'AMAZON FBA', val: coverageData?.amazon, color: COLORS.amazon },
              { label: 'NOON FBN', val: coverageData?.noon, color: COLORS.noon },
              { label: 'NOON MINUTES', val: coverageData?.minutes, color: COLORS.minutes },
              { label: 'LOCAD WAREHOUSE', val: coverageData?.locad, color: '#10b981' }
            ].map(node => (
              <div key={node.label} className="bg-zinc-50 p-6 rounded-xl border border-zinc-100 flex flex-col items-center text-center">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">{node.label}</span>
                <span className="text-2xl font-black text-sidebar font-data">
                  {node.val ? Math.round(node.val) : '-'}
                </span>
                <span className="text-[8px] font-bold text-zinc-500 uppercase mt-1">Days</span>
                <div className="w-full h-1 mt-4 bg-zinc-200 rounded-full overflow-hidden">
                  <div className="h-full transition-all duration-1000" style={{ width: `${Math.min(node.val || 0, 100)}%`, backgroundColor: node.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Mix Area Chart */}
        <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="mb-8 flex items-center justify-center gap-4">
            <div className="p-3 bg-orange-50 rounded-xl shrink-0"><PieIcon className="w-6 h-6 text-orange-500" /></div>
            <div className="text-center md:text-left">
              <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Channel Mix</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Daily sales share %</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={channelMixData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis unit="%" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <ChartTooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }} />
                <Area type="monotone" dataKey="amz_pct" stackId="1" stroke={COLORS.amazon} fill={COLORS.amazon} fillOpacity={0.1} name="AMAZON" />
                <Area type="monotone" dataKey="noon_pct" stackId="1" stroke={COLORS.noon} fill={COLORS.noon} fillOpacity={0.1} name="NOON" />
                <Area type="monotone" dataKey="min_pct" stackId="1" stroke={COLORS.minutes} fill={COLORS.minutes} fillOpacity={0.1} name="MINUTES" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 3: Top Sub-categories */}
      <div className="bg-white p-8 lg:p-10 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="mb-10 flex items-center justify-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl shrink-0"><BarChart3 className="w-6 h-6 text-emerald-600" /></div>
          <div className="text-center md:text-left">
            <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Sub-category Performance</h3>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Volume breakdown by type</p>
          </div>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={subcategoryData} margin={{ top: 20, right: 30, left: 20, bottom: 120 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="sub_category" 
                axisLine={false} 
                tickLine={false} 
                interval={0}
                tick={(props: any) => {
                  const { x, y, payload } = props;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text
                        x={0}
                        y={0}
                        dy={16}
                        textAnchor="start"
                        fill="#475569"
                        fontSize={9}
                        fontWeight={900}
                        transform="rotate(90)"
                      >
                        {payload.value?.toString().toUpperCase()}
                      </text>
                    </g>
                  );
                }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
              />
              <ChartTooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}
                labelFormatter={(v) => v?.toString().toUpperCase()}
              />
              <Bar dataKey="total_units" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} label={{ position: 'top', fill: '#0f172a', fontSize: 11, fontWeight: 900, offset: 10, formatter: (v: any) => v?.toLocaleString() }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROW 4: Detailed Performance Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-8 lg:p-10 border-b border-zinc-100 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-fit">
            <div className="p-3 bg-amber-50 rounded-xl"><ListFilter className="w-6 h-6 text-brand-amber" /></div>
            <div>
              <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Detailed Performance Audit</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">SKU-level channel metrics</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1 justify-end max-w-5xl">
            <div className="flex items-center gap-3">
              <MultiSelect label="CATEGORIES" options={categories} selected={selCategories} onChange={setSelCategories} />
              <MultiSelect label="SUB-CATEGORIES" options={subCategories} selected={selSubCategories} onChange={setSelSubCategories} />
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH SKUS..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-2.5 pl-11 pr-4 text-xs font-bold text-sidebar placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-amber/20 uppercase"
              />
            </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[800px] custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead className="sticky top-0 z-20 bg-zinc-50 shadow-sm">
              <tr className="border-b border-zinc-200">
                <th onClick={() => toggleSort('total_units')} className="px-6 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest w-16 cursor-pointer hover:text-brand-blue text-center">#</th>
                <th onClick={() => toggleSort('category')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">Category</th>
                <th onClick={() => toggleSort('sub_category')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">Sub-Category</th>
                <th onClick={() => toggleSort('sku')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">SKU</th>
                <th onClick={() => toggleSort('amazon_units')} className="px-8 py-5 text-[11px] font-black text-brand-amber uppercase tracking-widest cursor-pointer hover:text-sidebar text-right">Amazon</th>
                <th onClick={() => toggleSort('noon_units')} className="px-8 py-5 text-[11px] font-black text-brand-blue uppercase tracking-widest cursor-pointer hover:text-sidebar text-right">Noon</th>
                <th onClick={() => toggleSort('minutes_units')} className="px-8 py-5 text-[11px] font-black text-indigo-600 uppercase tracking-widest cursor-pointer hover:text-sidebar text-right">Minutes</th>
                <th onClick={() => toggleSort('total_units')} className="px-8 py-5 text-[11px] font-black text-sidebar uppercase tracking-widest cursor-pointer hover:text-brand-blue text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredAndSortedSales.map((row, i) => (
                <tr key={i} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-6 py-5 text-center text-[11px] font-black text-zinc-400">{i + 1}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-zinc-600 uppercase">{row.category}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-zinc-600 uppercase">{row.sub_category}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-sidebar font-data uppercase">{row.sku}</td>
                  <td className="px-8 py-5 text-right font-data text-[13px] font-black text-brand-amber">{row.amazon_units?.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right font-data text-[13px] font-black text-brand-blue">{row.noon_units?.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right font-data text-[13px] font-black text-indigo-600">{row.minutes_units?.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right font-data text-[15px] font-black text-sidebar">{row.total_units?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 5: Asset Valuation & PO Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Valuation */}
        <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm flex flex-col">
          <div className="mb-10 flex items-center justify-center gap-4">
            <div className="p-3 bg-brand-blue/10 rounded-xl shrink-0"><TrendingUp className="w-6 h-6 text-brand-blue" /></div>
            <div className="text-center md:text-left">
              <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Inventory Valuation</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Asset value per node</p>
            </div>
          </div>
          <div className="h-[350px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={valuationData}
                  dataKey="value_aed"
                  nameKey="node"
                  cx="50%"
                  cy="50%"
                  innerRadius={100}
                  outerRadius={130}
                  paddingAngle={6}
                  stroke="none"
                  onMouseEnter={(_, i) => setHoverValuation(valuationData[i].node)}
                  onMouseLeave={() => setHoverValuation(null)}
                >
                  {valuationData.map((entry, i) => <Cell key={i} fill={VAL_COLORS[entry.node] || '#e2e8f0'} />)}
                </Pie>
                <ChartTooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }} formatter={(v: any) => aed(v)} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', paddingTop: '30px', color: '#475569' }} />
              </PieChart>
            </ResponsiveContainer>
            {!hoverValuation && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
                <span className="text-[18px] font-black text-sidebar font-data tracking-tight">{aed(totalValuation)}</span>
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">Total Assets</span>
              </div>
            )}
          </div>
        </div>

        {/* PO Distribution */}
        <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm flex flex-col">
          <div className="mb-10 flex items-center justify-center gap-4">
            <div className="p-3 bg-purple-50 rounded-xl shrink-0"><ShoppingCart className="w-6 h-6 text-purple-600" /></div>
            <div className="text-center md:text-left">
              <h3 className="text-sm font-black text-sidebar uppercase tracking-wider">Purchase Order Status</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Procurement lifecycle breakdown</p>
            </div>
          </div>
          <div className="h-[350px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={poStatusData}
                  dataKey="total_units"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={100}
                  outerRadius={130}
                  paddingAngle={6}
                  stroke="none"
                  onMouseEnter={(_, i) => setHoverPo(poStatusData[i].status)}
                  onMouseLeave={() => setHoverPo(null)}
                >
                  {poStatusData.map((entry, i) => <Cell key={i} fill={PO_STATUS_COLORS[entry.status] || '#e2e8f0'} />)}
                </Pie>
                <ChartTooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}
                  formatter={(value: any, name: any, props: any) => {
                    const data = props.payload;
                    return [`${value?.toLocaleString()} UNITS (${data.po_count} POs)`, name];
                  }}
                />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', paddingTop: '30px', color: '#475569' }} />
              </PieChart>
            </ResponsiveContainer>
            {!hoverPo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
                <span className="text-[20px] font-black text-sidebar font-data leading-none">
                  {poStatusData.reduce((acc, curr) => acc + (curr.total_units || 0), 0).toLocaleString()}
                </span>
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">Units</span>
                <div className="w-8 h-px bg-zinc-100 my-1" />
                <span className="text-[14px] font-black text-sidebar font-data leading-none">
                  {poStatusData.reduce((acc, curr) => acc + curr.po_count, 0)}
                </span>
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">Orders</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center pb-10">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.5em] flex items-center justify-center gap-4">
          <Package className="w-4 h-4 opacity-40" /> Performance Ecosystem • Commercial Suite
        </p>
      </div>
    </div>
  )
}
