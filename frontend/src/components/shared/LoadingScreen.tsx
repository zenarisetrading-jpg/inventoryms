import React from 'react'
import { Loader2 } from 'lucide-react'
import saddlLogo from '../../assets/saddl_logo.jpg'

interface LoadingScreenProps {
  message?: string
  fullScreen?: boolean
}

export function LoadingScreen({ message = 'Loading System Resources...', fullScreen = false }: LoadingScreenProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${fullScreen ? 'h-screen w-full fixed inset-0 z-[100] bg-slate-950' : 'flex-1 min-h-[60vh] w-full'}`}>
      <div className="relative mb-8">
        {/* Animated Rings */}
        <div className="absolute inset-[-20px] border border-blue-500/10 rounded-full animate-[ping_3s_infinite]" />
        <div className="absolute inset-[-40px] border border-blue-500/5 rounded-full animate-[ping_3s_infinite_1s]" />
        
        {/* Logo Hexagon / Container */}
        <div className="relative w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.15)] border border-blue-500/10 transform rotate-12 group-hover:rotate-0 transition-transform duration-500 overflow-hidden">
          <img src={saddlLogo} alt="Saddl Logo" className="w-full h-full object-cover transform -rotate-12 group-hover:rotate-0 transition-transform duration-500" />
          
          {/* Scanning Line */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            <div className="w-full h-[2px] bg-blue-500/50 absolute top-0 animate-[scan_2s_infinite_linear] shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.4em] relative">
              {message}
              <span className="absolute inset-0 text-blue-500 animate-pulse opacity-20">{message}</span>
            </h3>
          </div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest opacity-60">
            Secure Neural Link Established
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 relative">
          <div className="h-full bg-blue-600 w-1/3 animate-[loading_2s_infinite_easeInOutQuad] shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
        </div>
        
        <div className="flex items-center gap-8 opacity-40">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Core Data</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse [animation-delay:0.5s]" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse [animation-delay:1s]" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Fleet OS</span>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes loading {
          0% { left: -40%; width: 30%; }
          50% { width: 60%; }
          100% { left: 110%; width: 30%; }
        }
        @keyframes scan {
          0% { top: -10%; }
          100% { top: 110%; }
        }
      `}</style>
    </div>
  )
}
