import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRegion } from '../lib/RegionContext'
import { api } from '../lib/api'

// Client-side cache for analytical performance queries (30-second TTL)
const performanceCache = new Map<string, { data: any; expiry: number }>()

export function usePerformanceData() {
  const { region } = useRegion()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [valuationData, setValuationData] = useState<any[]>([])
  const [subcategoryData, setSubcategoryData] = useState<any[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [coverageData, setCoverageData] = useState<any>(null)
  const [poStatusData, setPoStatusData] = useState<any[]>([])
  const [detailedSales, setDetailedSales] = useState<any[]>([])
  const [totalValuation, setTotalValuation] = useState(0)
  const [summaryData, setSummaryData] = useState<any>(null)
  const [mtdForecast, setMtdForecast] = useState<any>(null)
  const [lastMonthSales, setLastMonthSales] = useState<any>(null)
  const [refreshingConsolidated, setRefreshingConsolidated] = useState(false)
  const [consolidatedStep, setConsolidatedStep] = useState<'idle' | 'amazon' | 'facts'>('idle')

  // Filters & Sorting
  const [search, setSearch] = useState('')
  const [selCategories, setSelCategories] = useState<string[]>([])
  const [selProductCategories, setSelProductCategories] = useState<string[]>([])
  const [selSubCategories, setSelSubCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<string>('total_units')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Ref to track active request counter to prevent out-of-order responses
  const activeRequestId = useRef(0)

  const fetchData = useCallback(async (force = false) => {
    const reqId = ++activeRequestId.current
    const cacheKey = JSON.stringify({
      region,
      days,
      selCategories: selCategories.slice().sort(),
      selProductCategories: selProductCategories.slice().sort(),
      selSubCategories: selSubCategories.slice().sort(),
    })

    // Check cache
    if (!force) {
      const cached = performanceCache.get(cacheKey)
      if (cached && cached.expiry > Date.now()) {
        const c = cached.data
        setValuationData(c.valuationData)
        setTotalValuation(c.totalValuation)
        setSubcategoryData(c.subcategoryData)
        setTrendData(c.trendData)
        setDetailedSales(c.detailedSales)
        setPoStatusData(c.poStatusData)
        setCoverageData(c.coverageData)
        setSummaryData(c.summaryData)
        setMtdForecast(c.mtdForecast)
        setLastMonthSales(c.lastMonthSales)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const p_categories = selCategories.length > 0 ? selCategories : null
      const p_product_categories = selProductCategories.length > 0 ? selProductCategories : null
      const p_sub_categories = selSubCategories.length > 0 ? selSubCategories : null

      // Execute all analytical RPCs in a single parallel batch
      const [
        valResult,
        subResult,
        trendResult,
        detailedResult,
        poResult,
        covResult,
        summaryResult,
        forecastResult,
        lastMonthResult
      ] = await Promise.all([
        supabase.rpc('get_final_valuation', { p_saddl_id: region }),
        supabase.rpc('get_subcategory_performance', {
          days_count: days,
          p_categories,
          p_product_categories,
          p_sub_categories,
          p_saddl_id: region
        }),
        supabase.rpc('get_sales_velocity_trend', {
          days_count: days,
          p_categories,
          p_product_categories,
          p_sub_categories,
          p_saddl_id: region
        }),
        supabase.rpc('get_detailed_sales_performance', { days_count: days, p_saddl_id: region }),
        supabase.rpc('get_po_status_distribution', { p_saddl_id: region }),
        supabase.rpc('get_coverage_health', {
          p_categories,
          p_product_categories,
          p_sub_categories,
          p_saddl_id: region
        }),
        supabase.rpc('get_dashboard_sales_summary', {
          p_categories,
          p_product_categories,
          p_sub_categories,
          p_saddl_id: region
        }),
        supabase.rpc('get_mtd_forecast', {
          p_categories,
          p_product_categories,
          p_sub_categories,
          p_saddl_id: region
        }),
        supabase.rpc('get_last_month_sales', {
          p_categories,
          p_product_categories,
          p_sub_categories,
          p_saddl_id: region
        })
      ])

      // If a newer request has already fired, abandon this stale response
      if (reqId !== activeRequestId.current) return

      let newValuationData: any[] = []
      let newTotalValuation = 0
      if (valResult.data) {
        newValuationData = [
          { node: 'AMAZON FBA', value_aed: Math.round(valResult.data.fba || 0) },
          { node: 'NOON FBN', value_aed: Math.round(valResult.data.fbn || 0) },
          { node: 'NOON MINUTES', value_aed: Math.round(valResult.data.min || 0) },
          { node: 'LOCAD WAREHOUSE', value_aed: Math.round(valResult.data.loc || 0) }
        ]
        newTotalValuation = Math.round(
          (valResult.data.fba || 0) +
          (valResult.data.fbn || 0) +
          (valResult.data.min || 0) +
          (valResult.data.loc || 0)
        )
      }

      setValuationData(newValuationData)
      setTotalValuation(newTotalValuation)

      const newSubData = subResult.data || []
      const newTrendData = trendResult.data || []
      const newDetailedSales = detailedResult.data || []
      const newPoData = poResult.data || []
      const newCoverageData = covResult.data || null
      const newSummaryData = summaryResult.data || null
      const newMtdForecast = forecastResult.data || null
      const newLastMonthSales = lastMonthResult.data || null

      setSubcategoryData(newSubData)
      setTrendData(newTrendData)
      setDetailedSales(newDetailedSales)
      setPoStatusData(newPoData)
      setCoverageData(newCoverageData)
      setSummaryData(newSummaryData)
      setMtdForecast(newMtdForecast)
      setLastMonthSales(newLastMonthSales)

      // Store in performance cache (30s TTL)
      performanceCache.set(cacheKey, {
        data: {
          valuationData: newValuationData,
          totalValuation: newTotalValuation,
          subcategoryData: newSubData,
          trendData: newTrendData,
          detailedSales: newDetailedSales,
          poStatusData: newPoData,
          coverageData: newCoverageData,
          summaryData: newSummaryData,
          mtdForecast: newMtdForecast,
          lastMonthSales: newLastMonthSales
        },
        expiry: Date.now() + 30000
      })
    } catch (err: any) {
      if (reqId === activeRequestId.current) {
        console.error('Fetch error:', err)
        setError(err.message || 'Failed to fetch performance data')
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setLoading(false)
      }
    }
  }, [region, days, selCategories, selProductCategories, selSubCategories])

  // Debounced effect for filter updates to prevent request flooding
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData()
    }, 150)
    return () => clearTimeout(timer)
  }, [fetchData])

  const handleConsolidatedRefresh = async () => {
    setRefreshingConsolidated(true)
    setError(null)
    performanceCache.clear()
    try {
      setConsolidatedStep('amazon')
      const resSaddl = await api.triggerSync('amazon')
      if ((resSaddl as any).error) throw new Error((resSaddl as any).error)

      const resAmz = await api.triggerAmazonFDW()
      if ((resAmz as any).error) throw new Error((resAmz as any).error)

      setConsolidatedStep('facts')
      const resFact = await api.refreshFactTable()
      if ((resFact as any).error) throw new Error((resFact as any).error)

      await fetchData(true)
    } catch (err: any) {
      console.error('Consolidated refresh error:', err)
      setError(err.message || 'Failed to complete consolidated sync')
    } finally {
      setRefreshingConsolidated(false)
      setConsolidatedStep('idle')
    }
  }

  // Derived calculations
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

  const categories = useMemo(() => [...new Set(detailedSales.map(s => s.category))].filter(Boolean).sort(), [detailedSales])
  const productCategories = useMemo(() => {
    let list = detailedSales
    if (selCategories.length > 0) list = list.filter(s => selCategories.includes(s.category))
    return [...new Set(list.map(s => s.product_category))].filter(Boolean).sort()
  }, [detailedSales, selCategories])
  const subCategories = useMemo(() => {
    let list = detailedSales
    if (selCategories.length > 0) list = list.filter(s => selCategories.includes(s.category))
    if (selProductCategories.length > 0) list = list.filter(s => selProductCategories.includes(s.product_category))
    return [...new Set(list.map(s => s.sub_category))].filter(Boolean).sort()
  }, [detailedSales, selCategories, selProductCategories])

  const filteredAndSortedSales = useMemo(() => {
    let result = [...detailedSales]
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(r =>
        (r.sku && r.sku.toLowerCase().includes(s)) ||
        (r.category && r.category.toLowerCase().includes(s)) ||
        (r.product_category && r.product_category.toLowerCase().includes(s)) ||
        (r.sub_category && r.sub_category.toLowerCase().includes(s))
      )
    }
    if (selCategories.length > 0) result = result.filter(r => selCategories.includes(r.category))
    if (selProductCategories.length > 0) result = result.filter(r => selProductCategories.includes(r.product_category))
    if (selSubCategories.length > 0) result = result.filter(r => selSubCategories.includes(r.sub_category))

    result.sort((a, b) => {
      const valA = a[sortField], valB = b[sortField]
      if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      return sortOrder === 'asc' ? (valA ?? 0) - (valB ?? 0) : (valB ?? 0) - (valA ?? 0)
    })
    return result
  }, [detailedSales, search, selCategories, selProductCategories, selSubCategories, sortField, sortOrder])

  const toggleSort = (field: string) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortOrder('desc') }
  }

  return {
    loading,
    error,
    days,
    setDays,
    search,
    setSearch,
    selCategories,
    setSelCategories,
    selProductCategories,
    setSelProductCategories,
    selSubCategories,
    setSelSubCategories,
    sortField,
    sortOrder,
    toggleSort,
    valuationData,
    subcategoryData,
    trendData,
    coverageData,
    poStatusData,
    detailedSales,
    totalValuation,
    summaryData,
    mtdForecast,
    lastMonthSales,
    channelMixData,
    categories,
    productCategories,
    subCategories,
    filteredAndSortedSales,
    refreshingConsolidated,
    consolidatedStep,
    handleConsolidatedRefresh,
    fetchData
  }
}
