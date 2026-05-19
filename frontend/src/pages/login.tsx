import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import saddlLogo from '../assets/saddl_logo.jpg'
import { LogIn, Mail, Lock, ShieldCheck, ArrowRight, AlertCircle, Loader2, UserPlus, ArrowLeft, Eye, EyeOff } from 'lucide-react'

type AuthMode = 'signin' | 'signup'

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    // Domain Validation
    if (!email.toLowerCase().endsWith('@zenarise.org')) {
      setError('Registration is restricted to @zenarise.org email addresses only.')
      setLoading(false)
      return
    }

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      } else {
        const isAdmin = ['siraj.kamaluddin@zenarise.org', 'aslamy@zenarise.org'].includes(email.toLowerCase())
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: isAdmin ? 'Administrator' : 'Member',
              full_name: email.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
            }
          }
        })
        if (error) throw error
        setSuccess('Account created! Please check your email for a confirmation link.')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />
      
      <div className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-white/10 group hover:rotate-3 transition-transform cursor-pointer overflow-hidden" onClick={() => setMode('signin')}>
            <img src={saddlLogo} alt="Saddl Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
            Saddl<span className="text-blue-500"> Inventory</span>
          </h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">
            Operations Management System
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                {mode === 'signin' ? <ShieldCheck className="w-5 h-5 text-blue-400" /> : <UserPlus className="w-5 h-5 text-blue-400" />}
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Company Email
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@zenarise.org"
                  className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Password
                </label>
                {mode === 'signin' && (
                  <button type="button" className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest">
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-medium"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-xs font-bold text-red-400 leading-tight">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                </div>
                <p className="text-xs font-bold text-emerald-400 leading-tight">{success}</p>
              </div>
            )}

            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 transition-all group"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setError(null)
                  setSuccess(null)
                }}
                className="w-full text-[10px] font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {mode === 'signin' ? (
                  <>
                    <span>Need an account?</span>
                    <span className="text-blue-400">Register</span>
                  </>
                ) : (
                  <>
                    <ArrowLeft className="w-3 h-3" />
                    <span>Back to login</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-[10px] font-black text-slate-600 uppercase tracking-widest">
          Secure access via Supabase Auth • @zenarise.org only
        </p>
      </div>
    </div>
  )
}
