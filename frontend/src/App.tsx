import { useEffect, useState } from 'react'
import { LayoutDashboard, Package, ClipboardList, Upload, Activity, Calendar, BarChart2, ShieldAlert, Settings, User, ChevronDown, Menu, X, Table, LogOut, Loader2, TrendingUp, Layers } from 'lucide-react'

import CommandCenter from './pages/index'
import SKUDetail from './pages/sku/[sku]'
import SKUCatalog from './pages/skus'
import POPage from './pages/po'
import UploadPage from './pages/upload'
import HealthPage from './pages/health'
import InventoryPage from './pages/inventory'
import PerformancePage from './pages/performance'
import PONewPage from './pages/po_new'
import SKUNewPage from './pages/skus_new'
import { navigate } from './lib/router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { supabase } from './lib/supabase'
import LoginPage from './pages/login'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { LoadingScreen } from './components/shared/LoadingScreen'
import saddlLogo from './assets/saddl_logo.jpg'

type Route =
  | { name: 'dashboard' }
  | { name: 'sku'; sku: string }
  | { name: 'skus' }
  | { name: 'po' }
  | { name: 'po_new' }
  | { name: 'upload' }
  | { name: 'health' }
  | { name: 'inventory' }
  | { name: 'performance' }
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
  if (path === '/performance') return { name: 'performance' }
  if (path === '/skus/new') return { name: 'skus_new' }
  return { name: 'dashboard' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const isAdminRoute = ['skus', 'sku', 'po', 'po_new', 'upload', 'health', 'skus_new'].includes(route.name)
  const [isAdminExpanded, setIsAdminExpanded] = useState(isAdminRoute)

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setSessionLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (sessionLoading) {
    return <LoadingScreen fullScreen message="Authenticating User..." />
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="flex h-screen bg-body overflow-hidden relative">
      {/* Sidebar - Desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-white/5 flex flex-col shrink-0 
        transition-all duration-300 lg:relative lg:translate-x-0
        ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full w-64'}
      `}>
        <div className={`h-14 px-6 flex items-center border-b border-white/5 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            <img src={saddlLogo} alt="Saddl Logo" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/10" />
            {!isSidebarCollapsed && (
              <span className="text-white font-black tracking-tight text-xl animate-in fade-in duration-300">
                Saddl<span className="text-blue-400"> Inventory</span>
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
          <SidebarLink icon={TrendingUp} label="Performance" path="/performance" current={route.name === 'performance'} collapsed={isSidebarCollapsed} />
        </nav>

        <div className={`p-4 border-t border-white/5 ${isSidebarCollapsed ? 'items-center' : ''}`}>
          <div className={`bg-white/5 rounded-xl border border-white/5 transition-all ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
            <div className={`flex items-center gap-4 ${isAdminExpanded && !isSidebarCollapsed ? 'mb-5' : ''} ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div 
                className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shrink-0 cursor-pointer shadow-lg shadow-blue-900/20"
                onClick={() => isSidebarCollapsed ? setIsSidebarCollapsed(false) : setIsAdminExpanded(!isAdminExpanded)}
              >
                {user.user_metadata?.full_name?.substring(0, 2).toUpperCase() || user.email?.substring(0, 2).toUpperCase() || 'US'}
              </div>
              {!isSidebarCollapsed && (
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                >
                  <p className="text-[13px] font-black text-white leading-tight uppercase tracking-tight truncate">
                    {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-[10px] font-bold text-white/40 mt-1.5 uppercase tracking-widest truncate">
                    {user.user_metadata?.role || user.app_metadata?.role || 'Member'}
                  </p>
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
                <SidebarLink icon={Package} label="SKU Master" path="/skus" current={route.name === 'skus' || route.name === 'sku'} isSubItem />
                <SidebarLink icon={ClipboardList} label="PO Register" path="/po" current={route.name === 'po'} isSubItem />
                <SidebarLink icon={Layers} label="Operations Hub" path="/upload" current={route.name === 'upload' || route.name === 'health'} isSubItem />
              </div>
            )}

            {/* Sign Out is now inside the Settings Modal (accessible via header profile) */}
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
        <header className="h-14 bg-sidebar border-b border-white/5 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-muted hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">

            <div 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-3 group cursor-pointer hover:bg-white/5 p-1.5 rounded-xl transition-colors"
            >
              <div className="hidden sm:flex flex-col items-end justify-center mr-1">
                <p className="text-xs font-black text-white uppercase tracking-wider leading-none mb-0.5">
                  {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs font-black text-white/60 uppercase tracking-widest leading-none">
                  {user.user_metadata?.role || user.app_metadata?.role || 'Member'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shadow-sm group-hover:shadow-indigo-500/20 transition-all">
                <User className="w-4 h-4 text-white" />
              </div>
              <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-zinc-500 group-hover:text-white group-hover:translate-y-0.5 transition-all" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 custom-scrollbar bg-body">
          <div className="w-full min-h-full flex flex-col">
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
              {route.name === 'performance' && <PerformancePage />}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          user={user} 
          onClose={() => setIsSettingsOpen(false)} 
          onUpdate={(newUser) => setUser(newUser)}
        />
      )}
    </div>
  )
}

function SettingsModal({ user, onClose, onUpdate }: { user: SupabaseUser; onClose: () => void; onUpdate: (u: SupabaseUser) => void }) {
  const [fullName, setFullName] = useState(user.user_metadata?.full_name || '')
  const [role, setRole] = useState(user.user_metadata?.role || 'Member')
  const [loading, setLoading] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    const isSuperAdmin = ['siraj.kamaluddin@zenarise.org', 'aslamy@zenarise.org'].includes(user.email?.toLowerCase() || '')
    const finalRole = isSuperAdmin ? 'Administrator' : role

    const { data, error } = await supabase.auth.updateUser({
      data: { 
        full_name: fullName, 
        role: finalRole 
      }
    })
    
    if (!error && data.user) {
      onUpdate(data.user)
      onClose()
    }
    setLoading(false)
  }

  const handleSignOut = () => {
    supabase.auth.signOut()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Settings className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider">User Settings</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {!showSignOutConfirm ? (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  placeholder="Enter your name"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Professional Role</label>
                <div className="relative">
                  <select 
                    disabled={!['siraj.kamaluddin@zenarise.org', 'aslamy@zenarise.org'].includes(user?.email || '')}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={`w-full bg-slate-950 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium appearance-none ${!['siraj.kamaluddin@zenarise.org', 'aslamy@zenarise.org'].includes(user?.email || '') ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    <option value="Member">Member</option>
                    <option value="Operations Mgr">Operations Mgr</option>
                    <option value="Supply Chain Lead">Supply Chain Lead</option>
                    <option value="Inventory Analyst">Inventory Analyst</option>
                    <option value="Administrator">Administrator</option>
                  </select>
                  {['siraj.kamaluddin@zenarise.org', 'aslamy@zenarise.org'].includes(user?.email || '') && (
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  )}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={onClose}
                    className="flex-1 py-3 text-[10px] font-black text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="flex-1 py-3 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-900/20 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Changes'}
                  </button>
                </div>
                
                <div className="h-px bg-white/5 my-1" />
                
                <button 
                  onClick={() => setShowSignOutConfirm(true)}
                  className="w-full py-3 text-[10px] font-black text-red-400/80 bg-red-400/5 hover:bg-red-400/10 rounded-xl transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out from Account
                </button>
              </div>
            </>
          ) : (
            <div className="py-4 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldAlert className="w-8 h-8 text-red-400" />
              </div>
              <div className="space-y-2">
                <h4 className="text-white font-black uppercase tracking-widest">Confirm Sign Out</h4>
                <p className="text-xs text-slate-400 font-medium">Are you sure you want to end your session?</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSignOutConfirm(false)}
                  className="flex-1 py-3 text-[10px] font-black text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors uppercase tracking-widest"
                >
                  No, Stay
                </button>
                <button 
                  onClick={handleSignOut}
                  className="flex-1 py-3 text-[10px] font-black text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-900/20 transition-all uppercase tracking-widest"
                >
                  Yes, Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
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
