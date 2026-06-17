import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRegion } from '../lib/RegionContext'
import type { SyncStatus, UploadLocadResponse, UploadNoonResponse, UploadNoonInventoryResponse } from '../types'

export function useOperationsHub() {
  const { region } = useRegion()
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [masterStep, setMasterStep] = useState<'amazon-saddl' | 'amazon-fdw' | 'fact-tables' | null>(null)

  // Upload States
  const [locadState, setLocadState] = useState<{loading: boolean, error: string|null, result: UploadLocadResponse|null}>({loading: false, error: null, result: null})
  const [noonSalesState, setNoonSalesState] = useState<{loading: boolean, error: string|null, result: UploadNoonResponse|null}>({loading: false, error: null, result: null})
  const [noonInvState, setNoonInvState] = useState<{loading: boolean, error: string|null, result: UploadNoonInventoryResponse|null}>({loading: false, error: null, result: null})
  const [minutesState, setMinutesState] = useState<{loading: boolean, error: string|null, result: UploadNoonResponse|null}>({loading: false, error: null, result: null})

  const loadData = () => {
    setLoading(true)
    api.getSyncStatus().then(res => {
      const resAny = res as any
      if (!resAny.error) setSyncStatus(res as SyncStatus)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const handleUpload = async (type: 'locad'|'noon-sales'|'noon-inv'|'minutes', file: File) => {
    if (type === 'locad') {
      setLocadState({loading: true, error: null, result: null})
      const res = await api.uploadLocadXLSX(file) as any
      setLocadState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    } else if (type === 'noon-sales') {
      setNoonSalesState({loading: true, error: null, result: null})
      const res = await api.uploadNoonCSV(file) as any
      setNoonSalesState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    } else if (type === 'noon-inv') {
      setNoonInvState({loading: true, error: null, result: null})
      const res = await api.uploadNoonInventory(file) as any
      setNoonInvState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    } else if (type === 'minutes') {
      setMinutesState({loading: true, error: null, result: null})
      const res = await api.uploadNoonMinutesSales(file) as any
      setMinutesState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    }
  }

  const handleLocadApiSync = async () => {
    setLocadState({ loading: true, error: null, result: null })
    try {
      await api.triggerSync('locad')
      loadData()
      setLocadState({ loading: false, error: null, result: null })
    } catch (err: any) {
      setLocadState({ loading: false, error: err.message, result: null })
    }
  }

  const handleMasterRefresh = async () => {
    setTriggerLoading(true)
    setMasterStep('amazon-saddl')
    try {
      await api.triggerSync('amazon')
      
      setMasterStep('amazon-fdw')
      await api.triggerAmazonFDW()
      
      setMasterStep('fact-tables')
      await api.refreshFactTable()
      
      setMasterStep(null)
      loadData()
    } catch (err) {
      console.error('Master refresh error:', err)
      setMasterStep(null)
    } finally {
      setTriggerLoading(false)
    }
  }

  return {
    syncStatus, loading, loadData,
    showMappingModal, setShowMappingModal,
    triggerLoading, masterStep, handleMasterRefresh,
    showGuide, setShowGuide,
    locadState, noonSalesState, noonInvState, minutesState,
    handleUpload, handleLocadApiSync
  }
}
