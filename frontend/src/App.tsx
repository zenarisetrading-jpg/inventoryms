import { useEffect, useState } from 'react'
import { LayoutDashboard, Package, ClipboardList, Upload, Activity, Calendar, BarChart2, ShieldAlert, Settings, Bell, Search, User, ChevronDown, Menu, X, Table } from 'lucide-react'

import CommandCenter from './pages/index'
import SKUDetail from './pages/sku/[sku]'
import SKUCatalog from './pages/skus'
import POPage from './pages/po'
import UploadPage from './pages/upload'
import HealthPage from './pages/health'
import InventoryPage from './pages/inventory'
import AnalyticsPage from './pages/analytics'
import PerformanceInsightsPage from './pages/performance-insights'
import PONewPage from './pages/po_new'
import SKUNewPage from './pages/skus_new'
import { navigate } from './lib/router'
import { ErrorBoundary } from './components/ErrorBoundary'

type Route =
  | { name: 'dashboard' }
  | { name: 'sku'; sku: string }
  | { name: 'skus' }
  | { name: 'po' }
  | { name: 'po_new' }
  | { name: 'upload' }
  | { name: 'health' }
  | { name: 'inventory' }
  | { name: 'analytics' }
  | { name: 'insights' }
  | { name: 'skus_new' }

function parseRoute(): Route {
  const path = window.location.pathname
  if (path === '/' || path === '') return { name: 'dashboard' }
  if (path.startsWith('/sku/')) return { name: 'sku', sku: path.slice(5) }
  if (path === '/skus') return { name: 'skus' }
  if (path === '/po') return { name: 'po' }
  if (path === '/po/new') return { name: 'po_new' }
  if (path === '/upload') return { name: 'upload' }
  if (path === '/health') return { name: 'health' }
  if (path === '/inventory') return { name: 'inventory' }
  if (path === '/analytics') return { name: 'analytics' }
  if (path === '/insights') return { name: 'insights' }
  if (path === '/skus/new') return { name: 'skus_new' }
  return { name: 'dashboard' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const handler = () => {
      setRoute(parseRoute())
      setIsSidebarOpen(false) // Close sidebar on navigation
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  return (
    <div className="flex h-screen bg-body overflow-hidden relative">
      {/* Sidebar - Desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-white/5 flex flex-col shrink-0 
        transition-transform duration-300 lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-brand-amber flex items-center justify-center text-sidebar font-black text-lg shadow-lg">S</div>
            <span className="text-white font-black tracking-tighter text-lg uppercase">S2C <span className="text-white/40 font-normal">PLANNER</span></span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto pb-6 custom-scrollbar">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Main Console</span>
          </div>
          <SidebarLink icon={LayoutDashboard} label="Dashboard" path="/" current={route.name === 'dashboard'} />
          <SidebarLink icon={Package} label="SKU Catalog" path="/skus" current={route.name === 'skus' || route.name === 'sku'} />
          <SidebarLink icon={ClipboardList} label="PO Register" path="/po" current={route.name === 'po'} />
          <SidebarLink icon={Upload} label="Upload Center" path="/upload" current={route.name === 'upload'} />

          <div className="px-3 mt-8 mb-2">
            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Strategy & Ops</span>
          </div>
          <SidebarLink icon={Activity} label="Data Health" path="/health" current={route.name === 'health'} />
          <SidebarLink icon={Table} label="Inventory" path="/inventory" current={route.name === 'inventory'} />
          <SidebarLink icon={BarChart2} label="Analytics" path="/analytics" current={route.name === 'analytics'} />
          <SidebarLink icon={Activity} label="Insights" path="/insights" current={route.name === 'insights'} />
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="p-3 bg-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-white">AU</div>
              <div>
                <p className="text-xs font-black text-white leading-none uppercase tracking-tight">Admin User</p>
                <p className="text-[10px] font-bold text-white/40 mt-1 uppercase tracking-widest">Operations Mgr</p>
              </div>
            </div>
            <button className="w-full mt-3 flex items-center justify-center gap-2 py-1.5 text-[10px] font-black text-white/60 bg-white/5 hover:bg-white/10 rounded transition-colors uppercase tracking-widest">
              <Settings className="w-3 h-3" />
              Settings
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <header className="h-14 bg-white/50 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-muted hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-4 bg-white/50 px-3 py-1.5 rounded-lg border border-zinc-200 w-48 lg:w-80 overflow-hidden">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input 
                type="text" 
                placeholder="SEARCH..." 
                className="bg-transparent border-none text-[10px] font-black tracking-widest text-primary placeholder:text-muted/60 focus:ring-0 w-full uppercase"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="flex items-center gap-1">
              <button className="p-2 text-muted hover:bg-slate-100 rounded-full relative transition-colors">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
              </button>
            </div>
            <div className="w-px h-6 bg-slate-200 mx-1 lg:mx-2" />
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <User className="w-4 h-4 text-indigo-600" />
              </div>
              <ChevronDown className="hidden sm:block w-4 h-4 text-muted group-hover:translate-y-0.5 transition-transform" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar bg-body">
          <div className="max-w-[1920px] mx-auto w-full">
            <ErrorBoundary>
              {route.name === 'dashboard' && <CommandCenter />}
              {route.name === 'sku' && <SKUDetail sku={route.sku} />}
              {route.name === 'skus' && <SKUCatalog />}
              {route.name === 'po' && <POPage />}
              {route.name === 'po_new' && <PONewPage />}
              {route.name === 'skus_new' && <SKUNewPage />}
              {route.name === 'upload' && <UploadPage />}
              {route.name === 'health' && <HealthPage />}
              {route.name === 'inventory' && <InventoryPage />}
              {route.name === 'analytics' && <AnalyticsPage />}
              {route.name === 'insights' && <PerformanceInsightsPage />}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarLink({ icon: Icon, label, path, current }: { icon: any; label: string; path: string; current: boolean }) {
  return (
    <button
      onClick={() => navigate(path)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
        current 
          ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' 
          : 'text-white/50 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className={`w-4 h-4 ${current ? 'text-white' : 'text-white/40'}`} />
      <span className="uppercase tracking-[0.15em] text-[10px] font-black">{label}</span>
      {current && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
    </button>
  )
}
