import {production} from './auditedLedger.js';

const policies={
 POSSIBLE_DUPLICATE_FINANCIAL:{priority:2,label:'Compare similar documents',action:'Compare document IDs, scope lines and payment references. Matching amounts alone do not establish a duplicate; do not delete or reverse either record without evidence.'},
 COMMITTED_COST_WITHOUT_APPROVED_REVENUE:{priority:1,label:'Check customer coverage',action:'Match each issued work order to approved customer scope and its cost budget. Keep pending and accepted vendor orders separate.'},
 INVOICE_SCOPE_NEEDS_APPROVAL:{priority:1,label:'Reconcile sales approval',action:'Locate the approval and its date for this invoice scope, then record the supporting source. A paid invoice alone does not supply the original approval date.'},
 PAID_SCOPE_RATIFIED:{priority:1,label:'Document paid scope',action:'The customer paid this scope. Reconcile its acceptance date and scope evidence so sales can be recognized once.'},
 COST_OVER_COMMITMENT:{priority:2,label:'Check cost over work order',action:'Compare the bill and receipt against the work order. Confirm whether the extra cost was authorized and is billable.'},
 UNCOMMITTED_COST:{priority:2,label:'Match cost to authorization',action:'Inspect the source bill and scope. Record the matching authorization or identify this as a deliberate direct purchase.'},
 PASS_THROUGH_IMBALANCE:{priority:2,label:'Reconcile reimbursement',action:'Compare customer charges, receipts and vendor costs. Preserve historical payments until a credit, refund or other resolution is verified.'},
 OPERATIONAL_STAGE_REVIEW:{priority:3,label:'Confirm field status',action:'Check the latest field evidence and vendor assignment. Request a dated progress or completion update if the source is unclear.'},
 PM_UNATTRIBUTED:{priority:4,label:'Confirm property manager',action:'Identify the responsible PM from the original request and record the attribution in JobTread.'},
};
export function buildActionQueue(model){
 const grouped=new Map();
 for(const e of model.exceptions.filter(e=>['Critical','Review','Owner reviewed'].includes(e.severity))){
  const job=model.jobs.find(j=>e.jobId?j.job.id===e.jobId:j.job.name===e.job)?.job;
  const groupKey=job?.id||`source:${e.job}`;
  if(!grouped.has(groupKey))grouped.set(groupKey,{id:groupKey,job,name:e.job,issues:[],pricing:[],priority:5});
  const group=grouped.get(groupKey),policy=policies[e.code]||{priority:2,label:e.code.replaceAll('_',' ').toLowerCase(),action:'Inspect the source detail and reconcile the original JobTread records before relying on the affected figure.'};
  const priority=e.severity==='Critical'?0:e.severity==='Owner reviewed'?5:policy.priority;
  group.priority=Math.min(group.priority,priority);
  group.issues.push({...e,...policy,priority});
 }
 // These are pricing advisories, not ledger exceptions or recognized sales.
 for(const d of model.data.docs.filter(d=>d.type==='customerOrder'&&['pending','approved'].includes(d.status))){
  const revenue=production(d),cost=production(d,'Overall','cost');
  if(cost<=0||revenue>cost+.02)continue;
  const job=model.jobs.find(j=>j.job.id===d.job?.id)?.job;
  if(!job)continue;
  if(!grouped.has(job.id))grouped.set(job.id,{id:job.id,job,name:job.name,issues:[],pricing:[],priority:d.status==='pending'?1:5});
  const group=grouped.get(job.id);group.priority=Math.min(group.priority,d.status==='pending'?1:5);
  group.pricing.push({id:d.id,name:d.fullName,status:d.status,revenue,cost,profit:Math.round((revenue-cost)*100)/100});
 }
 return [...grouped.values()].map(g=>({...g,issues:g.issues.sort((a,b)=>a.priority-b.priority),docs:g.job?model.data.docs.filter(d=>d.job?.id===g.job.id):[],critical:g.issues.some(e=>e.severity==='Critical')})).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name));
}
