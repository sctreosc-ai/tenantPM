import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Auth() {
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState(null)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage({ type: 'error', text: error.message })
      else setMessage({ type: 'success', text: 'Account created! Check your email to confirm, then log in.' })
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage({ type: 'error', text: error.message })
    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) setMessage({ type: 'error', text: error.message })
      else setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' })
    }
    setLoading(false)
  }

  const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14, border: '1px solid #cbd5e1', borderRadius: 7 }
  const btn = { width: '100%', padding: '10px', background: '#0f1e3c', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 4 }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ width: 380, background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px #0001', padding: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: '#0f1e3c', borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <i className="ti ti-home-2" style={{ fontSize: 26, color: '#f59e0b' }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#0f172a' }}>Tenant Property Manager</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </p>
        </div>

        {message && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 7, fontSize: 13, background: message.type === 'error' ? '#fef2f2' : '#f0fdf4', color: message.type === 'error' ? '#dc2626' : '#16a34a', border: `1px solid ${message.type === 'error' ? '#fca5a5' : '#86efac'}` }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={inp} />
          </div>
          {mode !== 'reset' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Minimum 6 characters" style={inp} />
            </div>
          )}
          <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
          {mode === 'login' && <>
            <span>Don't have an account? </span>
            <button onClick={() => { setMode('signup'); setMessage(null); }} style={{ background: 'none', border: 'none', color: '#0f1e3c', fontWeight: 500, cursor: 'pointer', fontSize: 13 }}>Sign up</button>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => { setMode('reset'); setMessage(null); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>Forgot password?</button>
            </div>
          </>}
          {mode === 'signup' && <>
            <span>Already have an account? </span>
            <button onClick={() => { setMode('login'); setMessage(null); }} style={{ background: 'none', border: 'none', color: '#0f1e3c', fontWeight: 500, cursor: 'pointer', fontSize: 13 }}>Sign in</button>
          </>}
          {mode === 'reset' && <>
            <button onClick={() => { setMode('login'); setMessage(null); }} style={{ background: 'none', border: 'none', color: '#0f1e3c', fontWeight: 500, cursor: 'pointer', fontSize: 13 }}>← Back to sign in</button>
          </>}
        </div>
      </div>
    </div>
  )
}