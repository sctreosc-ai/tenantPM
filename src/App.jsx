 import { useState, useEffect, useRef } from 'react'
import { supabase, uploadImage, deleteImage } from './lib/supabase.js'
import { exportTenantReport } from './lib/excel.js'
import Auth from './components/Auth.jsx'

const SVC_CATS   = ['Plumbing','Electrical','HVAC/Heating','Appliance','Pest Control','Structural','Landscaping','General Maintenance','Other']
const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOA_TYPES  = ['Dues Unpaid','Noise Violation','Parking Violation','Pet Violation','Appearance Violation','Pool/Amenity Violation','Lease Violation','Other']
const RET_METHS  = ['Check by Mail','Check Hand-Delivered','ACH/Wire Transfer','Zelle','Venmo','Cash','Other']
const COND       = {good:{label:'Good / Clean',color:'#16a34a'},fair:{label:'Fair',color:'#d97706'},wear:{label:'Normal Wear',color:'#0284c7'},damaged:{label:'Damaged',color:'#dc2626'}}
const SVC_SC     = {Open:'#d97706','In Progress':'#0284c7',Completed:'#16a34a',Cancelled:'#94a3b8'}
const HOA_SC     = {Outstanding:'#dc2626',Paid:'#16a34a',Disputed:'#d97706',Waived:'#94a3b8'}
const RENT_SC    = {'On Time':'#16a34a',Late:'#d97706',Partial:'#0284c7',Unpaid:'#dc2626'}
const TABS = [
  {key:'damages',   label:'Damages',          icon:'ti-alert-triangle'},
  {key:'service',   label:'Service Requests', icon:'ti-tool'},
  {key:'rent',      label:'Rent & Fees',       icon:'ti-cash'},
  {key:'hoa',       label:'HOA',               icon:'ti-building-community'},
  {key:'deposit',   label:'Deposit Checklist', icon:'ti-checklist'},
]

const fmt = n => `$${(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const daysBetween = (a,b) => (!a||!b)?0:Math.floor((new Date(b)-new Date(a))/86400000)
const daysLateAfterGrace = (due,paid) => {
  if (!due||!paid) return 0
  const grace = new Date(due); grace.setDate(grace.getDate()+3)
  return Math.max(0,daysBetween(grace.toISOString().slice(0,10),paid))
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:14,color:'#94a3b8'}}>Loading…</div>
  if (!user) return <Auth />
  return <Dashboard user={user} />
}

function Dashboard({ user }) {
  const [tenants, setTenants] = useState([])
  const [selId, setSelId] = useState(null)
  const [panel, setPanel] = useState('splash')
  const [tab, setTab] = useState('damages')
  const [showArch, setShowArch] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(null)
  const [tData, setTData] = useState({})
  const [dataLoading, setDataLoading] = useState(false)
  const [tF,setTF] = useState({name:'',unit:'',moveIn:'',moveOut:'',depositAmount:'',lateFeeDefault:'',adminFeeDefault:''})
  const [dF,setDF] = useState({description:'',location:'',cost:'',notes:''})
  const [sF,setSF] = useState({date:'',category:'General Maintenance',description:'',priority:'Medium',status:'Open',techName:'',techCompany:'',techCost:'',completedDate:'',notes:''})
  const [rF,setRF] = useState({periodMonth:'',periodYear:new Date().getFullYear(),dueDate:'',rentDue:'',amountPaid:'',paidDate:'',lateFee:'',adminFee:'',method:'Check',notes:''})
  const [hF,setHF] = useState({date:'',type:'Dues Unpaid',description:'',amount:'',status:'Outstanding',paidDate:'',notes:''})
  const [newCI,setNewCI] = useState({area:'',item:''})
  const [imgUploading, setImgUploading] = useState(false)
const dPreR=useRef(); const dAftR=useRef(); const sDocR=useRef()
const [dPreUrl, setDPreUrl] = useState(null)
const [dAftUrl, setDAftUrl] = useState(null)
const [dExtraUrls, setDExtraUrls] = useState([])
const [sDocUrl, setSDocUrl] = useState(null)

  useEffect(() => { loadTenants() }, [user])

  const loadTenants = async () => {
    setLoading(true)
    const { data } = await supabase.from('tenants').select('*').eq('user_id', user.id).order('created_at')
    setTenants(data || [])
    setLoading(false)
  }

  const loadTenantData = async (tenantId) => {
    setDataLoading(true)
    const [d, s, r, h, c, dr] = await Promise.all([
      supabase.from('damages').select('*').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('service_requests').select('*').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('rent_payments').select('*').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('hoa_charges').select('*').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('checklist_items').select('*').eq('tenant_id', tenantId).order('sort_order'),
      supabase.from('deposit_returns').select('*').eq('tenant_id', tenantId).single(),
    ])
    setTData(prev => ({
      ...prev,
      [tenantId]: {
        damages: d.data || [],
        serviceRequests: s.data || [],
        rentPayments: r.data || [],
        hoaCharges: h.data || [],
        checklistItems: c.data || [],
        depositReturn: dr.data || null,
      }
    }))
    setDataLoading(false)
  }

  const selTenant = async (id) => {
    setSelId(id); setPanel('detail'); setTab('damages')
    if (!tData[id]) await loadTenantData(id)
  }

  const T  = tenants.find(t => t.id === selId)
  const TD = tData[selId] || { damages:[], serviceRequests:[], rentPayments:[], hoaCharges:[], checklistItems:[], depositReturn:null }
  const active   = tenants.filter(t => t.status !== 'archived')
  const archived = tenants.filter(t => t.status === 'archived')

  const createTenant = async () => {
    if (!tF.name.trim()) return
    const row = {
      user_id: user.id, name: tF.name.trim(), unit: tF.unit.trim(),
      move_in: tF.moveIn||null, move_out: tF.moveOut||null,
      deposit_amount: parseFloat(tF.depositAmount)||0,
      late_fee_default: parseFloat(tF.lateFeeDefault)||0,
      admin_fee_default: parseFloat(tF.adminFeeDefault)||0,
    }
    const { data, error } = await supabase.from('tenants').insert(row).select().single()
    if (error) { alert('Error: '+error.message); return }
    await supabase.rpc('insert_default_checklist', { p_tenant_id: data.id, p_user_id: user.id })
    setTenants(prev => [...prev, data])
    setTF({name:'',unit:'',moveIn:'',moveOut:'',depositAmount:'',lateFeeDefault:'',adminFeeDefault:''})
    await selTenant(data.id)
  }

  const archiveTenant = async (id) => {
    await supabase.from('tenants').update({ status: 'archived' }).eq('id', id)
    setTenants(prev => prev.map(t => t.id === id ? {...t, status: 'archived'} : t))
    if (selId === id) { setSelId(null); setPanel('splash') }
  }
  const restoreTenant = async (id) => {
    await supabase.from('tenants').update({ status: 'active' }).eq('id', id)
    setTenants(prev => prev.map(t => t.id === id ? {...t, status: 'active'} : t))
  }
  const deleteTenant = async (id) => {
    if (!window.confirm('Delete this tenant permanently?')) return
    await supabase.from('tenants').delete().eq('id', id)
    setTenants(prev => prev.filter(t => t.id !== id))
    if (selId === id) { setSelId(null); setPanel('splash') }
  }

  const addRecord = async (table, row, key) => {
    const { data, error } = await supabase.from(table).insert({ ...row, tenant_id: selId, user_id: user.id }).select().single()
    if (error) { alert('Save error: '+error.message); return null }
    setTData(prev => ({ ...prev, [selId]: { ...TD, [key]: [...(TD[key]||[]), data] } }))
    return data
  }
  const delRecord = async (table, id, key) => {
    await supabase.from(table).delete().eq('id', id)
    setTData(prev => ({ ...prev, [selId]: { ...TD, [key]: TD[key].filter(r => r.id !== id) } }))
  }
  const updRecord = async (table, id, patch, key) => {
    const { data } = await supabase.from(table).update(patch).eq('id', id).select().single()
    if (data) setTData(prev => ({ ...prev, [selId]: { ...TD, [key]: TD[key].map(r => r.id === id ? data : r) } }))
  }

  const handleImg = async (file, pathPrefix) => {
    if (!file) return null
    setImgUploading(true)
    const path = `${user.id}/${selId}/${pathPrefix}_${Date.now()}`
    const url = await uploadImage(file, path)
    setImgUploading(false)
    return url
  }

  const addDamage = async () => {
  if (!dF.description.trim()) return
  const preUrl = dPreUrl
  const aftUrl = dAftUrl
  await addRecord('damages', {
    description: dF.description.trim(), location: dF.location.trim(),
    cost: parseFloat(dF.cost)||0, notes: dF.notes.trim(),
    pre_image_url: preUrl, after_image_url: aftUrl,
    extra_images: dExtraUrls,
    recorded_at: new Date().toISOString().slice(0,10),
  }, 'damages')
  setDF({description:'',location:'',cost:'',notes:''})
  setDPreUrl(null); setDAftUrl(null); setDExtraUrls([])
  if (dPreR.current) dPreR.current.value = ''
  if (dAftR.current) dAftR.current.value = ''
}  

  const addService = async () => {
    if (!sF.description.trim()) return
    const docUrl = sDocR.current?.files[0] ? await handleImg(sDocR.current.files[0], 'doc') : null
    await addRecord('service_requests', {
      date: sF.date||null, category: sF.category, description: sF.description.trim(),
      priority: sF.priority, status: sF.status,
      tech_name: sF.techName.trim(), tech_company: sF.techCompany.trim(),
      tech_cost: parseFloat(sF.techCost)||0, completed_date: sF.completedDate||null,
      notes: sF.notes.trim(), doc_image_url: docUrl,
    }, 'serviceRequests')
    setSF({date:'',category:'General Maintenance',description:'',priority:'Medium',status:'Open',techName:'',techCompany:'',techCost:'',completedDate:'',notes:''})
    if (sDocR.current) sDocR.current.value = ''
  }

  const addRent = async () => {
    if (!rF.periodMonth) return
    const rentDue = parseFloat(rF.rentDue)||0
    const amountPaid = parseFloat(rF.amountPaid)||0
    const dlg = daysLateAfterGrace(rF.dueDate, rF.paidDate)
    const lateFee = parseFloat(rF.lateFee) || (dlg > 0 ? (T?.late_fee_default||0) : 0)
    const adminFee = parseFloat(rF.adminFee) || (dlg > 0 ? (T?.admin_fee_default||0) : 0)
    const rawDays = daysBetween(rF.dueDate, rF.paidDate)
    const status = amountPaid===0 ? 'Unpaid' : amountPaid<rentDue ? 'Partial' : dlg>0 ? 'Late' : 'On Time'
    await addRecord('rent_payments', {
      period_month: parseInt(rF.periodMonth), period_year: parseInt(rF.periodYear),
      due_date: rF.dueDate||null, rent_due: rentDue, amount_paid: amountPaid,
      paid_date: rF.paidDate||null, days_late: Math.max(0,rawDays), days_late_after_grace: dlg,
      late_fee: lateFee, admin_fee: adminFee, method: rF.method, status, notes: rF.notes,
    }, 'rentPayments')
    setRF({periodMonth:'',periodYear:new Date().getFullYear(),dueDate:'',rentDue:'',amountPaid:'',paidDate:'',lateFee:'',adminFee:'',method:'Check',notes:''})
  }

  const addHoa = async () => {
    if (!hF.description.trim()) return
    await addRecord('hoa_charges', {
      date: hF.date||null, type: hF.type, description: hF.description.trim(),
      amount: parseFloat(hF.amount)||0, status: hF.status,
      paid_date: hF.paidDate||null, notes: hF.notes,
    }, 'hoaCharges')
    setHF({date:'',type:'Dues Unpaid',description:'',amount:'',status:'Outstanding',paidDate:'',notes:''})
  }

  const updCLItem = async (itemId, patch) => { await updRecord('checklist_items', itemId, patch, 'checklistItems') }
  const addCLItem = async () => {
    if (!newCI.area.trim()||!newCI.item.trim()) return
    const maxOrder = Math.max(0, ...TD.checklistItems.map(i=>i.sort_order||0))
    await addRecord('checklist_items', { area: newCI.area.trim(), item: newCI.item.trim(), condition: 'good', count_ded: false, cost: 0, sort_order: maxOrder+1 }, 'checklistItems')
    setNewCI({area:'',item:''})
  }
  const delCLItem = async (id) => { await delRecord('checklist_items', id, 'checklistItems') }
  const updCLImg = async (e, itemId) => {
    const file = e.target.files[0]
    if (!file) return
    const url = await handleImg(file, `cl_${itemId}`)
    if (url) await updCLItem(itemId, { image_url: url })
  }

  const updDepReturn = async (patch) => {
    const existing = TD.depositReturn
    if (existing) {
      const { data } = await supabase.from('deposit_returns').update(patch).eq('id', existing.id).select().single()
      if (data) setTData(prev => ({...prev, [selId]: {...TD, depositReturn: data}}))
    } else {
      const { data } = await supabase.from('deposit_returns').insert({ ...patch, tenant_id: selId, user_id: user.id }).select().single()
      if (data) setTData(prev => ({...prev, [selId]: {...TD, depositReturn: data}}))
    }
  }

  const doExport = () => {
    if (!T) return
    exportTenantReport(T, {
      damages: TD.damages, serviceRequests: TD.serviceRequests,
      rentPayments: TD.rentPayments, hoaCharges: TD.hoaCharges,
      checklistItems: TD.checklistItems, depositReturn: TD.depositReturn,
    })
  }

  const formIsLate = daysLateAfterGrace(rF.dueDate, rF.paidDate) > 0
  const formDaysLate = daysLateAfterGrace(rF.dueDate, rF.paidDate)
  const dedItems = TD.checklistItems.filter(i => i.count_ded)
  const dedTotal = dedItems.reduce((s,i) => s+(i.cost||0), 0)
  const clAreas  = [...new Set(TD.checklistItems.map(i => i.area))]

  const IS  = {width:'100%',boxSizing:'border-box',fontSize:13}
  const LS  = {fontSize:12,color:'#64748b',display:'block',marginBottom:3}
  const SL  = {fontSize:11,fontWeight:500,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}
  const CS  = {border:'1px solid #e2e8f0',borderRadius:8,padding:'11px 14px',marginBottom:8,background:'#fff'}
  const badge = (txt,col='#64748b') => <span style={{fontSize:11,background:col+'22',color:col,borderRadius:4,padding:'2px 7px',fontWeight:500}}>{txt}</span>
  const thumb = (src,lbl) => src ? <div><img src={src} alt={lbl} onClick={()=>setLightbox({src,label:lbl})} style={{width:84,height:60,objectFit:'cover',borderRadius:4,cursor:'pointer',border:'1px solid #e2e8f0',display:'block'}}/><div style={{fontSize:10,color:'#94a3b8',marginTop:2,textAlign:'center'}}>{lbl}</div></div> : null
  const mc = (label,val,color) => <div style={{background:'#f8fafc',borderRadius:8,padding:'8px 14px',textAlign:'center',minWidth:90}}><div style={{fontSize:11,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div><div style={{fontSize:17,fontWeight:500,color:color||'#0f172a',marginTop:3}}>{val}</div></div>
  const delB = (fn) => T?.status==='active' && <button onClick={fn} style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:15,padding:3}}><i className="ti ti-trash"/></button>

  return (
    <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',fontSize:14,minHeight:'100vh',background:'#f8fafc'}}>
      <div style={{background:'#0f1e3c',padding:'13px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:50}}>
        <div style={{display:'flex',alignItems:'center',gap:10,color:'#f1f5f9'}}>
          <i className="ti ti-home-2" style={{fontSize:20}}/>
          <span style={{fontSize:15,fontWeight:500}}>Tenant Property Manager</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {T && <button onClick={doExport} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:6,padding:'6px 13px',fontSize:12,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><i className="ti ti-file-spreadsheet" style={{fontSize:13}}/> Export All</button>}
          <button onClick={()=>setPanel('new-tenant')} style={{background:'#f59e0b',color:'#fff',border:'none',borderRadius:6,padding:'6px 14px',fontSize:13,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}><i className="ti ti-plus" style={{fontSize:13}}/> New Tenant</button>
          <button onClick={()=>supabase.auth.signOut()} title="Sign out" style={{background:'transparent',border:'1px solid #334155',color:'#94a3b8',borderRadius:6,padding:'6px 10px',fontSize:12,cursor:'pointer'}}><i className="ti ti-logout" style={{fontSize:14}}/></button>
        </div>
      </div>

      <div style={{display:'flex',minHeight:'calc(100vh - 50px)'}}>
        <div style={{width:200,flexShrink:0,borderRight:'1px solid #e2e8f0',background:'#fff',minHeight:'100%'}}>
          <div style={{...SL,padding:'12px 12px 4px'}}>Active ({active.length})</div>
          {loading && <div style={{padding:'8px 12px',fontSize:12,color:'#94a3b8'}}>Loading…</div>}
          {!loading && active.length===0 && <p style={{padding:'4px 12px',fontSize:12,color:'#94a3b8',margin:0}}>No tenants yet</p>}
          {active.map(t => {
            const isSel = selId === t.id
            return <div key={t.id} onClick={()=>selTenant(t.id)} style={{padding:'9px 12px',cursor:'pointer',borderLeft:isSel?'3px solid #f59e0b':'3px solid transparent',borderBottom:'1px solid #f1f5f9',background:isSel?'#f8fafc':'transparent'}}>
              <div style={{fontWeight:500,fontSize:13,color:'#0f172a'}}>{t.name}</div>
              <div style={{fontSize:11,color:'#64748b',marginTop:2}}>{t.unit||'—'}</div>
            </div>
          })}
          {archived.length > 0 && <>
            <div onClick={()=>setShowArch(v=>!v)} style={{...SL,padding:'12px 12px 4px',cursor:'pointer',display:'flex',alignItems:'center',gap:4,marginTop:4}}>
              <i className={`ti ti-chevron-${showArch?'down':'right'}`} style={{fontSize:11}}/> Archived ({archived.length})
            </div>
            {showArch && archived.map(t => <div key={t.id} onClick={()=>selTenant(t.id)} style={{padding:'8px 12px',cursor:'pointer',borderLeft:selId===t.id?'3px solid #94a3b8':'3px solid transparent',borderBottom:'1px solid #f1f5f9',opacity:0.65}}>
              <div style={{fontWeight:500,fontSize:13,color:'#0f172a'}}>{t.name}</div>
              <div style={{fontSize:11,color:'#64748b'}}>{t.unit||'—'}</div>
            </div>)}
          </>}
        </div>

        <div style={{flex:1,overflow:'auto',background:'#f8fafc'}}>
          {panel==='splash' && <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'80px 24px',textAlign:'center',color:'#64748b'}}>
            <i className="ti ti-home-2" style={{fontSize:52,color:'#cbd5e1'}}/>
            <p style={{fontSize:15,marginTop:14,marginBottom:4,color:'#0f172a'}}>Tenant Property Manager</p>
            <p style={{fontSize:13,margin:'0 0 20px'}}>Select a tenant or create one to get started</p>
            <button onClick={()=>setPanel('new-tenant')} style={{background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontSize:13,fontWeight:500,cursor:'pointer'}}>+ New Tenant</button>
          </div>}

          {panel==='new-tenant' && <div style={{padding:'24px',maxWidth:560}}>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 18px',color:'#0f172a'}}>Add new tenant</h2>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 18px'}}>
              <div style={{gridColumn:'1/-1'}}><label style={LS}>Tenant name *</label><input value={tF.name} onChange={e=>setTF(f=>({...f,name:e.target.value}))} placeholder="Full name" style={IS}/></div>
              <div><label style={LS}>Unit / address</label><input value={tF.unit} onChange={e=>setTF(f=>({...f,unit:e.target.value}))} placeholder="Apt 4B" style={IS}/></div>
              <div><label style={LS}>Security deposit ($)</label><input type="number" value={tF.depositAmount} onChange={e=>setTF(f=>({...f,depositAmount:e.target.value}))} placeholder="0.00" style={IS}/></div>
              <div><label style={LS}>Move-in date</label><input type="date" value={tF.moveIn} onChange={e=>setTF(f=>({...f,moveIn:e.target.value}))} style={IS}/></div>
              <div><label style={LS}>Move-out date</label><input type="date" value={tF.moveOut} onChange={e=>setTF(f=>({...f,moveOut:e.target.value}))} style={IS}/></div>
              <div><label style={LS}>Default late fee ($)</label><input type="number" value={tF.lateFeeDefault} onChange={e=>setTF(f=>({...f,lateFeeDefault:e.target.value}))} placeholder="e.g. 75.00" style={IS}/></div>
              <div><label style={LS}>Default admin fee ($)</label><input type="number" value={tF.adminFeeDefault} onChange={e=>setTF(f=>({...f,adminFeeDefault:e.target.value}))} placeholder="e.g. 25.00" style={IS}/></div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:20}}>
              <button onClick={createTenant} disabled={!tF.name.trim()} style={{background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontSize:13,fontWeight:500,cursor:tF.name.trim()?'pointer':'not-allowed',opacity:tF.name.trim()?1:0.5}}>Create Tenant</button>
              <button onClick={()=>setPanel(selId?'detail':'splash')} style={{background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'8px 16px',fontSize:13,cursor:'pointer',color:'#374151'}}>Cancel</button>
            </div>
          </div>}

          {panel==='detail' && T && <div style={{background:'#fff',minHeight:'calc(100vh - 50px)'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap',background:'#fff'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <h2 style={{fontSize:16,fontWeight:600,margin:0,color:'#0f172a'}}>{T.name}</h2>
                  {T.status==='archived' && <span style={{fontSize:11,background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:4,padding:'2px 7px',color:'#64748b'}}>Archived</span>}
                </div>
                <div style={{fontSize:12,color:'#64748b',marginTop:4,display:'flex',gap:14,flexWrap:'wrap'}}>
                  {T.unit && <span><i className="ti ti-building" style={{fontSize:12,verticalAlign:-1,marginRight:3}}/>{T.unit}</span>}
                  {T.move_in && <span><i className="ti ti-calendar" style={{fontSize:12,verticalAlign:-1,marginRight:3}}/>In: {T.move_in}</span>}
                  {T.move_out && <span><i className="ti ti-calendar-off" style={{fontSize:12,verticalAlign:-1,marginRight:3}}/>Out: {T.move_out}</span>}
                  <span><i className="ti ti-wallet" style={{fontSize:12,verticalAlign:-1,marginRight:3}}/>Deposit: {fmt(T.deposit_amount||0)}</span>
                </div>
              </div>
              <div style={{display:'flex',gap:6}}>
                {T.status==='active'
                  ? <button onClick={()=>archiveTenant(T.id)} style={{background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',color:'#64748b',display:'flex',alignItems:'center',gap:3}}><i className="ti ti-archive" style={{fontSize:12}}/> Archive</button>
                  : <><button onClick={()=>restoreTenant(T.id)} style={{background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',color:'#64748b',display:'flex',alignItems:'center',gap:3}}><i className="ti ti-restore" style={{fontSize:12}}/> Restore</button>
                     <button onClick={()=>deleteTenant(T.id)} style={{background:'transparent',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',color:'#dc2626',display:'flex',alignItems:'center',gap:3}}><i className="ti ti-trash" style={{fontSize:12}}/> Delete</button></>
                }
              </div>
            </div>

            <div style={{display:'flex',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',overflowX:'auto'}}>
              {TABS.map(t => <button key={t.key} onClick={()=>setTab(t.key)} style={{padding:'9px 14px',border:'none',borderBottom:tab===t.key?'2px solid #f59e0b':'2px solid transparent',background:'transparent',fontSize:13,cursor:'pointer',color:tab===t.key?'#0f1e3c':'#64748b',fontWeight:tab===t.key?500:400,display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
                <i className={`ti ${t.icon}`} style={{fontSize:14}}/>{t.label}
              </button>)}
            </div>

            {dataLoading && <div style={{padding:'40px',textAlign:'center',color:'#94a3b8',fontSize:13}}>Loading tenant data…</div>}
            {!dataLoading && <div style={{padding:'16px 20px'}}>

              {tab==='damages' && (() => {
                const dmgs = TD.damages
                const tot = dmgs.reduce((s,d)=>s+(d.cost||0),0)
                return <div>
                  <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
                    {mc('Total Damages',fmt(tot),'#dc2626')}
                    {mc('Deposit Held',fmt(T.deposit_amount||0),'#64748b')}
                    {mc('Amount Owed',fmt(Math.max(0,tot-(T.deposit_amount||0))),'#d97706')}
                  </div>
                  {T.status==='active' && <div style={{...CS,background:'#f8fafc',marginBottom:16}}>
                    <div style={SL}>Add damage item</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px 16px'}}>
                      <div><label style={LS}>Description *</label><input value={dF.description} onChange={e=>setDF(f=>({...f,description:e.target.value}))} placeholder="Cracked tile" style={IS}/></div>
                      <div><label style={LS}>Location</label><input value={dF.location} onChange={e=>setDF(f=>({...f,location:e.target.value}))} placeholder="Master bath" style={IS}/></div>
                      <div><label style={LS}>Repair cost ($)</label><input type="number" value={dF.cost} onChange={e=>setDF(f=>({...f,cost:e.target.value}))} placeholder="0.00" style={IS}/></div>
                      <div><label style={LS}>Notes</label><input value={dF.notes} onChange={e=>setDF(f=>({...f,notes:e.target.value}))} placeholder="Optional" style={IS}/></div>
                      <div style={{gridColumn:'1/-1'}}>
  <label style={LS}>Before photo / video</label>
  <label style={{cursor:'pointer',fontSize:12,color:'#2563eb',border:'1px dashed #e2e8f0',borderRadius:6,padding:'8px 12px',display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
    <i className="ti ti-camera" style={{fontSize:14}}/>{dPreUrl?'✓ Uploaded — tap to change':'Tap to upload before photo or video'}
    <input type="file" accept="image/*,video/*" onChange={async e=>{const f=e.target.files[0];if(f){setImgUploading(true);const url=await uploadImage(f,`${user.id}/${selId}/pre_${Date.now()}`);setDPreUrl(url);setImgUploading(false);}}} style={{display:'none'}}/>
  </label>
  {dPreUrl&&(dPreUrl.includes('.mp4')||dPreUrl.includes('.mov')||dPreUrl.includes('.webm')
    ?<video src={dPreUrl} controls style={{width:'100%',maxHeight:160,borderRadius:4,marginBottom:4}}/>
    :<img src={dPreUrl} alt="before" style={{width:'100%',maxHeight:160,objectFit:'cover',borderRadius:4,marginBottom:4}}/>)}
</div>

<div style={{gridColumn:'1/-1'}}>
  <label style={LS}>After photo / video</label>
  <label style={{cursor:'pointer',fontSize:12,color:'#2563eb',border:'1px dashed #e2e8f0',borderRadius:6,padding:'8px 12px',display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
    <i className="ti ti-camera" style={{fontSize:14}}/>{dAftUrl?'✓ Uploaded — tap to change':'Tap to upload after photo or video'}
    <input type="file" accept="image/*,video/*" onChange={async e=>{const f=e.target.files[0];if(f){setImgUploading(true);const url=await uploadImage(f,`${user.id}/${selId}/aft_${Date.now()}`);setDAftUrl(url);setImgUploading(false);}}} style={{display:'none'}}/>
  </label>
  {dAftUrl&&(dAftUrl.includes('.mp4')||dAftUrl.includes('.mov')||dAftUrl.includes('.webm')
    ?<video src={dAftUrl} controls style={{width:'100%',maxHeight:160,borderRadius:4,marginBottom:4}}/>
    :<img src={dAftUrl} alt="after" style={{width:'100%',maxHeight:160,objectFit:'cover',borderRadius:4,marginBottom:4}}/>)}
</div>

<div style={{gridColumn:'1/-1'}}>
  <label style={LS}>Additional photos / videos (tap + to add more)</label>
  {dExtraUrls.map((url,i)=>(
    <div key={i} style={{position:'relative',marginBottom:4}}>
      {url.includes('.mp4')||url.includes('.mov')||url.includes('.webm')
        ?<video src={url} controls style={{width:'100%',maxHeight:120,borderRadius:4}}/>
        :<img src={url} alt={`extra${i}`} style={{width:'100%',maxHeight:120,objectFit:'cover',borderRadius:4}}/>}
      <button onClick={()=>setDExtraUrls(prev=>prev.filter((_,j)=>j!==i))} style={{position:'absolute',top:4,right:4,background:'#dc2626',color:'#fff',border:'none',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontSize:12}}>✕</button>
    </div>
  ))}
  <label style={{cursor:'pointer',fontSize:12,color:'#2563eb',border:'1px dashed #e2e8f0',borderRadius:6,padding:'8px 12px',display:'flex',alignItems:'center',gap:6}}>
    <i className="ti ti-plus" style={{fontSize:14}}/>Add another photo or video
    <input type="file" accept="image/*,video/*" onChange={async e=>{const f=e.target.files[0];if(f){setImgUploading(true);const url=await uploadImage(f,`${user.id}/${selId}/extra_${Date.now()}`);setDExtraUrls(prev=>[...prev,url]);setImgUploading(false);}}} style={{display:'none'}}/>
  </label>
</div>
                    </div>
                    <button onClick={addDamage} disabled={!dF.description.trim()||imgUploading} style={{marginTop:12,background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'7px 16px',fontSize:13,fontWeight:500,cursor:'pointer',opacity:dF.description.trim()&&!imgUploading?1:0.5}}>{imgUploading?'Uploading…':'+ Add Damage Item'}</button>
                  </div>}
                  {dmgs.length===0 ? <div style={{textAlign:'center',padding:'24px 0',color:'#94a3b8',fontSize:13}}>No damage items recorded</div>
                  : dmgs.map((d,i) => <div key={d.id} style={CS}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                          <span style={{fontSize:11,background:'#0f1e3c',color:'#fff',borderRadius:3,padding:'2px 6px',fontWeight:500}}>#{i+1}</span>
                          <span style={{fontWeight:500,fontSize:14,color:'#0f172a'}}>{d.description}</span>
                          {d.location && <span style={{fontSize:12,color:'#64748b'}}><i className="ti ti-map-pin" style={{fontSize:12,verticalAlign:-1}}/> {d.location}</span>}
                        </div>
                        {d.notes && <div style={{fontSize:12,color:'#64748b',marginTop:3}}>{d.notes}</div>}
                        <div style={{fontSize:11,color:'#94a3b8',marginTop:3}}>{d.recorded_at}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:15,fontWeight:500,color:'#dc2626'}}>{fmt(d.cost)}</span>
                        {delB(()=>delRecord('damages',d.id,'damages'))}
                      </div>
                    </div>
                    {(d.pre_image_url||d.after_image_url) && <div style={{display:'flex',gap:10,marginTop:10}}>{thumb(d.pre_image_url,'Before')}{thumb(d.after_image_url,'After')}</div>}
                  </div>)}
                </div>
              })()}

              {tab==='service' && (() => {
                const svcs = TD.serviceRequests
                const tot = svcs.reduce((s,v)=>s+(v.tech_cost||0),0)
                return <div>
                  <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
                    {mc('Total Requests',svcs.length)}{mc('Open',svcs.filter(s=>s.status==='Open').length,'#d97706')}
                    {mc('Total Cost',fmt(tot),'#dc2626')}{mc('Completed',svcs.filter(s=>s.status==='Completed').length,'#16a34a')}
                  </div>
                  {T.status==='active' && <div style={{...CS,background:'#f8fafc',marginBottom:16}}>
                    <div style={SL}>Log service request</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px 16px'}}>
                      <div><label style={LS}>Date</label><input type="date" value={sF.date} onChange={e=>setSF(f=>({...f,date:e.target.value}))} style={IS}/></div>
                      <div><label style={LS}>Category</label><select value={sF.category} onChange={e=>setSF(f=>({...f,category:e.target.value}))} style={{...IS,background:'#fff'}}>{SVC_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                      <div style={{gridColumn:'1/-1'}}><label style={LS}>Description *</label><input value={sF.description} onChange={e=>setSF(f=>({...f,description:e.target.value}))} placeholder="Describe the issue" style={IS}/></div>
                      <div><label style={LS}>Priority</label><select value={sF.priority} onChange={e=>setSF(f=>({...f,priority:e.target.value}))} style={{...IS,background:'#fff'}}>{['Low','Medium','High','Emergency'].map(p=><option key={p}>{p}</option>)}</select></div>
                      <div><label style={LS}>Status</label><select value={sF.status} onChange={e=>setSF(f=>({...f,status:e.target.value}))} style={{...IS,background:'#fff'}}>{['Open','In Progress','Completed','Cancelled'].map(s=><option key={s}>{s}</option>)}</select></div>
                      <div><label style={LS}>Technician</label><input value={sF.techName} onChange={e=>setSF(f=>({...f,techName:e.target.value}))} placeholder="Name" style={IS}/></div>
                      <div><label style={LS}>Company</label><input value={sF.techCompany} onChange={e=>setSF(f=>({...f,techCompany:e.target.value}))} placeholder="Company" style={IS}/></div>
                      <div><label style={LS}>Cost ($)</label><input type="number" value={sF.techCost} onChange={e=>setSF(f=>({...f,techCost:e.target.value}))} placeholder="0.00" style={IS}/></div>
                      <div><label style={LS}>Completed date</label><input type="date" value={sF.completedDate} onChange={e=>setSF(f=>({...f,completedDate:e.target.value}))} style={IS}/></div>
                      <div><label style={LS}>Notes</label><input value={sF.notes} onChange={e=>setSF(f=>({...f,notes:e.target.value}))} placeholder="Optional" style={IS}/></div>
                      <div style={{gridColumn:'1/-1'}}><label style={LS}>Document / photo</label><input ref={sDocR} type="file" accept="image/*" style={{fontSize:12,width:'100%'}}/></div>
                    </div>
                    <button onClick={addService} disabled={!sF.description.trim()||imgUploading} style={{marginTop:12,background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'7px 16px',fontSize:13,fontWeight:500,cursor:'pointer',opacity:sF.description.trim()&&!imgUploading?1:0.5}}>{imgUploading?'Uploading…':'+ Log Request'}</button>
                  </div>}
                  {svcs.length===0 ? <div style={{textAlign:'center',padding:'24px 0',color:'#94a3b8',fontSize:13}}>No service requests recorded</div>
                  : svcs.map(s=><div key={s.id} style={CS}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:4}}>{badge(s.status,SVC_SC[s.status]||'#64748b')}{badge(s.priority,s.priority==='Emergency'?'#dc2626':s.priority==='High'?'#d97706':'#64748b')}<span style={{fontSize:12,color:'#94a3b8'}}>{s.category}</span></div>
                        <div style={{fontWeight:500,fontSize:14,color:'#0f172a'}}>{s.description}</div>
                        {(s.tech_name||s.tech_company) && <div style={{fontSize:12,color:'#64748b',marginTop:3}}>{[s.tech_name,s.tech_company].filter(Boolean).join(' · ')}</div>}
                        {s.notes && <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{s.notes}</div>}
                        <div style={{fontSize:11,color:'#94a3b8',marginTop:3}}>{s.date}{s.completed_date?` → done: ${s.completed_date}`:''}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {s.tech_cost>0 && <span style={{fontSize:14,fontWeight:500,color:'#dc2626'}}>{fmt(s.tech_cost)}</span>}
                        {delB(()=>delRecord('service_requests',s.id,'serviceRequests'))}
                      </div>
                    </div>
                    {s.doc_image_url && <div style={{marginTop:8}}>{thumb(s.doc_image_url,'Document')}</div>}
                  </div>)}
                </div>
              })()}

              {tab==='rent' && (() => {
                const rents = TD.rentPayments
                const totCol = rents.reduce((s,r)=>s+(r.amount_paid||0),0)
                const totLF  = rents.reduce((s,r)=>s+(r.late_fee||0),0)
                const totAF  = rents.reduce((s,r)=>s+(r.admin_fee||0),0)
                return <div>
                  <div style={{display:'flex',gap:10,marginBottom:4,flexWrap:'wrap'}}>
                    {mc('Total Collected',fmt(totCol),'#16a34a')}{mc('Late Fees',fmt(totLF),'#d97706')}
                    {mc('Admin Fees',fmt(totAF),'#0284c7')}{mc('Payments',rents.length)}
                  </div>
                  <p style={{fontSize:11,color:'#94a3b8',margin:'4px 0 14px',fontStyle:'italic'}}><i className="ti ti-info-circle" style={{fontSize:12,verticalAlign:-1,marginRight:3}}/>Balance Owed is calculated in the exported spreadsheet only.</p>
                  {T.status==='active' && <div style={{...CS,background:'#f8fafc',marginBottom:16}}>
                    <div style={SL}>Record rent payment</div>
                    {formIsLate && <div style={{marginBottom:12,padding:'9px 12px',background:'#fef3c7',border:'1px solid #f59e0b',borderRadius:6,display:'flex',alignItems:'flex-start',gap:8}}>
                      <i className="ti ti-alert-triangle" style={{fontSize:16,color:'#d97706',flexShrink:0,marginTop:1}}/>
                      <div><div style={{fontWeight:500,fontSize:13,color:'#92400e'}}>Late — {formDaysLate} day{formDaysLate!==1?'s':''} past 3-day grace</div><div style={{fontSize:12,color:'#78350f',marginTop:2}}>Late fee and admin fee pre-filled from tenant defaults.</div></div>
                    </div>}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'9px 14px'}}>
                      <div><label style={LS}>Month</label><select value={rF.periodMonth} onChange={e=>setRF(f=>({...f,periodMonth:e.target.value}))} style={{...IS,background:'#fff'}}><option value=''>Select</option>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></div>
                      <div><label style={LS}>Year</label><input type="number" value={rF.periodYear} onChange={e=>setRF(f=>({...f,periodYear:e.target.value}))} style={IS}/></div>
                      <div><label style={LS}>Rent due ($)</label><input type="number" value={rF.rentDue} onChange={e=>setRF(f=>({...f,rentDue:e.target.value}))} placeholder="0.00" style={IS}/></div>
                      <div><label style={LS}>Due date</label><input type="date" value={rF.dueDate} onChange={e=>setRF(f=>({...f,dueDate:e.target.value}))} style={IS}/></div>
                      <div><label style={LS}>Amount paid ($)</label><input type="number" value={rF.amountPaid} onChange={e=>setRF(f=>({...f,amountPaid:e.target.value}))} placeholder="0.00" style={IS}/></div>
                      <div><label style={LS}>Date paid</label><input type="date" value={rF.paidDate} onChange={e=>setRF(f=>({...f,paidDate:e.target.value}))} style={IS}/></div>
                      <div><label style={{...LS,color:formIsLate?'#d97706':undefined,fontWeight:formIsLate?600:400}}>{formIsLate?'⚠ ':''}Late fee ($)</label><input type="number" value={rF.lateFee} onChange={e=>setRF(f=>({...f,lateFee:e.target.value}))} placeholder={formIsLate&&T.late_fee_default?String(T.late_fee_default):'0.00'} style={{...IS,borderColor:formIsLate?'#f59e0b':undefined}}/></div>
                      <div><label style={{...LS,color:formIsLate?'#0284c7':undefined,fontWeight:formIsLate?600:400}}>{formIsLate?'● ':''}Admin fee ($)</label><input type="number" value={rF.adminFee} onChange={e=>setRF(f=>({...f,adminFee:e.target.value}))} placeholder={formIsLate&&T.admin_fee_default?String(T.admin_fee_default):'0.00'} style={{...IS,borderColor:formIsLate?'#0284c7':undefined}}/></div>
                      <div><label style={LS}>Method</label><select value={rF.method} onChange={e=>setRF(f=>({...f,method:e.target.value}))} style={{...IS,background:'#fff'}}>{['Check','Money Order','ACH','Zelle','Venmo','Cash','Other'].map(m=><option key={m}>{m}</option>)}</select></div>
                      <div style={{gridColumn:'1/-1'}}><label style={LS}>Notes</label><input value={rF.notes} onChange={e=>setRF(f=>({...f,notes:e.target.value}))} placeholder="Optional" style={IS}/></div>
                    </div>
                    <button onClick={addRent} disabled={!rF.periodMonth} style={{marginTop:12,background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'7px 16px',fontSize:13,fontWeight:500,cursor:rF.periodMonth?'pointer':'not-allowed',opacity:rF.periodMonth?1:0.5}}>+ Record Payment</button>
                  </div>}
                  {rents.length===0 ? <div style={{textAlign:'center',padding:'24px 0',color:'#94a3b8',fontSize:13}}>No rent payments recorded</div>
                  : rents.map(r=><div key={r.id} style={{...CS,borderLeft:r.status==='Late'||r.status==='Unpaid'?'3px solid #dc2626':r.status==='Partial'?'3px solid #0284c7':'3px solid transparent'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:3}}>{badge(r.status,RENT_SC[r.status]||'#64748b')}<span style={{fontWeight:500,fontSize:14,color:'#0f172a'}}>{MONTHS[(r.period_month||1)-1]} {r.period_year}</span></div>
                        <div style={{fontSize:12,color:'#64748b'}}>Due: {fmt(r.rent_due)} · Paid: {fmt(r.amount_paid)} · {r.method}{r.paid_date?` on ${r.paid_date}`:''}{r.days_late>0?<span style={{color:'#dc2626',fontWeight:500}}> ({r.days_late}d late)</span>:''}</div>
                        {(r.late_fee>0||r.admin_fee>0) && <div style={{fontSize:12,marginTop:3,display:'flex',gap:10}}>{r.late_fee>0&&<span style={{color:'#d97706',fontWeight:500}}>Late fee: {fmt(r.late_fee)}</span>}{r.admin_fee>0&&<span style={{color:'#0284c7',fontWeight:500}}>Admin fee: {fmt(r.admin_fee)}</span>}</div>}
                        {r.notes && <div style={{fontSize:12,color:'#94a3b8',marginTop:2}}>{r.notes}</div>}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:14,fontWeight:500,color:'#16a34a'}}>{fmt(r.amount_paid)}</span>
                        {delB(()=>delRecord('rent_payments',r.id,'rentPayments'))}
                      </div>
                    </div>
                  </div>)}
                </div>
              })()}

              {tab==='hoa' && (() => {
                const hoas = TD.hoaCharges
                const totOut = hoas.filter(h=>h.status==='Outstanding').reduce((s,h)=>s+(h.amount||0),0)
                const totPd  = hoas.filter(h=>h.status==='Paid').reduce((s,h)=>s+(h.amount||0),0)
                return <div>
                  <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
                    {mc('Outstanding',fmt(totOut),'#dc2626')}{mc('Paid',fmt(totPd),'#16a34a')}{mc('Total Charges',hoas.length)}
                  </div>
                  {T.status==='active' && <div style={{...CS,background:'#f8fafc',marginBottom:16}}>
                    <div style={SL}>Add HOA delinquency</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px 16px'}}>
                      <div><label style={LS}>Date</label><input type="date" value={hF.date} onChange={e=>setHF(f=>({...f,date:e.target.value}))} style={IS}/></div>
                      <div><label style={LS}>Type</label><select value={hF.type} onChange={e=>setHF(f=>({...f,type:e.target.value}))} style={{...IS,background:'#fff'}}>{HOA_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                      <div style={{gridColumn:'1/-1'}}><label style={LS}>Description *</label><input value={hF.description} onChange={e=>setHF(f=>({...f,description:e.target.value}))} placeholder="Describe the charge" style={IS}/></div>
                      <div><label style={LS}>Amount ($)</label><input type="number" value={hF.amount} onChange={e=>setHF(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={IS}/></div>
                      <div><label style={LS}>Status</label><select value={hF.status} onChange={e=>setHF(f=>({...f,status:e.target.value}))} style={{...IS,background:'#fff'}}>{['Outstanding','Paid','Disputed','Waived'].map(s=><option key={s}>{s}</option>)}</select></div>
                      <div><label style={LS}>Date paid</label><input type="date" value={hF.paidDate} onChange={e=>setHF(f=>({...f,paidDate:e.target.value}))} style={IS}/></div>
                      <div><label style={LS}>Notes</label><input value={hF.notes} onChange={e=>setHF(f=>({...f,notes:e.target.value}))} placeholder="Optional" style={IS}/></div>
                    </div>
                    <button onClick={addHoa} disabled={!hF.description.trim()} style={{marginTop:12,background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'7px 16px',fontSize:13,fontWeight:500,cursor:hF.description.trim()?'pointer':'not-allowed',opacity:hF.description.trim()?1:0.5}}>+ Add Charge</button>
                  </div>}
                  {hoas.length===0 ? <div style={{textAlign:'center',padding:'24px 0',color:'#94a3b8',fontSize:13}}>No HOA charges recorded</div>
                  : hoas.map(h=><div key={h.id} style={CS}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:3}}>{badge(h.status,HOA_SC[h.status]||'#64748b')}<span style={{fontSize:12,color:'#94a3b8'}}>{h.type}</span></div>
                        <div style={{fontWeight:500,fontSize:14,color:'#0f172a'}}>{h.description}</div>
                        <div style={{fontSize:11,color:'#94a3b8',marginTop:3}}>{h.date}{h.paid_date?` · Paid: ${h.paid_date}`:''}</div>
                        {h.notes && <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{h.notes}</div>}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:14,fontWeight:500,color:h.status==='Outstanding'?'#dc2626':'#16a34a'}}>{fmt(h.amount)}</span>
                        {delB(()=>delRecord('hoa_charges',h.id,'hoaCharges'))}
                      </div>
                    </div>
                  </div>)}
                </div>
              })()}

              {tab==='deposit' && (() => {
                const deposit = T.deposit_amount || 0
                const returnAmt = Math.max(0, deposit - dedTotal)
                const DR = TD.depositReturn
                return <div>
                  <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                    {mc('Deposit Held',fmt(deposit),'#64748b')}{mc('Total Deductions',fmt(dedTotal),'#dc2626')}
                    {mc('Return to Tenant',fmt(returnAmt),'#16a34a')}{mc('Damaged Items',dedItems.length,'#d97706')}
                  </div>
                  <div style={{fontSize:12,color:'#64748b',marginBottom:14,padding:'8px 12px',background:'#f0f9ff',borderLeft:'3px solid #0284c7',borderRadius:'0 6px 6px 0'}}>
                    <strong>Note:</strong> Normal wear &amp; tear is <em>not</em> deductible. Mark "Damaged" + check "Deduct from deposit" for actual damage.
                  </div>
                  {clAreas.map(area => (
                    <div key={area} style={{marginBottom:14}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#0f172a',background:'#f8fafc',padding:'6px 12px',borderRadius:'6px 6px 0 0',border:'1px solid #e2e8f0',borderBottom:'none'}}>{area}</div>
                      <div style={{border:'1px solid #e2e8f0',borderRadius:'0 0 6px 6px',overflow:'hidden'}}>
                        {TD.checklistItems.filter(i=>i.area===area).map((item,idx,arr) => (
                          <div key={item.id} style={{padding:'10px 12px',borderBottom:idx<arr.length-1?'1px solid #f1f5f9':'none',background:item.count_ded?'#fff7ed':undefined}}>
                            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                              <div style={{minWidth:140,flex:'1 1 120px',fontSize:13,fontWeight:500,color:'#0f172a'}}>{item.item}</div>
                              <select value={item.condition} onChange={e=>{const c=e.target.value; updCLItem(item.id,{condition:c,count_ded:['good','wear','fair'].includes(c)?false:item.count_ded,cost:['good','wear','fair'].includes(c)?0:item.cost,company:['good','wear','fair'].includes(c)?'':item.company,invoice:['good','wear','fair'].includes(c)?'':item.invoice})}} style={{fontSize:12,padding:'3px 6px',borderRadius:4,border:'1px solid #e2e8f0',color:COND[item.condition]?.color||'inherit',background:'#fff',width:140}}>
                                {Object.entries(COND).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                              </select>
                              {item.condition==='damaged' && <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer',color:item.count_ded?'#dc2626':'#64748b',fontWeight:item.count_ded?600:400}}>
                                <input type="checkbox" checked={item.count_ded} onChange={e=>updCLItem(item.id,{count_ded:e.target.checked,cost:!e.target.checked?0:item.cost,company:!e.target.checked?'':item.company,invoice:!e.target.checked?'':item.invoice})}/>
                                Deduct from deposit
                              </label>}
                              <input value={item.notes||''} onChange={e=>updCLItem(item.id,{notes:e.target.value})} placeholder="Notes…" style={{fontSize:12,flex:'1 1 80px',minWidth:60,padding:'3px 6px'}}/>
                              {item.image_url
                                ? <div style={{display:'flex',alignItems:'center',gap:5}}>
                                    <img src={item.image_url} alt="item" onClick={()=>setLightbox({src:item.image_url,label:item.item})} style={{width:50,height:35,objectFit:'cover',borderRadius:3,cursor:'pointer',border:'1px solid #e2e8f0'}}/>
                                    <label style={{cursor:'pointer',fontSize:10,color:'#2563eb'}}>change<input type="file" accept="image/*" onChange={e=>updCLImg(e,item.id)} style={{display:'none'}}/></label>
                                  </div>
                                : <label style={{cursor:'pointer',fontSize:11,color:'#2563eb',border:'1px dashed #e2e8f0',borderRadius:4,padding:'3px 7px',display:'inline-flex',alignItems:'center',gap:3}}>
                                    <i className="ti ti-camera" style={{fontSize:12}}/>Photo
                                    <input type="file" accept="image/*" onChange={e=>updCLImg(e,item.id)} style={{display:'none'}}/>
                                  </label>
                              }
                              {T.status==='active' && <button onClick={()=>delCLItem(item.id)} style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:14,padding:2}}><i className="ti ti-x"/></button>}
                            </div>
                            {item.count_ded && <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:8,paddingTop:8,borderTop:'1px dashed #e2e8f0'}}>
                              <div style={{display:'flex',alignItems:'center',gap:5}}><label style={{fontSize:12,color:'#dc2626',fontWeight:500,whiteSpace:'nowrap'}}>Repair cost ($)</label><input type="number" value={item.cost||''} onChange={e=>updCLItem(item.id,{cost:parseFloat(e.target.value)||0})} placeholder="0.00" style={{width:88,fontSize:13,padding:'3px 6px',borderColor:'#dc2626'}}/></div>
                              <div style={{display:'flex',alignItems:'center',gap:5}}><label style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>Company</label><input value={item.company||''} onChange={e=>updCLItem(item.id,{company:e.target.value})} placeholder="Company name" style={{fontSize:12,width:150,padding:'3px 6px'}}/></div>
                              <div style={{display:'flex',alignItems:'center',gap:5}}><label style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>Invoice #</label><input value={item.invoice||''} onChange={e=>updCLItem(item.id,{invoice:e.target.value})} placeholder="INV-001" style={{fontSize:12,width:110,padding:'3px 6px'}}/></div>
                              <span style={{fontSize:13,fontWeight:600,color:'#dc2626',marginLeft:'auto'}}>{fmt(item.cost)}</span>
                            </div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {T.status==='active' && <div style={{...CS,background:'#f8fafc',marginBottom:20}}>
                    <div style={{...SL,marginBottom:8}}>Add custom checklist item</div>
                    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                      <input value={newCI.area} onChange={e=>setNewCI(f=>({...f,area:e.target.value}))} placeholder="Area (e.g. Patio)" style={{fontSize:13,flex:'1 1 120px'}}/>
                      <input value={newCI.item} onChange={e=>setNewCI(f=>({...f,item:e.target.value}))} placeholder="Item (e.g. Screen door)" style={{fontSize:13,flex:'2 1 180px'}}/>
                      <button onClick={addCLItem} disabled={!newCI.area.trim()||!newCI.item.trim()} style={{background:'#0f1e3c',color:'#fff',border:'none',borderRadius:6,padding:'7px 14px',fontSize:13,cursor:'pointer',opacity:newCI.area.trim()&&newCI.item.trim()?1:0.5}}>+ Add</button>
                    </div>
                  </div>}
                  <div style={{border:'1px solid #e2e8f0',borderRadius:8,padding:16}}>
                    <div style={{...SL,marginBottom:14}}>Deposit return details</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 16px'}}>
                      <div><div style={{fontSize:12,color:'#64748b',marginBottom:3}}>Security deposit held</div><div style={{fontSize:16,fontWeight:500,color:'#0f172a'}}>{fmt(deposit)}</div></div>
                      <div><div style={{fontSize:12,color:'#64748b',marginBottom:3}}>Total deductions</div><div style={{fontSize:16,fontWeight:500,color:'#dc2626'}}>{fmt(dedTotal)}</div></div>
                      <div style={{gridColumn:'1/-1',borderTop:'1px solid #f1f5f9',paddingTop:12}}>
                        <div style={{fontSize:12,color:'#64748b',marginBottom:3}}>Amount to return to tenant</div>
                        <div style={{fontSize:24,fontWeight:600,color:'#16a34a'}}>{fmt(returnAmt)}</div>
                      </div>
                      <div><label style={LS}>Return date</label><input type="date" value={DR?.return_date||''} onChange={e=>updDepReturn({return_date:e.target.value})} style={IS}/></div>
                      <div><label style={LS}>Return method</label><select value={DR?.return_method||''} onChange={e=>updDepReturn({return_method:e.target.value})} style={{...IS,background:'#fff'}}><option value=''>Select…</option>{RET_METHS.map(m=><option key={m}>{m}</option>)}</select></div>
                      <div><label style={LS}>Payable to</label><input value={DR?.return_payable_to||''} onChange={e=>updDepReturn({return_payable_to:e.target.value})} placeholder="Tenant full name" style={IS}/></div>
                      <div><label style={LS}>Notes / mailing address</label><input value={DR?.return_notes||''} onChange={e=>updDepReturn({return_notes:e.target.value})} placeholder="Address or instructions" style={IS}/></div>
                    </div>
                    {dedTotal>0 && <div style={{marginTop:14,borderTop:'1px solid #f1f5f9',paddingTop:12}}>
                      <div style={{...SL,marginBottom:8}}>Deduction breakdown</div>
                      {dedItems.map(i=><div key={i.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',fontSize:13,padding:'5px 0',borderBottom:'1px solid #f1f5f9'}}>
                        <div><span style={{color:'#64748b'}}>{i.area} — {i.item}</span>{(i.company||i.invoice)&&<div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>{[i.company,i.invoice].filter(Boolean).join(' · ')}</div>}</div>
                        <span style={{fontWeight:600,color:'#dc2626',flexShrink:0,marginLeft:12}}>{fmt(i.cost)}</span>
                      </div>)}
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'8px 0 0',fontWeight:600}}><span>Total deductions</span><span style={{color:'#dc2626'}}>{fmt(dedTotal)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:14,padding:'6px 0 0',fontWeight:600,color:'#16a34a'}}><span>Deposit return ({fmt(deposit)} − {fmt(dedTotal)})</span><span>{fmt(returnAmt)}</span></div>
                    </div>}
                  </div>
                </div>
              })()}

            </div>}
          </div>}
        </div>
      </div>

      {lightbox && <div onClick={()=>setLightbox(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,cursor:'pointer'}}>
        <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:14,maxWidth:'85vw',cursor:'default'}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:10,color:'#1e293b'}}>{lightbox.label}</div>
          <img src={lightbox.src} alt="detail" style={{maxWidth:'100%',maxHeight:'70vh',objectFit:'contain',borderRadius:4,display:'block'}}/>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:8,textAlign:'center'}}>Click outside to close</div>
        </div>
      </div>}
    </div>
  )
}