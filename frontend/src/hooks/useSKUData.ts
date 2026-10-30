import { useState, useEffect, useMemo, useCallback } from 'react'
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
    product_categories: [] as string[],
    sub_categories: [] as string[],
    is_active: [] as string[],
    amazon_active: [] as string[],
    noon_active: [] as string[],
    minutes_active: [] as string[]
  })

  // Stored custom categories (so added categories with 0 SKUs persist locally)
  const [customProductCategories, setCustomProductCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sku_custom_product_categories')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [customSubCategories, setCustomSubCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sku_custom_sub_categories')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
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
      setData(prev => prev.map(row => {
        if (row.sku !== sku) return row
        const newRow = { ...row, [field]: value }
        if (field === 'cogs' || field === 'shipping_cost') {
          const cogsVal = Number(newRow.cogs) || 0
          const shipVal = Number(newRow.shipping_cost) || 0
          newRow.landing_cost = cogsVal + shipVal
        }
        return newRow
      }))

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

  const defaultProductCategories = useMemo(() => [
    'Art Supplies',
    'Baby and Toddlers',
    'Health',
    'Home and Kitchen',
    'Lunch Box',
    'Pet Supplies',
    'Tumblr',
    'Wander',
    'Water Bottles'
  ], [])

  // Dynamically calculate valid product categories
  const validProductCategories = useMemo(() => {
    let pool = data
    if (filters.categories.length > 0) {
      pool = data.filter(r => filters.categories.includes(r.category))
    }
    const fromData = pool.map(r => r.product_category).filter(Boolean)
    const set = new Set([...defaultProductCategories, ...customProductCategories, ...fromData])
    return Array.from(set).sort((a: string, b: string) => a.localeCompare(b)) as string[]
  }, [data, filters.categories, customProductCategories, defaultProductCategories])

  // Dynamically calculate valid sub-categories based on selected categories & product categories
  const validSubCategories = useMemo(() => {
    let pool = data
    if (filters.categories.length > 0) {
      pool = pool.filter(r => filters.categories.includes(r.category))
    }
    if (filters.product_categories.length > 0) {
      pool = pool.filter(r => filters.product_categories.includes(r.product_category))
    }
    const fromData = pool.map(r => r.sub_category).filter(Boolean)
    const set = new Set([...customSubCategories, ...fromData])
    return Array.from(set).sort((a: string, b: string) => a.localeCompare(b)) as string[]
  }, [data, filters.categories, filters.product_categories, customSubCategories])

  // Category Management Functions
  const handleAddProductCategory = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCustomProductCategories(prev => {
      const next = Array.from(new Set([...prev, trimmed]))
      localStorage.setItem('sku_custom_product_categories', JSON.stringify(next))
      return next
    })
  }, [])

  const handleRenameProductCategory = useCallback(async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim()
    if (!trimmedNew || oldName === trimmedNew) return

    const { error: dbErr } = await supabase
      .from('sku_master')
      .update({ product_category: trimmedNew })
      .eq('product_category', oldName)
    if (dbErr) throw dbErr

    try {
      await supabase.rpc('refresh_fact_inventory_planning')
    } catch (_) {}

    setData(prev => prev.map(r => r.product_category === oldName ? { ...r, product_category: trimmedNew } : r))

    setCustomProductCategories(prev => {
      const next = prev.map(c => c === oldName ? trimmedNew : c)
      localStorage.setItem('sku_custom_product_categories', JSON.stringify(next))
      return next
    })

    setFilters(prev => ({
      ...prev,
      product_categories: prev.product_categories.map(c => c === oldName ? trimmedNew : c)
    }))
  }, [])

  const handleDeleteProductCategory = useCallback(async (catName: string) => {
    const { error: dbErr } = await supabase
      .from('sku_master')
      .update({ product_category: null })
      .eq('product_category', catName)
    if (dbErr) throw dbErr

    try {
      await supabase.rpc('refresh_fact_inventory_planning')
    } catch (_) {}

    setData(prev => prev.map(r => r.product_category === catName ? { ...r, product_category: null } : r))

    setCustomProductCategories(prev => {
      const next = prev.filter(c => c !== catName)
      localStorage.setItem('sku_custom_product_categories', JSON.stringify(next))
      return next
    })

    setFilters(prev => ({
      ...prev,
      product_categories: prev.product_categories.filter(c => c !== catName)
    }))
  }, [])

  const handleAddSubCategory = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCustomSubCategories(prev => {
      const next = Array.from(new Set([...prev, trimmed]))
      localStorage.setItem('sku_custom_sub_categories', JSON.stringify(next))
      return next
    })
  }, [])

  const handleRenameSubCategory = useCallback(async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim()
    if (!trimmedNew || oldName === trimmedNew) return

    const { error: dbErr } = await supabase
      .from('sku_master')
      .update({ sub_category: trimmedNew })
      .eq('sub_category', oldName)
    if (dbErr) throw dbErr

    try {
      await supabase.rpc('refresh_fact_inventory_planning')
    } catch (_) {}

    setData(prev => prev.map(r => r.sub_category === oldName ? { ...r, sub_category: trimmedNew } : r))

    setCustomSubCategories(prev => {
      const next = prev.map(c => c === oldName ? trimmedNew : c)
      localStorage.setItem('sku_custom_sub_categories', JSON.stringify(next))
      return next
    })

    setFilters(prev => ({
      ...prev,
      sub_categories: prev.sub_categories.map(c => c === oldName ? trimmedNew : c)
    }))
  }, [])

  const handleDeleteSubCategory = useCallback(async (subName: string) => {
    const { error: dbErr } = await supabase
      .from('sku_master')
      .update({ sub_category: null })
      .eq('sub_category', subName)
    if (dbErr) throw dbErr

    try {
      await supabase.rpc('refresh_fact_inventory_planning')
    } catch (_) {}

    setData(prev => prev.map(r => r.sub_category === subName ? { ...r, sub_category: null } : r))

    setCustomSubCategories(prev => {
      const next = prev.filter(c => c !== subName)
      localStorage.setItem('sku_custom_sub_categories', JSON.stringify(next))
      return next
    })

    setFilters(prev => ({
      ...prev,
      sub_categories: prev.sub_categories.filter(c => c !== subName)
    }))
  }, [])

  const sortedAndFilteredData = useMemo(() => {
    let result = data.filter(row => {
      // 1. Dropdown Filters
      if (filters.categories.length > 0 && !filters.categories.includes(row.category)) return false
      if (filters.product_categories.length > 0 && !filters.product_categories.includes(row.product_category)) return false
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
      if (filters.minutes_active.length > 0) {
        const rowStatus = row.minutes_active === true ? 'TRUE' : 'FALSE'
        if (!filters.minutes_active.includes(rowStatus)) return false
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
    'sku', 'asin', 'fnsku', 'name', 'category', 'product_category', 'sub_category', 'moq', 'lead_time_days',
    'cogs', 'shipping_cost', 'landing_cost', 'units_per_box', 'dimensions', 'weight_kg', 'cbm',
    'is_active', 'amazon_active', 'noon_active', 'minutes_active'
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
    filters, setFilters,
    validProductCategories, validSubCategories,
    updating, handleUpdateField,
    editingCell, setEditingCell,
    sortedAndFilteredData, columns,
    fetchData, handleExport,
    selectedSkus, setSelectedSkus, handleDeleteSelected,
    handleAddProductCategory,
    handleRenameProductCategory,
    handleDeleteProductCategory,
    handleAddSubCategory,
    handleRenameSubCategory,
    handleDeleteSubCategory,
  }
}
