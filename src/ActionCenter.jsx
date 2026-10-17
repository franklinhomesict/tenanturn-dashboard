import {useEffect,useMemo,useRef,useState} from 'react';
import {buildActionQueue} from './actionQueue.js';
import {money} from './forensicModel.js';
import {Table,Metric} from './dashboardPresentation.jsx';

const stamp=value=>value?new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T12:00:00-06:00`:value).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',...(!/^\d{4}-\d{2}-\d{2}$/.test(value)?{hour:'numeric',minute:'2-digit'}:{})}):'No date';
export default function ActionCenter({model,available}){
 const queue=useMemo(()=>buildActionQueue(model),[model]);
 const [filter,setFilter]=useState('Money first'),[search,setSearch]=useState(''),[selectedId,setSelectedId]=useState('');
 const evidenceRef=useRef(null);
 useEffect(()=>{if(selectedId)evidenceRef.current?.focus();},[selectedId]);
 const selected=model.jobs.find(j=>j.job.id===selectedId);
 const visible=queue.filter(g=>(filter!=='Money first'||g.priority<=2)&&(filter!=='Critical'||g.critical)&&`${g.name} ${g.issues.map(e=>e.label).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
 const docs=selected?model.data.docs.filter(d=>d.job?.id===selectedId):[];
 const comments=selected?model.data.comments.filter(c=>c.job?.id===selectedId):[];
 const logs=selected?model.data.logs.filter(l=>l.job?.id===selectedId):[];
 const events=[...comments.map(c=>({id:c.id,at:c.createdAt,title:c.name||'Job message',text:c.message,author:c.createdByUser?.name})),...logs.map(l=>({id:l.id,at:l.date,title:'Daily log',text:l.notes}))].sort((a,b)=>new Date(b.at)-new Date(a.at));
 return <section className='detail actioncenter' aria-labelledby='attention-heading'>
  <div className='detailhead'><div><div className='eyebrow'>YOUR NEXT MOVES</div><h2 id='attention-heading'>Needs attention <span className='pill'>{queue.length} jobs / accounts</span></h2></div><span className='small muted'>Company-wide · current records · independent of sales period</span></div>
  <div className='queue-toolbar'><div className='subnav' role='group' aria-label='Action priority'>{['Money first','All actions','Critical'].map(f=><button key={f} aria-pressed={filter===f} className={filter===f?'on':''} onClick={()=>setFilter(f)}>{f}</button>)}</div><label className='searchbox'>Find an action<input type='search' value={search} onChange={e=>setSearch(e.target.value)} placeholder='Job address or issue…'/></label></div>
  <div className='actionlist'>{visible.map(g=><article key={g.id} className={`actionitem ${g.critical?'iscritical':''}`}>
   <div className='actiontop'><div><div className='small muted'>{g.critical?'Critical check':g.pricing.length?'Pricing review':g.priority===1?'Revenue & commitments':g.priority===2?'Costs & billing':g.priority===5?'Owner reviewed':'Operations & records'}</div><h3>{g.name}</h3></div>{g.job&&<button className='evidence-button' onClick={()=>setSelectedId(g.job.id)} aria-expanded={selectedId===g.job.id}>Inspect job →</button>}</div>
   {g.pricing.map(p=><div key={p.id} className='pricing-warning'><b>{p.profit<0?'Below-cost proposal':'Zero-margin proposal'} · {p.status}</b><p>{p.name}: production price {money(p.revenue)} − cost {money(p.cost)} = {money(p.profit)} planned job profit.</p><span>Review discounts and price before proceeding. Pending proposals are excluded from approved sales.</span></div>)}
   <div className='actiontags'>{[...new Set(g.issues.map(e=>e.label))].map(label=><span key={label}>{label}</span>)}</div>
   <p className='nextmove'>{g.issues[0]?.action||'Review the proposal price and discount against the intended margin. No source price has been changed.'}</p>
   <details><summary>{g.issues.length} source {g.issues.length===1?'check':'checks'} · {g.docs.length} documents</summary>{g.issues.map((e,i)=><div className='sourcecheck' key={`${e.code}-${i}`}><b>{e.severity} · {e.label}</b><p>{e.detail}</p><p className='muted'>{e.action}</p><code>{e.code}</code></div>)}</details>
  </article>)}</div>
  {!visible.length&&<div className='empty-state'>{queue.length?'No actions match this filter.':'No action items in the loaded records.'}</div>}
  <div className='foot'>{visible.length} of {queue.length} groups shown. Groups combine related checks without clearing them. Pricing advisories do not change reconciliation status. Amounts inside source evidence are not an additive risk total.</div>
  <div className='job-picker'><label htmlFor='inspect-job'>Inspect any job</label><select id='inspect-job' value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value=''>Choose a job…</option>{[...model.jobs].sort((a,b)=>a.job.name.localeCompare(b.job.name)).map(j=><option key={j.job.id} value={j.job.id}>{j.job.number} · {j.job.name}</option>)}</select></div>
  {selected&&<section ref={evidenceRef} tabIndex={-1} className='job-evidence' aria-label={`Evidence for ${selected.job.name}`}><div className='detailhead'><div><div className='eyebrow'>JOB EVIDENCE · LIFETIME · ALL BUSINESS LINES</div><h2>{selected.job.name}</h2><p className='muted'>{selected.stage} · {selected.status} · PM: {selected.src.pm}</p></div><button className='evidence-button' onClick={()=>setSelectedId('')}>Close job detail</button></div>
   <div className='grid'><Metric label='Approved production' value={available?money(selected.approved):'—'}/><Metric label='Issued production' value={available?money(selected.billed):'—'}/><Metric label='Actual production cost & fees' value={available?money(selected.cost):'—'}/><Metric label='Recorded job profit' value={available?money(selected.profitRecorded):'—'} note='Issued production less recorded costs; excludes at-cost reimbursements.'/></div>
   <h3>Documents · {docs.length}</h3><Table headers={['Document','Status','Issue date','Total incl. reimbursements','Paid','Balance','Source ID']} rows={docs.map(d=>[d.fullName,d.status,d.issueDate||'—',available?money(d.type.startsWith('customer')?d.priceWithTax:d.cost):'—',available?money(d.amountPaid):'—',available?money(d.balance):'—',d.id])}/>
   <details><summary>Scope lines and source description</summary><p className='preserve'>{selected.job.description||'No job description.'}</p>{docs.map(d=><details key={d.id} className='document-lines'><summary>{d.fullName} · {d.status}</summary><Table headers={['Scope','Price','Cost','Source scope ID']} rows={(d.costItems?.nodes||[]).map(i=>[i.name,available?money(i.priceWithTax??i.price):'—',available?money(i.cost):'—',i.jobCostItem?.id||i.sourceCostItem?.id||i.id])}/></details>)}</details>
   <details><summary>Messages & daily logs · {events.length}</summary><div className='foot'>Loaded text evidence only. File contents and photo inspections are not included in this feed.</div>{events.map(e=><article className='timeline-event' key={e.id}><div className='small muted'>{stamp(e.at)} · {e.author||e.title}</div><b>{e.title}</b><p className='preserve'>{e.text||'No text notes; inspect attachments in JobTread.'}</p><code>{e.id}</code></article>)}</details>
  </section>}
 </section>;
}
