import {digest} from './evidenceFingerprints.js';
import {isPassThroughItem} from './businessLineRules.js';

// Identifiers and fingerprints only: amounts and narrative stay in the live feed.
// These are reviewed scope decisions, never blanket approval of an owner's jobs.
const rules=[{jobId:'22Pc5SVPF52k',commentId:'22PdTUW9Dbva',userId:'22P3vNkFbqgK',documentId:'22PdTiRJSMJ8',itemId:'22PdTiRJavwi',vendorOrderId:'22PdTfwTvL2F',commentHash:'50b6c8d4',itemHash:'5553400'}];
export const scopeFingerprint=i=>digest(JSON.stringify([i.name,i.description,i.jobCostItem?.id,i.priceWithTax,i.cost]));
export const commentFingerprint=c=>digest(JSON.stringify([c.message,c.createdAt]));
export function verifiedOwnerScopes(data,sourceIdentity,auditRules=rules){
 const scopes=[],issues=[];
 const comments=Object.fromEntries(data.comments.map(c=>[c.id,c]));
 for(const r of auditRules){
  const job=data.jobs.find(j=>j.id===r.jobId);if(!job)continue;
  const c=comments[r.commentId],d=data.docs.find(d=>d.id===r.documentId),item=d?.costItems?.nodes?.find(i=>i.id===r.itemId);
  const wo=data.docs.find(d=>d.id===r.vendorOrderId);
  const src=sourceIdentity(job,data.comments.filter(c=>c.job?.id===job.id),comments);
  const bid=c?.message?.match(/Labor bid\s*\$([\d,.]+)\s*\/\s*cost to comp(?:l?ete)\s*\$([\d,.]+)/i);
  const value=Number(bid?.[1]?.replaceAll(',','')),cost=Number(bid?.[2]?.replaceAll(',',''));
  const scopeKey=item?.jobCostItem?.id;
  if(!c?.isPinned||c.createdByUser?.id!==r.userId||(c.job?.id&&c.job.id!==job.id)||!['Blu','Blu 2','SB Investments'].includes(src.workSource)||src.pm!=='Brandon'||commentFingerprint(c)!==r.commentHash||!item||scopeFingerprint(item)!==r.itemHash||d.job?.id!==job.id||d.type!=='customerInvoice'||!['draft','pending','approved'].includes(d.status)||!Number.isFinite(value)||value!==Number(item.priceWithTax)||cost!==Number(item.cost)||isPassThroughItem(item)||!scopeKey||wo?.type!=='vendorOrder'||wo.status!=='approved'||wo.job?.id!==job.id||!wo.costItems?.nodes?.some(i=>i.jobCostItem?.id===scopeKey&&Number(i.cost)===cost)){
   issues.push({job:job.name,severity:'Critical',code:'OWNER_APPROVAL_EVIDENCE_CHANGED',detail:`Owner-authorized scope ${r.commentId} failed its live identity, ownership, date, scope or amount checks. Re-review is required.`});continue;
  }
  scopes.push({id:`owner-${c.id}`,job,doc:d,item,key:scopeKey,value,cost,approvedAt:c.createdAt,basis:'Verified property-owner instruction',kind:'Additional scope'});
 }
 return {scopes,issues};
}

export const reviewedInvoiceFingerprint=d=>digest(JSON.stringify([d.id,d.status,d.priceWithTax,d.amountPaid,d.balance,d.costItems.nodes.map(i=>[i.id,i.name,i.description,i.priceWithTax,i.cost])]));
export function applyOwnerReviewedExceptions(exceptions,data,rules=[{jobId:'22PcJGYBPtfG',documentId:'22PdjS8hTUBN',hash:'2d29c7bd',reviewedOn:'2026-09-30'}]){
 return exceptions.map(e=>{
  if(e.code!=='PASS_THROUGH_IMBALANCE')return e;
  const r=rules.find(r=>data.jobs.some(j=>j.id===r.jobId&&j.name===e.job));
  const d=r&&data.docs.find(d=>d.id===r.documentId&&d.job?.id===r.jobId);
  const passCost=data.docs.filter(x=>x.job?.id===r?.jobId&&x.type==='vendorBill'&&['pending','approved'].includes(x.status)).flatMap(x=>x.costItems?.nodes||[]).filter(isPassThroughItem).reduce((n,i)=>n+Number(i.cost||0),0);
  if(!d||reviewedInvoiceFingerprint(d)!==r.hash||passCost!==0)return e;
  return {...e,severity:'Owner reviewed',originalSeverity:e.severity,reviewedOn:r.reviewedOn,financiallySettled:false,detail:`${e.detail} Owner reviewed ${r.reviewedOn}: receipt charged to 316 is reference-only, with no receipt amount due under owner policy. Original billed/payment records are preserved. Excluded from sales and profit. Owner acceptance is not a verified refund, credit or settlement; this job is excluded from the financially checked subset.`};
 });
}
