import { useState, useEffect, useMemo } from 'react'
import {
  ShieldAlert,
  Search,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  X,
  Filter,
  ArrowUpDown,
  ShoppingBag,
  DollarSign,
  AlertOctagon,
  Eye,
  Info,
  Calendar,
  Truck,
  RotateCcw,
  FileSpreadsheet
} from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../lib/RegionContext'
import type {
  SKUIntelligenceItem,
  SKUClassification,
  SKURecommendedAction,
  StockoutRisk,
  VelocityTrend
} from '../types'
import { LoadingScreen } from '../components/shared/LoadingScreen'

type QuickViewType = 'all' | 'restock_priority' | 'oos_analysis' | 'listing_issues' | 'slow_excess'

export default function SKUIntelligencePage() {
  const { region } = useRegion()
  const [data, setData] = useState<SKUIntelligenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quick View Tabs
  const [activeTab, setActiveTab] = useState<QuickViewType>('all')

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClassification, setSelectedClassification] = useState<string>('all')
  const [selectedListingStatus, setSelectedListingStatus] = useState<string>('all')
  const [selectedInventoryStatus, setSelectedInventoryStatus] = useState<string>('all')
  const [selectedSalesHistory, setSelectedSalesHistory] = useState<string>('all')
  const [selectedAction, setSelectedAction] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStockoutRisk, setSelectedStockoutRisk] = useState<string>('all')

  // Sorting
  const [sortKey, setSortKey] = useState<keyof SKUIntelligenceItem>('sales_120d')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Drawer modal for deep-dive
  const [selectedSKU, setSelectedSKU] = useState<SKUIntelligenceItem | null>(null)

  // Fetch Data
  const fetchData = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const items = await api.getSKUIntelligence(forceRefresh)
      setData(items)
    } catch (err: any) {
      console.error('Error fetching SKU Intelligence:', err)
      setError(err?.message || 'Failed to load SKU intelligence data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [region])

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>()
    data.forEach(item => {
      if (item.category) set.add(item.category)
      if (item.product_category) set.add(item.product_category)
    })
    return Array.from(set).filter(Boolean).sort()
  }, [data])

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalSKUs = data.length
    const activeSKUs = data.filter(d => d.listing_status === 'Active').length
    const inactiveSKUs = data.filter(d => d.listing_status === 'Inactive').length
    const activeOOS = data.filter(d => d.listing_status === 'Active' && d.total_available === 0).length
    const activeOOS120dSales = data.filter(
      d => d.listing_status === 'Active' && d.total_available === 0 && d.sales_120d > 0
    ).length
    const activeOOSNoSales = data.filter(
      d => d.listing_status === 'Active' && d.total_available === 0 && d.sales_120d === 0
    ).length
    const activeLowStock = data.filter(
      d => d.sku_classification === 'Active + Low Stock'
    ).length
    const inactiveWithStock = data.filter(
      d => d.listing_status === 'Inactive' && d.total_available > 0
    ).length
    const investigateNeeded = data.filter(
      d => d.recommended_action === 'INVESTIGATE LISTING' || d.sku_classification === 'Unknown Status / Stale Data'
    ).length
    const totalAvailableUnits = data.reduce((acc, curr) => acc + (curr.total_available || 0), 0)
    const totalReplenishmentUnits = data.reduce((acc, curr) => acc + (curr.pending_qty_to_reorder || 0), 0)

    return {
      totalSKUs,
      activeSKUs,
      inactiveSKUs,
      activeOOS,
      activeOOS120dSales,
      activeOOSNoSales,
      activeLowStock,
      inactiveWithStock,
      investigateNeeded,
      totalAvailableUnits,
      totalReplenishmentUnits
    }
  }, [data])

  // Tab Filtering Logic
  const tabFilteredData = useMemo(() => {
    switch (activeTab) {
      case 'restock_priority':
        // Active OOS with recent sales + Active Low Stock
        return data.filter(
          d =>
            (d.sku_classification === 'Active + OOS + Sold in Last 120 Days' ||
              d.sku_classification === 'Active + Low Stock') &&
            d.pending_qty_to_reorder > 0
        )
      case 'oos_analysis':
        // All Out of Stock SKUs
        return data.filter(d => d.total_available === 0)
      case 'listing_issues':
        // Inactive with stock, suppressed, or unknown
        return data.filter(
          d =>
            (d.listing_status === 'Inactive' && d.total_available > 0) ||
            d.listing_status === 'Unknown' ||
            d.recommended_action === 'INVESTIGATE LISTING' ||
            d.sku_classification === 'Unknown Status / Stale Data'
        )
      case 'slow_excess':
        // In stock with declining or no sales or high coverage
        return data.filter(
          d =>
            d.total_available > 0 &&
            (d.sales_120d === 0 || d.velocity_trend === 'Declining' || (d.days_of_cover !== null && d.days_of_cover > 60))
        )
      case 'all':
      default:
        return data
    }
  }, [data, activeTab])

  // Multi-Filter & Search Logic
  const filteredData = useMemo(() => {
    return tabFilteredData.filter(item => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchSku = item.sku.toLowerCase().includes(q)
        const matchName = item.name.toLowerCase().includes(q)
        const matchAsin = item.asin ? item.asin.toLowerCase().includes(q) : false
        const matchFnsku = item.fnsku ? item.fnsku.toLowerCase().includes(q) : false
        const matchCat = (item.category || '').toLowerCase().includes(q) || (item.product_category || '').toLowerCase().includes(q)
        if (!matchSku && !matchName && !matchAsin && !matchFnsku && !matchCat) return false
      }

      // Classification
      if (selectedClassification !== 'all' && item.sku_classification !== selectedClassification) {
        return false
      }

      // Listing Status
      if (selectedListingStatus !== 'all' && item.listing_status !== selectedListingStatus) {
        return false
      }

      // Inventory Status
      if (selectedInventoryStatus !== 'all' && item.inventory_status !== selectedInventoryStatus) {
        return false
      }

      // Sales History
      if (selectedSalesHistory !== 'all' && item.sales_history_status !== selectedSalesHistory) {
        return false
      }

      // Recommended Action
      if (selectedAction !== 'all' && item.recommended_action !== selectedAction) {
        return false
      }

      // Category
      if (selectedCategory !== 'all') {
        const cat = item.category || item.product_category || ''
        if (cat !== selectedCategory) return false
      }

      // Stockout Risk
      if (selectedStockoutRisk !== 'all' && item.stockout_risk !== selectedStockoutRisk) {
        return false
      }

      return true
    })
  }, [
    tabFilteredData,
    searchQuery,
    selectedClassification,
    selectedListingStatus,
    selectedInventoryStatus,
    selectedSalesHistory,
    selectedAction,
    selectedCategory,
    selectedStockoutRisk
  ])

  // Sorting
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortKey]
      let bVal = b[sortKey]

      if (aVal === null || aVal === undefined) return sortDir === 'asc' ? -1 : 1
      if (bVal === null || bVal === undefined) return sortDir === 'asc' ? 1 : -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
  }, [filteredData, sortKey, sortDir])

  const handleSort = (key: keyof SKUIntelligenceItem) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Quick Card Click Filter Helper
  const applyCardFilter = (type: string) => {
    // Reset other filters
    setSelectedClassification('all')
    setSelectedListingStatus('all')
    setSelectedInventoryStatus('all')
    setSelectedSalesHistory('all')
    setSelectedAction('all')
    setSelectedCategory('all')
    setSelectedStockoutRisk('all')
    setSearchQuery('')

    switch (type) {
      case 'active':
        setActiveTab('all')
        setSelectedListingStatus('Active')
        break
      case 'inactive':
        setActiveTab('all')
        setSelectedListingStatus('Inactive')
        break
      case 'active_oos':
        setActiveTab('all')
        setSelectedListingStatus('Active')
        setSelectedInventoryStatus('Out of Stock')
        break
      case 'active_oos_120d':
        setActiveTab('all')
        setSelectedClassification('Active + OOS + Sold in Last 120 Days')
        break
      case 'active_oos_no_sales':
        setActiveTab('all')
        setSelectedClassification('Active + OOS + No Sales in Last 120 Days')
        break
      case 'active_low_stock':
        setActiveTab('all')
        setSelectedClassification('Active + Low Stock')
        break
      case 'inactive_stock':
        setActiveTab('listing_issues')
        setSelectedClassification('Inactive + In Stock')
        break
      case 'investigate':
        setActiveTab('listing_issues')
        setSelectedAction('INVESTIGATE LISTING')
        break
      default:
        setActiveTab('all')
        break
    }
  }

  const resetAllFilters = () => {
    setActiveTab('all')
    setSearchQuery('')
    setSelectedClassification('all')
    setSelectedListingStatus('all')
    setSelectedInventoryStatus('all')
    setSelectedSalesHistory('all')
    setSelectedAction('all')
    setSelectedCategory('all')
    setSelectedStockoutRisk('all')
  }

  const isAnyFilterActive =
    activeTab !== 'all' ||
    searchQuery.trim() !== '' ||
    selectedClassification !== 'all' ||
    selectedListingStatus !== 'all' ||
    selectedInventoryStatus !== 'all' ||
    selectedSalesHistory !== 'all' ||
    selectedAction !== 'all' ||
    selectedCategory !== 'all' ||
    selectedStockoutRisk !== 'all'

  // CSV Export
  const exportToCSV = () => {
    if (!sortedData.length) return

    const headers = [
      'SKU',
      'Product Name',
      'ASIN',
      'FNSKU',
      'Category',
      'Listing Status',
      'Amazon Active',
      'Noon Active',
      'Minutes Active',
      'Inventory Status',
      'SKU Classification',
      'Total Available',
      'FBA Available',
      'FBA Reserved',
      'FBA Inbound',
      'FBN Available',
      'Minutes Available',
      'Locad Available',
      'Total Inbound',
      'Units Sold 30d',
      'Units Sold 120d',
      'Revenue 120d AED',
      'Last Sale Date',
      'Days Since Last Sale',
      'ADS 30d',
      'ADS 120d',
      'Days of Cover',
      'Stockout Risk',
      'Estimated Stockout Date',
      'Velocity Trend',
      'Supplier Lead Time Days',
      'MOQ',
      'Already Ordered (PO)',
      'Suggested Reorder Qty',
      'Pending Qty To Reorder',
      'Recommended Action',
      'Recommendation Reason',
      'Last Inventory Sync'
    ]

    const rows = sortedData.map(item => [
      `"${item.sku.replace(/"/g, '""')}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.asin || ''}"`,
      `"${item.fnsku || ''}"`,
      `"${item.category || item.product_category || ''}"`,
      item.listing_status,
      item.amazon_active ? 'Yes' : 'No',
      item.noon_active ? 'Yes' : 'No',
      item.minutes_active ? 'Yes' : 'No',
      item.inventory_status,
      `"${item.sku_classification}"`,
      item.total_available,
      item.fba_available,
      item.fba_reserved,
      item.fba_inbound,
      item.fbn_available,
      item.minutes_available,
      item.locad_available,
      item.total_inbound,
      item.sales_30d,
      item.sales_120d,
      item.revenue_120d.toFixed(2),
      item.last_sale_date || 'None',
      item.days_since_last_sale !== null ? item.days_since_last_sale : 'N/A',
      item.ads_30d.toFixed(2),
      item.ads_120d.toFixed(2),
      item.days_of_cover !== null ? item.days_of_cover.toFixed(1) : 'N/A',
      item.stockout_risk,
      item.estimated_stockout_date,
      item.velocity_trend,
      item.lead_time_days,
      item.moq,
      item.already_ordered,
      item.suggested_reorder_qty,
      item.pending_qty_to_reorder,
      item.recommended_action,
      `"${(item.recommendation_reason || '').replace(/"/g, '""')}"`,
      item.last_inventory_sync || ''
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `SADDL_SKU_Intelligence_${region}_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Render Action Badge Helper
  const renderActionBadge = (action: SKURecommendedAction) => {
    switch (action) {
      case 'REORDER NOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse shadow-sm shadow-rose-950/40">
            <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
            REORDER NOW
          </span>
        )
      case 'REORDER SOON':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            REORDER SOON
          </span>
        )
      case 'MONITOR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            MONITOR
          </span>
        )
      case 'INVESTIGATE LISTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/35">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            INVESTIGATE
          </span>
        )
      case 'RESTOCK ONLY IF APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            RESTOCK IF APPROVED
          </span>
        )
      case 'DO NOT REORDER YET':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700/50">
            <Minus className="w-3.5 h-3.5 shrink-0" />
            DO NOT REORDER
          </span>
        )
    }
  }

  // Render Classification Badge Helper
  const renderClassificationBadge = (classification: SKUClassification) => {
    switch (classification) {
      case 'Active + In Stock':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Active · In Stock
          </span>
        )
      case 'Active + Low Stock':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/25">
            Active · Low Stock
          </span>
        )
      case 'Active + OOS + Sold in Last 120 Days':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm shadow-rose-950/30">
            Active OOS · 120d Seller
          </span>
        )
      case 'Active + OOS + No Sales in Last 120 Days':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-800/80 text-slate-400 border border-slate-700">
            Active OOS · No Recent Sales
          </span>
        )
      case 'Active + No Sales History':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
            Active · No Sales History
          </span>
        )
      case 'Inactive + In Stock':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
            Inactive · Stranded Stock!
          </span>
        )
      case 'Inactive + OOS':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-900 text-slate-500 border border-slate-800">
            Inactive · OOS
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-zinc-800 text-zinc-400">
            {classification}
          </span>
        )
    }
  }

  // Render Velocity Trend Badge
  const renderVelocityBadge = (trend: VelocityTrend) => {
    switch (trend) {
      case 'Increasing':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" /> ↗ Growing
          </span>
        )
      case 'Stable':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400">
            <Minus className="w-3.5 h-3.5" /> → Stable
          </span>
        )
      case 'Declining':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <TrendingDown className="w-3.5 h-3.5" /> ↘ Declining
          </span>
        )
      case 'No Sales':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Minus className="w-3.5 h-3.5" /> — No Sales
          </span>
        )
    }
  }

  if (loading) {
    return <LoadingScreen message="Analyzing SKU Listings, Inventory & Reorder Intelligence..." />
  }

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900/90 via-[#0b1329]/80 to-slate-900/90 p-5 rounded-2xl border border-white/[0.08] shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Futuristic accent background glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 right-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 via-amber-500 to-indigo-600 p-[1.5px] shadow-lg shadow-rose-500/10 shrink-0">
            <div className="w-full h-full bg-[#080d1f] rounded-[10px] flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-rose-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                SKU Intelligence <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 uppercase tracking-widest font-bold">OOS & Reorder Matrix</span>
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 font-mono font-bold">
                {region}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Distinguish active vs inactive listings, isolate 120-day OOS sellers, detect stranded stock, and evaluate replenishment recommendations based on actual demand, lead time, MOQ, and pending purchase orders.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            title="Refresh SKU Intelligence Engine"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : 'text-slate-300'}`} />
            {refreshing ? 'Computing...' : 'Refresh'}
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 transition-all hover:scale-105 active:scale-95"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV ({sortedData.length})
          </button>

          <a
            href="/SADDL_UAE_SKU_Intelligence_OOS_Breakdown.xlsx"
            download={`SADDL_${region}_SKU_Intelligence_OOS_Breakdown.xlsx`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
            title="Download formatted multi-tab Excel workbook (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel (.xlsx)
          </a>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-3 text-xs">
          <AlertOctagon className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Interactive KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total SKUs */}
        <div
          onClick={() => applyCardFilter('all')}
          className="bg-slate-900/60 hover:bg-slate-800/80 border border-white/[0.06] hover:border-white/20 p-3.5 rounded-xl cursor-pointer transition-all duration-200 group shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Total Catalog</span>
            <Package className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-black text-white">{metrics.totalSKUs}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Active: {metrics.activeSKUs}</span>
            <span>Inactive: {metrics.inactiveSKUs}</span>
          </div>
        </div>

        {/* Priority 1: Active OOS with 120d Sales */}
        <div
          onClick={() => applyCardFilter('active_oos_120d')}
          className="bg-gradient-to-b from-rose-950/40 to-slate-900/80 hover:from-rose-950/60 hover:to-slate-900 border border-rose-500/30 hover:border-rose-400 p-3.5 rounded-xl cursor-pointer transition-all duration-200 group shadow-lg shadow-rose-950/30 relative overflow-hidden"
        >
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-400 animate-ping" />
          <div className="flex items-center justify-between text-rose-300 text-[11px] font-black uppercase tracking-wider mb-1">
            <span>OOS · Sold in 120d</span>
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-black text-rose-400">{metrics.activeOOS120dSales}</div>
          <div className="text-[10px] text-rose-400/80 font-semibold mt-1">
            Urgent Restock Candidates
          </div>
        </div>

        {/* Active Low Stock */}
        <div
          onClick={() => applyCardFilter('active_low_stock')}
          className="bg-slate-900/60 hover:bg-slate-800/80 border border-amber-500/20 hover:border-amber-400/40 p-3.5 rounded-xl cursor-pointer transition-all duration-200 group shadow-lg"
        >
          <div className="flex items-center justify-between text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Active Low Stock</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black text-amber-400">{metrics.activeLowStock}</div>
          <div className="text-[10px] text-amber-500/80 mt-1">Coverage &lt; 21 Days</div>
        </div>

        {/* Active OOS with No Recent Sales */}
        <div
          onClick={() => applyCardFilter('active_oos_no_sales')}
          className="bg-slate-900/60 hover:bg-slate-800/80 border border-white/[0.06] hover:border-white/20 p-3.5 rounded-xl cursor-pointer transition-all duration-200 group shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>OOS · No 120d Sales</span>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-200">{metrics.activeOOSNoSales}</div>
          <div className="text-[10px] text-slate-500 mt-1">Investigate Before PO</div>
        </div>

        {/* Inactive with Stock (Stranded Alert!) */}
        <div
          onClick={() => applyCardFilter('inactive_stock')}
          className="bg-slate-900/60 hover:bg-slate-800/80 border border-purple-500/20 hover:border-purple-400/40 p-3.5 rounded-xl cursor-pointer transition-all duration-200 group shadow-lg"
        >
          <div className="flex items-center justify-between text-purple-300 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Inactive w/ Stock</span>
            <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-black text-purple-400">{metrics.inactiveWithStock}</div>
          <div className="text-[10px] text-purple-400/80 mt-1">Stranded Inventory</div>
        </div>

        {/* Units Needed to Replenish */}
        <div className="bg-slate-900/60 border border-blue-500/20 p-3.5 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-blue-300 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Reorder Demand</span>
            <Truck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-black text-blue-400">
            {metrics.totalReplenishmentUnits.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Units (Net After PO)</div>
        </div>
      </div>

      {/* 3. Recommended Quick-Action Views (Tabs) */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 gap-2 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>All Catalog</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{data.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('restock_priority')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'restock_priority'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                : 'bg-white/5 text-rose-300 hover:text-white hover:bg-rose-500/20'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            <span>View 1: Restock Priority</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-900/60 text-rose-200">
              {data.filter(d => (d.sku_classification === 'Active + OOS + Sold in Last 120 Days' || d.sku_classification === 'Active + Low Stock') && d.pending_qty_to_reorder > 0).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('oos_analysis')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'oos_analysis'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>View 2: OOS Analysis</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {data.filter(d => d.total_available === 0).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('listing_issues')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'listing_issues'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
            <span>View 3: Listing Issues</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {data.filter(d => (d.listing_status === 'Inactive' && d.total_available > 0) || d.listing_status === 'Unknown' || d.recommended_action === 'INVESTIGATE LISTING').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('slow_excess')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'slow_excess'
                ? 'bg-slate-700 text-white'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>View 4: Slow Movers & Excess</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {data.filter(d => d.total_available > 0 && (d.sales_120d === 0 || d.velocity_trend === 'Declining' || (d.days_of_cover !== null && d.days_of_cover > 60))).length}
            </span>
          </button>
        </div>

        {isAnyFilterActive && (
          <button
            onClick={resetAllFilters}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Filters
          </button>
        )}
      </div>

      {/* 4. Multi-Facet Filter Bar */}
      <div className="bg-slate-900/70 border border-white/[0.06] rounded-xl p-3.5 backdrop-blur-md space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search SKU, name, ASIN, FNSKU..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Classification Filter */}
          <div>
            <select
              value={selectedClassification}
              onChange={e => setSelectedClassification(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/80 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All SKU Classifications</option>
              <option value="Active + In Stock">Active + In Stock</option>
              <option value="Active + Low Stock">Active + Low Stock</option>
              <option value="Active + OOS + Sold in Last 120 Days">Active + OOS + Sold in Last 120 Days</option>
              <option value="Active + OOS + No Sales in Last 120 Days">Active + OOS + No Sales in Last 120 Days</option>
              <option value="Active + No Sales History">Active + No Sales History</option>
              <option value="Inactive + In Stock">Inactive + In Stock (Stranded)</option>
              <option value="Inactive + OOS">Inactive + OOS</option>
              <option value="Unknown Status / Stale Data">Unknown Status / Stale Data</option>
            </select>
          </div>

          {/* Recommended Action Filter */}
          <div>
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/80 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Recommended Actions</option>
              <option value="REORDER NOW">REORDER NOW</option>
              <option value="REORDER SOON">REORDER SOON</option>
              <option value="MONITOR">MONITOR</option>
              <option value="INVESTIGATE LISTING">INVESTIGATE LISTING</option>
              <option value="RESTOCK ONLY IF APPROVED">RESTOCK ONLY IF APPROVED</option>
              <option value="DO NOT REORDER YET">DO NOT REORDER YET</option>
            </select>
          </div>

          {/* Product Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/80 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Filter Chips Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.04] text-xs text-slate-400">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filters:</span>

          {/* Listing Status */}
          <div className="flex items-center bg-slate-950/60 rounded-md border border-white/5 p-0.5">
            {['all', 'Active', 'Inactive'].map(s => (
              <button
                key={s}
                onClick={() => setSelectedListingStatus(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedListingStatus === s ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All Listings' : s}
              </button>
            ))}
          </div>

          {/* Inventory Status */}
          <div className="flex items-center bg-slate-950/60 rounded-md border border-white/5 p-0.5">
            {['all', 'In Stock', 'Low Stock', 'Out of Stock'].map(s => (
              <button
                key={s}
                onClick={() => setSelectedInventoryStatus(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedInventoryStatus === s ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All Stock' : s}
              </button>
            ))}
          </div>

          {/* Sales History */}
          <div className="flex items-center bg-slate-950/60 rounded-md border border-white/5 p-0.5">
            {[
              { id: 'all', label: 'All Sales' },
              { id: 'Sold in Last 120 Days', label: '120d Sellers' },
              { id: 'Previously Sold (>120d ago)', label: '>120d Sellers' },
              { id: 'Never Sold', label: 'Never Sold' }
            ].map(h => (
              <button
                key={h.id}
                onClick={() => setSelectedSalesHistory(h.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedSalesHistory === h.id ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* Showing count indicator */}
          <div className="ml-auto text-xs text-slate-400 font-medium">
            Showing <span className="font-bold text-white">{sortedData.length}</span> of {data.length} SKUs
          </div>
        </div>
      </div>

      {/* 5. Actionable SKU Table */}
      <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-white/[0.08] text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5 cursor-pointer hover:text-white" onClick={() => handleSort('sku')}>
                  <div className="flex items-center gap-1.5">
                    <span>SKU & Product Name</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('listing_status')}>
                  <div className="flex items-center gap-1.5">
                    <span>Listing Status</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('sku_classification')}>
                  <div className="flex items-center gap-1.5">
                    <span>Classification</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort('total_available')}>
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Available Stock</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">
                  <span>Reserved / Inbound</span>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort('sales_30d')}>
                  <div className="flex items-center justify-end gap-1.5">
                    <span>30d Sales</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort('sales_120d')}>
                  <div className="flex items-center justify-end gap-1.5">
                    <span>120d Sales</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort('days_of_cover')}>
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Coverage</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort('days_since_last_sale')}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Last Sale</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 text-right">
                  <span>In Pipeline (PO)</span>
                </th>
                <th className="py-3 px-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort('pending_qty_to_reorder')}>
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Reorder Qty</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3.5 text-center">
                  <span>Recommended Action</span>
                </th>
                <th className="py-3 px-2 text-center">
                  <span>Audit</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm font-semibold">No SKUs matching the current filter criteria</p>
                    <button
                      onClick={resetAllFilters}
                      className="mt-2 text-xs text-blue-400 hover:underline"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                sortedData.map(item => {
                  const isUrgentOOS = item.sku_classification === 'Active + OOS + Sold in Last 120 Days'
                  const isStranded = item.sku_classification === 'Inactive + In Stock'
                  const isLowStock = item.sku_classification === 'Active + Low Stock'

                  return (
                    <tr
                      key={item.sku}
                      className={`hover:bg-white/[0.03] transition-colors group ${
                        isUrgentOOS
                          ? 'bg-rose-950/15 border-l-2 border-l-rose-500'
                          : isStranded
                          ? 'bg-purple-950/15 border-l-2 border-l-purple-500'
                          : isLowStock
                          ? 'bg-amber-950/10 border-l-2 border-l-amber-500'
                          : ''
                      }`}
                    >
                      {/* SKU & Name */}
                      <td className="py-3 px-3.5 max-w-[280px]">
                        <div className="flex items-baseline gap-2">
                          <span
                            onClick={() => setSelectedSKU(item)}
                            className="font-mono font-bold text-white hover:text-blue-400 cursor-pointer hover:underline truncate"
                            title={item.sku}
                          >
                            {item.sku}
                          </span>
                          {item.asin && (
                            <span className="text-[9px] px-1 rounded bg-white/5 text-slate-400 font-mono">
                              {item.asin}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5" title={item.name}>
                          {item.name}
                        </div>
                        {item.category && (
                          <div className="text-[9px] text-slate-500 uppercase font-semibold mt-0.5">
                            {item.category}
                          </div>
                        )}
                      </td>

                      {/* Listing Status & Channels */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit ${
                              item.listing_status === 'Active'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : item.listing_status === 'Inactive'
                                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {item.listing_status}
                          </span>
                          <div className="flex items-center gap-1 text-[9px] text-slate-500">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.amazon_active ? 'bg-emerald-400' : 'bg-slate-700'
                              }`}
                              title={item.amazon_active ? 'Amazon Listing Active' : 'Amazon Inactive'}
                            />
                            <span>AMZ</span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full ml-1 ${
                                item.noon_active ? 'bg-emerald-400' : 'bg-slate-700'
                              }`}
                              title={item.noon_active ? 'Noon Listing Active' : 'Noon Inactive'}
                            />
                            <span>NOON</span>
                          </div>
                        </div>
                      </td>

                      {/* Classification Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderClassificationBadge(item.sku_classification)}
                      </td>

                      {/* Available Stock */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div
                          className={`text-sm font-black font-mono ${
                            item.total_available === 0
                              ? 'text-rose-400'
                              : item.total_available < 15
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {item.total_available.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          FBA: {item.fba_available} | FBN: {item.fbn_available}
                        </div>
                      </td>

                      {/* Reserved / Inbound */}
                      <td className="py-3 px-3 text-center whitespace-nowrap text-slate-400 font-mono">
                        <div>
                          <span className="text-slate-300 font-semibold">{item.total_reserved}</span> res
                        </div>
                        <div className="text-[10px] text-slate-500">
                          <span className="text-blue-400 font-semibold">{item.total_inbound}</span> inb
                        </div>
                      </td>

                      {/* 30d Sales */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                        <div className="font-bold text-white">{item.sales_30d}</div>
                        <div className="text-[10px] text-slate-500">ADS: {item.ads_30d.toFixed(1)}/d</div>
                      </td>

                      {/* 120d Sales & Revenue */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                        <div className="font-black text-white">{item.sales_120d}</div>
                        <div className="text-[10px] text-emerald-400/90 font-semibold">
                          AED {item.revenue_120d.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </td>

                      {/* Coverage Days */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                        {item.days_of_cover === null ? (
                          <span className="text-slate-500 text-[11px]">N/A</span>
                        ) : (
                          <div
                            className={`font-black ${
                              item.days_of_cover === 0
                                ? 'text-rose-400'
                                : item.days_of_cover < 14
                                ? 'text-amber-400'
                                : 'text-blue-400'
                            }`}
                          >
                            {item.days_of_cover.toFixed(1)} d
                          </div>
                        )}
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          {renderVelocityBadge(item.velocity_trend)}
                        </div>
                      </td>

                      {/* Last Sale Date */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {item.last_sale_date ? (
                          <>
                            <div className="text-slate-300 font-medium">{item.last_sale_date}</div>
                            <div className="text-[10px] text-slate-500">
                              {item.days_since_last_sale !== null ? `${item.days_since_last_sale}d ago` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-600 text-[11px]">Never</span>
                        )}
                      </td>

                      {/* Pending In PO */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                        {item.already_ordered > 0 ? (
                          <div>
                            <span className="font-bold text-blue-400">{item.already_ordered}</span>
                            <div className="text-[9px] text-slate-500">
                              {item.earliest_eta ? `ETA: ${item.earliest_eta}` : 'PO Placed'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Reorder Qty (Net After PO) */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                        {item.pending_qty_to_reorder > 0 ? (
                          <div className="font-black text-rose-400 text-sm">
                            {item.pending_qty_to_reorder.toLocaleString()}
                          </div>
                        ) : (
                          <span className="text-slate-600 font-semibold">0</span>
                        )}
                        {item.moq > 0 && (
                          <div className="text-[9px] text-slate-500">MOQ: {item.moq}</div>
                        )}
                      </td>

                      {/* Recommended Action */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {renderActionBadge(item.recommended_action)}
                      </td>

                      {/* Audit Details Button */}
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <button
                          onClick={() => setSelectedSKU(item)}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title="View Full SKU Reorder & Availability Intelligence Breakdown"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Deep Dive SKU Intelligence Drawer Modal */}
      {selectedSKU && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setSelectedSKU(null)}
          />
          <div className="relative w-full max-w-xl h-full bg-[#080d1f] border-l border-white/10 shadow-2xl p-6 overflow-y-auto custom-scrollbar flex flex-col z-10 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono font-black text-white">{selectedSKU.sku}</span>
                  {selectedSKU.asin && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono border border-blue-500/20">
                      {selectedSKU.asin}
                    </span>
                  )}
                </div>
                <h3 className="text-xs text-slate-300 font-medium mt-1 leading-relaxed">{selectedSKU.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                  {renderClassificationBadge(selectedSKU.sku_classification)}
                  {renderActionBadge(selectedSKU.recommended_action)}
                </div>
              </div>
              <button
                onClick={() => setSelectedSKU(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recommendation Justification Callout */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-900 border border-blue-500/30 mb-6 shadow-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-300 mb-1.5">
                <Info className="w-4 h-4 text-blue-400" />
                <span>Decision Engine Recommendation Justification</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {selectedSKU.recommendation_reason}
              </p>
            </div>

            {/* Section A: Listing & Marketplace Status */}
            <div className="space-y-4 mb-6">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                <span>1. Marketplace Listing Audit</span>
              </h4>
              <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-white/5 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Overall Listing Status</span>
                  <span className="font-bold text-white mt-0.5 block">{selectedSKU.listing_status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Inventory Status</span>
                  <span className="font-bold text-white mt-0.5 block">{selectedSKU.inventory_status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Amazon UAE Listing</span>
                  <span className={`font-semibold mt-0.5 block ${selectedSKU.amazon_active ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {selectedSKU.amazon_active ? 'Active & Eligible' : 'Inactive / Suppressed'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Noon Listing</span>
                  <span className={`font-semibold mt-0.5 block ${selectedSKU.noon_active ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {selectedSKU.noon_active ? 'Active & Eligible' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section B: Inventory Quantities Across Channels */}
            <div className="space-y-4 mb-6">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <span>2. Channel Inventory Breakdown</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-500 block text-[10px] font-bold">FBA Available</span>
                  <span className="text-base font-black text-white font-mono mt-1 block">{selectedSKU.fba_available}</span>
                  <span className="text-[9px] text-slate-500 font-mono">Res: {selectedSKU.fba_reserved}</span>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-500 block text-[10px] font-bold">FBN (Noon)</span>
                  <span className="text-base font-black text-white font-mono mt-1 block">{selectedSKU.fbn_available}</span>
                  <span className="text-[9px] text-slate-500 font-mono">Min: {selectedSKU.minutes_available}</span>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-500 block text-[10px] font-bold">Locad Warehouse</span>
                  <span className="text-base font-black text-white font-mono mt-1 block">{selectedSKU.locad_available}</span>
                  <span className="text-[9px] text-slate-500 font-mono">{selectedSKU.locad_boxes} boxes</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-white/[0.08] flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Total Sellable Available</span>
                  <span className="text-lg font-black text-emerald-400">{selectedSKU.total_available} units</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Total Inbound Pipeline</span>
                  <span className="text-base font-bold text-blue-400">{selectedSKU.total_inbound} units</span>
                </div>
              </div>
            </div>

            {/* Section C: Historical Demand & Sales Analysis (Last 120 Days) */}
            <div className="space-y-4 mb-6">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span>3. Multi-Window Demand & Velocity (120 Days)</span>
              </h4>
              <div className="grid grid-cols-4 gap-2 text-xs text-center font-mono">
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-500 block">7 Days</span>
                  <span className="font-bold text-white text-sm">{selectedSKU.sales_7d}</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-500 block">30 Days</span>
                  <span className="font-bold text-white text-sm">{selectedSKU.sales_30d}</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-500 block">60 Days</span>
                  <span className="font-bold text-white text-sm">{selectedSKU.sales_60d}</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-500 block">120 Days</span>
                  <span className="font-bold text-white text-sm">{selectedSKU.sales_120d}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-white/5 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">120d Revenue</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    AED {selectedSKU.revenue_120d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Days of Cover</span>
                  <span className="font-bold text-white text-sm">
                    {selectedSKU.days_of_cover !== null ? `${selectedSKU.days_of_cover.toFixed(1)} Days` : 'N/A (No sales)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Last Transaction Date</span>
                  <span className="font-medium text-slate-300">
                    {selectedSKU.last_sale_date || 'No recorded orders'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Velocity Trend</span>
                  <span className="mt-0.5 block">{renderVelocityBadge(selectedSKU.velocity_trend)}</span>
                </div>
              </div>
            </div>

            {/* Section D: Reorder Mathematics & PO Offset */}
            <div className="space-y-4 mb-6">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-blue-400" />
                <span>4. Reorder Calculation & Purchase Pipeline</span>
              </h4>
              <div className="bg-slate-950 p-4 rounded-xl border border-white/10 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Supplier Lead Time:</span>
                  <span className="text-white font-bold">{selectedSKU.lead_time_days} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Minimum Order Quantity (MOQ):</span>
                  <span className="text-white font-bold">{selectedSKU.moq} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estimated Gross Reorder Needed:</span>
                  <span className="text-white font-bold">{selectedSKU.suggested_reorder_qty} units</span>
                </div>
                <div className="flex justify-between text-blue-400">
                  <span>Already Ordered (Pending PO Pipeline):</span>
                  <span className="font-bold">-{selectedSKU.already_ordered} units</span>
                </div>
                <div className="h-[1px] bg-white/10 my-1" />
                <div className="flex justify-between text-sm">
                  <span className="text-rose-400 font-bold">Net Reorder Required:</span>
                  <span className="text-rose-400 font-black">{selectedSKU.pending_qty_to_reorder} units</span>
                </div>
              </div>
            </div>

            {/* Footer Close */}
            <div className="mt-auto pt-4 border-t border-white/[0.08] flex justify-between items-center text-[10px] text-slate-500">
              <span>Last Sync: {selectedSKU.last_inventory_sync || 'Live Fact Engine'}</span>
              <button
                onClick={() => setSelectedSKU(null)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
