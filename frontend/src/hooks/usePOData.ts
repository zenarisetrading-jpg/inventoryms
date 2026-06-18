import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRegion } from '../lib/RegionContext'
import type { PO, POStatus } from '../types'
import { nextStatus } from '../components/po/utils'

export function usePOData(itemsPerPage = 20) {
  const { region } = useRegion()
  const [pos, setPOs] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'po_number', direction: 'desc' })

  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const [allSuppliers, setAllSuppliers] = useState<string[]>([])
  const [allSkus, setAllSkus] = useState<any[]>([])
  const [skuSuggestions, setSkuSuggestions] = useState<string[]>([])

  useEffect(() => {
    setSelectedIds(new Set())
    setCurrentPage(1)
  }, [activeTab, search])

  const load = (status?: string) => {
    setLoading(true)
    api.getPOs(status ? { status } : {}).then(res => {
      const resAny = res as unknown as { error?: string; pos?: PO[] }
      if (resAny.error) setPOs([])
      else {
        const normalized = ((resAny.pos ?? []) as Array<PO & { po_line_items?: PO['line_items'] }>).map((po) => ({
          ...po,
          line_items: po.line_items ?? po.po_line_items ?? [],
        }))
        setPOs(normalized)
      }
      setLoading(false)
    })
  }

  useEffect(() => {
    load(activeTab || undefined)
  }, [activeTab, region])

  useEffect(() => {
    api.getSuppliers().then(res => setAllSuppliers(res.suppliers || []))
    api.getSKUs().then(res => {
      const skus = res.skus ?? []
      setAllSkus(skus)
      setSkuSuggestions(skus.map(s => s.sku))
    })
  }, [])

  const filteredPOs = pos.filter(po => {
    const q = search.toLowerCase()
    const poNum = po.po_number || ''
    const supplier = po.supplier || ''
    return (
      poNum.toLowerCase().includes(q) ||
      supplier.toLowerCase().includes(q) ||
      po.line_items.some(li => li.sku && li.sku.toLowerCase().includes(q))
    )
  }).sort((a, b) => {
    if (!sortConfig) return 0
    const { key, direction } = sortConfig
    
    let aVal: any = a[key as keyof PO]
    let bVal: any = b[key as keyof PO]
    
    // Custom logic for computed columns
    if (key === 'units') {
      aVal = a.line_items.reduce((s, li) => s + (li.units_ordered || 0), 0)
      bVal = b.line_items.reduce((s, li) => s + (li.units_ordered || 0), 0)
    } else if (key === 'skus') {
      aVal = a.line_items.length
      bVal = b.line_items.length
    }
    
    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    
    const res = aVal < bVal ? -1 : 1
    return direction === 'asc' ? res : -res
  })

  const totalPages = Math.max(1, Math.ceil(filteredPOs.length / itemsPerPage))
  const paginatedPOs = filteredPOs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleAdvance = async (po: PO) => {
    const next = nextStatus(po.status)
    if (!next) return
    setAdvancingId(po.id)
    const updated = await api.updatePO(po.id, { status: next })
    setAdvancingId(null)
    const updatedAny = updated as unknown as { error?: string }
    if (!updatedAny.error) setPOs(prev => prev.map(p => (p.id === po.id ? { ...p, status: next } : p)))
  }

  const handleExport = async (selectedIds?: Set<string>) => {
    setLoading(true)
    try {
      const res = await api.getPOs({})
      const resAny = res as unknown as { error?: string; pos?: PO[] }
      if (resAny.error) throw new Error(resAny.error)
      
      let allPOs = ((resAny.pos ?? []) as Array<PO & { po_line_items?: PO['line_items'] }>).map((po) => ({
        ...po,
        line_items: po.line_items ?? po.po_line_items ?? [],
      }))
      
      if (selectedIds && selectedIds.size > 0) {
        allPOs = allPOs.filter(po => selectedIds.has(po.id))
      }

      if (!allPOs.length) return

      const headers = [
        'PO Number', 'PO Name', 'Supplier', 'Country', 'Order Date', 'ETA', 'Tracking', 'Status', 'PO Notes',
        'SKU', 'Units Ordered', 'Units Received', 'Units Per Box', 'Box Count', 'Dimensions', 'COGS', 'Shipping Cost', 'Item Notes'
      ].join(',')

      const rows = allPOs.flatMap(po => {
        if (!po.line_items || po.line_items.length === 0) {
          return [[
            `"${po.po_number}"`,
            `"${po.po_name || ''}"`,
            `"${po.supplier}"`,
            `"${po.country || ''}"`,
            `"${po.order_date}"`,
            `"${po.eta || ''}"`,
            `"${po.tracking_number || ''}"`,
            `"${po.status}"`,
            `"${(po.notes || '').replace(/"/g, '""')}"`,
            '""', 0, 0, 0, 0, '""', 0, 0, '""'
          ].join(',')]
        }
        return po.line_items.map(li => [
          `"${po.po_number}"`,
          `"${po.po_name || ''}"`,
          `"${po.supplier}"`,
          `"${po.country || ''}"`,
          `"${po.order_date}"`,
          `"${po.eta || ''}"`,
          `"${po.tracking_number || ''}"`,
          `"${po.status}"`,
          `"${(po.notes || '').replace(/"/g, '""')}"`,
          `"${li.sku}"`,
          li.units_ordered || 0,
          li.units_received || 0,
          li.units_per_box || 0,
          li.box_count || 0,
          `"${li.dimensions || ''}"`,
          li.cogs_per_unit || 0,
          li.shipping_cost_per_unit || 0,
          `"${(li.notes || '').replace(/"/g, '""')}"`
        ].join(','))
      }).join('\n')

      const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `po_register_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export POs:', err)
      alert('Failed to export POs')
    } finally {
      setLoading(false)
    }
  }

  return {
    pos, setPOs,
    loading, setLoading,
    activeTab, setActiveTab,
    search, setSearch,
    expandedId, setExpandedId,
    selectedIds, setSelectedIds,
    currentPage, setCurrentPage,
    sortConfig, setSortConfig,
    allSuppliers, allSkus, skuSuggestions,
    itemsPerPage, filteredPOs, paginatedPOs, totalPages,
    load, requestSort, handleAdvance, handleExport,
    advancingId, setAdvancingId
  }
}
