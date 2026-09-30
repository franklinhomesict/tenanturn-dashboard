import {buildForensicModel,normalize,inRange,eventBusinessDate,sum,ymd,sourceIdentity} from './forensicModel.js';
import {approvalEvidence} from './approvalEvidence.js';
import {evidenceFingerprints,digest} from './evidenceFingerprints.js';
import {classifyBusinessLine,isPassThroughItem,isFeeItem} from './businessLineRules.js';
import {reconcileAuditedScopes} from './scopeReconciliation.js';
import {verifiedPriceAdjustments} from './priceAdjustmentEvidence.js';
import {verifiedOwnerScopes,applyOwnerReviewedExceptions} from './ownerEvidence.js';

const cents=n=>Math.round(Number(n||0)*100);
const total=(xs,f=x=>x)=>xs.reduce((n,x)=>n+cents(f(x)),0)/100;
const valid=d=>['pending','approved'].includes(d.status);
const key=i=>i.auditScopeKey||i.jobCostItem?.id||i.sourceCostItem?.id||i.id;
const classify=(i,context)=>i.auditBusinessLine||classifyBusinessLine(i,context);
export const production=(d,line='Overall',kind='revenue')=>total(d.costItems?.nodes||[],i=>
 isPassThroughItem(i)||(kind==='revenue'&&isFeeItem(i))||(line!=='Overall'&&classify(i,`${d.job?.name||''} ${d.fullName||''}`)!==line)?0:
 kind==='revenue'?i.priceWithTax??i.price:i.cost);
const date=d=>d&&ymd(new Date(d));

export function auditedLedger(api,start,end,line='Overall',{ownerRules,reviewRules}={}){
 const source=normalize(api);
 // Apply only when the relevant historical job is present in this source set.
 const reconciliation=source.jobs.length?reconcileAuditedScopes(source):{data:source,issues:[],applied:[]};
 const data=reconciliation.data;
 const priceChanges=verifiedPriceAdjustments(data);
 data.scopeAdjustments=priceChanges.adjustments;
 data.scopeAllocations=priceChanges.allocations;
 const scopeLines=new Map();
 const ranked=data.docs.filter(d=>valid(d)&&(d.type!=='customerOrder'||d.status==='approved')).slice().sort((a,b)=>['customerOrder','customerInvoice','vendorOrder','vendorBill'].indexOf(a.type)-['customerOrder','customerInvoice','vendorOrder','vendorBill'].indexOf(b.type));
 for(const d of ranked)for(const i of d.costItems?.nodes||[]){const k=`${d.job?.id}|${key(i)}`,v=classifyBusinessLine(i,`${d.job?.name||''} ${d.fullName||''}`);if(v!=='REVIEW'&&!scopeLines.has(k))scopeLines.set(k,v);}
 data.docs=data.docs.map(d=>({...d,costItems:{nodes:(d.costItems?.nodes||[]).map(i=>({...i,auditBusinessLine:scopeLines.get(`${d.job?.id}|${key(i)}`)||classifyBusinessLine(i,`${d.job?.name||''} ${d.fullName||''}`)}))}}));
 const ownerEvidence=verifiedOwnerScopes(data,sourceIdentity,ownerRules);
 data.ownerScopes=ownerEvidence.scopes;
 const core=buildForensicModel(data,start,end),exceptions=applyOwnerReviewedExceptions([...core.exceptions,...reconciliation.issues,...reconciliation.applied,...priceChanges.issues,...ownerEvidence.issues],data,reviewRules);
 const flag=(job,code,detail,severity='Review')=>exceptions.push({job:job?.name||'Source',code,detail,severity});
 const docs=data.docs,byId=new Map(docs.map(d=>[d.id,d])),comments=new Map(data.comments.map(c=>[c.id,c]));
 if(!api?.ok||api.organizationId!=='22Pa5G229Dc7'||!api.sourceCoverage?.complete)flag(null,'SOURCE_NOT_VERIFIED','The complete live JobTread source has not passed the feed checks.','Critical');
 for(const [name,rows] of Object.entries({jobs:data.jobs,documents:docs,comments:data.comments,payments:data.payments,documentPayments:data.documentPayments})){
  if(new Set(rows.map(x=>x.id)).size!==rows.length)flag(null,'DUPLICATE_SOURCE_ID',`${name} contains duplicate record IDs.`,'Critical');
 }
 for(const p of data.payments){
  const allocated=total(data.documentPayments.filter(dp=>dp.payment?.id===p.id),dp=>dp.amount);
  if(Math.abs(cents(allocated)-cents(p.amountApplied))>2||Math.abs(cents(p.amount)-cents(p.amountApplied)-cents(p.amountUnapplied))>2)flag({name:p.account?.name},'PAYMENT_ALLOCATION_MISMATCH',`Payment ${p.id} does not reconcile between its total, applied allocations and unapplied balance.`,'Critical');
 }
 for(const d of docs.filter(d=>valid(d)&&!(d.type==='customerOrder'&&d.status==='pending'))){
  const items=d.costItems?.nodes||[],value=d.type.startsWith('customer')?d.priceWithTax:d.cost;
  const itemTotal=total(items,i=>d.type.startsWith('customer')?i.priceWithTax??i.price:i.cost);
  if(!items.length&&cents(value)!==0)flag(d.job,'MISSING_DOCUMENT_LINES',`${d.fullName} has value but no source lines.`,'Critical');
  if(Math.abs(cents(itemTotal)-cents(value))>2)flag(d.job,'DOCUMENT_LINE_MISMATCH',`${d.fullName}: line total ${itemTotal.toFixed(2)} differs from document ${Number(value).toFixed(2)}.`,'Critical');
  for(const i of items)if(!isPassThroughItem(i)&&!isFeeItem(i)&&classify(i,`${d.job?.name||''} ${d.fullName||''}`)==='REVIEW'&&Math.abs(cents(i.priceWithTax??i.price))>2)flag(d.job,'BUSINESS_LINE_UNRESOLVED',`${d.fullName}: ${i.name} needs a Make Ready / Contractor Services classification.`);
 }
 const orders=docs.filter(d=>d.type==='customerOrder'&&d.status==='approved');
 const contractKeys=new Set(orders.flatMap(d=>(d.costItems?.nodes||[]).map(i=>`${d.job?.id}|${key(i)}`)));
 for(const a of priceChanges.allocations)for(const c of a.components)contractKeys.add(`${a.jobId}|${c.key}`);
 const salesEntries=[];
 // A later formal order for this same scope retains the original approval date.
 const ownerByKey=new Map(ownerEvidence.scopes.map(s=>[`${s.job.id}|${s.key}`,s]));
 for(const s of ownerEvidence.scopes)salesEntries.push({...s,date:ymd(new Date(s.approvedAt)),value:line==='Overall'||classify(s.item,s.job.name)===line?s.value:0});
 for(const s of priceChanges.adjustments)salesEntries.push({...s,value:line==='Overall'||classify(s.item,s.job.name)===line?s.value:0});
 for(const d of orders){
  if(!d.closedAt)flag(d.job,'APPROVAL_DATE_MISSING',`${d.fullName} has no approval timestamp. Excluded from period sales.`,'Critical');
  else {
   const repeated=(d.costItems?.nodes||[]).filter(i=>ownerByKey.has(`${d.job?.id}|${key(i)}`));
   for(const i of repeated)if(cents(i.priceWithTax??i.price)!==cents(ownerByKey.get(`${d.job.id}|${key(i)}`).value))flag(d.job,'OWNER_SCOPE_FORMALIZATION_CHANGED','A later order differs from the original owner-approved scope; reconcile the change before counting sales.','Critical');
   const remaining={...d,costItems:{nodes:(d.costItems?.nodes||[]).filter(i=>!ownerByKey.has(`${d.job?.id}|${key(i)}`))}};
   salesEntries.push({id:d.id,doc:d,job:d.job,date:eventBusinessDate(d),value:production(remaining,line),basis:'Approved customer order',kind:/change order/i.test(d.fullName)?'Change order':'Proposal'});
  }
  if(d.approvalHistory?.nextPage)flag(d.job,'APPROVAL_HISTORY_INCOMPLETE',`${d.fullName}: approval history is incomplete.`,'Critical');
  if(!d.approvalHistory)flag(d.job,'APPROVAL_HISTORY_MISSING',`${d.fullName}: approval history was not loaded.`,'Critical');
  else{
   const approvals=d.approvalHistory.nodes.filter(e=>e.nextStatus==='approved');
   if(!approvals.some(e=>Math.abs(new Date(e.createdAt)-new Date(d.closedAt))<300000))flag(d.job,'APPROVAL_TIMESTAMP_CONFLICT',`${d.fullName}: current approval timestamp does not match its event history.`,'Critical');
   if(d.approvalHistory.nodes.some(e=>e.nextPrice!=null&&e.previousPrice!=null&&e.nextPrice!==e.previousPrice&&new Date(e.createdAt)-new Date(d.closedAt)>300000))flag(d.job,'POST_APPROVAL_PRICE_REVISION',`${d.fullName}: price changed after approval; its period sales amount requires review.`);
  }
 }
 const supportedItems=new Set();
 for(const s of ownerEvidence.scopes){supportedItems.add(s.item.id);contractKeys.add(`${s.job.id}|${s.key}`);}
 for(const evidence of approvalEvidence){
  const found=docs.flatMap(d=>(d.costItems?.nodes||[]).filter(i=>i.id===evidence.itemId).map(item=>({d,item})))[0];
  if(!found){flag(null,'AUDITED_SCOPE_MISSING',`Previously audited line ${evidence.itemId} is missing from the live source.`);continue;}
  const {d,item}=found;
  if(!valid(d)||d.type!=='customerInvoice'||cents(item.priceWithTax??item.price)!==cents(evidence.amount)||isPassThroughItem(item)){
   flag(d.job,'AUDITED_SCOPE_CHANGED',`${d.fullName}: previously audited scope changed; excluded until rechecked.`,'Critical');continue;
  }
  const comment=evidence.commentId&&comments.get(evidence.commentId),payment=evidence.paymentId&&data.documentPayments.find(p=>p.id===evidence.paymentId);
  const expected=evidenceFingerprints[item.id];
  if(expected&&(expected.item!==digest(JSON.stringify([item.name,item.description,item.jobCostItem?.id,item.priceWithTax,item.cost]))||(expected.comment&&expected.comment!==digest(comment?.message))||(expected.payment&&expected.payment!==digest(JSON.stringify([payment?.amount,payment?.document?.id,payment?.payment?.paidAt,payment?.payment?.type]))))){
   flag(d.job,'APPROVAL_EVIDENCE_CHANGED',`${d.fullName}: the source facts behind the audited approval have changed. Excluded until reviewed.`,'Critical');continue;
  }
  if((evidence.commentId&&(!comment||comment.job?.id!==d.job?.id))||(evidence.paymentId&&(!payment||payment.document?.id!==d.id))||(!evidence.commentId&&!evidence.paymentId&&!(/approved/i.test(`${item.name} ${item.description}`)&&/\d{1,2}\/\d{1,2}/.test(`${item.name} ${item.description}`)))){
   flag(d.job,'APPROVAL_EVIDENCE_MISSING',`${d.fullName}: audited approval evidence is no longer available.`,'Critical');continue;
  }
  if(evidence.paymentId&&(payment.payment?.type!=='credit'||cents(payment.amount)<=0||Math.abs(cents(d.balance))>2||Math.abs(cents(d.amountPaid)-cents(d.priceWithTax))>2)){
   flag(d.job,'PAYMENT_RATIFICATION_INCOMPLETE',`${d.fullName}: the additional scope is no longer supported by a fully paid customer invoice.`,'Critical');continue;
  }
  supportedItems.add(item.id);
  if(contractKeys.has(`${d.job?.id}|${key(item)}`))continue; // formalized later: one scope, one sale
  const value=line==='Overall'||classify(item,`${d.job?.name||''} ${d.fullName||''}`)===line?evidence.amount:0;
  salesEntries.push({id:item.id,doc:d,item,job:d.job,date:evidence.date,value,basis:evidence.basis,kind:'Additional scope'});
  if(evidence.paymentId)flag(d.job,'SALES_RATIFIED_BY_PAYMENT',`${item.name}: customer acceptance is evidenced by full invoice payment. The sales date is the recorded ratification date, not an inferred formal order approval date.`,'Info');
 }
 const automaticScopeKeys=new Set();
 for(const d of docs.filter(d=>d.type==='customerInvoice'&&valid(d)))for(const item of d.costItems?.nodes||[]){
  if(supportedItems.has(item.id)||isPassThroughItem(item)||contractKeys.has(`${d.job?.id}|${key(item)}`))continue;
  const text=`${item.name||''} ${item.description||''}`;
  if(!/change order|added scope|additional (?:work|scope)|\bcredit\b/i.test(text))continue;
  const match=text.match(/approved[^.\n]{0,100}?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  if(!match)continue;
  const year=match[3]?(match[3].length===2?'20'+match[3]:match[3]):String(d.createdAt||'').slice(0,4);
  const approvedDate=`${year}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(approvedDate)||Number(match[1])>12||Number(match[2])>31||approvedDate>ymd(new Date())){flag(d.job,'ITEM_APPROVAL_DATE_INVALID',`${d.fullName}: invalid approval date on ${item.name}.`);continue;}
  const scopeKey=`${d.job?.id}|${key(item)}`;
  if(automaticScopeKeys.has(scopeKey)){flag(d.job,'REPEATED_INVOICE_ONLY_SCOPE',`${item.name}: repeated invoice-only approved scope requires deduplication review.`);continue;}
  automaticScopeKeys.add(scopeKey);supportedItems.add(item.id);
  const value=line==='Overall'||classify(item,`${d.job?.name} ${d.fullName}`)===line?Number(item.priceWithTax??item.price):0;
  salesEntries.push({id:item.id,doc:d,item,job:d.job,date:approvedDate,value,basis:'Explicit dated approval on added scope line',kind:'Additional scope'});
 }
 // New invoice-only scope is never silently converted into sales by invoice date,
 // a paid flag, or a generic "approved" elsewhere in the thread.
 for(const d of docs.filter(d=>d.type==='customerInvoice'&&valid(d)))for(const i of d.costItems?.nodes||[]){
  if(isPassThroughItem(i)||supportedItems.has(i.id)||contractKeys.has(`${d.job?.id}|${key(i)}`)||cents(i.priceWithTax??i.price)===0)continue;
  flag(d.job,'INVOICE_SCOPE_NEEDS_APPROVAL',`${d.fullName}: ${i.name} requires scope/date reconciliation before inclusion in sales.`);
 }
 const periodSales=salesEntries.filter(x=>inRange(x.date,start,end)&&cents(x.value)!==0);
 const invoices=docs.filter(d=>d.type==='customerInvoice'&&valid(d)),bills=docs.filter(d=>d.type==='vendorBill'&&valid(d));
 const jobRows=core.jobs.map(j=>{
  const jd=docs.filter(d=>d.job?.id===j.job.id),inv=jd.filter(d=>d.type==='customerInvoice'&&valid(d)),bill=jd.filter(d=>d.type==='vendorBill'&&valid(d));
  const approved=total(salesEntries.filter(s=>s.job?.id===j.job.id),s=>s.value),billed=total(inv,d=>production(d,line));
  const feeBills=bill.filter(d=>/processing fee|instant pay/i.test(`${d.account?.name||''} ${d.fullName||''}`));
  const allocation=line==='Overall'?0:(total(inv,d=>production(d))>0?billed/total(inv,d=>production(d)):0);
  const cost=total(bill,d=>production(d,line,'cost'))+total(feeBills,d=>d.cost)*allocation;
  const projectedCost=total(jd.filter(d=>d.type==='customerOrder'&&d.status==='approved'),d=>production(d,line,'cost'));
  const scopeCost=total(salesEntries.filter(s=>s.job?.id===j.job.id&&s.kind==='Additional scope'&&s.value!==0&&!jd.some(d=>d.type==='customerOrder'&&d.status==='approved'&&(d.costItems?.nodes||[]).some(i=>key(i)===key(s.item)))),s=>s.item?.cost||0);
  const lineCommitByVendor={};
  for(const d of j.vendorOrders)for(const i of d.costItems?.nodes||[]){if(isPassThroughItem(i)||(line!=='Overall'&&classify(i,`${j.job.name} ${d.fullName}`)!==line))continue;const vn=d.account?.name||'Unknown',k=key(i);(lineCommitByVendor[vn]||={})[k]=((lineCommitByVendor[vn]||{})[k]||0)+Number(i.cost||0);}
  const remainingByVendor=Object.fromEntries(Object.entries(lineCommitByVendor).map(([vn,values])=>[vn,total(Object.entries(values),([k,c])=>Math.max(0,c-(j.vendorActualByKey?.[vn]?.[k]||0)))]));
  const remainingCommit=total(Object.values(remainingByVendor));
  let planned=Math.max(projectedCost+scopeCost,cost+remainingCommit);
  if(line==='Overall'){
   // Prevent one business line's unused budget from hiding another's overrun.
   // Overall must equal the sum of the same per-line job budgets shown in detail.
   planned=total(['MR','CS','REVIEW'],group=>{
    const groupBilling=total(inv,d=>production(d,group)),allBilling=total(inv,d=>production(d));
    const groupCost=total(bill,d=>production(d,group,'cost'))+total(feeBills,d=>d.cost)*(allBilling>0?groupBilling/allBilling:0);
    const groupBudget=total(jd.filter(d=>d.type==='customerOrder'&&d.status==='approved'),d=>production(d,group,'cost'))+total(salesEntries.filter(s=>s.job?.id===j.job.id&&s.kind==='Additional scope'&&classify(s.item,j.job.name)===group&&!jd.some(d=>d.type==='customerOrder'&&d.status==='approved'&&(d.costItems?.nodes||[]).some(i=>key(i)===key(s.item)))),s=>s.item.cost);
    const commitments={};
    for(const d of j.vendorOrders)for(const i of d.costItems?.nodes||[])if(!isPassThroughItem(i)&&classify(i,`${j.job.name} ${d.fullName}`)===group){const vn=d.account?.name||'Unknown',k=key(i);(commitments[vn]||={})[k]=((commitments[vn]||{})[k]||0)+Number(i.cost||0);}
    const remainder=total(Object.entries(commitments),([vn,ks])=>total(Object.entries(ks),([k,c])=>Math.max(0,c-(j.vendorActualByKey?.[vn]?.[k]||0))));
    return Math.max(groupBudget,groupCost+remainder);
   });
  }
  if(remainingCommit>0&&planned>projectedCost+scopeCost+.02)flag(j.job,'COMMITTED_COST_WITHOUT_APPROVED_REVENUE','Vendor commitments exceed the cost budget of approved customer scope; projected profit retains the committed cost.');
  const reviews=exceptions.filter(e=>e.job===j.job.name&&['Critical','Review'].includes(e.severity));
  const ownerReviewed=exceptions.some(e=>e.job===j.job.name&&e.severity==='Owner reviewed');
  return {...j,remainingByVendor,approved,billed,cost,profitRecorded:billed-cost,projectedCost:planned,projectedProfit:approved-planned,remainingBudget:Math.max(0,planned-cost),status:!j.job.closedOn?'Open / provisional':reviews.length?'Closed / review':ownerReviewed?'Closed / owner reviewed':j.economicsStatus==='Reconciled'?'Closed / checked':'Closed / cost incomplete',reviews:reviews.length,ownerReviewed};
 });
 const current=jobRows.filter(j=>!j.job.closedOn&&(j.approved!==0||j.billed!==0||j.cost!==0||j.vendorOrders.some(d=>production(d,line,'cost')!==0))); 
 const periodInvoices=invoices.filter(d=>inRange(d.issueDate,start,end));
 const arDocs=invoices.filter(d=>cents(d.balance)>2),apDocs=bills.filter(d=>cents(d.balance)>2);
 const pms=new Map();for(const s of periodSales){const j=core.jobs.find(j=>j.job.id===s.job?.id),name=j?.src.pm||'Unattributed';const row=pms.get(name)||{name,count:0,sales:0};row.count++;row.sales+=cents(s.value);pms.set(name,row);}
 const vendors=core.vendors.map(v=>{
  let attributedRevenue=0,finalActualCost=0;
  for(const j of jobRows.filter(j=>j.status==='Closed / checked'))for(const [k,vendorCost] of Object.entries(j.vendorActualByKey?.[v.name]||{})){
   const item=j.vendorBills.flatMap(d=>d.costItems?.nodes||[]).find(i=>key(i)===k);
   if(line!=='Overall'&&(!item||classify(item,j.job.name)!==line))continue;
   finalActualCost+=Number(vendorCost||0);const scopeActual=j.actualByKey?.[k]||0;
   if(scopeActual>0)attributedRevenue+=(j.billedByKey?.[k]||0)*Number(vendorCost)/scopeActual;
  }
  return {...v,openJobs:current.filter(j=>j.vendorOrders.some(d=>d.account?.name===v.name && production(d,line,'cost')>0)).length,remainingCost:total(current,j=>j.remainingByVendor?.[v.name]||0),attributedRevenue,finalActualCost};
 });
 const closed=jobRows.filter(j=>j.job.closedOn&&(j.approved!==0||j.billed!==0||j.cost!==0)),checked=closed.filter(j=>j.status==='Closed / checked');
 const critical=exceptions.filter(e=>e.severity==='Critical'),review=exceptions.filter(e=>e.severity==='Review');
 return {core,data,exceptions,trust:critical.length?'BLOCKED':review.length?'REVIEW':'RECONCILED',critical:critical.length,review:review.length,salesEntries:periodSales,sales:total(periodSales,s=>s.value),grossSales:total(periodSales.filter(s=>s.value>0),s=>s.value),salesAdjustments:total(periodSales.filter(s=>s.value<0),s=>s.value),formalCount:periodSales.filter(s=>s.doc.type==='customerOrder').length,additionalCount:new Set(periodSales.filter(s=>s.kind==='Additional scope').map(s=>s.doc.id)).size,pms:[...pms.values()].map(p=>({...p,sales:p.sales/100})),jobs:jobRows,current,vendors,periodInvoices,billed:total(periodInvoices,d=>production(d,line)),ar:total(arDocs,d=>d.balance),ap:total(apDocs,d=>d.balance),arDocs,apDocs,projectedProfit:total(current,j=>j.projectedProfit),futureCost:total(current,j=>j.remainingBudget),closedProfit:total(closed,j=>j.profitRecorded),checkedProfit:total(checked,j=>j.profitRecorded),checkedJobs:checked.length,closedJobs:closed.length,customerPaymentsApplied:core.customerPaymentsApplied};
}
