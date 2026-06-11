import React from 'react'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { useOperationsHub } from '../hooks/useOperationsHub'
import { buildHealthRows } from '../components/upload/shared'

import { OperationsHeader } from '../components/upload/OperationsHeader'
import { ConnectivityStatus } from '../components/upload/ConnectivityStatus'
import { LocadSync } from '../components/upload/LocadSync'
import { NoonSync } from '../components/upload/NoonSync'
import { MinutesSync } from '../components/upload/MinutesSync'
import { MappingModal } from '../components/upload/MappingModal'

export default function OperationsHub() {
  const {
    syncStatus, loading, loadData,
    showMappingModal, setShowMappingModal,
    triggerLoading, masterStep, handleMasterRefresh,
    showGuide, setShowGuide,
    locadState, noonSalesState, noonInvState, minutesState,
    handleUpload
  } = useOperationsHub()

  if (loading && !syncStatus) return <LoadingScreen message="Initializing Operations Hub..." fullScreen />

  const healthRows = syncStatus ? buildHealthRows(syncStatus) : []
  const freshCount = healthRows.filter(r => r.status === 'fresh' || r.status === 'ok').length
  const staleCount = healthRows.filter(r => r.status === 'stale').length
  const criticalCount = healthRows.filter(r => r.status === 'old' || r.status === 'missing' || r.status === 'error' || r.status === 'warning').length

  return (
    <div className="w-full space-y-8 px-0 sm:px-6 lg:px-8 max-w-[1920px] mx-auto pb-20">
      <OperationsHeader 
        freshCount={freshCount}
        staleCount={staleCount}
        criticalCount={criticalCount}
        triggerLoading={triggerLoading}
        masterStep={masterStep}
        handleMasterRefresh={handleMasterRefresh}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ConnectivityStatus healthRows={healthRows} loading={loading} loadData={loadData} />
        
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <LocadSync 
            locadState={locadState}
            syncStatus={syncStatus}
            handleUpload={handleUpload}
            setShowMappingModal={setShowMappingModal}
          />
          <MinutesSync 
            minutesState={minutesState}
            handleUpload={handleUpload}
          />
        </div>
      </div>

      <NoonSync 
        noonSalesState={noonSalesState}
        noonInvState={noonInvState}
        handleUpload={handleUpload}
      />

      {showMappingModal && (
        <MappingModal 
          onClose={() => setShowMappingModal(false)}
          onSaved={loadData}
          internalSKUs={[]}
        />
      )}
    </div>
  )
}
