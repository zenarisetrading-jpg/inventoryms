import { useEffect, useState } from 'react'
import { LayoutDashboard, Package, ClipboardList, Upload, Activity, Calendar, BarChart2, ShieldAlert, Settings, User, ChevronDown, Menu, X, Table, LogOut, Loader2, TrendingUp, Layers, Receipt, Plus, Edit2, Trash2 } from 'lucide-react'

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
import InvoicePage from './pages/invoice'
import { navigate } from './lib/router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { supabase } from './lib/supabase'
import LoginPage from './pages/login'
import { CursorSpotlight } from './components/shared/CursorSpotlight'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { LoadingScreen } from './components/shared/LoadingScreen'
import saddlLogo from './assets/saddl_logo.jpg'
import { useRegion } from './lib/RegionContext'
import { api } from './lib/api'

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
  | { name: 'invoice' }

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
  if (path === '/invoice') return { name: 'invoice' }
  return { name: 'dashboard' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarPinned, setIsSidebarPinned] = useState(true) // Changed to true so it defaults to collapsed but hoverable
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  
  const isSidebarCollapsed = isSidebarPinned && !isSidebarHovered
  
  const toggleSidebarPin = () => setIsSidebarPinned(!isSidebarPinned)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const isAdminRoute = ['skus', 'sku', 'po', 'po_new', 'upload', 'health', 'skus_new'].includes(route.name)
  const [isAdminExpanded, setIsAdminExpanded] = useState(isAdminRoute)
  const { region, setRegion } = useRegion()
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false)
  const [locations, setLocations] = useState<{country: string, saddl_account_id: string, display_name: string}[]>([])
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<{country: string, saddl_account_id: string, display_name: string} | null>(null)

  const fetchLocations = async () => {
    const locs = await api.getLocations()
    if (locs.length > 0) {
      // De-duplicate by saddl_account_id
      const unique = Array.from(new Map(locs.map(l => [l.saddl_account_id, l])).values())
      setLocations(unique)
      
      const currentSelectedAccount = localStorage.getItem('selected_account')
      const validLocation = unique.find(l => l.saddl_account_id === currentSelectedAccount)
      if (validLocation) {
        localStorage.setItem('selected_country', validLocation.country)
      }
    } else {
      setLocations([{ country: 'UAE', saddl_account_id: 's2c_uae_test', display_name: 'UAE' }, { country: 'KSA', saddl_account_id: 's2c_test', display_name: 'KSA' }])
    }
  }

  useEffect(() => {
    fetchLocations()
  }, [])

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
      <CursorSpotlight />
      {/* Immersive Futuristic Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
        {/* Soft Ambient Mesh Glows */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[130px]" />
        <div className="absolute top-[30%] left-[20%] w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px]" />
        <div className="absolute -bottom-20 -left-20 w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[130px]" />
        <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px]" />

        {/* Subtle Flowing Abstract Shapes / Floating 3D Spheres */}
        <div className="absolute top-[15%] left-[25%] w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/10 via-indigo-500/2 to-transparent border border-white/[0.03] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.05),0_10px_40px_rgba(0,0,0,0.2)] backdrop-blur-[2px] animate-pulse" style={{ animationDuration: '15s' }} />
        <div className="absolute bottom-[25%] right-[20%] w-60 h-60 rounded-full bg-gradient-to-tr from-purple-500/8 via-pink-500/1 to-transparent border border-white/[0.02] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.03),0_15px_50px_rgba(0,0,0,0.2)] backdrop-blur-[1px] animate-pulse" style={{ animationDuration: '20s' }} />
        
        {/* Tiny ambient floating particles */}
        <div className="absolute top-[40%] right-[35%] w-2 h-2 rounded-full bg-blue-400/20 blur-[1px] animate-ping" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[45%] left-[40%] w-3 h-3 rounded-full bg-purple-400/20 blur-[1px] animate-ping" style={{ animationDuration: '8s' }} />
      </div>

      {/* Sidebar - Desktop */}
      <aside 
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`
        fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-[#080d1f] via-[#040712] to-[#020409] border-r border-white/[0.04] flex flex-col shrink-0 
        transition-all duration-300 lg:relative lg:translate-x-0
        ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full w-64'}
      `}>
        <div className={`h-14 px-6 flex items-center border-b border-white/[0.04] ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3 flex-nowrap">
            <img 
              src={saddlLogo} 
              alt="Saddl Logo" 
              className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/[0.08] shadow-md shadow-blue-500/5 hover:scale-105 transition-transform duration-300" 
            />
            <div className={`flex items-center gap-3 flex-nowrap shrink-0 transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-[160px] opacity-100'}`}>
              <span className="bg-gradient-to-r from-white via-slate-100 to-blue-400 bg-clip-text text-transparent font-black tracking-tight text-[17px] whitespace-nowrap">
                Saddl<span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent font-bold"> Inventory</span>
              </span>
              {!isSidebarOpen && (
                <button 
                  onClick={toggleSidebarPin} 
                  className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.02] hover:bg-white/[0.08] text-white/40 hover:text-white transition-all shrink-0 hover:scale-105 duration-200 border border-white/[0.04]"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          {isSidebarCollapsed && !isSidebarOpen && (
            <button 
              onClick={toggleSidebarPin} 
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.02] hover:bg-white/[0.08] text-white/40 hover:text-white transition-all hover:scale-105 duration-200 border border-white/[0.04]"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'px-2' : 'px-3.5'} space-y-1.5 overflow-y-auto pb-6 pt-4 custom-scrollbar`}>
          <div className={`px-3 mb-3 flex items-center gap-3 transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'opacity-0 h-0 mb-0 mt-0' : 'opacity-100 h-4'}`}>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.25em] whitespace-nowrap">Strategy</span>
            <div className="h-[1px] flex-1 min-w-[20px] bg-gradient-to-r from-white/5 to-transparent" />
          </div>
          <SidebarLink icon={LayoutDashboard} label="Dashboard" path="/" current={route.name === 'dashboard'} collapsed={isSidebarCollapsed} />
          <SidebarLink icon={Table} label="Inventory" path="/inventory" current={route.name === 'inventory'} collapsed={isSidebarCollapsed} />
          <SidebarLink icon={TrendingUp} label="Performance" path="/performance" current={route.name === 'performance'} collapsed={isSidebarCollapsed} />
          {['Administrator', 'Finance', 'finance'].includes(user?.user_metadata?.role || user?.app_metadata?.role || '') && (
            <SidebarLink icon={Receipt} label="Invoice Billing" path="/invoice" current={route.name === 'invoice'} collapsed={isSidebarCollapsed} />
          )}
        </nav>

        <div className={`p-4 border-t border-white/[0.04] ${isSidebarCollapsed ? 'items-center' : ''}`}>
          <div className={`bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] backdrop-blur-md transition-all hover:border-white/[0.12] hover:shadow-[0_8px_30px_rgba(59,130,246,0.05)] shadow-2xl rounded-2xl ${isSidebarCollapsed ? 'p-1.5' : 'p-3.5'}`}>
            <div className={`flex items-center gap-3.5 ${isAdminExpanded && !isSidebarCollapsed ? 'mb-4' : ''} ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div 
                className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-blue via-indigo-500 to-purple-600 p-[1.5px] shrink-0 cursor-pointer shadow-md shadow-brand-blue/10 hover:scale-105 transition-transform duration-300 avatar-glow-effect"
                onClick={() => isSidebarCollapsed ? toggleSidebarPin() : setIsAdminExpanded(!isAdminExpanded)}
              >
                <div className="w-full h-full rounded-[10px] bg-slate-900 flex items-center justify-center text-[10px] font-black text-white">
                  {user.user_metadata?.full_name?.substring(0, 2).toUpperCase() || user.email?.substring(0, 2).toUpperCase() || 'US'}
                </div>
              </div>
              <div className={`flex flex-1 min-w-0 items-center justify-between transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100 ml-3.5'}`}>
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                >
                  <p className="text-[12px] font-black text-white leading-none uppercase tracking-wider truncate mb-1">
                    {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <span className="inline-block bg-blue-500/10 px-2 py-0.5 rounded text-[8px] tracking-[0.15em] font-semibold text-blue-400 border border-blue-500/15 w-fit uppercase whitespace-nowrap">
                    {user?.user_metadata?.role || user?.app_metadata?.role || 'Member'}
                  </span>
                </div>
                <ChevronDown 
                  className={`w-4 h-4 text-white/30 hover:text-white transition-all cursor-pointer shrink-0 ${isAdminExpanded ? 'rotate-180 text-blue-400' : ''}`} 
                  onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                />
              </div>
            </div>

            {isAdminExpanded && !isSidebarCollapsed && (
              <div className="relative pl-3 ml-[18px] mt-3 space-y-1.5 mb-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Decorative vertical tree connector line */}
                <div className="absolute left-0 top-0 bottom-3 w-[1px] bg-gradient-to-b from-white/15 via-white/5 to-transparent" />
                
                <SidebarLink icon={Package} label="SKU Master" path="/skus" current={route.name === 'skus' || route.name === 'sku'} isSubItem />
                <SidebarLink icon={ClipboardList} label="PO Register" path="/po" current={route.name === 'po'} isSubItem />
                <SidebarLink icon={Layers} label="Operations Hub" path="/upload" current={route.name === 'upload' || route.name === 'health'} isSubItem />
              </div>
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
        <header className="h-14 bg-gradient-to-r from-[#080d1f]/95 to-[#040712]/95 backdrop-blur-md border-b border-white/[0.04] flex items-center justify-between px-4 lg:px-6 shrink-0 relative z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-muted hover:bg-white/5 rounded-lg lg:hidden transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">

            {/* Region Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsRegionDropdownOpen(!isRegionDropdownOpen)}
                onBlur={() => setTimeout(() => setIsRegionDropdownOpen(false), 200)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/[0.05] hover:bg-white/[0.03] transition-all bg-slate-900/50"
              >
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-blue-400">
                    {(locations.find(l => l.saddl_account_id === region)?.country || region).substring(0,2)}
                  </span>
                </div>
                <span className="text-xs font-bold text-white uppercase tracking-wider">{locations.find(l => l.saddl_account_id === region)?.display_name || region}</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isRegionDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isRegionDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-36 bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-1">
                    {locations.map((loc) => (
                      <div key={loc.saddl_account_id} className="flex items-center w-full relative group">
                        <button 
                          onClick={() => { setRegion(loc.saddl_account_id, loc.country); setIsRegionDropdownOpen(false) }}
                          className={`flex-1 flex items-center gap-2 pl-3 pr-2 py-2 text-left rounded-lg text-xs font-bold tracking-wider transition-colors overflow-hidden ${region === loc.saddl_account_id ? 'bg-blue-500/10 text-blue-400' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                        >
                          <span className="uppercase truncate">{loc.display_name || loc.country}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500 ml-auto uppercase shrink-0 group-hover:opacity-0 transition-opacity">{loc.country}</span>
                        </button>
                        <button 
                          onMouseDown={(e) => { 
                            e.preventDefault(); // Prevent onBlur from closing the dropdown before click
                            setEditingLocation(loc); 
                            setIsRegionDropdownOpen(false);
                          }}
                          className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-md transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                        </button>
                      </div>
                    ))}
                    <div className="h-px bg-white/10 my-1 mx-2" />
                    <button 
                      onClick={() => { setIsAddAccountModalOpen(true); setIsRegionDropdownOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-xs font-bold tracking-wider uppercase transition-colors text-slate-400 hover:bg-blue-500/10 hover:text-blue-400"
                    >
                      <Plus className="w-3.5 h-3.5" /> ADD ACCOUNT
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-3 group cursor-pointer hover:bg-white/[0.03] p-1 px-2.5 rounded-xl border border-transparent hover:border-white/[0.05] transition-all duration-300"
            >
              <div className="hidden sm:flex flex-col items-end justify-center mr-1">
                <p className="text-xs font-black text-white uppercase tracking-wider leading-none mb-1">
                  {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                </p>
                <span className="text-[8px] tracking-[0.15em] font-semibold text-blue-400 uppercase leading-none">
                  {user.user_metadata?.role || user.app_metadata?.role || 'Member'}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-blue to-purple-500 p-[1px] shadow-sm group-hover:scale-105 transition-all duration-300">
                <div className="w-full h-full rounded-[7px] bg-slate-900 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-transform duration-300 group-hover:translate-y-0.5" />
            </div>
          </div>
        </header>


        <main key={region} className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 custom-scrollbar bg-transparent relative z-10">
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
              {route.name === 'invoice' && <InvoicePage user={user} />}
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

      {/* Add Account Modal */}
      {isAddAccountModalOpen && (
        <AddAccountModal 
          onClose={() => setIsAddAccountModalOpen(false)}
          onSuccess={async () => {
            await fetchLocations()
            setIsAddAccountModalOpen(false)
          }}
        />
      )}

      {/* Edit Account Modal */}
      {editingLocation && (
        <EditAccountModal 
          location={editingLocation}
          onClose={() => setEditingLocation(null)}
          onSuccess={async () => {
            await fetchLocations()
            setEditingLocation(null)
          }}
        />
      )}
    </div>
  )
}

function SettingsModal({ user, onClose, onUpdate }: { user: SupabaseUser; onClose: () => void; onUpdate: (u: SupabaseUser) => void }) {
  const [fullName, setFullName] = useState(user.user_metadata?.full_name || '')
  const [role] = useState(user.user_metadata?.role || 'Member')
  const [loading, setLoading] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const handleSave = async () => {
    setLoading(true)

    const { data, error } = await supabase.auth.updateUser({
      data: { 
        full_name: fullName
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
                  <input 
                    type="text"
                    disabled
                    value={role}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none transition-all font-medium cursor-not-allowed opacity-60"
                  />
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
      className={`group w-full flex items-center transition-all duration-300 relative overflow-hidden
        ${collapsed 
          ? 'justify-center py-3 px-2 rounded-xl' 
          : `gap-3 px-4 py-2.5 rounded-xl ${isSubItem ? 'py-2 px-3 text-[13px] ml-1' : 'text-sm'}`
        } 
        ${current
          ? isSubItem
            ? 'bg-blue-500/10 text-white font-bold border-l-2 border-brand-blue shadow-sm'
            : 'bg-gradient-to-r from-blue-500/15 via-blue-500/5 to-transparent text-white border-l-[3px] border-brand-blue shadow-[inset_1px_0_0_rgba(255,255,255,0.03)]'
          : 'text-white/45 hover:text-white hover:bg-white/[0.03] hover:translate-x-0.5'
        }`}
    >
      {/* Dynamic background hover glow element */}
      {!current && (
        <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-500/0 via-blue-500/[0.02] to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      )}
      
      <Icon className={`
        ${isSubItem ? 'w-3.5 h-3.5' : 'w-4 h-4'} 
        ${current ? 'text-blue-400' : 'text-white/35 group-hover:text-white/70'} 
        shrink-0 transition-colors duration-300
      `} />
      
      <div className={`flex items-center overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100 ml-3'}`}>
        <span className={`uppercase tracking-[0.15em] ${isSubItem ? 'text-[9px]' : 'text-[10px]'} font-black truncate transition-colors duration-300 whitespace-nowrap`}>
          {label}
        </span>
        {current && (
          <div className="ml-auto flex items-center justify-center shrink-0 pl-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

function AddAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [country, setCountry] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!country.trim() || !accountId.trim() || !displayName.trim()) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    setError(null)
    const result = await api.addLocation(country.trim().toUpperCase(), accountId.trim(), displayName.trim())
    if (result.success) {
      onSuccess()
    } else {
      setError(`Failed to add account: ${result.error || 'Unknown error'}`)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Plus className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Add New Location</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Country Code (e.g., UAE, KSA)</label>
            <input 
              type="text" 
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
              placeholder="Enter country code"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Display Name (e.g., Oneshot UAE)</label>
            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
              placeholder="Enter display name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saddl Account ID</label>
            <input 
              type="text" 
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
              placeholder="e.g. mycompany_us_test"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-2.5 text-[10px] font-black text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] py-2.5 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Add Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditAccountModal({ location, onClose, onSuccess }: { location: {country: string, saddl_account_id: string, display_name: string, is_active?: boolean}, onClose: () => void; onSuccess: () => void }) {
  const [displayName, setDisplayName] = useState(location.display_name || location.country)
  const [accountId, setAccountId] = useState(location.saddl_account_id)
  const [isActive, setIsActive] = useState(location.is_active !== false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    if (!displayName.trim() || !accountId.trim()) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    setError(null)
    const result = await api.updateLocation(location.saddl_account_id, displayName.trim(), accountId.trim(), isActive)
    if (result.success) {
      onSuccess()
    } else {
      setError(`Failed to update account: ${result.error || 'Unknown error'}`)
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    const result = await api.deleteLocation(location.saddl_account_id)
    if (result.success) {
      onSuccess()
    } else {
      setError(`Failed to delete account: ${result.error || 'Unknown error'}`)
      setConfirmDelete(false)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Edit2 className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Edit Account</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
          
          {!confirmDelete ? (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location Code</label>
                <input 
                  type="text" 
                  value={location.country}
                  disabled
                  className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 px-3 text-white/50 focus:outline-none transition-all font-medium text-sm cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Name (e.g., MyCompany UAE)</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
                  placeholder="Enter account name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saddl Account ID</label>
                <input 
                  type="text" 
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
                  placeholder="e.g. mycompany_us_test"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                <div>
                  <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Account Status</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{isActive ? 'Account is active and visible' : 'Account is hidden/disabled'}</div>
                </div>
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[10px] font-black text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="flex-1 py-2.5 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-900/20 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Changes'}
                  </button>
                </div>
                
                <div className="h-px bg-white/5 my-1" />
                
                <button 
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2.5 text-[10px] font-black text-red-400/80 bg-red-400/5 hover:bg-red-400/10 rounded-xl transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Account
                </button>
              </div>
            </>
          ) : (
            <div className="py-2 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-white font-black uppercase tracking-widest text-sm">Delete Account?</h4>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">This will permanently remove the account <span className="text-white">{location.country}</span>.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 text-[10px] font-black text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors uppercase tracking-widest"
                >
                  No, Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 py-2.5 text-[10px] font-black text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-900/20 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes, Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
