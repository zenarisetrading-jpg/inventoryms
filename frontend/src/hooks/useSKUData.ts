import { useState, useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useRegion } from '../lib/RegionContext'

export function useSKUData() {
  const { region } = useRegion()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search, Sort & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)

  // Arrays represent selected values. Empty array means ALL.
  const [filters, setFilters] = useState({
    categories: [] as string[],
    sub_categories: [] as string[],
    is_active: [] as string[],
    amazon_active: [] as string[],
    noon_active: [] as string[]
  })

  const [updating, setUpdating] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ sku: string, field: string, value: string } | null>(null)
  
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set())

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getSKUs()
      if ((response as any).error) {
        throw new Error((response as any).error)
      }
      setData((response as any).skus || [])
    } catch (e: any) {
      setError(e.message || 'Failed to fetch SKUs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [region])

  const handleUpdateField = async (sku: string, field: string, value: any) => {
    setUpdating(`${sku}-${field}`)
    try {
      const res = await api.updateSKU(sku, { [field]: value })
      if ((res as any).error) throw new Error((res as any).error)

      // Optimistically update local state
      setData(prev => prev.map(row => row.sku === sku ? { ...row, [field]: value } : row))

      setEditingCell(null)
    } catch (e: any) {
      alert(`Failed to update ${field}: ${e.message}`)
    } finally {
      setUpdating(null)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedSkus.size === 0) return
    const skusToDelete = Array.from(selectedSkus)
    if (!window.confirm(`Are you sure you want to delete ${skusToDelete.length} SKUs?`)) return
    
    setLoading(true)
    try {
      const { error: delError } = await supabase
        .from('sku_master')
        .delete()
        .in('sku', skusToDelete)
        
      if (delError) throw delError

      setData(prev => prev.filter(row => !selectedSkus.has(row.sku)))
      setSelectedSkus(new Set())
    } catch (e: any) {
      alert(`Failed to delete SKUs: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Dynamically calculate valid sub-categories based on selected categories
  const validSubCategories = useMemo(() => {
    let pool = data
    if (filters.categories.length > 0) {
      pool = data.filter(r => filters.categories.includes(r.category))
    }
    const subs = new Set(pool.map(r => r.sub_category).filter(Boolean))
    return Array.from(subs).sort() as string[]
  }, [data, filters.categories])

  const sortedAndFilteredData = useMemo(() => {
    let result = data.filter(row => {
      // 1. Dropdown Filters
      if (filters.categories.length > 0 && !filters.categories.includes(row.category)) return false
      if (filters.sub_categories.length > 0 && !filters.sub_categories.includes(row.sub_category)) return false

      if (filters.is_active.length > 0) {
        const rowStatus = row.is_active === true ? 'TRUE' : 'FALSE'
        if (!filters.is_active.includes(rowStatus)) return false
      }
      if (filters.amazon_active.length > 0) {
        const rowStatus = row.amazon_active === true ? 'TRUE' : 'FALSE'
        if (!filters.amazon_active.includes(rowStatus)) return false
      }
      if (filters.noon_active.length > 0) {
        const rowStatus = row.noon_active === true ? 'TRUE' : 'FALSE'
        if (!filters.noon_active.includes(rowStatus)) return false
      }

      // 2. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesSearch = Object.values(row).some(val =>
          String(val).toLowerCase().includes(q)
        )
        if (!matchesSearch) return false
      }

      return true
    })

    // 3. Sorting
    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]

        if (aVal === null || aVal === undefined) return sortConfig.direction === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortConfig.direction === 'asc' ? -1 : 1

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, searchQuery, filters, sortConfig])

  // Fixed column order including physical properties and flags
  const columns = [
    'sku', 'asin', 'fnsku', 'name', 'category', 'sub_category', 'moq', 'lead_time_days',
    'cogs', 'units_per_box', 'dimensions', 'weight_kg', 'cbm',
    'is_active', 'amazon_active', 'noon_active'
  ]

  const handleExport = () => {
    if (!sortedAndFilteredData.length) return
    const headers = columns.join(',')
    const rows = sortedAndFilteredData.map(row =>
      columns.map(key => `"${row[key] ?? ''}"`).join(',')
    ).join('\n')
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sku_master_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return {
    data, loading, error,
    searchQuery, setSearchQuery,
    sortConfig, handleSort,
    filters, setFilters, validSubCategories,
    updating, handleUpdateField,
    editingCell, setEditingCell,
    sortedAndFilteredData, columns,
    fetchData, handleExport,
    selectedSkus, setSelectedSkus, handleDeleteSelected
  }
}
