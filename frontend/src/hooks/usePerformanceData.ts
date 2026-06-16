import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRegion } from '../lib/RegionContext'
import { api } from '../lib/api'

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

  async function fetchData() {
    setLoading(true)
    try {
      const { data: valResult } = await supabase.rpc('get_final_valuation', { p_saddl_id: region })
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
          p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null,
          p_saddl_id: region
        }),
        supabase.rpc('get_sales_velocity_trend', {
          days_count: days,
          p_categories: selCategories.length > 0 ? selCategories : null,
          p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
          p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null,
          p_saddl_id: region
        }),
        supabase.rpc('get_detailed_sales_performance', { days_count: days, p_saddl_id: region }),
        supabase.rpc('get_po_status_distribution', { p_saddl_id: region }),
        supabase.rpc('get_coverage_health', {
          p_categories: selCategories.length > 0 ? selCategories : null,
          p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
          p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null,
          p_saddl_id: region
        })
      ])

      if (subResult.data) setSubcategoryData(subResult.data)
      if (trendResult.data) setTrendData(trendResult.data)
      if (detailedResult.data) setDetailedSales(detailedResult.data)
      if (poResult.data) setPoStatusData(poResult.data)
      if (covResult.data) setCoverageData(covResult.data)

      const { data: summary } = await supabase.rpc('get_dashboard_sales_summary', {
        p_categories: selCategories.length > 0 ? selCategories : null,
        p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
        p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null,
        p_saddl_id: region
      })
      if (summary) setSummaryData(summary)

      const { data: forecastResult } = await supabase.rpc('get_mtd_forecast', {
        p_categories: selCategories.length > 0 ? selCategories : null,
        p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
        p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null,
        p_saddl_id: region
      })
      if (forecastResult) setMtdForecast(forecastResult)

      const { data: lastMonthResult } = await supabase.rpc('get_last_month_sales', {
        p_categories: selCategories.length > 0 ? selCategories : null,
        p_product_categories: selProductCategories.length > 0 ? selProductCategories : null,
        p_sub_categories: selSubCategories.length > 0 ? selSubCategories : null,
        p_saddl_id: region
      })
      if (lastMonthResult) setLastMonthSales(lastMonthResult)

    } catch (err: any) {
      console.error('Fetch error:', err)
      setError(err.message || 'Failed to fetch performance data')
    }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [region, days, selCategories, selProductCategories, selSubCategories])

  const handleConsolidatedRefresh = async () => {
    setRefreshingConsolidated(true)
    setError(null)
    try {
      setConsolidatedStep('amazon')
      const resSaddl = await api.triggerSync('amazon')
      if ((resSaddl as any).error) throw new Error((resSaddl as any).error)

      const resAmz = await api.triggerAmazonFDW()
      if ((resAmz as any).error) throw new Error((resAmz as any).error)

      setConsolidatedStep('facts')
      const resFact = await api.refreshFactTable()
      if ((resFact as any).error) throw new Error((resFact as any).error)

      await fetchData()
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
