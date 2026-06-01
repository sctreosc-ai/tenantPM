import * as XLSX from 'xlsx'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = n => `$${(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export function exportTenantReport(tenant, { damages, serviceRequests, rentPayments, hoaCharges, checklistItems, depositReturn }) {
  const wb = XLSX.utils.book_new()
  const dep = tenant.deposit_amount || 0
  const dedItems = checklistItems.filter(i => i.count_ded)
  const dedTotal = dedItems.reduce((s, i) => s + (i.cost || 0), 0)

  // ── Sheet 1: Summary
  const ws0 = XLSX.utils.aoa_to_sheet([
    ['TENANT PROPERTY MANAGEMENT REPORT'], [],
    ['Tenant:', tenant.name],
    ['Unit:', tenant.unit || ''],
    ['Move-In:', tenant.move_in || ''],
    ['Move-Out:', tenant.move_out || ''],
    ['Security Deposit Held:', dep],
    ['Report Date:', new Date().toLocaleString()], [],
    ['FINANCIAL SUMMARY'],
    ['Total Damage Repairs:', damages.reduce((s, d) => s + (d.cost || 0), 0)],
    ['Total Service Costs:', serviceRequests.reduce((s, v) => s + (v.tech_cost || 0), 0)],
    ['HOA Outstanding:', hoaCharges.filter(h => h.status === 'Outstanding').reduce((s, h) => s + (h.amount || 0), 0)],
    ['Rent Late Fees:', rentPayments.reduce((s, r) => s + (r.late_fee || 0), 0)],
    ['Rent Admin Fees:', rentPayments.reduce((s, r) => s + (r.admin_fee || 0), 0)],
    ['Deposit Deductions:', dedTotal],
    ['Security Deposit Held:', dep],
    ['Deposit Return to Tenant:', Math.max(0, dep - dedTotal)],
  ])
  ws0['!cols'] = [{wch:32},{wch:25}]
  XLSX.utils.book_append_sheet(wb, ws0, 'Summary')

  // ── Sheet 2: Damages
  const n2 = damages.length
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['DAMAGE ITEMS'], [],
    ['#','Description','Location','Date','Repair Cost ($)','Notes'],
    ...damages.map((d, i) => [i+1, d.description, d.location||'', d.recorded_at||'', d.cost||0, d.notes||'']),
    [], [,,,,'TOTAL:', n2 ? {f:`SUM(E4:E${3+n2})`} : 0],
  ])
  ws1['!cols'] = [{wch:5},{wch:32},{wch:18},{wch:12},{wch:16},{wch:35}]
  XLSX.utils.book_append_sheet(wb, ws1, 'Damages')

  // ── Sheet 3: Service Requests
  const n3 = serviceRequests.length
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['SERVICE REQUESTS'], [],
    ['Date','Category','Description','Priority','Status','Technician','Company','Cost ($)','Completed','Notes'],
    ...serviceRequests.map(s => [s.date||'',s.category,s.description,s.priority,s.status,s.tech_name||'',s.tech_company||'',s.tech_cost||0,s.completed_date||'',s.notes||'']),
    [], [,,,,,,'TOTAL COST:', n3 ? {f:`SUM(H4:H${3+n3})`} : 0],
  ])
  ws2['!cols'] = [{wch:12},{wch:18},{wch:30},{wch:10},{wch:12},{wch:18},{wch:18},{wch:10},{wch:12},{wch:30}]
  XLSX.utils.book_append_sheet(wb, ws2, 'Service Requests')

  // ── Sheet 4: Rent Payments — Balance Owed ONLY in export
  const n4 = rentPayments.length
  const r4s = 4, r4e = 3 + n4
  const ws3 = XLSX.utils.aoa_to_sheet([
    ['RENT PAYMENT HISTORY'], [],
    ['Period','Due Date','Rent Due ($)','Amount Paid ($)','Paid Date','Days Late','Late Fee ($)','Admin Fee ($)','Method','Status','Notes'],
    ...rentPayments.map(r => [
      `${MONTHS[(r.period_month||1)-1]} ${r.period_year}`,
      r.due_date||'', r.rent_due||0, r.amount_paid||0, r.paid_date||'',
      r.days_late||0, r.late_fee||0, r.admin_fee||0, r.method||'', r.status||'', r.notes||''
    ]),
    [],
    ['','','TOTAL RENT DUE:',    n4?{f:`SUM(C${r4s}:C${r4e})`}:0],
    ['','','TOTAL PAID:',        n4?{f:`SUM(D${r4s}:D${r4e})`}:0],
    ['','','TOTAL LATE FEES:',   n4?{f:`SUM(G${r4s}:G${r4e})`}:0],
    ['','','TOTAL ADMIN FEES:',  n4?{f:`SUM(H${r4s}:H${r4e})`}:0],
    ['','','BALANCE OWED:',      n4?{f:`C${n4+5}-D${n4+6}+G${n4+7}+H${n4+8}`}:0],
  ])
  ws3['!cols'] = [{wch:12},{wch:12},{wch:14},{wch:14},{wch:12},{wch:10},{wch:12},{wch:12},{wch:14},{wch:10},{wch:25}]
  XLSX.utils.book_append_sheet(wb, ws3, 'Rent Payments')

  // ── Sheet 5: HOA
  const n5 = hoaCharges.length
  const ws4 = XLSX.utils.aoa_to_sheet([
    ['HOA DELINQUENCIES'], [],
    ['Date','Type','Description','Amount ($)','Status','Date Paid','Notes'],
    ...hoaCharges.map(h => [h.date||'',h.type,h.description,h.amount||0,h.status,h.paid_date||'',h.notes||'']),
    [], [,,'TOTAL OUTSTANDING:', n5?{f:`SUMIF(E4:E${3+n5},"Outstanding",D4:D${3+n5})`}:0],
  ])
  ws4['!cols'] = [{wch:12},{wch:20},{wch:30},{wch:12},{wch:14},{wch:12},{wch:25}]
  XLSX.utils.book_append_sheet(wb, ws4, 'HOA Charges')

  // ── Sheet 6: Deposit Checklist
  const COND_LABELS = {good:'Good / Clean',fair:'Fair',wear:'Normal Wear',damaged:'Damaged'}
  const n6 = checklistItems.length
  const ws5 = XLSX.utils.aoa_to_sheet([
    ['MOVE-OUT DEPOSIT CHECKLIST'], [],
    ['Area','Item','Condition','Deducted?','Company / Contractor','Invoice #','Deduction ($)','Notes'],
    ...checklistItems.map(i => [
      i.area, i.item,
      COND_LABELS[i.condition]||i.condition,
      i.count_ded ? 'YES — Tenant damage' : 'No',
      i.count_ded ? (i.company||'') : '',
      i.count_ded ? (i.invoice||'') : '',
      i.count_ded ? (i.cost||0) : 0,
      i.notes||''
    ]),
    [],
    ['','','','','','TOTAL DEDUCTIONS:', n6?{f:`SUM(G4:G${3+n6})`}:0],
    ['','','','','','SECURITY DEPOSIT:', dep],
    ['','','','','','DEPOSIT RETURN:',   n6?{f:`MAX(0,G${n6+5}-G${n6+6})`}:Math.max(0,dep-dedTotal)],
    [],
    ['RETURN DETAILS'],
    ['Return Amount:',   fmt(Math.max(0, dep - dedTotal))],
    ['Return Date:',     depositReturn?.return_date || ''],
    ['Return Method:',   depositReturn?.return_method || ''],
    ['Payable To:',      depositReturn?.return_payable_to || ''],
    ['Notes:',           depositReturn?.return_notes || ''],
    [],
    ['DEDUCTION ITEMIZATION'],
    dedItems.length ? ['Area','Item','Company','Invoice #','Amount'] : ['(no deductions)'],
    ...dedItems.map(i => [i.area, i.item, i.company||'', i.invoice||'', i.cost||0]),
    [],
    dedItems.length ? ['','','','TOTAL:', dedTotal] : [],
  ])
  ws5['!cols'] = [{wch:14},{wch:28},{wch:16},{wch:22},{wch:24},{wch:16},{wch:14},{wch:30}]
  XLSX.utils.book_append_sheet(wb, ws5, 'Deposit Checklist')

  const safe = tenant.name.replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_')
  XLSX.writeFile(wb, `${safe}_Full_Report.xlsx`)
}
