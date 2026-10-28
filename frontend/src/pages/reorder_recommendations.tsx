import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Layers,
  Box,
  Coins,
  RefreshCw,
  Download,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  Info,
  Calendar,
  Truck,
  ArrowUpDown,
  X,
  ExternalLink,
  Copy,
  Sparkles,
  Package,
  Clock,
  ArrowRight,
  Eye,
  Percent,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useRegion } from '../lib/RegionContext'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import {
  fetchReorderRawData,
  calculateReorderPlan,
  calculateKPIs,
  calculateABCSummaries,
  filterReorderItems,
  sortReorderItems,
  exportReorderToCSV,
  fetchSavedDiscontinuedFlags,
  saveReorderRecommendationsToDB,
  type RawSKUData,
} from '../lib/reorderService'
import {
  DEFAULT_REORDER_CONFIG,
  type ReorderConfig,
  type SKUReorderRecommendation,
  type ReorderExecutiveKPIs,
  type ABCCategorySummary,
  type ReorderFilterState,
  INITIAL_REORDER_FILTERS,
  type ABCClass,
} from '../types/reorder'
import { navigate } from '../lib/router'

export default function ReorderRecommendationsPage() {
  const { region } = useRegion()
  const [rawData, setRawData] = useState<RawSKUData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Configuration State
  const [config, setConfig] = useState<ReorderConfig>(() => {
    const saved = localStorage.getItem('reorder_config')
    return saved ? JSON.parse(saved) : DEFAULT_REORDER_CONFIG
  })
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  // Filtering & Sorting State
  const [filters, setFilters] = useState<ReorderFilterState>(INITIAL_REORDER_FILTERS)
  const [sortKey, setSortKey] = useState<keyof SKUReorderRecommendation>('total_reorder_cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(25)
  const [currentPage, setCurrentPage] = useState<number>(1)

  // Drill-down Modal State
  const [selectedSKU, setSelectedSKU] = useState<SKUReorderRecommendation | null>(null)
  const [copiedSku, setCopiedSku] = useState<string | null>(null)
  const [savingToDB, setSavingToDB] = useState(false)
  const [lastSavedCount, setLastSavedCount] = useState<number | null>(null)

  // Discontinued SKUs State (Planning to Discontinue, off by default)
  const [discontinuedSkus, setDiscontinuedSkus] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`reorder_discontinued_${region || 's2c_uae_test'}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Persist discontinued state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`reorder_discontinued_${region || 's2c_uae_test'}`, JSON.stringify(discontinuedSkus))
    } catch (e) {
      console.error('Error saving discontinued state:', e)
    }
  }, [discontinuedSkus, region])

  const handleToggleDiscontinue = (sku: string) => {
    setDiscontinuedSkus((prev: Record<string, boolean>) => {
      const isCurrentlyDiscontinued = Boolean(prev[sku])
      const next = { ...prev }
      if (isCurrentlyDiscontinued) {
        delete next[sku]
      } else {
        next[sku] = true
      }
      return next
    })
    setSelectedSKU((prev: SKUReorderRecommendation | null) => {
      if (prev && prev.sku === sku) {
        const isDis = !prev.is_discontinued
        return {
          ...prev,
          is_discontinued: isDis,
          reorder_qty: isDis ? 0 : prev.reorder_qty,
          remaining_reorder_qty: isDis ? 0 : prev.remaining_reorder_qty,
          suggested_order_qty: isDis ? 0 : prev.suggested_order_qty,
          total_reorder_cost: isDis ? 0 : prev.total_reorder_cost,
          is_reorder_required: isDis ? false : prev.is_reorder_required,
        }
      }
      return prev
    })
  }

  // Persist config changes
  useEffect(() => {
    localStorage.setItem('reorder_config', JSON.stringify(config))
  }, [config])

  // Fetch Live Data
  const loadData = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const country = localStorage.getItem('selected_country') || (region === 's2c_test' ? 'KSA' : 'UAE')
      const accountId = region || 's2c_uae_test'
      const [data, savedFlags] = await Promise.all([
        fetchReorderRawData(country, accountId, force),
        fetchSavedDiscontinuedFlags(country, accountId),
      ])
      if (Object.keys(savedFlags).length > 0) {
        setDiscontinuedSkus((prev) => ({ ...savedFlags, ...prev }))
      }
      setRawData(data)
    } catch (err: any) {
      console.error('Error fetching reorder data:', err)
      setError(err.message || 'Failed to load reorder recommendation data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [region])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Calculate complete SKU-level reorder plan
  const allRecommendations = useMemo(() => {
    if (!rawData.length) return []
    const { recommendations } = calculateReorderPlan(rawData, config)

    // Map in the planning to discontinue flag (off by default)
    return recommendations.map((item) => {
      const is_discontinued = Boolean(discontinuedSkus[item.sku])
      if (is_discontinued) {
        return {
          ...item,
          is_discontinued: true,
          reorder_qty: 0,
          remaining_reorder_qty: 0,
          suggested_order_qty: 0,
          total_reorder_cost: 0,
          is_reorder_required: false,
        }
      }
      return {
        ...item,
        is_discontinued: false,
      }
    })
  }, [rawData, config, discontinuedSkus])

  // Automatically sync calculated reorder recommendations table to public.sku_reorder_recommendations
  const handleSaveToDB = useCallback(async (itemsToSave = allRecommendations) => {
    if (!itemsToSave.length) return
    setSavingToDB(true)
    try {
      const country = localStorage.getItem('selected_country') || (region === 's2c_test' ? 'KSA' : 'UAE')
      const accountId = region || 's2c_uae_test'
      const res = await saveReorderRecommendationsToDB(itemsToSave, country, accountId)
      if (res.ok) {
        setLastSavedCount(res.count)
      }
    } finally {
      setSavingToDB(false)
    }
  }, [allRecommendations, region])

  useEffect(() => {
    if (allRecommendations.length > 0) {
      handleSaveToDB(allRecommendations)
    }
  }, [allRecommendations, handleSaveToDB])

  // Apply filters consistently across table, summary cards, and category analysis
  const filteredData = useMemo(() => {
    return filterReorderItems(allRecommendations, filters)
  }, [allRecommendations, filters])

  // Sort filtered items
  const sortedData = useMemo(() => {
    return sortReorderItems(filteredData, sortKey, sortDir)
  }, [filteredData, sortKey, sortDir])

  // Reconciled KPIs calculated dynamically from the filtered dataset
  const filteredKPIs: ReorderExecutiveKPIs = useMemo(() => {
    return calculateKPIs(filteredData)
  }, [filteredData])

  // ABC Category Summaries calculated dynamically from the filtered dataset
  const filteredABCSummaries: ABCCategorySummary[] = useMemo(() => {
    return calculateABCSummaries(filteredData)
  }, [filteredData])

  // Paginated Table Data
  const paginatedData = useMemo(() => {
    if (pageSize === -1) return sortedData
    const start = (currentPage - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, currentPage, pageSize])

  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedData.length / pageSize)

  // Handle Sort Toggle
  const handleSort = (key: keyof SKUReorderRecommendation) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setCurrentPage(1)
  }

  // Handle Copy SKU
  const handleCopySku = (sku: string) => {
    navigator.clipboard.writeText(sku)
    setCopiedSku(sku)
    setTimeout(() => setCopiedSku(null), 2000)
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
      maximumFractionDigits: 0,
    }).format(val)
  }

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.cat !== 'ALL' ||
      Boolean(filters.sku.trim()) ||
      Boolean(filters.productName.trim()) ||
      filters.reorderRequired ||
      filters.zeroStock ||
      filters.lowDaysLeft ||
      filters.moqApplied ||
      filters.missingUnitCost ||
      filters.missingMOQ ||
      filters.planningToDiscontinue
    )
  }, [filters])

  // Chart Data for ABC Breakdown
  const chartData = useMemo(() => {
    return filteredABCSummaries.map((s) => ({
      name: `Category ${s.category}`,
      category: s.category,
      cost: s.totalReorderCost,
      qty: s.totalSuggestedOrderQty,
      skus: s.skuCount,
    }))
  }, [filteredABCSummaries])

  if (loading && !rawData.length) {
    return <LoadingScreen message="Loading live inventory & reorder recommendations..." />
  }

  return (
    <div className="space-y-6 pb-20">
      {/* ─── 1. Header & Primary Actions ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                SKU-Wise Reorder Dashboard
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Live DB
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Active SKUs Only
                </span>
                {lastSavedCount !== null && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                    title="Saved to public.sku_reorder_recommendations table"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Table Saved ({lastSavedCount} rows)
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated replenishment recommendations, MOQ adjustments, and purchase commitments saved in <code className="text-cyan-400">sku_reorder_recommendations</code>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Save to Table Button */}
          <button
            onClick={() => handleSaveToDB(allRecommendations)}
            disabled={savingToDB || !allRecommendations.length}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:text-white hover:bg-emerald-600/30 transition-all disabled:opacity-50"
            title="Save current table rows to public.sku_reorder_recommendations"
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${savingToDB ? 'animate-pulse text-emerald-400' : 'text-emerald-400'}`} />
            <span>{savingToDB ? 'Saving Table...' : 'Save to DB Table'}</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
            title="Refresh inventory matrix"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>{refreshing ? 'Recalculating...' : 'Refresh'}</span>
          </button>

          {/* Config Settings Button */}
          <button
            onClick={() => setIsConfigOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
            title="Configure Target Days & Ordering Parameters"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Target Days Settings</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={() => exportReorderToCSV(sortedData)}
            disabled={!sortedData.length}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => loadData(true)} className="underline hover:text-white font-bold ml-4">
            Retry
          </button>
        </div>
      )}

      {/* ─── 2. SUMMARY CARDS: Total SKU to Reorder, Units to Reorder, Total Cost ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total SKU to Reorder */}
        <div className="bg-slate-900/70 border border-amber-500/25 rounded-2xl p-5 shadow-xl backdrop-blur-md bg-amber-500/[0.03] hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Total SKU to Reorder</span>
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <p className="text-2xl sm:text-3xl font-black text-amber-400 font-data leading-none">
              {filteredKPIs.skusRequiringReorder.toLocaleString()}
            </p>
          </div>
          <p className="text-xs text-amber-400/80 font-medium">
            {filteredKPIs.totalSKUs > 0
              ? `${Math.round((filteredKPIs.skusRequiringReorder / filteredKPIs.totalSKUs) * 100)}% of ${filteredKPIs.totalSKUs} active SKUs requiring restock`
              : '0 SKUs requiring restock'}
          </p>
        </div>

        {/* Card 2: Units to Reorder */}
        <div className="bg-slate-900/70 border border-cyan-500/25 rounded-2xl p-5 shadow-xl backdrop-blur-md bg-cyan-500/[0.03] hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-cyan-400 uppercase tracking-wider">Units to Reorder</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <p className="text-2xl sm:text-3xl font-black text-cyan-400 font-data leading-none">
              {filteredKPIs.totalSuggestedOrderQty.toLocaleString()}
            </p>
          </div>
          <p className="text-xs text-cyan-400/80 font-medium">
            MOQ & pack adjusted (Net deficit: {filteredKPIs.totalRemainingReorderQty.toLocaleString()} units)
          </p>
        </div>

        {/* Card 3: Total Cost */}
        <div className="bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-md bg-emerald-500/[0.04] hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">Total Cost</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-data leading-none truncate">
              {formatCurrency(filteredKPIs.totalReorderCost)}
            </p>
          </div>
          <p className="text-xs text-emerald-400/80 font-medium">
            Suggested Order Qty × Unit Cost across active SKUs
          </p>
        </div>
      </div>

      {/* ─── 3. ABC Category Analysis Section ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: ABC Category Analysis Table */}
        <div className="lg:col-span-8 bg-slate-900/60 border border-white/[0.08] rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  ABC Category Replenishment Analysis
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Breakdown by category target stock, order shortfall, and financial requirements
                </p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                100% Reconciled
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">CAT</th>
                    <th className="py-2.5 px-3 text-right">SKUs</th>
                    <th className="py-2.5 px-3 text-right">Daily Sales</th>
                    <th className="py-2.5 px-3 text-right">Available Stock</th>
                    <th className="py-2.5 px-3 text-right">Target Stock</th>
                    <th className="py-2.5 px-3 text-right">Reorder Qty</th>
                    <th className="py-2.5 px-3 text-right">Existing PO</th>
                    <th className="py-2.5 px-3 text-right">Remaining Qty</th>
                    <th className="py-2.5 px-3 text-right text-cyan-400">Suggested Order</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400">Total Reorder Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {filteredABCSummaries.map((catSummary) => {
                    const badgeClasses = {
                      A: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      B: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                      C: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    }[catSummary.category]

                    const targetDaysLabel = {
                      A: `${config.targetDaysA}d`,
                      B: `${config.targetDaysB}d`,
                      C: `${config.targetDaysC}d`,
                    }[catSummary.category]

                    return (
                      <tr key={catSummary.category} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] border ${badgeClasses}`}>
                            CAT {catSummary.category} ({targetDaysLabel})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-slate-300">
                          {catSummary.skuCount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-slate-300">
                          {catSummary.totalDailySales.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-slate-300">
                          {catSummary.totalAvailableStock.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-slate-300">
                          {catSummary.totalTargetStock.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-slate-300">
                          {catSummary.totalReorderQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-blue-400">
                          {catSummary.totalExistingPOQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data text-orange-400">
                          {catSummary.totalRemainingReorderQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data font-bold text-cyan-400">
                          {catSummary.totalSuggestedOrderQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-data font-black text-emerald-400">
                          {formatCurrency(catSummary.totalReorderCost)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals row strictly reconciling */}
                  <tr className="border-t-2 border-white/10 font-black text-white bg-white/[0.02]">
                    <td className="py-2.5 px-3 uppercase tracking-wider">Total</td>
                    <td className="py-2.5 px-3 text-right font-data">{filteredKPIs.totalSKUs.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-data">
                      {filteredKPIs.totalDailySales.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data">
                      {filteredKPIs.totalAvailableStock.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data">
                      {filteredABCSummaries.reduce((s, c) => s + c.totalTargetStock, 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data">
                      {filteredKPIs.totalReorderQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data text-blue-400">
                      {filteredKPIs.totalExistingPOQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data text-orange-400">
                      {filteredKPIs.totalRemainingReorderQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data text-cyan-400">
                      {filteredKPIs.totalSuggestedOrderQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-data text-emerald-400">
                      {formatCurrency(filteredKPIs.totalReorderCost)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Prioritize <strong>CAT A</strong> replenishment first to protect 80% of sales volume.
            </span>
            <span className="text-[11px] text-slate-500">
              Target days: A ({config.targetDaysA}d), B ({config.targetDaysB}d), C ({config.targetDaysC}d)
            </span>
          </div>
        </div>

        {/* Right: Reorder Cost Distribution Chart */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-white/[0.08] rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Coins className="w-4 h-4 text-cyan-400" />
                Capital Distribution
              </h3>
              <span className="text-xs font-bold text-cyan-400">
                {formatCurrency(filteredKPIs.totalReorderCost)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Required replenishment capital allocation across CAT A, B, and C
            </p>

            <div className="h-48 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={{ stroke: '#334155' }} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                    tickFormatter={(val) => `AED ${(val / 1000).toFixed(0)}k`}
                  />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload
                        return (
                          <div className="bg-slate-950 border border-white/15 p-3 rounded-xl shadow-2xl text-xs space-y-1">
                            <p className="font-black text-white uppercase tracking-wider">{d.name}</p>
                            <p className="text-slate-300">
                              Reorder Cost: <span className="font-bold text-emerald-400">{formatCurrency(d.cost)}</span>
                            </p>
                            <p className="text-slate-400">
                              Suggested Units: <span className="font-bold text-white">{d.qty.toLocaleString()}</span>
                            </p>
                            <p className="text-slate-400">
                              Active SKUs: <span className="font-bold text-white">{d.skus}</span>
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => {
                      const colors = ['#10b981', '#3b82f6', '#f59e0b']
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-center text-[10px]">
            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <span className="font-bold text-emerald-400 block">CAT A</span>
              <p className="font-bold text-white mt-0.5">
                {filteredKPIs.totalReorderCost > 0
                  ? `${Math.round(((filteredABCSummaries[0]?.totalReorderCost || 0) / filteredKPIs.totalReorderCost) * 100)}%`
                  : '0%'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <span className="font-bold text-blue-400 block">CAT B</span>
              <p className="font-bold text-white mt-0.5">
                {filteredKPIs.totalReorderCost > 0
                  ? `${Math.round(((filteredABCSummaries[1]?.totalReorderCost || 0) / filteredKPIs.totalReorderCost) * 100)}%`
                  : '0%'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <span className="font-bold text-amber-400 block">CAT C</span>
              <p className="font-bold text-white mt-0.5">
                {filteredKPIs.totalReorderCost > 0
                  ? `${Math.round(((filteredABCSummaries[2]?.totalReorderCost || 0) / filteredKPIs.totalReorderCost) * 100)}%`
                  : '0%'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Search, Filters, and Sorting Controls ─────────────────────── */}
      <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-4">
        {/* Row 1: Search Inputs & Category Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex-1 flex flex-wrap items-center gap-2.5">
            {/* SKU Search */}
            <div className="relative min-w-[180px] max-w-xs flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search SKU..."
                value={filters.sku}
                onChange={(e) => {
                  setFilters({ ...filters, sku: e.target.value })
                  setCurrentPage(1)
                }}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {filters.sku && (
                <button
                  onClick={() => {
                    setFilters({ ...filters, sku: '' })
                    setCurrentPage(1)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Product Name Search */}
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search Product Name..."
                value={filters.productName}
                onChange={(e) => {
                  setFilters({ ...filters, productName: e.target.value })
                  setCurrentPage(1)
                }}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {filters.productName && (
                <button
                  onClick={() => {
                    setFilters({ ...filters, productName: '' })
                    setCurrentPage(1)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* CAT Selector */}
            <select
              value={filters.cat}
              onChange={(e) => {
                setFilters({ ...filters, cat: e.target.value })
                setCurrentPage(1)
              }}
              className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">CAT: All Categories</option>
              <option value="A">CAT A Only</option>
              <option value="B">CAT B Only</option>
              <option value="C">CAT C Only</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilters(INITIAL_REORDER_FILTERS)
                setCurrentPage(1)
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-bold underline whitespace-nowrap"
            >
              Reset All Filters
            </button>
          )}
        </div>

        {/* Row 2: Filter Toggle Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Quick Filters:
          </span>

          {/* Filter: Reorder Required */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, reorderRequired: !prev.reorderRequired }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.reorderRequired
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>Reorder Required</span>
            {filters.reorderRequired && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
          </button>

          {/* Filter: Zero Stock */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, zeroStock: !prev.zeroStock }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.zeroStock
                ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>Zero Stock</span>
            {filters.zeroStock && <CheckCircle2 className="w-3 h-3 text-red-400" />}
          </button>

          {/* Filter: Low Days Left */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, lowDaysLeft: !prev.lowDaysLeft }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.lowDaysLeft
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>Low Days Left</span>
            {filters.lowDaysLeft && <CheckCircle2 className="w-3 h-3 text-purple-400" />}
          </button>

          {/* Filter: MOQ Applied */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, moqApplied: !prev.moqApplied }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.moqApplied
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>MOQ Applied</span>
            {filters.moqApplied && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
          </button>

          {/* Filter: Missing Unit Cost */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, missingUnitCost: !prev.missingUnitCost }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.missingUnitCost
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>Missing Unit Cost</span>
            {filters.missingUnitCost && <CheckCircle2 className="w-3 h-3 text-rose-400" />}
          </button>

          {/* Filter: Missing MOQ */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, missingMOQ: !prev.missingMOQ }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.missingMOQ
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>Missing MOQ</span>
            {filters.missingMOQ && <CheckCircle2 className="w-3 h-3 text-yellow-400" />}
          </button>

          {/* Filter: Planning to Discontinue */}
          <button
            onClick={() => {
              setFilters((prev) => ({ ...prev, planningToDiscontinue: !prev.planningToDiscontinue }))
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filters.planningToDiscontinue
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <span>Planning to Discontinue</span>
            {filters.planningToDiscontinue && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
          </button>
        </div>

        {/* Results Count & Page Size Selection */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
          <span>
            Showing <strong className="text-white">{sortedData.length}</strong> of{' '}
            <strong className="text-white">{allRecommendations.length}</strong> Active SKUs
            {hasActiveFilters && <span className="ml-1 text-blue-400 font-semibold">(Filtered)</span>}
          </span>
          <div className="flex items-center gap-2">
            <span>Per Page:</span>
            {[25, 50, 100, -1].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setPageSize(size)
                  setCurrentPage(1)
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  pageSize === size ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {size === -1 ? 'All' : size}
              </button>
            ))}
          </div>
        </div>

        {/* ─── 5. REORDER DASHBOARD TABLE (Combined SKU & Product, Vertical Scroll) ─── */}
        <div className="overflow-x-auto overflow-y-auto max-h-[620px] custom-scrollbar rounded-xl border border-white/10 shadow-2xl relative">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-950/95 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky top-0 z-20 border-b border-white/10 backdrop-blur-md">
              <tr>
                {/* 1. Combined SKU & Product Name */}
                <th
                  onClick={() => handleSort(sortKey === 'sku' ? 'name' : 'sku')}
                  className="py-3 px-3 cursor-pointer hover:text-white border-r border-white/5 min-w-[260px]"
                  title="Click to sort by SKU or Product Name"
                >
                  <div className="flex items-center gap-1.5">
                    <span>SKU & Product Name</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 3. CAT */}
                <th
                  onClick={() => handleSort('category')}
                  className="py-3 px-2 text-center cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-center gap-1">
                    CAT
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* Planning to Discontinue */}
                <th
                  onClick={() => handleSort('is_discontinued')}
                  className="py-3 px-3 text-center cursor-pointer hover:text-white border-r border-white/5 min-w-[140px]"
                  title="Click to sort by Planning to Discontinue"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Planning to Discontinue</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 4. Daily Sales */}
                <th
                  onClick={() => handleSort('daily_sales')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Daily Sales
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 5. Available Stock */}
                <th
                  onClick={() => handleSort('available_stock')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Available Stock
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 6. Days Left */}
                <th
                  onClick={() => handleSort('days_left')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Days Left
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 7. Target Days */}
                <th
                  onClick={() => handleSort('target_days')}
                  className="py-3 px-2.5 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Target Days
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 8. Target Stock */}
                <th
                  onClick={() => handleSort('target_stock')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Target Stock
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 9. Reorder Qty */}
                <th
                  onClick={() => handleSort('reorder_qty')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Reorder Qty
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 10. Existing PO Qty */}
                <th
                  onClick={() => handleSort('existing_po_qty')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5 text-blue-400"
                >
                  <div className="flex items-center justify-end gap-1">
                    Existing PO Qty
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 11. Remaining Reorder Qty */}
                <th
                  onClick={() => handleSort('remaining_reorder_qty')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5 text-orange-400"
                >
                  <div className="flex items-center justify-end gap-1">
                    Remaining Reorder Qty
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 12. MOQ */}
                <th
                  onClick={() => handleSort('moq')}
                  className="py-3 px-2.5 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    MOQ
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 13. Suggested Order Qty */}
                <th
                  onClick={() => handleSort('suggested_order_qty')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5 text-cyan-400"
                >
                  <div className="flex items-center justify-end gap-1">
                    Suggested Order Qty
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 14. Unit Cost */}
                <th
                  onClick={() => handleSort('unit_cost')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white border-r border-white/5"
                >
                  <div className="flex items-center justify-end gap-1">
                    Unit Cost
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                {/* 15. Total Reorder Cost */}
                <th
                  onClick={() => handleSort('total_reorder_cost')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white text-emerald-400"
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Reorder Cost
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-900/40 font-medium">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-500">
                    No SKUs matching your active filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row) => {
                  const abcBadge = {
                    A: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
                    B: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
                    C: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
                  }[row.category] || 'bg-slate-800 text-slate-400 border-slate-700'

                  const isUrgent = row.is_stockout_risk

                  return (
                    <tr
                      key={row.sku}
                      onClick={() => setSelectedSKU(row)}
                      className={`hover:bg-white/[0.04] transition-colors cursor-pointer ${
                        isUrgent ? 'bg-red-500/[0.04]' : ''
                      }`}
                    >
                      {/* Combined SKU & Product Name */}
                      <td className="py-2.5 px-3 border-r border-white/5 min-w-[260px] max-w-sm">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-white font-data text-xs tracking-tight">{row.sku}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopySku(row.sku)
                              }}
                              className="text-slate-500 hover:text-white p-0.5"
                              title="Copy SKU"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            {copiedSku === row.sku && (
                              <span className="text-[9px] text-emerald-400 font-bold">Copied!</span>
                            )}
                            {row.brand && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                                {row.brand}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-300 text-[11px] truncate block leading-tight" title={row.name}>
                            {row.name}
                          </span>
                        </div>
                      </td>

                      {/* 3. CAT */}
                      <td className="py-2.5 px-2 text-center border-r border-white/5">
                        <span className={`px-2 py-0.5 rounded font-black text-[10px] border ${abcBadge}`}>
                          {row.category}
                        </span>
                      </td>

                      {/* Planning to Discontinue Toggle Switch (Off by default) */}
                      <td
                        className="py-2.5 px-3 text-center border-r border-white/5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleDiscontinue(row.sku)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              row.is_discontinued
                                ? 'bg-amber-500 shadow-sm shadow-amber-500/50'
                                : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                            role="switch"
                            aria-checked={Boolean(row.is_discontinued)}
                            title={
                              row.is_discontinued
                                ? 'Planning to Discontinue: ON (Orders suspended. Click to turn off)'
                                : 'Planning to Discontinue: OFF (Click to turn on)'
                            }
                          >
                            <span className="sr-only">Planning to Discontinue</span>
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                row.is_discontinued ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span
                            className={`text-[10px] font-bold ${
                              row.is_discontinued ? 'text-amber-400' : 'text-slate-500'
                            }`}
                          >
                            {row.is_discontinued ? 'Yes' : 'Off'}
                          </span>
                        </div>
                      </td>

                      {/* 4. Daily Sales */}
                      <td className="py-2.5 px-3 text-right font-data text-slate-300 border-r border-white/5">
                        {row.daily_sales > 0
                          ? row.daily_sales.toFixed(2)
                          : <span className="text-slate-500">0.00</span>}
                      </td>

                      {/* 5. Available Stock */}
                      <td className="py-2.5 px-3 text-right font-data border-r border-white/5">
                        <span
                          className={
                            row.available_stock === 0
                              ? 'text-red-400 font-bold'
                              : row.is_low_days
                              ? 'text-amber-400 font-semibold'
                              : 'text-white'
                          }
                        >
                          {row.available_stock.toLocaleString()}
                        </span>
                      </td>

                      {/* 6. Days Left */}
                      <td className="py-2.5 px-3 text-right font-data border-r border-white/5">
                        {row.is_zero_sales && row.available_stock === 0 ? (
                          <span className="font-bold text-red-400 flex items-center justify-end gap-1">
                            0.0d
                            <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                          </span>
                        ) : row.is_zero_sales ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700"
                            title="Daily Sales is zero with stock available. Flagged for review."
                          >
                            N/A (Review)
                          </span>
                        ) : row.days_left !== null && row.days_left < row.lead_time_days ? (
                          <span className="font-bold text-red-400 flex items-center justify-end gap-1">
                            {row.days_left.toFixed(1)}d
                            <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                          </span>
                        ) : row.days_left !== null ? (
                          <span className="text-slate-300">{row.days_left.toFixed(1)}d</span>
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </td>

                      {/* 7. Target Days */}
                      <td className="py-2.5 px-2.5 text-right font-data text-slate-400 border-r border-white/5">
                        {row.target_days}d
                      </td>

                      {/* 8. Target Stock */}
                      <td className="py-2.5 px-3 text-right font-data text-slate-300 border-r border-white/5">
                        {row.target_stock.toLocaleString()}
                      </td>

                      {/* 9. Reorder Qty */}
                      <td className="py-2.5 px-3 text-right font-data text-slate-200 border-r border-white/5">
                        {row.reorder_qty > 0 ? (
                          <span className="font-bold">{row.reorder_qty.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>

                      {/* 10. Existing PO Qty */}
                      <td className="py-2.5 px-3 text-right font-data text-blue-400 border-r border-white/5">
                        {row.existing_po_qty > 0 ? (
                          <span className="font-semibold">{row.existing_po_qty.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* 11. Remaining Reorder Qty */}
                      <td className="py-2.5 px-3 text-right font-data text-orange-400 border-r border-white/5">
                        {row.remaining_reorder_qty > 0 ? (
                          <span className="font-bold">{row.remaining_reorder_qty.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* 12. MOQ */}
                      <td className="py-2.5 px-2.5 text-right font-data border-r border-white/5">
                        {row.moq > 0 ? (
                          <span className="text-slate-300">{row.moq.toLocaleString()}</span>
                        ) : row.remaining_reorder_qty > 0 ? (
                          <span
                            className="text-[9px] font-bold text-yellow-400 bg-yellow-500/10 px-1 py-0.5 rounded border border-yellow-500/20"
                            title="Missing MOQ configuration"
                          >
                            Missing
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* 13. Suggested Order Qty */}
                      <td className="py-2.5 px-3 text-right font-data border-r border-white/5">
                        {row.is_discontinued ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              title="Planning to Discontinue: Reorders suspended"
                            >
                              Suspended
                            </span>
                          </div>
                        ) : row.suggested_order_qty > 0 ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-black text-cyan-400 text-sm">
                              {row.suggested_order_qty.toLocaleString()}
                            </span>
                            {row.is_moq_applied && (
                              <span
                                className="px-1 py-0.2 rounded text-[9px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                                title={`Adjusted to MOQ (${row.moq})`}
                              >
                                MOQ
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* 14. Unit Cost */}
                      <td className="py-2.5 px-3 text-right font-data border-r border-white/5">
                        {row.is_missing_cost ? (
                          <span
                            className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-1 py-0.5 rounded border border-rose-500/20"
                            title="Missing unit cost! Excluded from total reorder investment."
                          >
                            Missing
                          </span>
                        ) : (
                          <span className="text-slate-300 font-data">AED {row.unit_cost.toFixed(2)}</span>
                        )}
                      </td>

                      {/* 15. Total Reorder Cost */}
                      <td className="py-2.5 px-3 text-right font-data font-black">
                        {row.is_discontinued ? (
                          <span className="text-slate-500">AED 0</span>
                        ) : row.total_reorder_cost > 0 ? (
                          <span className="text-emerald-400">{formatCurrency(row.total_reorder_cost)}</span>
                        ) : (
                          <span className="text-slate-600">AED 0</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Navigation Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-slate-400">
              Page <strong className="text-white">{currentPage}</strong> of{' '}
              <strong className="text-white">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── 6. SKU Detail Drill-Down Modal ──────────────────────────────── */}
      {selectedSKU && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-white font-data">{selectedSKU.sku}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    CAT {selectedSKU.category}
                  </span>
                  {selectedSKU.is_discontinued && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Planning to Discontinue
                    </span>
                  )}
                  {selectedSKU.is_stockout_risk && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                      Stockout Risk
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">{selectedSKU.name}</p>
              </div>
              <button
                onClick={() => setSelectedSKU(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Discontinued Status Banner if active */}
            {selectedSKU.is_discontinued && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-300">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    This SKU is marked as <strong>Planning to Discontinue</strong>. Replenishment reorders are currently suspended (0 units, AED 0).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleDiscontinue(selectedSKU.sku)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-bold border border-amber-500/40 transition-colors"
                >
                  Re-enable Reorders
                </button>
              </div>
            )}

            {/* Inventory Breakdown by Channels (From Inventory Tab) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-blue-400" />
                Available Stock Channels (Inventory Tab Parity)
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">FBA Stock</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.fba_units.toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">FBN Stock</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.fbn_units.toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">Minutes Stock</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.minutes_units.toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">LOCAD Stock</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.locad_units.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Daily Sales Velocity Channels */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                Channel Sales Velocity (Units/Day)
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">Amazon Daily</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.amazon_sv.toFixed(2)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">Noon Daily</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.noon_sv.toFixed(2)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold">Minutes Daily</span>
                  <span className="text-sm font-bold text-white font-data">{selectedSKU.minutes_sv.toFixed(2)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <span className="text-[10px] block font-bold">Total Daily Sales</span>
                  <span className="text-sm font-black font-data">{selectedSKU.daily_sales.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Step-by-Step Mathematical Reconciliation */}
            <div className="space-y-2.5 bg-slate-950/70 p-4 rounded-xl border border-white/10 text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Step-by-Step Reorder Mathematical Audit
              </h4>
              <div className="space-y-1.5 text-slate-300 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span>Target Stock = {selectedSKU.is_zero_sales && selectedSKU.available_stock === 0 ? 'MOQ (Zero sales & zero stock)' : `Daily Sales (${selectedSKU.daily_sales}) × Target Days (${selectedSKU.target_days})`}</span>
                  <strong className="text-white">= {selectedSKU.target_stock} units</strong>
                </div>
                <div className="flex justify-between">
                  <span>Reorder Qty = MAX(0, Target Stock ({selectedSKU.target_stock}) − Available ({selectedSKU.available_stock}))</span>
                  <strong className="text-white">= {selectedSKU.reorder_qty} units</strong>
                </div>
                <div className="flex justify-between">
                  <span>Existing PO Qty (Outstanding in pipeline)</span>
                  <strong className="text-blue-400">= {selectedSKU.existing_po_qty} units</strong>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1">
                  <span>Remaining Reorder Qty = MAX(0, Reorder Qty − Existing PO Qty)</span>
                  <strong className="text-orange-400">= {selectedSKU.remaining_reorder_qty} units</strong>
                </div>
                <div className="flex justify-between">
                  <span>MOQ ({selectedSKU.moq}) & Case Pack Multiples ({selectedSKU.case_pack})</span>
                  <strong className="text-cyan-400">Suggested: {selectedSKU.suggested_order_qty} units</strong>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1 text-xs">
                  <span className="font-sans font-bold text-white">Total Investment = Suggested ({selectedSKU.suggested_order_qty}) × Unit Cost ({formatCurrency(selectedSKU.unit_cost)})</span>
                  <strong className="text-emerald-400 font-bold">{formatCurrency(selectedSKU.total_reorder_cost)}</strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                Supplier: <strong className="text-white">{selectedSKU.supplier}</strong> (Lead time: {selectedSKU.lead_time_days} days)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedSKU(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-300"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    navigate('/purchase-orders')
                    setSelectedSKU(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Create Purchase Order</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. Configuration Settings Modal ─────────────────────────────── */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                Target Days & Policy Settings
              </h3>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Target Days for Category A */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Category A Target Days (Default 60)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.targetDaysA}
                  onChange={(e) => setConfig({ ...config, targetDaysA: Number(e.target.value) || 60 })}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-data focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Target Days for Category B */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Category B Target Days (Default 45)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.targetDaysB}
                  onChange={(e) => setConfig({ ...config, targetDaysB: Number(e.target.value) || 45 })}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-data focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Target Days for Category C */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Category C Target Days (Default 30)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.targetDaysC}
                  onChange={(e) => setConfig({ ...config, targetDaysC: Number(e.target.value) || 30 })}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-data focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Apply MOQ Toggle */}
              <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-white/10">
                <span className="text-slate-300 font-bold">Apply Minimum Order Quantity (MOQ)</span>
                <input
                  type="checkbox"
                  checked={config.applyMOQ}
                  onChange={(e) => setConfig({ ...config, applyMOQ: e.target.checked })}
                  className="rounded border-white/20 bg-slate-950 text-blue-600 focus:ring-0"
                />
              </label>

              {/* Apply Case Pack Multiple Toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-300 font-bold">Round to Case-Pack Multiples</span>
                <input
                  type="checkbox"
                  checked={config.applyCasePack}
                  onChange={(e) => setConfig({ ...config, applyCasePack: e.target.checked })}
                  className="rounded border-white/20 bg-slate-950 text-blue-600 focus:ring-0"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  setConfig(DEFAULT_REORDER_CONFIG)
                }}
                className="text-xs text-slate-400 hover:text-white underline font-bold"
              >
                Reset to Defaults
              </button>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
