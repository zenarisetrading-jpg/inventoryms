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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const isAdminRoute = ['skus', 'sku', 'po', 'po_new', 'upload', 'health', 'skus_new'].includes(route.name)
  const [isAdminExpanded, setIsAdminExpanded] = useState(isAdminRoute)

  useEffect(() => {
    const handler = () => {
      const newRoute = parseRoute()
      setRoute(newRoute)
      setIsSidebarOpen(false) // Close sidebar on navigation
      
      // Auto-expand if navigating to an admin route
      if (['skus', 'sku', 'po', 'po_new', 'upload', 'health', 'skus_new'].includes(newRoute.name)) {
        setIsAdminExpanded(true)
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  return (
    <div className="flex h-screen bg-body overflow-hidden relative">
      {/* Sidebar - Desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-white/5 flex flex-col shrink-0 
        transition-all duration-300 lg:relative lg:translate-x-0
        ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full w-64'}
      `}>
        <div className={`p-6 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
              <span className="text-black font-black text-lg italic">Z</span>
            </div>
            {!isSidebarCollapsed && (
              <span className="text-white font-black tracking-tight text-xl animate-in fade-in duration-300">
                Zen<span className="text-blue-400">Ventory </span>
              </span>
            )}
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
              className="hidden lg:flex text-white/30 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'px-2' : 'px-3'} space-y-1 overflow-y-auto pb-6 custom-scrollbar`}>
          <div className={`px-3 mb-2 ${isSidebarCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Strategy</span>
          </div>
          <SidebarLink icon={LayoutDashboard} label="Dashboard" path="/" current={route.name === 'dashboard'} collapsed={isSidebarCollapsed} />
          <SidebarLink icon={Table} label="Inventory" path="/inventory" current={route.name === 'inventory'} collapsed={isSidebarCollapsed} />
          <SidebarLink icon={BarChart2} label="Analytics" path="/analytics" current={route.name === 'analytics'} collapsed={isSidebarCollapsed} />
          <SidebarLink icon={Activity} label="Insights" path="/insights" current={route.name === 'insights'} collapsed={isSidebarCollapsed} />
        </nav>

        <div className={`p-4 border-t border-white/5 ${isSidebarCollapsed ? 'items-center' : ''}`}>
          <div className={`bg-white/5 rounded-lg transition-all ${isSidebarCollapsed ? 'p-2' : 'p-3'}`}>
            <div className={`flex items-center gap-3 ${isAdminExpanded && !isSidebarCollapsed ? 'mb-4' : ''} ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div 
                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-white shrink-0 cursor-pointer"
                onClick={() => isSidebarCollapsed ? setIsSidebarCollapsed(false) : setIsAdminExpanded(!isAdminExpanded)}
              >
                AU
              </div>
              {!isSidebarCollapsed && (
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                >
                  <p className="text-xs font-black text-white leading-none uppercase tracking-tight truncate">Admin User</p>
                  <p className="text-[10px] font-bold text-white/40 mt-1 uppercase tracking-widest truncate">Operations Mgr</p>
                </div>
              )}
              {!isSidebarCollapsed && (
                <ChevronDown 
                  className={`w-4 h-4 text-white/40 transition-transform cursor-pointer ${isAdminExpanded ? 'rotate-180' : ''}`} 
                  onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                />
              )}
            </div>

            {isAdminExpanded && !isSidebarCollapsed && (
              <div className="space-y-1 mb-3 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <SidebarLink icon={Package} label="SKU Catalog" path="/skus" current={route.name === 'skus' || route.name === 'sku'} isSubItem />
                <SidebarLink icon={ClipboardList} label="PO Register" path="/po" current={route.name === 'po'} isSubItem />
                <SidebarLink icon={Upload} label="Upload Centre" path="/upload" current={route.name === 'upload'} isSubItem />
                <SidebarLink icon={Activity} label="Data Health" path="/health" current={route.name === 'health'} isSubItem />
              </div>
            )}

            {!isSidebarCollapsed && (
              <button className="w-full flex items-center justify-center gap-2 py-1.5 text-[10px] font-black text-white/60 bg-white/5 hover:bg-white/10 rounded transition-colors uppercase tracking-widest">
                <Settings className="w-3 h-3" />
                Settings
              </button>
            )}
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
            {!isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(true)}
                className="hidden lg:flex p-2 text-muted hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
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

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-body">
          <div className="w-full">
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

function SidebarLink({ icon: Icon, label, path, current, isSubItem, collapsed }: { icon: any; label: string; path: string; current: boolean; isSubItem?: boolean; collapsed?: boolean }) {
  return (
    <button
      onClick={() => navigate(path)}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center transition-all ${collapsed ? 'justify-center py-3 px-2' : 'gap-3 px-4 py-2.5'} rounded-lg text-sm ${isSubItem ? 'ml-1 w-[calc(100%-4px)] py-1.5 px-3' : ''} ${current
        ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20'
        : 'text-white/50 hover:text-white hover:bg-white/5'
        }`}
    >
      <Icon className={`${isSubItem ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${current ? 'text-white' : 'text-white/40'} shrink-0`} />
      {!collapsed && (
        <>
          <span className={`uppercase tracking-[0.15em] ${isSubItem ? 'text-[9px]' : 'text-[10px]'} font-black truncate`}>{label}</span>
          {current && <div className={`ml-auto ${isSubItem ? 'w-1 h-1' : 'w-1.5 h-1.5'} rounded-full bg-white animate-pulse`} />}
        </>
      )}
    </button>
  )
}
