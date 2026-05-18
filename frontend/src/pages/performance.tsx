import { useEffect, useState, useMemo, useRef } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend, AreaChart, Area
} from 'recharts'
import { TrendingUp, BarChart3, Package, Calendar, ListFilter, Search, ChevronUp, ChevronDown, Filter, X, Check, Hash, LineChart as LineIcon, ShoppingCart, HeartPulse, PieChart as PieIcon, AlertTriangle, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { SalesPerformanceCard } from '../components/SalesPerformanceCard'
import { MultiSelect } from '../components/shared/MultiSelect'

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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Attempt to parse date, fallback to raw label if not a date
    const dateParsed = Date.parse(label);
    const isDate = !isNaN(dateParsed) && label.toString().includes('-');
    const displayLabel = isDate 
      ? new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
      : label.toString().toUpperCase();

    return (
      <div className="bg-[#0f172a] border border-white/10 p-5 rounded-2xl shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] font-black text-zinc-500 mb-4 uppercase tracking-[0.2em] border-b border-white/5 pb-3">
          {displayLabel}
        </p>
        <div className="space-y-2.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{entry.name}</span>
              </div>
              <span className="text-[12px] font-black text-white font-data">
                {entry.value.toLocaleString()}{entry.unit === '%' ? '%' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

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
  const [summaryData, setSummaryData] = useState<any>(null)
  const [mtdForecast, setMtdForecast] = useState<any>(null)
  const [lastMonthSales, setLastMonthSales] = useState<any>(null)
  const [refreshingFact, setRefreshingFact] = useState(false)

  const handleRefreshFact = async () => {
    setRefreshingFact(true)
    setError(null)
    try {
      // Use the central sync endpoint which has robustness and fallbacks
      const res = await api.refreshFactTable()
      if ((res as any).error) throw new Error((res as any).error)
      
      await fetchData()
    } catch (err: any) {
      console.error('Refresh fact error:', err)
      setError(err.message || 'Failed to refresh fact data')
    } finally {
      setRefreshingFact(false)
    }
  }


  // Filters & Sorting
  const [search, setSearch] = useState('')
  const [selCategories, setSelCategories] = useState<string[]>([])
  const [selProductCategories, setSelProductCategories] = useState<string[]>([])
  const [selSubCategories, setSelSubCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
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
        supabase.rpc('get_subcategory_performance', { 
          days_count: days,
          p_categories: selCategories.length > 0 ? selCategories : null,
          p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
          p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null
        }),
        supabase.rpc('get_sales_velocity_trend', { 
          days_count: days,
          p_categories: selCategories.length > 0 ? selCategories : null,
          p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
          p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null
        }),
        supabase.rpc('get_detailed_sales_performance', { days_count: days }),
        supabase.rpc('get_po_status_distribution'),
        supabase.rpc('get_coverage_health', {
          p_categories: selCategories.length > 0 ? selCategories : null,
          p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
          p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null
        })
      ])

      if (subResult.data) setSubcategoryData(subResult.data)
      if (trendResult.data) setTrendData(trendResult.data)
      if (detailedResult.data) setDetailedSales(detailedResult.data)
      if (poResult.data) setPoStatusData(poResult.data)
      if (covResult.data) setCoverageData(covResult.data)

      const { data: summary } = await supabase.rpc('get_dashboard_sales_summary')
      if (summary) setSummaryData(summary)

      const { data: forecastResult } = await supabase.rpc('get_mtd_forecast')
      if (forecastResult) setMtdForecast(forecastResult)

      const { data: lastMonthResult } = await supabase.rpc('get_last_month_sales')
      if (lastMonthResult) setLastMonthSales(lastMonthResult)

    } catch (err: any) { 
      console.error('Fetch error:', err)
      setError(err.message || 'Failed to fetch performance data')
    }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [days, selCategories, selProductCategories, selSubCategories])

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
  const productCategories = useMemo(() => {
    let list = detailedSales
    if (selCategories.length > 0) list = list.filter(s => selCategories.includes(s.category))
    return [...new Set(list.map(s => s.product_category))].sort()
  }, [detailedSales, selCategories])
  const subCategories = useMemo(() => {
    let list = detailedSales
    if (selCategories.length > 0) list = list.filter(s => selCategories.includes(s.category))
    if (selProductCategories.length > 0) list = list.filter(s => selProductCategories.includes(s.product_category))
    return [...new Set(list.map(s => s.sub_category))].sort()
  }, [detailedSales, selCategories, selProductCategories])

  const filteredAndSortedSales = useMemo(() => {
    let result = [...detailedSales]
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(r => 
        r.sku.toLowerCase().includes(s) || 
        r.category.toLowerCase().includes(s) || 
        r.product_category.toLowerCase().includes(s) || 
        r.sub_category.toLowerCase().includes(s)
      )
    }
    if (selCategories.length > 0) result = result.filter(r => selCategories.includes(r.category))
    if (selProductCategories.length > 0) result = result.filter(r => selProductCategories.includes(r.product_category))
    if (selSubCategories.length > 0) result = result.filter(r => selSubCategories.includes(r.sub_category))

    result.sort((a, b) => {
      const valA = a[sortField], valB = b[sortField]
      if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      return sortOrder === 'asc' ? valA - valB : valB - valA
    })
    return result
  }, [detailedSales, search, selCategories, selProductCategories, selSubCategories, sortField, sortOrder])

  const toggleSort = (field: string) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortOrder('desc'); }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />
  }

  if (loading && detailedSales.length === 0) return <LoadingScreen message="Aggregating Performance Data..." fullScreen />

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertTriangle className="w-12 h-12 text-rose-500" />
      <p className="text-rose-500 font-bold uppercase tracking-widest">{error}</p>
      <button onClick={() => fetchData()} className="px-6 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all font-black uppercase text-[10px] tracking-widest">Retry</button>
    </div>
  )

  return (
    <div className="w-full space-y-4 sm:space-y-8 px-0 sm:px-6 lg:px-8 max-w-[1920px] mx-auto pb-20">

      {/* HEADER & CONSOLIDATED CONTROL CENTER */}
      <div className="relative z-50 bg-card border-white/5 shadow-2xl p-6 lg:p-10 rounded-2xl flex flex-col gap-10">
        {/* Top: Centered Header */}
        <div className="flex flex-col items-center gap-5">
          <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-3xl bg-sidebar flex items-center justify-center text-brand-blue shadow-2xl border border-white/5">
            <LineIcon className="w-7 h-7 lg:w-8 lg:h-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl lg:text-4xl font-black text-white uppercase tracking-tighter leading-none">Performance Analytics</h1>
            <p className="text-[10px] lg:text-[12px] font-black text-zinc-500 uppercase tracking-[0.4em] mt-3 opacity-80 flex items-center justify-center gap-3">
              <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              Commercial Intelligence Engine • Live Stream
            </p>
          </div>
        </div>

        {/* Bottom: Unified Controls Row */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full border-t border-white/5 pt-8">
          {/* Timeline Toggle */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0">
            {([7, 30, 90] as const).map(v => (
              <button
                key={v}
                onClick={() => setDays(v)}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${days === v ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'text-zinc-500 hover:text-brand-blue hover:bg-zinc-50/5'}`}
              >
                {v}D
              </button>
            ))}
          </div>

          <div className="h-8 w-px bg-white/10 hidden xl:block mx-1" />

          {/* Refresh Data Button */}
          <button
            onClick={handleRefreshFact}
            disabled={refreshingFact}
            className="px-6 py-2.5 bg-brand-blue text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-colors shadow-lg shadow-brand-blue/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
          >
            {refreshingFact ? 'Refreshing...' : 'Refresh Data'}
          </button>

          <div className="h-8 w-px bg-white/10 hidden xl:block mx-1" />

          {/* Search Bar */}
          <div className="relative group w-full lg:max-w-xs xl:max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-brand-blue transition-colors" />
            <input
              type="text"
              placeholder="SEARCH CATALOG..."
              className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] lg:text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-all placeholder:text-zinc-600 font-black uppercase tracking-widest"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <MultiSelect 
              label="Class" 
              placeholder="ALL CLASSS"
              icon={Filter}
              options={['A', 'B', 'C'].map(v => ({ label: `CATEGORY ${v}`, value: v }))} 
              selected={selCategories} 
              onChange={setSelCategories} 
            />
            <MultiSelect 
              label="Category" 
              placeholder="ALL CATEGORYS"
              icon={Filter}
              options={Array.from(new Set(detailedSales.map(r => r.product_category))).filter(Boolean).sort().map(v => ({ label: String(v).toUpperCase(), value: String(v) }))} 
              selected={selProductCategories} 
              onChange={setSelProductCategories} 
            />
            <MultiSelect 
              label="Sub Category" 
              placeholder="ALL SUB-CATEGORYS"
              icon={Layers}
              options={Array.from(new Set(detailedSales.map(r => r.sub_category))).filter(Boolean).sort().map(v => ({ label: String(v).toUpperCase(), value: String(v) }))} 
              selected={selSubCategories} 
              onChange={setSelSubCategories} 
            />
          </div>
        </div>
      </div>

      {/* NEW: Sales Performance Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {summaryData && (
          <>
            <SalesPerformanceCard
              title="TODAY"
              dateRange="Snapshot"
              sales={summaryData.today?.sales_aed || 0}
              orders={summaryData.today?.orders || 0}
              units={summaryData.today?.units || 0}
              refunds={0}
              headerColor="bg-zinc-900"
              breakdown={[
                { label: 'AMAZON', sales: summaryData.today?.amazon_sales || 0, units: summaryData.today?.amazon_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: summaryData.today?.noon_sales || 0, units: summaryData.today?.noon_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: summaryData.today?.minutes_sales || 0, units: summaryData.today?.minutes_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="YESTERDAY"
              dateRange="Full Day"
              sales={summaryData.yesterday?.sales_aed || 0}
              orders={summaryData.yesterday?.orders || 0}
              units={summaryData.yesterday?.units || 0}
              refunds={0}
              headerColor="bg-zinc-800"
              breakdown={[
                { label: 'AMAZON', sales: summaryData.yesterday?.amazon_sales || 0, units: summaryData.yesterday?.amazon_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: summaryData.yesterday?.noon_sales || 0, units: summaryData.yesterday?.noon_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: summaryData.yesterday?.minutes_sales || 0, units: summaryData.yesterday?.minutes_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="MONTH TO DATE"
              dateRange="Current Month"
              sales={summaryData.mtd?.sales_aed || 0}
              orders={summaryData.mtd?.orders || 0}
              units={summaryData.mtd?.units || 0}
              refunds={0}
              headerColor="bg-blue-900/50"
              breakdown={[
                { label: 'AMAZON', sales: summaryData.mtd?.amazon_sales || 0, units: summaryData.mtd?.amazon_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: summaryData.mtd?.noon_sales || 0, units: summaryData.mtd?.noon_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: summaryData.mtd?.minutes_sales || 0, units: summaryData.mtd?.minutes_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="THIS MONTH FORECAST"
              dateRange="Projected"
              sales={mtdForecast?.find((r: any) => r.sales_channel === 'TOTAL')?.projected_month_end_sales || 0}
              orders={mtdForecast?.find((r: any) => r.sales_channel === 'TOTAL')?.projected_month_end_units || 0}
              units={mtdForecast?.find((r: any) => r.sales_channel === 'TOTAL')?.projected_month_end_units || 0}
              refunds={0}
              headerColor="bg-emerald-900/50"
              breakdown={[
                { label: 'AMAZON', sales: mtdForecast?.find((r: any) => r.sales_channel === 'Amazon')?.projected_month_end_sales || 0, units: mtdForecast?.find((r: any) => r.sales_channel === 'Amazon')?.projected_month_end_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: mtdForecast?.find((r: any) => r.sales_channel === 'Noon')?.projected_month_end_sales || 0, units: mtdForecast?.find((r: any) => r.sales_channel === 'Noon')?.projected_month_end_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: mtdForecast?.find((r: any) => r.sales_channel === 'Minutes')?.projected_month_end_sales || 0, units: mtdForecast?.find((r: any) => r.sales_channel === 'Minutes')?.projected_month_end_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="LAST MONTH"
              dateRange="Previous Full Month"
              sales={lastMonthSales?.find((r: any) => r.sales_channel === 'TOTAL')?.total_sales || 0}
              orders={lastMonthSales?.find((r: any) => r.sales_channel === 'TOTAL')?.total_units || 0}
              units={lastMonthSales?.find((r: any) => r.sales_channel === 'TOTAL')?.total_units || 0}
              refunds={0}
              headerColor="bg-indigo-900/50"
              breakdown={[
                { label: 'AMAZON', sales: lastMonthSales?.find((r: any) => r.sales_channel === 'Amazon')?.total_sales || 0, units: lastMonthSales?.find((r: any) => r.sales_channel === 'Amazon')?.total_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: lastMonthSales?.find((r: any) => r.sales_channel === 'Noon')?.total_sales || 0, units: lastMonthSales?.find((r: any) => r.sales_channel === 'Noon')?.total_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: lastMonthSales?.find((r: any) => r.sales_channel === 'Minutes')?.total_sales || 0, units: lastMonthSales?.find((r: any) => r.sales_channel === 'Minutes')?.total_units || 0, color: 'bg-purple-500' }
              ]}
            />
          </>
        )}
      </div>

      {/* ROW 1: Sales Velocity Trend (FULL WIDTH) */}
      <div className="bg-card border-white/5 shadow-2xl relative overflow-hidden p-8 lg:p-10">
        <div className="mb-6 sm:mb-10 flex flex-col items-center justify-center text-center relative z-10">
          <div className="p-2 sm:p-3 bg-indigo-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><LineIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" /></div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Sales Velocity Trend</h3>
            <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">Daily units per channel</p>
          </div>
        </div>
        <div className="h-[300px] sm:h-[450px] relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 900 }} />
              <ChartTooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={window.innerWidth < 640 ? 100 : 60} 
                iconType="circle" 
                wrapperStyle={{ 
                  fontSize: window.innerWidth < 640 ? '8px' : '10px',
                  fontWeight: 900, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  paddingBottom: '20px'
                }} 
              />
              <Line type="monotone" dataKey="amazon" stroke={COLORS.amazon} strokeWidth={4} dot={false} name="AMAZON" />
              <Line type="monotone" dataKey="noon" stroke={COLORS.noon} strokeWidth={4} dot={false} name="NOON FBN" />
              <Line type="monotone" dataKey="minutes" stroke={COLORS.minutes} strokeWidth={4} dot={false} name="NOON MINUTES" />
              <Line type="monotone" dataKey="total" stroke={COLORS.total} strokeWidth={2} strokeDasharray="8 8" dot={false} name="TOTAL UNITS" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROW 2: Channel Mix Area Chart */}
      <div className="bg-card border-white/5 shadow-2xl p-8 lg:p-10">
        <div className="mb-6 sm:mb-8 flex flex-col items-center justify-center text-center">
          <div className="p-2 sm:p-3 bg-orange-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><PieIcon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" /></div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Channel Mix</h3>
            <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">Daily sales share %</p>
          </div>
        </div>
        <div className="h-[250px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={channelMixData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis unit="%" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
              <ChartTooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="amz_pct" stackId="1" stroke={COLORS.amazon} fill={COLORS.amazon} fillOpacity={0.1} name="AMAZON" />
              <Area type="monotone" dataKey="noon_pct" stackId="1" stroke={COLORS.noon} fill={COLORS.noon} fillOpacity={0.1} name="NOON" />
              <Area type="monotone" dataKey="min_pct" stackId="1" stroke={COLORS.minutes} fill={COLORS.minutes} fillOpacity={0.1} name="MINUTES" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROW 3: Top Sub-categories */}
      <div className="bg-card border-white/5 shadow-2xl p-8 lg:p-10">
        <div className="mb-6 sm:mb-10 flex flex-col items-center justify-center text-center">
          <div className="p-2 sm:p-3 bg-emerald-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" /></div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Sub-category Performance</h3>
            <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">Volume breakdown by type</p>
          </div>
        </div>
        <div className="h-[300px] sm:h-[400px]">
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
              <ChartTooltip content={<CustomTooltip />} />
              <Bar dataKey="total_units" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} label={{ position: 'top', fill: '#0f172a', fontSize: 11, fontWeight: 900, offset: 10, formatter: (v: any) => v?.toLocaleString() }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* ROW 4: Detailed Performance Table */}
      <div className="relative z-10 bg-card border-white/5 shadow-2xl overflow-hidden">
        <div className="p-8 lg:p-10 border-b border-white/5">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-brand-amber/10 rounded-2xl mb-4"><ListFilter className="w-6 h-6 text-brand-amber" /></div>
            <div>
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">Detailed Performance Audit</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">SKU-level channel metrics • Data Explorer</p>
            </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[420px] custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead className="sticky top-0 z-20 bg-[#111827] shadow-none border-white/10">
              <tr className="border-b border-zinc-200">
                <th onClick={() => toggleSort('total_units')} className="px-6 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest w-16 cursor-pointer hover:text-brand-blue text-center">#</th>
                <th onClick={() => toggleSort('category')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">Class</th>
                <th onClick={() => toggleSort('product_category')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">Category</th>
                <th onClick={() => toggleSort('sub_category')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">Sub-Category</th>
                <th onClick={() => toggleSort('sku')} className="px-8 py-5 text-[11px] font-black text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-brand-blue">SKU</th>
                <th onClick={() => toggleSort('amazon_units')} className="px-8 py-5 text-[11px] font-black text-brand-amber uppercase tracking-widest cursor-pointer hover:text-primary text-right">Amazon</th>
                <th onClick={() => toggleSort('noon_units')} className="px-8 py-5 text-[11px] font-black text-brand-blue uppercase tracking-widest cursor-pointer hover:text-primary text-right">Noon</th>
                <th onClick={() => toggleSort('minutes_units')} className="px-8 py-5 text-[11px] font-black text-indigo-600 uppercase tracking-widest cursor-pointer hover:text-primary text-right">Minutes</th>
                <th onClick={() => toggleSort('total_units')} className="px-8 py-5 text-[11px] font-black text-primary uppercase tracking-widest cursor-pointer hover:text-brand-blue text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredAndSortedSales.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-8 py-20 text-center text-zinc-500 font-black uppercase tracking-widest">
                    No performance data found matching your current filters.
                  </td>
                </tr>
              )}
              {filteredAndSortedSales.map((row, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-5 text-center text-[11px] font-black text-zinc-500">{i + 1}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-zinc-300 uppercase">{row.category}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-zinc-300 uppercase">{row.product_category}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-zinc-300 uppercase">{row.sub_category}</td>
                  <td className="px-8 py-5 text-[12px] font-black text-white font-data uppercase">{row.sku}</td>
                  <td className="px-8 py-5 text-right font-data text-[13px] font-black text-brand-amber">{row.amazon_units?.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right font-data text-[13px] font-black text-brand-blue">{row.noon_units?.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right font-data text-[13px] font-black text-indigo-600">{row.minutes_units?.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right font-data text-[15px] font-black text-primary">{row.total_units?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 5: Asset Valuation & PO Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Valuation */}
        <div className="bg-card border-white/5 shadow-2xl flex flex-col p-8">
          <div className="mb-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-brand-blue/10 rounded-2xl shrink-0 mb-4"><TrendingUp className="w-6 h-6 text-brand-blue" /></div>
            <div>
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">Inventory Valuation</h3>
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
                <ChartTooltip contentStyle={{ display: 'none' }} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', paddingTop: '30px', color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
                <span className="text-[18px] font-black text-white font-data tracking-tight">
                  {hoverValuation 
                    ? aed(valuationData.find(d => d.node === hoverValuation)?.value_aed) 
                    : aed(totalValuation)}
                </span>
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                  {hoverValuation || 'Total Assets'}
                </span>
              </div>
          </div>
        </div>

        {/* PO Distribution */}
        <div className="bg-card border-white/5 shadow-2xl flex flex-col p-8">
          <div className="mb-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-purple-50 rounded-2xl shrink-0 mb-4"><ShoppingCart className="w-6 h-6 text-purple-600" /></div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Purchase Order Status</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">Procurement lifecycle breakdown</p>
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
                <ChartTooltip contentStyle={{ display: 'none' }} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', paddingTop: '30px', color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
              <span className="text-[20px] font-black text-white font-data leading-none">
                {hoverPo 
                  ? (poStatusData.find(d => d.status === hoverPo)?.total_units || 0).toLocaleString()
                  : poStatusData.reduce((acc, curr) => acc + (curr.total_units || 0), 0).toLocaleString()}
              </span>
              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                {hoverPo || 'Total Units'}
              </span>
              <div className="w-8 h-px bg-white/10 my-1" />
              <span className="text-[14px] font-black text-white font-data leading-none">
                {hoverPo
                  ? (poStatusData.find(d => d.status === hoverPo)?.po_count || 0)
                  : poStatusData.reduce((acc, curr) => acc + curr.po_count, 0)}
              </span>
              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                {hoverPo ? 'Orders' : 'Total Orders'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 6: Coverage Health (Logistical Audit) */}
      <div className="bg-card border-white/5 shadow-2xl p-8 lg:p-10">
        <div className="mb-6 sm:mb-8 flex flex-col items-center justify-center text-center">
          <div className="p-2 sm:p-3 bg-emerald-50 rounded-2xl shrink-0 mb-3 sm:mb-4"><HeartPulse className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" /></div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider">Coverage Health</h3>
            <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">Median days of stock • Global Audit</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-2">
          {[
            { label: 'AMAZON FBA', val: coverageData?.amazon, color: COLORS.amazon },
            { label: 'NOON FBN', val: coverageData?.noon, color: COLORS.noon },
            { label: 'NOON MINUTES', val: coverageData?.minutes, color: COLORS.minutes },
            { label: 'LOCAD WAREHOUSE', val: coverageData?.locad, color: '#10b981' }
          ].map(node => (
            <div key={node.label} className="bg-white/5 border border-white/5 shadow-2xl p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center">
              <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 sm:mb-2 leading-tight">{node.label}</span>
              <span className="text-lg sm:text-2xl font-black text-primary font-data">
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

      <div className="text-center pb-10">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.5em] flex items-center justify-center gap-4">
          <Package className="w-4 h-4 opacity-40" /> Performance Ecosystem • Commercial Suite
        </p>
      </div>
    </div>
  )
}
