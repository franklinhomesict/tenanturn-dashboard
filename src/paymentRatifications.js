import {isPassThroughItem,isFeeItem} from './businessLineRules.js';
import {ymd} from './forensicModel.js';
const cents=n=>Math.round(Number(n||0)*100);
const scope=i=>i.auditScopeKey||i.jobCostItem?.id||i.sourceCostItem?.id;
const invalidPayment=/return(?:ed)?|revers(?:ed|al)|chargeback|failed|void|cancel|misrout/i;
// Acceptance date is the final recorded customer allocation, never an invented
// original order-approval date. Paid flags alone are insufficient evidence.
export function paymentRatifications(data,contractKeys,supportedItems){
 const rows=[];
 const invoices=data.docs.filter(d=>d.type==='customerInvoice'&&['pending','approved'].includes(d.status));
 const scopeDocs=new Map();
 for(const d of invoices)for(const i of d.costItems?.nodes||[]){const k=scope(i);if(k){const id=`${d.job?.id}|${k}`;(scopeDocs.get(id)||scopeDocs.set(id,new Set()).get(id)).add(d.id);}}
 for(const d of invoices){
  if(!d.account?.id||cents(d.priceWithTax)<=0||cents(d.balance)!==0||cents(d.amountPaid)!==cents(d.priceWithTax))continue;
  const allocations=data.documentPayments.filter(p=>p.document?.id===d.id);
  if(!allocations.length||allocations.reduce((n,p)=>n+cents(p.amount),0)!==cents(d.amountPaid))continue;
  const payments=allocations.map(p=>data.payments.find(x=>x.id===p.payment?.id));
  if(payments.some((p,i)=>!p||p.type!=='credit'||cents(allocations[i].amount)<=0||!Number.isFinite(Date.parse(p.paidAt))||p.account?.id!==d.account.id||invalidPayment.test(`${p.description||''} ${p.source||''}`)||cents(p.amount)!==cents(p.amountApplied)+cents(p.amountUnapplied)||data.documentPayments.filter(x=>x.payment?.id===p.id).reduce((n,x)=>n+cents(x.amount),0)!==cents(p.amountApplied)))continue;
  const paidAt=payments.map(p=>p.paidAt).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
  if(Date.parse(paidAt)<Date.parse(d.createdAt))continue;
  for(const item of d.costItems?.nodes||[]){
   const k=scope(item),id=`${d.job?.id}|${k}`;
   if(!k||contractKeys.has(id)||supportedItems.has(item.id)||scopeDocs.get(id)?.size!==1||isPassThroughItem(item)||isFeeItem(item)||cents(item.priceWithTax??item.price)<=0)continue;
   rows.push({id:`payment-ratified:${item.id}`,doc:d,item,job:d.job,key:k,date:ymd(new Date(paidAt)),value:Number(item.priceWithTax??item.price),basis:`Customer acceptance by fully allocated payment; allocations ${allocations.map(p=>p.id).join(', ')}`,kind:'Additional scope'});
  }
 }
 return rows;
}
