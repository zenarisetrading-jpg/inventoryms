import React, { useState, useEffect, useMemo } from 'react'
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
  ChevronDown,
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
  FileSpreadsheet,
  Check,
  UserCheck,
  Building,
  Store,
  Warehouse,
  History,
  ClipboardCheck,
  SlidersHorizontal,
  BookmarkCheck,
  AlertCircle
} from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../lib/RegionContext'
import type {
  SKUIntelligenceItem,
  SKURecommendedAction,
  SKUReviewDecision,
  StockoutRisk,
  VelocityTrend
} from '../types'
import { LoadingScreen } from '../components/shared/LoadingScreen'

type QuickTab =
  | 'all'
  | 'restock_candidates'
  | 'review_discontinuation'
  | 'amazon_oos'
  | 'noon_oos'
  | 'both_oos'
  | 'listing_issues'
  | 'slow_movers'

export default function SKUIntelligencePage() {
  const { region } = useRegion()
  const [data, setData] = useState<SKUIntelligenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Navigation tab
  const [activeTab, setActiveTab] = useState<QuickTab>('all')

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedAction, setSelectedAction] = useState<string>('all')
  const [selectedReviewStatus, setSelectedReviewStatus] = useState<string>('all')
  const [selectedMarketplaceFilter, setSelectedMarketplaceFilter] = useState<string>('all')

  // Sorting
  const [sortKey, setSortKey] = useState<keyof SKUIntelligenceItem>('sales_120d')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Expanded rows for marketplace deep-dive
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Review Modal state
  const [reviewModalSKU, setReviewModalSKU] = useState<SKUIntelligenceItem | null>(null)
  const [reviewDecision, setReviewDecision] = useState<SKUReviewDecision>('Keep Active')
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewerEmail, setReviewerEmail] = useState(
    localStorage.getItem('reviewer_email') || 'inventory.analyst@zenarise.org'
  )
  const [savingReview, setSavingReview] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)

  // Fetch live data
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

  // Toggle row expansion
  const toggleRow = (sku: string) => {
    setExpandedRows(prev => ({ ...prev, [sku]: !prev[sku] }))
  }

  // Categories list for filter dropdown
  const categories = useMemo(() => {
    const set = new Set<string>()
    data.forEach(item => {
      if (item.category) set.add(item.category)
      if (item.product_category) set.add(item.product_category)
    })
    return Array.from(set).filter(Boolean).sort()
  }, [data])

  // 10 Summary KPI Metrics
  const metrics = useMemo(() => {
    const totalCatalog = data.length
    const activeSKUs = data.filter(d => d.is_active)
    const inactiveSKUs = data.filter(d => !d.is_active)

    const activeAmazonListings = data.filter(d => d.is_active && d.amazon_listing_status === 'Active').length
    const activeNoonListings = data.filter(d => d.is_active && d.noon_listing_status === 'Active').length

    const amazonOOS = activeSKUs.filter(d => d.fba_available === 0).length
    const noonOOS = activeSKUs.filter(d => d.noon_available === 0).length
    const bothOOS = activeSKUs.filter(d => d.fba_available === 0 && d.noon_available === 0).length

    const noSales120d = activeSKUs.filter(d => d.sales_120d === 0).length

    // Discontinuation review candidates: Active, OOS on both or evaluated channel with 0 sales in 120d
    const reviewDiscontinuation = data.filter(
      d => d.recommended_action === 'REVIEW FOR DISCONTINUATION'
    ).length

    // Replenishment candidates: Active with verified recent demand needing stock
    const replenishmentCandidates = data.filter(
      d => d.recommended_action === 'REORDER NOW' || d.recommended_action === 'REORDER SOON'
    ).length

    // Inactive listings with remaining inventory
    const inactiveWithStock = inactiveSKUs.filter(d => d.total_available > 0).length

    return {
      totalCatalog,
      activeSKUsCount: activeSKUs.length,
      inactiveSKUsCount: inactiveSKUs.length,
      activeAmazonListings,
      activeNoonListings,
      amazonOOS,
      noonOOS,
      bothOOS,
      noSales120d,
      reviewDiscontinuation,
      replenishmentCandidates,
      inactiveWithStock
    }
  }, [data])

  // Filtered and Sorted Data
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // 1. Navigation Tab Filter
      if (activeTab === 'restock_candidates') {
        if (item.recommended_action !== 'REORDER NOW' && item.recommended_action !== 'REORDER SOON') {
          return false
        }
      } else if (activeTab === 'review_discontinuation') {
        if (item.recommended_action !== 'REVIEW FOR DISCONTINUATION') {
          return false
        }
      } else if (activeTab === 'amazon_oos') {
        if (!item.is_active || item.fba_available > 0) return false
      } else if (activeTab === 'noon_oos') {
        if (!item.is_active || item.noon_available > 0) return false
      } else if (activeTab === 'both_oos') {
        if (!item.is_active || item.fba_available > 0 || item.noon_available > 0) return false
      } else if (activeTab === 'listing_issues') {
        if (item.recommended_action !== 'FIX LISTING' && (!(!item.is_active && item.total_available > 0))) {
          return false
        }
      } else if (activeTab === 'slow_movers') {
        if (item.recommended_action !== 'REVIEW PRODUCT PERFORMANCE' && item.sales_120d > 0) {
          return false
        }
      }

      // 2. Search Query (SKU, Name, ASIN, FNSKU)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesSku = item.sku.toLowerCase().includes(q)
        const matchesName = (item.name || '').toLowerCase().includes(q)
        const matchesAsin = (item.asin || '').toLowerCase().includes(q)
        const matchesFnsku = (item.fnsku || '').toLowerCase().includes(q)
        if (!matchesSku && !matchesName && !matchesAsin && !matchesFnsku) return false
      }

      // 3. Category Filter
      if (selectedCategory !== 'all') {
        if (item.category !== selectedCategory && item.product_category !== selectedCategory) {
          return false
        }
      }

      // 4. Recommendation Action Filter
      if (selectedAction !== 'all') {
        if (item.recommended_action !== selectedAction) return false
      }

      // 5. Review Status Filter
      if (selectedReviewStatus !== 'all') {
        const rev = item.review_decision || 'Pending Review'
        if (rev !== selectedReviewStatus) return false
      }

      // 6. Marketplace Availability Filter
      if (selectedMarketplaceFilter === 'both_available') {
        if (item.fba_available === 0 || item.noon_available === 0) return false
      } else if (selectedMarketplaceFilter === 'amazon_only') {
        if (item.fba_available === 0 || item.noon_available > 0) return false
      } else if (selectedMarketplaceFilter === 'noon_only') {
        if (item.noon_available === 0 || item.fba_available > 0) return false
      } else if (selectedMarketplaceFilter === 'both_oos') {
        if (item.fba_available > 0 || item.noon_available > 0) return false
      }

      return true
    }).sort((a, b) => {
      let valA: any = a[sortKey]
      let valB: any = b[sortKey]

      if (valA === null || valA === undefined) valA = ''
      if (valB === null || valB === undefined) valB = ''

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA
      }

      const strA = String(valA).toLowerCase()
      const strB = String(valB).toLowerCase()
      if (strA < strB) return sortDir === 'asc' ? -1 : 1
      if (strA > strB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [
    data,
    activeTab,
    searchQuery,
    selectedCategory,
    selectedAction,
    selectedReviewStatus,
    selectedMarketplaceFilter,
    sortKey,
    sortDir
  ])

  // Sorting handler
  const handleSort = (key: keyof SKUIntelligenceItem) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Handle Review Modal Submission
  const handleSaveReview = async () => {
    if (!reviewModalSKU) return
    setSavingReview(true)
    setSaveSuccessMsg(null)

    try {
      localStorage.setItem('reviewer_email', reviewerEmail)
      const res = await api.saveSKUReviewDecision(
        reviewModalSKU.sku,
        reviewDecision,
        reviewNotes,
        reviewerEmail,
        'global'
      )

      if (res.success) {
        // Update local state immediately
        setData(prev =>
          prev.map(item =>
            item.sku === reviewModalSKU.sku
              ? {
                  ...item,
                  review_decision: reviewDecision,
                  reviewer_email: reviewerEmail,
                  review_notes: reviewNotes,
                  reviewed_at: new Date().toISOString()
                }
              : item
          )
        )
        setSaveSuccessMsg(`Review recorded: ${reviewDecision}`)
        setTimeout(() => {
          setReviewModalSKU(null)
          setSaveSuccessMsg(null)
        }, 1200)
      } else {
        alert(res.error || 'Failed to save review decision')
      }
    } catch (err: any) {
      console.error('Error saving review decision:', err)
      alert(err?.message || 'Error saving review decision')
    } finally {
      setSavingReview(false)
    }
  }

  // Open Review Modal
  const openReviewModal = (item: SKUIntelligenceItem) => {
    setReviewModalSKU(item)
    setReviewDecision(
      (item.review_decision as SKUReviewDecision) ||
        (item.recommended_action === 'REVIEW FOR DISCONTINUATION'
          ? 'Mark for Discontinuation Review'
          : item.recommended_action === 'REORDER NOW'
          ? 'Approve for Replenishment'
          : 'Keep Active')
    )
    setReviewNotes(item.review_notes || '')
    setSaveSuccessMsg(null)
  }

  // Render badge helper for Recommendation Action
  const renderActionBadge = (action: SKURecommendedAction | string) => {
    switch (action) {
      case 'REORDER NOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            REORDER NOW
          </span>
        )
      case 'REORDER SOON':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            REORDER SOON
          </span>
        )
      case 'REVIEW FOR DISCONTINUATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-red-950/80 text-red-300 border border-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.25)]">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            REVIEW FOR DISCONTINUATION
          </span>
        )
      case 'DO NOT REORDER YET':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-zinc-800 text-zinc-400 border border-zinc-700/60">
            <Minus className="w-3.5 h-3.5 text-zinc-400" />
            DO NOT REORDER YET
          </span>
        )
      case 'REVIEW PRODUCT PERFORMANCE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <TrendingDown className="w-3.5 h-3.5 text-blue-300" />
            REVIEW PERFORMANCE
          </span>
        )
      case 'FIX LISTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <AlertCircle className="w-3.5 h-3.5 text-purple-300" />
            FIX LISTING
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
            {action || 'DATA NEEDS CHECKING'}
          </span>
        )
    }
  }

  // Render badge helper for Review Decision
  const renderReviewBadge = (decision?: string | null) => {
    if (!decision || decision === 'Pending Review') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700">
          <Clock className="w-3 h-3 text-zinc-500" />
          Pending Review
        </span>
      )
    }

    if (decision === 'Approve for Replenishment') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Approved Restock
        </span>
      )
    }

    if (decision === 'Mark for Discontinuation Review') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-950/80 text-rose-300 border border-rose-500/50">
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          Discontinue Review
        </span>
      )
    }

    if (decision === 'Keep Active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40">
          <Check className="w-3 h-3 text-sky-400" />
          Keep Active
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
        <BookmarkCheck className="w-3 h-3 text-indigo-400" />
        {decision}
      </span>
    )
  }

  if (loading && data.length === 0) {
    return <LoadingScreen message="Aggregating Multi-Channel SKU Intelligence..." fullScreen />
  }

  return (
    <div className="w-full space-y-6 px-3 sm:px-6 lg:px-8 max-w-[1920px] mx-auto pb-24 text-zinc-100">
      {/* ------------------------------------------------------------- */}
      {/* 1. HEADER SECTION                                             */}
      {/* ------------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#121622] via-[#0d1017] to-[#0a0d13] border border-white/10 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                  SKU Intelligence
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-widest">
                    OOS & Discontinuation Engine
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                  Verified decision matrix evaluating Amazon FBA, Noon, and Locad warehouse stocks with multi-channel sales history
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/SADDL_UAE_SKU_Intelligence_OOS_Breakdown.xlsx"
              download="SADDL_UAE_SKU_Intelligence_OOS_Breakdown.xlsx"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md hover:border-emerald-500/50 hover:text-emerald-400"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Download Decision Spreadsheet (.xlsx)
            </a>

            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-blue hover:bg-brand-blue/90 border border-blue-400/30 text-xs font-black uppercase tracking-wider text-white transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Syncing...' : 'Sync Fresh Data'}
            </button>
          </div>
        </div>

        {/* Sync freshness bar */}
        <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-[11px] text-zinc-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Database Scope: <strong className="text-white">UAE ({region.toUpperCase()})</strong>
            </span>
            <span>•</span>
            <span>
              Total Unique Catalog: <strong className="text-white">{metrics.totalCatalog} SKUs</strong>
            </span>
            <span>•</span>
            <span>
              Active Products: <strong className="text-white">{metrics.activeSKUsCount}</strong> ({metrics.inactiveSKUsCount} Inactive)
            </span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <span>Last Sync Freshness:</span>
            <strong className="text-zinc-300">
              {data[0]?.last_inventory_sync
                ? new Date(data[0].last_inventory_sync).toLocaleString()
                : 'Live Snapshot'}
            </strong>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. TEN SUMMARY KPI CARDS                                      */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Total Catalog */}
        <div
          onClick={() => { setActiveTab('all'); setSelectedMarketplaceFilter('all') }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'all'
              ? 'bg-blue-950/40 border-blue-500/50 shadow-lg shadow-blue-500/10'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Catalog</span>
            <Package className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{metrics.totalCatalog}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">All unique SKUs in system</div>
        </div>

        {/* Card 2: Active Amazon Listings */}
        <div
          onClick={() => { setActiveTab('all'); setSelectedMarketplaceFilter('all') }}
          className="p-4 rounded-2xl bg-[#121622]/80 border border-white/5 hover:border-white/15 transition-all select-none"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Active Amazon</span>
            <Store className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400">{metrics.activeAmazonListings}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Listed & active on Amazon UAE</div>
        </div>

        {/* Card 3: Active Noon Listings */}
        <div
          onClick={() => { setActiveTab('all'); setSelectedMarketplaceFilter('all') }}
          className="p-4 rounded-2xl bg-[#121622]/80 border border-white/5 hover:border-white/15 transition-all select-none"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Active Noon</span>
            <Store className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-yellow-400">{metrics.activeNoonListings}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Listed & active on Noon UAE</div>
        </div>

        {/* Card 4: Amazon FBA OOS */}
        <div
          onClick={() => setActiveTab('amazon_oos')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'amazon_oos'
              ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-500/10'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Amazon FBA OOS</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-400">{metrics.amazonOOS}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Active SKUs with 0 FBA stock</div>
        </div>

        {/* Card 5: Noon OOS */}
        <div
          onClick={() => setActiveTab('noon_oos')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'noon_oos'
              ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-500/10'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Noon OOS</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-400">{metrics.noonOOS}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Active SKUs with 0 Noon stock</div>
        </div>

        {/* Card 6: Both Marketplaces OOS */}
        <div
          onClick={() => setActiveTab('both_oos')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'both_oos'
              ? 'bg-rose-950/60 border-rose-500 shadow-xl shadow-rose-500/20'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Both Channels OOS</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-500">{metrics.bothOOS}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">0 stock across Amazon & Noon</div>
        </div>

        {/* Card 7: No Sales in 120 Days */}
        <div
          onClick={() => { setActiveTab('slow_movers') }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'slow_movers'
              ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-500/10'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>No Sales in 120d</span>
            <History className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400">{metrics.noSales120d}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Active SKUs with 0 units in 120d</div>
        </div>

        {/* Card 8: Review for Discontinuation */}
        <div
          onClick={() => setActiveTab('review_discontinuation')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none relative overflow-hidden ${
            activeTab === 'review_discontinuation'
              ? 'bg-red-950/70 border-red-500 shadow-xl shadow-red-500/30'
              : 'bg-red-950/30 hover:bg-red-950/50 border-red-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-red-300 text-xs font-black uppercase tracking-wider mb-2">
            <span>Discontinue Review</span>
            <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-400">{metrics.reviewDiscontinuation}</div>
          <div className="text-[10px] text-red-300/80 font-medium mt-1">
            0 stock + 0 sales 120d + reorder suggested
          </div>
        </div>

        {/* Card 9: Replenishment Candidates */}
        <div
          onClick={() => setActiveTab('restock_candidates')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'restock_candidates'
              ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Restock Candidates</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400">{metrics.replenishmentCandidates}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Proven 120d sales + low/no stock</div>
        </div>

        {/* Card 10: Inactive Listings with Stock */}
        <div
          onClick={() => setActiveTab('listing_issues')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'listing_issues'
              ? 'bg-purple-950/40 border-purple-500/50 shadow-lg shadow-purple-500/10'
              : 'bg-[#121622]/80 hover:bg-[#121622] border-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Stranded Stock</span>
            <Warehouse className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-400">{metrics.inactiveWithStock}</div>
          <div className="text-[10px] text-zinc-400 font-medium mt-1">Inactive listings with inventory</div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. EIGHT NAVIGATION TABS                                      */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin border-b border-white/10">
        {[
          { id: 'all', label: 'All Products', count: metrics.totalCatalog },
          { id: 'restock_candidates', label: 'Restock Candidates', count: metrics.replenishmentCandidates },
          { id: 'review_discontinuation', label: 'Review for Discontinuation', count: metrics.reviewDiscontinuation },
          { id: 'amazon_oos', label: 'Amazon FBA OOS', count: metrics.amazonOOS },
          { id: 'noon_oos', label: 'Noon OOS', count: metrics.noonOOS },
          { id: 'both_oos', label: 'Both Marketplaces OOS', count: metrics.bothOOS },
          { id: 'listing_issues', label: 'Listing Issues', count: metrics.inactiveWithStock },
          { id: 'slow_movers', label: 'Slow Movers (0 Sales)', count: metrics.noSales120d }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as QuickTab)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-brand-blue text-white shadow-lg shadow-blue-500/25 border border-blue-400/40'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === tab.id ? 'bg-black/30 text-white' : 'bg-black/20 text-zinc-400'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. SEARCH AND FILTERS BAR                                     */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#121622] border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search SKU, Product Name, ASIN, FNSKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Marketplace Stock filter */}
          <select
            value={selectedMarketplaceFilter}
            onChange={e => setSelectedMarketplaceFilter(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
          >
            <option value="all" className="bg-zinc-900 text-white">Stock: All Channels</option>
            <option value="both_available" className="bg-zinc-900 text-white">Stock: Both in Stock</option>
            <option value="amazon_only" className="bg-zinc-900 text-white">Stock: Amazon Only</option>
            <option value="noon_only" className="bg-zinc-900 text-white">Stock: Noon Only</option>
            <option value="both_oos" className="bg-zinc-900 text-white">Stock: OOS on Both</option>
          </select>

          {/* Action Filter */}
          <select
            value={selectedAction}
            onChange={e => setSelectedAction(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
          >
            <option value="all" className="bg-zinc-900 text-white">Action: All Recommendations</option>
            <option value="REORDER NOW" className="bg-zinc-900 text-white">REORDER NOW</option>
            <option value="REORDER SOON" className="bg-zinc-900 text-white">REORDER SOON</option>
            <option value="REVIEW FOR DISCONTINUATION" className="bg-zinc-900 text-white">REVIEW FOR DISCONTINUATION</option>
            <option value="DO NOT REORDER YET" className="bg-zinc-900 text-white">DO NOT REORDER YET</option>
            <option value="REVIEW PRODUCT PERFORMANCE" className="bg-zinc-900 text-white">REVIEW PERFORMANCE</option>
            <option value="FIX LISTING" className="bg-zinc-900 text-white">FIX LISTING</option>
          </select>

          {/* Review Status Filter */}
          <select
            value={selectedReviewStatus}
            onChange={e => setSelectedReviewStatus(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
          >
            <option value="all" className="bg-zinc-900 text-white">Review: All Statuses</option>
            <option value="Pending Review" className="bg-zinc-900 text-white">Pending Review</option>
            <option value="Approve for Replenishment" className="bg-zinc-900 text-white">Approved Restock</option>
            <option value="Mark for Discontinuation Review" className="bg-zinc-900 text-white">Discontinue Review</option>
            <option value="Keep Active" className="bg-zinc-900 text-white">Keep Active</option>
            <option value="Investigate Listing" className="bg-zinc-900 text-white">Investigate Listing</option>
            <option value="Defer Decision" className="bg-zinc-900 text-white">Deferred</option>
          </select>

          {/* Category Filter */}
          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
            >
              <option value="all" className="bg-zinc-900 text-white">Category: All</option>
              {categories.map(c => (
                <option key={c} value={c} className="bg-zinc-900 text-white">
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Clear Filters */}
          {(searchQuery ||
            selectedCategory !== 'all' ||
            selectedAction !== 'all' ||
            selectedReviewStatus !== 'all' ||
            selectedMarketplaceFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('all')
                setSelectedAction('all')
                setSelectedReviewStatus('all')
                setSelectedMarketplaceFilter('all')
              }}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-400 hover:text-white transition-all"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. DATA TABLE SECTION                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#121622] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Displaying</span>
            <strong className="text-white font-bold">{filteredData.length}</strong>
            <span>of {data.length} SKUs</span>
          </div>
          <div className="text-[11px] text-zinc-400">
            Click any row to expand Amazon & Noon multi-channel inventory details
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-black uppercase tracking-wider text-zinc-400">
                <th className="py-3 px-4 w-10 text-center">#</th>
                <th
                  onClick={() => handleSort('sku')}
                  className="py-3 px-4 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>SKU / Product</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">
                  <div className="flex items-center gap-1">
                    <span>Amazon Stock</span>
                    <span className="text-[9px] text-zinc-400">(FBA)</span>
                  </div>
                </th>
                <th className="py-3 px-4">
                  <div className="flex items-center gap-1">
                    <span>Noon Stock</span>
                    <span className="text-[9px] text-zinc-400">(FBN+Min)</span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('sales_120d')}
                  className="py-3 px-4 cursor-pointer hover:text-white text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>120d Units Sold</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('days_since_last_sale')}
                  className="py-3 px-4 cursor-pointer hover:text-white text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Last Sale</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('suggested_reorder_qty')}
                  className="py-3 px-4 cursor-pointer hover:text-white text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Reorder Qty</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Recommended Action</th>
                <th className="py-3 px-4">Decision Justification</th>
                <th className="py-3 px-4 text-center">Human Review</th>
                <th className="py-3 px-4 text-center w-24">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 text-xs">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-zinc-400">
                    <AlertTriangle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      No matching SKUs found
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">Try resetting search filters or changing tabs</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => {
                  const isExpanded = !!expandedRows[item.sku]
                  return (
                    <React.Fragment key={item.sku}>
                      {/* Main Table Row */}
                      <tr
                        className={`hover:bg-white/[0.03] transition-colors ${
                          item.recommended_action === 'REVIEW FOR DISCONTINUATION'
                            ? 'bg-red-950/15'
                            : item.recommended_action === 'REORDER NOW'
                            ? 'bg-rose-950/10'
                            : ''
                        }`}
                      >
                        {/* 1. Row index & expand toggle */}
                        <td
                          onClick={() => toggleRow(item.sku)}
                          className="py-3 px-3 text-center cursor-pointer text-zinc-500 hover:text-white"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] text-zinc-600 font-mono">{idx + 1}</span>
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </td>

                        {/* 2. SKU and Product Info */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-mono font-bold text-white text-xs tracking-tight flex items-center gap-2">
                            <span>{item.sku}</span>
                            {!item.is_active && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-red-900/60 text-red-300 border border-red-700">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5" title={item.name}>
                            {item.name || 'No title recorded'}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                            {item.asin && <span>ASIN: <strong className="text-zinc-400">{item.asin}</strong></span>}
                            {item.category && (
                              <span className="px-1.5 py-0.2 bg-white/5 rounded text-zinc-400">
                                Class {item.category}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Amazon FBA Available Stock */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span
                              className={`font-black text-xs ${
                                item.fba_available === 0 ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                            >
                              {item.fba_available} units
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {item.amazon_listing_status === 'Active' ? 'Active Listing' : 'Inactive on Amazon'}
                            </span>
                            {item.fba_reserved > 0 && (
                              <span className="text-[9px] text-zinc-400">({item.fba_reserved} reserved)</span>
                            )}
                          </div>
                        </td>

                        {/* 4. Noon Available Stock */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span
                              className={`font-black text-xs ${
                                item.noon_available === 0 ? 'text-rose-400' : 'text-yellow-400'
                              }`}
                            >
                              {item.noon_available} units
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {item.noon_listing_status === 'Active' ? 'Active Listing' : 'Inactive on Noon'}
                            </span>
                            {item.minutes_available > 0 && (
                              <span className="text-[9px] text-zinc-400">({item.minutes_available} in Minutes)</span>
                            )}
                          </div>
                        </td>

                        {/* 5. 120d Units Sold */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold text-white text-xs">{item.sales_120d}</div>
                          <div className="text-[10px] text-zinc-400 flex items-center justify-end gap-1.5 mt-0.5">
                            <span title="Amazon 120d sales">Amz: {item.amz_sales_120d}</span>
                            <span>•</span>
                            <span title="Noon 120d sales">Noon: {item.noon_sales_120d}</span>
                          </div>
                        </td>

                        {/* 6. Last Sale Date */}
                        <td className="py-3 px-4 text-center">
                          {item.last_sale_date ? (
                            <div>
                              <div className="text-[11px] font-mono text-zinc-300">{item.last_sale_date}</div>
                              <div className="text-[10px] text-zinc-400">
                                {item.days_since_last_sale !== null
                                  ? `${item.days_since_last_sale}d ago`
                                  : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-[11px]">No Sales</span>
                          )}
                        </td>

                        {/* 7. Current Reorder Quantity & Pipeline */}
                        <td className="py-3 px-4 text-right">
                          <div
                            className={`font-black text-xs ${
                              item.suggested_reorder_qty > 0 ? 'text-amber-400' : 'text-zinc-400'
                            }`}
                          >
                            {item.suggested_reorder_qty > 0 ? `${item.suggested_reorder_qty} units` : '0'}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            {item.already_ordered > 0 ? (
                              <span className="text-sky-400 font-bold">
                                {item.already_ordered} on PO
                              </span>
                            ) : (
                              <span>MOQ: {item.moq || 0}</span>
                            )}
                          </div>
                        </td>

                        {/* 8. Recommended Action Badge */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {renderActionBadge(item.recommended_action)}
                        </td>

                        {/* 9. Decision Justification */}
                        <td className="py-3 px-4 max-w-sm">
                          <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed" title={item.recommendation_reason}>
                            {item.recommendation_reason}
                          </p>
                        </td>

                        {/* 10. Human Review Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {renderReviewBadge(item.review_decision)}
                        </td>

                        {/* 11. Review Trigger Button */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => openReviewModal(item)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-brand-blue hover:text-white border border-white/10 text-[11px] font-bold uppercase tracking-wider text-zinc-300 transition-all shadow-sm"
                          >
                            Review
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Deep Dive Detail Row */}
                      {isExpanded && (
                        <tr className="bg-black/40 border-b border-white/10">
                          <td colSpan={11} className="p-4 sm:p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-2xl bg-white/[0.02] border border-white/5 p-4 sm:p-5">
                              {/* Amazon FBA Deep Dive */}
                              <div className="space-y-3 bg-[#0c1017] p-4 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                  <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-400 tracking-wider">
                                    <Store className="w-4 h-4" />
                                    <span>Amazon UAE Performance</span>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      item.amazon_listing_status === 'Active'
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-red-500/20 text-red-300'
                                    }`}
                                  >
                                    {item.amazon_listing_status}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div>
                                    <span className="text-zinc-500">FBA Available:</span>
                                    <div className="font-bold text-white text-xs">{item.fba_available} units</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">FBA Inbound / Reserved:</span>
                                    <div className="font-bold text-zinc-300">
                                      {item.fba_inbound} in / {item.fba_reserved} res
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Units Sold (30d):</span>
                                    <div className="font-bold text-white">{item.amz_sales_30d}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Units Sold (120d):</span>
                                    <div className="font-bold text-white">{item.amz_sales_120d}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Last Sale Date:</span>
                                    <div className="font-bold text-zinc-300">{item.amz_last_sale_date || 'No Amazon sales'}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Stock Coverage:</span>
                                    <div className="font-bold text-zinc-300">
                                      {item.amazon_coverage ? `${ROUND(item.amazon_coverage, 1)} days` : '0 days'}
                                    </div>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-white/5">
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">
                                    Amazon Evaluation:
                                  </span>
                                  <p className="text-[11px] text-amber-300/90 leading-tight">
                                    {item.amazon_recommendation_reason}
                                  </p>
                                </div>
                              </div>

                              {/* Noon Deep Dive */}
                              <div className="space-y-3 bg-[#0c1017] p-4 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                  <div className="flex items-center gap-2 text-xs font-black uppercase text-yellow-400 tracking-wider">
                                    <Store className="w-4 h-4" />
                                    <span>Noon UAE Performance</span>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      item.noon_listing_status === 'Active'
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-red-500/20 text-red-300'
                                    }`}
                                  >
                                    {item.noon_listing_status}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div>
                                    <span className="text-zinc-500">Total Available:</span>
                                    <div className="font-bold text-white text-xs">{item.noon_available} units</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">FBN / Minutes Breakdown:</span>
                                    <div className="font-bold text-zinc-300">
                                      {item.fbn_available} FBN / {item.minutes_available} Min
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Units Sold (30d):</span>
                                    <div className="font-bold text-white">{item.noon_sales_30d}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Units Sold (120d):</span>
                                    <div className="font-bold text-white">{item.noon_sales_120d}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Last Sale Date:</span>
                                    <div className="font-bold text-zinc-300">{item.noon_last_sale_date || 'No Noon sales'}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Stock Coverage:</span>
                                    <div className="font-bold text-zinc-300">
                                      {item.noon_coverage ? `${ROUND(item.noon_coverage, 1)} days` : '0 days'}
                                    </div>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-white/5">
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">
                                    Noon Evaluation:
                                  </span>
                                  <p className="text-[11px] text-yellow-300/90 leading-tight">
                                    {item.noon_recommendation_reason}
                                  </p>
                                </div>
                              </div>

                              {/* Operations, Warehouse & Decision Audit */}
                              <div className="space-y-3 bg-[#0c1017] p-4 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                  <div className="flex items-center gap-2 text-xs font-black uppercase text-sky-400 tracking-wider">
                                    <Warehouse className="w-4 h-4" />
                                    <span>Supply Chain & Audit</span>
                                  </div>
                                  <span className="text-[10px] text-zinc-400 font-mono">
                                    Lead: {item.lead_time_days || 45}d
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div>
                                    <span className="text-zinc-500">Locad Warehouse:</span>
                                    <div className="font-bold text-white">
                                      {item.locad_available} units ({item.locad_boxes} boxes)
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Units per Box:</span>
                                    <div className="font-bold text-zinc-300">{item.units_per_box || 1}</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Minimum Order Qty (MOQ):</span>
                                    <div className="font-bold text-white">{item.moq || 0} units</div>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Incoming PO Pipeline:</span>
                                    <div className="font-bold text-sky-400">
                                      {item.already_ordered} units {item.earliest_eta ? `(ETA: ${item.earliest_eta})` : ''}
                                    </div>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-white/5">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">
                                      Human Review Audit:
                                    </span>
                                    {item.reviewed_at && (
                                      <span className="text-[9px] text-zinc-500">
                                        {new Date(item.reviewed_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-300">
                                    <strong>Decision:</strong>{' '}
                                    <span className="text-white font-bold">{item.review_decision || 'Pending Review'}</span>
                                  </div>
                                  {item.reviewer_email && (
                                    <div className="text-[10px] text-zinc-400 mt-0.5">
                                      By: {item.reviewer_email}
                                    </div>
                                  )}
                                  {item.review_notes && (
                                    <div className="text-[10px] text-zinc-400 italic mt-0.5 bg-white/5 p-2 rounded border border-white/5">
                                      "{item.review_notes}"
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 6. HUMAN REVIEW AND APPROVAL MODAL                             */}
      {/* ------------------------------------------------------------- */}
      {reviewModalSKU && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-3xl bg-[#121622] border border-white/15 p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-tight">
                    Human Review & Decision
                  </h3>
                  <p className="text-xs text-zinc-400">Record business approval or discontinuation recommendation</p>
                </div>
              </div>

              <button
                onClick={() => setReviewModalSKU(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SKU Overview in Modal */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Target Product:</span>
                <span className="font-mono font-bold text-white text-sm">{reviewModalSKU.sku}</span>
              </div>
              <div className="text-zinc-300 font-medium truncate">{reviewModalSKU.name}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/5 text-[11px]">
                <div>
                  <span className="text-zinc-500 block">FBA Stock:</span>
                  <strong className={reviewModalSKU.fba_available === 0 ? 'text-rose-400' : 'text-white'}>
                    {reviewModalSKU.fba_available} units
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">Noon Stock:</span>
                  <strong className={reviewModalSKU.noon_available === 0 ? 'text-rose-400' : 'text-white'}>
                    {reviewModalSKU.noon_available} units
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">120d Sales:</span>
                  <strong className="text-white">{reviewModalSKU.sales_120d} units</strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">Reorder Engine:</span>
                  <strong className="text-amber-400">{reviewModalSKU.suggested_reorder_qty} units</strong>
                </div>
              </div>
            </div>

            {/* Decision Select */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block">
                Review Decision
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    value: 'Approve for Replenishment',
                    desc: 'Authorize capital for restocking',
                    border: 'hover:border-emerald-500/50'
                  },
                  {
                    value: 'Mark for Discontinuation Review',
                    desc: 'Review product sunsetting / stop reordering',
                    border: 'hover:border-rose-500/50'
                  },
                  {
                    value: 'Keep Active',
                    desc: 'Maintain active listing without ordering',
                    border: 'hover:border-sky-500/50'
                  },
                  {
                    value: 'Investigate Listing',
                    desc: 'Unblock stranded stock or fix listing',
                    border: 'hover:border-purple-500/50'
                  },
                  {
                    value: 'Defer Decision',
                    desc: 'Postpone decision until next cycle',
                    border: 'hover:border-zinc-500/50'
                  }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReviewDecision(opt.value as SKUReviewDecision)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      reviewDecision === opt.value
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                        : `bg-white/5 border-white/10 text-zinc-300 ${opt.border}`
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{opt.value}</span>
                      {reviewDecision === opt.value && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reviewer Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block">
                Reviewer Email
              </label>
              <input
                type="email"
                value={reviewerEmail}
                onChange={e => setReviewerEmail(e.target.value)}
                placeholder="analyst@zenarise.org"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
              />
            </div>

            {/* Review Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block">
                Decision Justification / Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add context on seasonality, supplier terms, price renegotiations, or liquidation plan..."
                rows={3}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/50 resize-none"
              />
            </div>

            {/* Success message */}
            {saveSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalSKU(null)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveReview}
                disabled={savingReview}
                className="px-6 py-2.5 rounded-xl bg-brand-blue hover:bg-brand-blue/90 border border-blue-400/30 text-xs font-black uppercase tracking-wider text-white transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center gap-2"
              >
                {savingReview ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <BookmarkCheck className="w-4 h-4" />
                    <span>Confirm Decision</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ROUND(val: number | null | undefined, decimals = 1): number {
  if (val === null || val === undefined) return 0
  const factor = Math.pow(10, decimals)
  return Math.round(val * factor) / factor
}
