import {inRange} from './forensicModel.js';
const sales=['sales','grossSales','salesAdjustments','formalCount'];
const order=[...sales,'approved','futureCost','projectedCost','projectedProfit'];
const billing=['billed','recordedProfit','closedProfit','projectedProfit','vendorEconomics'];
const costs=['actualCost','recordedProfit','futureCost','projectedCost','projectedProfit','closedProfit','commitments','vendorEconomics'];
const all=[...new Set([...order,...billing,...costs,'ar','ap','customerPaymentsApplied','heldCustomerCredits','checkedProfit'])];
const globalCodes=new Set(['SOURCE_NOT_VERIFIED','DUPLICATE_SOURCE_ID']);
export function metricHealth(model){
 const critical=model.exceptions.filter(e=>e.severity==='Critical');
 const impacts=critical.map(e=>{
  const job=model.jobs.find(j=>e.jobId?j.job.id===e.jobId:j.job.name===e.job);
  const doc=model.data.docs.find(d=>d.id===e.documentId);
  const type=e.documentType||doc?.type;
  let keys;
  if(globalCodes.has(e.code))keys=all;
  else if(['DOCUMENT_LINE_MISMATCH','MISSING_DOCUMENT_LINES'].includes(e.code))keys=type==='customerOrder'?order:type==='customerInvoice'?billing:type==='vendorBill'?costs:type==='vendorOrder'?['futureCost','projectedProfit','commitments']:all;
  else if(/APPROVAL|AUDITED_SCOPE|OWNER_SCOPE|PRICE_ADJUSTMENT|COMBINED_SCOPE|BILLED_UNCONTRACTED/.test(e.code))keys=order;
  else if(/INVOICE_TOTAL/.test(e.code))keys=billing;
  else if(/INVOICE_PAYMENT|INVOICE_BALANCE/.test(e.code))keys=['ar','customerPaymentsApplied'];
  else if(/BILL_PAYMENT/.test(e.code))keys=['ap'];
  else if(/PAYMENT_|CASH_/.test(e.code))keys=['ar','ap','customerPaymentsApplied','heldCustomerCredits','checkedProfit'];
  else if(e.code==='ACTIVE_AFTER_JOB_CLOSED')keys=['closedProfit'];
  else keys=all;
  if(job){
   if(job.job.closedOn)keys=keys.filter(k=>!['futureCost','projectedProfit','commitments'].includes(k));
   else keys=keys.filter(k=>!['closedProfit','vendorEconomics'].includes(k));
  }
  if(doc?.type==='customerOrder'&&doc.closedAt&&Number.isFinite(Date.parse(doc.closedAt))&&model.period&&!inRange(doc.closedAt,model.period.start,model.period.end))keys=keys.filter(k=>!sales.includes(k));
  return {issue:e,jobId:job?.job.id,keys};
 });
 return {impacts,canShow:(key,jobId)=>!impacts.some(x=>x.keys.includes(key)&&(!jobId||!x.jobId||x.jobId===jobId))};
}

export function sourceState(api,{error='',now=Date.now(),invalid=false}={}){
 const time=Date.parse(api?.fetchedAt);
 const available=!!api?.ok&&api.organizationId==='22Pa5G229Dc7'&&api.sourceCoverage?.complete===true&&Number.isFinite(time)&&!invalid;
 return {available,stale:available&&now-time>300000,status:!api?(error?'SOURCE UNAVAILABLE':'LOADING'):!available?'SOURCE UNAVAILABLE':error?'REFRESH FAILED':now-time>300000?'STALE SNAPSHOT':'LOADED'};
}
