import React from 'react'
import { AlertTriangle, Package } from 'lucide-react'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { SalesPerformanceCard } from '../components/SalesPerformanceCard'
import { usePerformanceData } from '../hooks/usePerformanceData'

// Extracted Components
import { PerformanceHeader } from '../components/performance/PerformanceHeader'
import { SalesVelocityChart } from '../components/performance/SalesVelocityChart'
import { ChannelMixChart } from '../components/performance/ChannelMixChart'
import { SubCategoryPerformance } from '../components/performance/SubCategoryPerformance'
import { DetailedPerformanceTable } from '../components/performance/DetailedPerformanceTable'
import { ValuationChart, PoStatusChart } from '../components/performance/ValuationAndPO'
import { CoverageHealth } from '../components/performance/CoverageHealth'

export default function PerformancePage() {
  const {
    loading, error, days, setDays, search, setSearch,
    selCategories, setSelCategories, selProductCategories, setSelProductCategories,
    selSubCategories, setSelSubCategories, sortField, sortOrder, toggleSort,
    valuationData, subcategoryData, trendData, coverageData, poStatusData,
    detailedSales, totalValuation, summaryData, mtdForecast, lastMonthSales,
    channelMixData, filteredAndSortedSales,
    refreshingConsolidated, consolidatedStep, handleConsolidatedRefresh, fetchData
  } = usePerformanceData()

  if (loading && detailedSales.length === 0) return <LoadingScreen message="Aggregating Performance Data..." fullScreen />

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertTriangle className="w-12 h-12 text-rose-500" />
      <p className="text-rose-500 font-bold uppercase tracking-widest">{error}</p>
      <button onClick={() => fetchData()} className="px-6 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all font-black uppercase text-[10px] tracking-widest">Retry</button>
    </div>
  )

  return (
    <div className="w-full space-y-4 sm:space-y-8 px-0 sm:px-6 lg:px-8 max-w-[1920px] mx-auto pb-20">
      <PerformanceHeader
        days={days}
        setDays={setDays}
        search={search}
        setSearch={setSearch}
        selCategories={selCategories}
        setSelCategories={setSelCategories}
        selProductCategories={selProductCategories}
        setSelProductCategories={setSelProductCategories}
        selSubCategories={selSubCategories}
        setSelSubCategories={setSelSubCategories}
        detailedSales={detailedSales}
        refreshingConsolidated={refreshingConsolidated}
        consolidatedStep={consolidatedStep}
        handleConsolidatedRefresh={handleConsolidatedRefresh}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryData && (
          <>
            <SalesPerformanceCard
              title="YESTERDAY"
              dateRange="Full Day"
              sales={summaryData.yesterday?.sales_aed || 0}
              orders={summaryData.yesterday?.orders || 0}
              units={summaryData.yesterday?.units || 0}
              refunds={0}
              headerColor="bg-zinc-800"
              breakdown={[
                { label: 'AMAZON', sales: summaryData.yesterday?.amazon_sales || 0, units: summaryData.yesterday?.amazon_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: summaryData.yesterday?.noon_sales || 0, units: summaryData.yesterday?.noon_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: summaryData.yesterday?.minutes_sales || 0, units: summaryData.yesterday?.minutes_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="MONTH TO DATE"
              dateRange="Current Month"
              sales={summaryData.mtd?.sales_aed || 0}
              orders={summaryData.mtd?.orders || 0}
              units={summaryData.mtd?.units || 0}
              refunds={0}
              headerColor="bg-blue-900/50"
              breakdown={[
                { label: 'AMAZON', sales: summaryData.mtd?.amazon_sales || 0, units: summaryData.mtd?.amazon_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: summaryData.mtd?.noon_sales || 0, units: summaryData.mtd?.noon_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: summaryData.mtd?.minutes_sales || 0, units: summaryData.mtd?.minutes_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="THIS MONTH FORECAST"
              dateRange="Projected"
              sales={mtdForecast?.find((r: any) => r.sales_channel === 'TOTAL')?.projected_month_end_sales || 0}
              orders={mtdForecast?.find((r: any) => r.sales_channel === 'TOTAL')?.projected_month_end_units || 0}
              units={mtdForecast?.find((r: any) => r.sales_channel === 'TOTAL')?.projected_month_end_units || 0}
              refunds={0}
              headerColor="bg-emerald-900/50"
              breakdown={[
                { label: 'AMAZON', sales: mtdForecast?.find((r: any) => r.sales_channel === 'Amazon')?.projected_month_end_sales || 0, units: mtdForecast?.find((r: any) => r.sales_channel === 'Amazon')?.projected_month_end_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: mtdForecast?.find((r: any) => r.sales_channel === 'Noon')?.projected_month_end_sales || 0, units: mtdForecast?.find((r: any) => r.sales_channel === 'Noon')?.projected_month_end_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: mtdForecast?.find((r: any) => r.sales_channel === 'Minutes')?.projected_month_end_sales || 0, units: mtdForecast?.find((r: any) => r.sales_channel === 'Minutes')?.projected_month_end_units || 0, color: 'bg-purple-500' }
              ]}
            />
            <SalesPerformanceCard
              title="LAST MONTH"
              dateRange="Previous Full Month"
              sales={lastMonthSales?.find((r: any) => r.sales_channel === 'TOTAL')?.total_sales || 0}
              orders={lastMonthSales?.find((r: any) => r.sales_channel === 'TOTAL')?.total_units || 0}
              units={lastMonthSales?.find((r: any) => r.sales_channel === 'TOTAL')?.total_units || 0}
              refunds={0}
              headerColor="bg-indigo-900/50"
              breakdown={[
                { label: 'AMAZON', sales: lastMonthSales?.find((r: any) => r.sales_channel === 'Amazon')?.total_sales || 0, units: lastMonthSales?.find((r: any) => r.sales_channel === 'Amazon')?.total_units || 0, color: 'bg-amber-500' },
                { label: 'NOON', sales: lastMonthSales?.find((r: any) => r.sales_channel === 'Noon')?.total_sales || 0, units: lastMonthSales?.find((r: any) => r.sales_channel === 'Noon')?.total_units || 0, color: 'bg-blue-500' },
                { label: 'MINUTES', sales: lastMonthSales?.find((r: any) => r.sales_channel === 'Minutes')?.total_sales || 0, units: lastMonthSales?.find((r: any) => r.sales_channel === 'Minutes')?.total_units || 0, color: 'bg-purple-500' }
              ]}
            />
          </>
        )}
      </div>

      <SalesVelocityChart data={trendData} />
      <ChannelMixChart data={channelMixData} />
      <SubCategoryPerformance data={subcategoryData} />
      <DetailedPerformanceTable filteredAndSortedSales={filteredAndSortedSales} sortField={sortField} sortOrder={sortOrder} toggleSort={toggleSort} />
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <ValuationChart valuationData={valuationData} totalValuation={totalValuation} />
        <PoStatusChart poStatusData={poStatusData} />
      </div>

      <CoverageHealth coverageData={coverageData} />

      <div className="text-center pb-10">
        <p className="text-[10px] font-black text-white uppercase tracking-[0.5em] flex items-center justify-center gap-4">
          <Package className="w-4 h-4 opacity-40" /> Performance Ecosystem • Commercial Suite
        </p>
      </div>
    </div>
  )
}
