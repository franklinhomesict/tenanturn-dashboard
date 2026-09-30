import {digest} from './evidenceFingerprints.js';

// Explicit repricing supported by the owner's billing instruction and the
// settled invoice. Preserve the original proposal as the original sale event.
const rules=[{jobId:'22PcvgzweCad',orderId:'22PcvpkkwMzD',invoiceId:'22PdjSEzwcDZ',scope:'22Pcvh3v9Q7c',commentId:'22PePXQ7TQby',date:'2026-09-12',orderHash:'67c108dd',invoiceHash:'c8bdfe4a',commentHash:'c39a6ad3'}];
const fingerprint=i=>digest(JSON.stringify([i?.name,i?.description,i?.jobCostItem?.id,i?.priceWithTax,i?.cost]));
export function verifiedPriceAdjustments(data){
 const adjustments=[],issues=[],allocations=[];
 for(const r of rules){
  if(!data.jobs.some(j=>j.id===r.jobId))continue;
  const o=data.docs.find(d=>d.id===r.orderId),d=data.docs.find(d=>d.id===r.invoiceId),c=data.comments.find(c=>c.id===r.commentId);
  const oi=o?.costItems?.nodes.find(i=>i.jobCostItem?.id===r.scope),item=d?.costItems?.nodes.find(i=>i.jobCostItem?.id===r.scope);
  if(o?.status!=='approved'||d?.status!=='approved'||o.job?.id!==r.jobId||d.job?.id!==r.jobId||Number(d.balance)!==0||Math.abs(Number(d.amountPaid)-Number(d.priceWithTax))>.02||fingerprint(oi)!==r.orderHash||fingerprint(item)!==r.invoiceHash||c?.job?.id!==r.jobId||digest(c?.message)!==r.commentHash){
   issues.push({job:d?.job?.name||'Source',severity:'Critical',code:'PRICE_ADJUSTMENT_EVIDENCE_CHANGED',detail:`Verified billing reduction on ${r.invoiceId} no longer matches its source records.`});continue;
  }
  const value=Number(item.priceWithTax)-Number(oi.priceWithTax);
  adjustments.push({id:`adjustment:${d.id}`,doc:d,item,job:d.job,key:r.scope,date:r.date,value,basis:`Owner billing instruction ${c.id}; fully paid revised invoice`,kind:'Price adjustment'});
 }
 const grove=data.jobs.find(j=>j.id==='22PbFZk2TsNe');
 if(grove){
  const o=data.docs.find(d=>d.id==='22PbTnXD5xXJ'),d=data.docs.find(d=>d.id==='22PcJScPsiBD'),c=data.comments.find(c=>c.id==='22PcER64ve9b');
  const oi=o?.costItems?.nodes.find(i=>i.id==='22PbTnXDDnPM'),item=d?.costItems?.nodes.find(i=>i.id==='22PcJScQ2C8y');
  const p=data.documentPayments.find(p=>p.id==='22PedJeGw7Mf');
  if(o?.status!=='approved'||d?.status!=='approved'||fingerprint(oi)!=='ea4926ee'||fingerprint(item)!=='9190e1d1'||digest(c?.message)!=='5a0cc409'||c?.job?.id!==grove.id||p?.document?.id!==d?.id||p?.payment?.type!=='credit'||Number(p?.amount)!==3598.9||p?.payment?.paidAt!=='2026-09-16T05:00:00.000Z'||Number(d?.balance)!==0||Number(d?.amountPaid)!==Number(d?.priceWithTax)){
   issues.push({job:grove.name,severity:'Critical',code:'COMBINED_SCOPE_EVIDENCE_CHANGED',detail:'Grove labor/carpet decomposition or accepted price increase no longer matches the audited source evidence.'});
  }else{
   allocations.push({jobId:grove.id,originalKey:oi.jobCostItem.id,originalValue:11221,components:[{key:oi.jobCostItem.id,value:9971},{key:item.jobCostItem.id,value:1250}]});
   adjustments.push({id:`adjustment:${item.id}`,doc:d,item,job:d.job,key:item.jobCostItem.id,date:'2026-09-16',value:Number(item.priceWithTax)-1250,basis:'Original carpet component $1,250; $80.35 increase accepted by full customer payment',kind:'Price adjustment'});
  }
 }
 return {adjustments,issues,allocations};
}
