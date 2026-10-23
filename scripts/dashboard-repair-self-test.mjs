import assert from 'node:assert/strict';
import {attachCostItems,orderPriceRevisions} from '../src/documentLines.js';
import {auditedLedger} from '../src/auditedLedger.js';
import {metricHealth,sourceState} from '../src/metricHealth.js';
import {isPassThroughItem} from '../src/businessLineRules.js';

const job={id:'repair-test',name:'Test - Make Ready',closedOn:null,description:'',taskSummary:{},location:{account:{name:'Customer',type:'customer'}}};
const item=(id,name,price,cost=0,extra={})=>({id,name,price,priceWithTax:price,cost,jobCostItem:{id,name},...extra});
const labor=item('labor','Bedroom Ceiling Repair',750,468,{isSelected:true});
const discount=item('discount','Discount - Bedroom Ceiling',-375,0,{isSelected:false});
const order={id:'order',job,type:'customerOrder',status:'approved',fullName:'Make Ready Change Order',priceWithTax:375,cost:468,amountPaid:0,balance:0,createdAt:'2026-09-30T14:00:00Z',closedAt:'2026-09-30T15:00:00Z',issueDate:'2026-09-30',account:{name:'Customer'},approvalHistory:{nextPage:null,nodes:[{createdAt:'2026-09-30T15:00:00Z',nextStatus:'approved'},{createdAt:'2026-10-01T15:00:00Z',previousPrice:750,nextPrice:375}]}};
const headers={count:1,nodes:[order]},raw={nodes:[labor,discount,item('option','Optional work',500,200,{isSelected:false})].map(i=>({...i,document:{id:order.id}}))};
const before=JSON.stringify({headers,raw});const attached=attachCostItems(headers,raw);
assert.deepEqual(attached.nodes[0].costItems.nodes.map(i=>i.id),['labor','discount']);assert.equal(JSON.stringify({headers,raw}),before);
assert.equal(attached.nodes[0].costItems.nodes[1].isSelected,false);
const wrong=attachCostItems({...headers,nodes:[{...order,priceWithTax:400}]},raw);assert.equal(wrong.nodes[0].costItems.nodes.length,1);
const positive=attachCostItems(headers,{nodes:[{...labor,document:{id:order.id}},{...discount,price:375,priceWithTax:375,document:{id:order.id}}]});assert.equal(positive.nodes[0].costItems.nodes.length,1);
assert.equal(orderPriceRevisions(attached.nodes[0]).matches[0].value,-375);
const broken=structuredClone(attached.nodes[0]);broken.approvalHistory.nodes[1].previousPrice=800;assert.equal(orderPriceRevisions(broken),null);

const invoice={...order,id:'invoice',type:'customerInvoice',status:'pending',issueDate:'2026-10-02',fullName:'Invoice',amountPaid:0,balance:375,costItems:{nodes:[{...labor,isSelected:false},{...discount,isSelected:false}]}};
const bill={...order,id:'bill',type:'vendorBill',status:'pending',fullName:'Vendor Bill',issueDate:'2026-10-02',priceWithTax:0,cost:468,balance:468,account:{name:'Vendor'},costItems:{nodes:[{...labor,price:0,priceWithTax:0}]}};
const api={ok:true,organizationId:'22Pa5G229Dc7',sourceCoverage:{complete:true},fetchedAt:'2026-10-22T15:00:00Z',payload:{organization:{jobs:{nodes:[job]},documents:{nodes:[attached.nodes[0],invoice,bill]},comments:{nodes:[]},dailyLogs:{nodes:[]},tasks:{nodes:[]},payments:{nodes:[]},documentPayments:{nodes:[]}}}};
let m=auditedLedger(api,'2026-10-01','2026-10-22');assert.equal(m.sales,-375);assert.equal(m.salesAdjustments,-375);assert.equal(m.formalCount,0);assert.equal(m.jobs[0].approved,375);assert.equal(m.jobs[0].projectedProfit,-93);
assert(!m.exceptions.some(e=>['DOCUMENT_LINE_MISMATCH','POST_APPROVAL_PRICE_REVISION','INVOICE_SCOPE_NEEDS_APPROVAL'].includes(e.code)));
assert.equal(auditedLedger(api,'2026-09-01','2026-09-30').sales,750);
assert.equal(auditedLedger(api,'2026-09-01','2026-10-22').sales,375);
const bad=structuredClone(api);bad.payload.organization.documents.nodes[0].priceWithTax=400;
m=auditedLedger(bad,'2026-09-01','2026-10-22');let health=metricHealth(m);
assert(!health.canShow('sales'));assert(!health.canShow('approved',job.id));assert(health.canShow('ar'));assert(health.canShow('customerPaymentsApplied'));assert(health.canShow('closedProfit'));assert(health.canShow('approved','unrelated-job'));
const historical=metricHealth(auditedLedger(bad,'2026-10-01','2026-10-22'));assert(historical.canShow('sales'));assert(!historical.canShow('approved',job.id));
const dup=structuredClone(api);dup.payload.organization.documents.nodes.push(dup.payload.organization.documents.nodes[0]);health=metricHealth(auditedLedger(dup,'2026-09-01','2026-10-22'));assert(!health.canShow('ar'));assert(!health.canShow('checkedProfit'));
const now=Date.parse('2026-10-22T15:10:00Z');assert(sourceState(api,{now,error:'Refresh failed'}).available);assert(sourceState(api,{now}).stale);assert(!sourceState(null,{error:'Failed'}).available);assert.equal(sourceState(null,{error:'Failed'}).status,'SOURCE UNAVAILABLE');assert(!sourceState({...api,sourceCoverage:{complete:false}},{now}).available);assert(!sourceState(api,{invalid:true}).available);
const rental=item('rental','Truck Rental',67.60,67.60,{description:'Truck rental, billed at cost.'});assert(isPassThroughItem(rental));assert(!isPassThroughItem({...rental,priceWithTax:80}));assert(!isPassThroughItem(item('labor','Labor',100,100,{description:'At cost, no markup'})));
const rentalBill={...bill,id:'rental-bill',cost:67.6,balance:67.6,costItems:{nodes:[{...rental,price:0,priceWithTax:0,description:'Final rental charge'}]}};
const rentalInvoice={...invoice,id:'rental-invoice',priceWithTax:67.6,cost:67.6,balance:67.6,costItems:{nodes:[rental]}};
const rented=structuredClone(api);rented.payload.organization.documents.nodes.push(rentalBill,rentalInvoice);
m=auditedLedger(rented,'2026-09-01','2026-10-22');assert.equal(m.billed,375);assert.equal(m.jobs[0].cost,468);assert.equal(m.jobs[0].billedPass,67.6);assert.equal(m.jobs[0].passCost,67.6);assert(!m.exceptions.some(e=>e.code==='INVOICE_SCOPE_NEEDS_APPROVAL'));
const zero=structuredClone(api);zero.payload.organization.documents.nodes.push({...bill,id:'zero',cost:0,balance:0,costItems:{nodes:[item('zero','Net vendor charge-back',0,0)]}});assert(!auditedLedger(zero,'2026-09-01','2026-10-22').exceptions.some(e=>e.code==='UNCOMMITTED_COST'&&e.detail.startsWith('zero:')));
const credit=structuredClone(api);credit.payload.organization.documents.nodes.push({...bill,id:'credit',cost:-50,balance:0,costItems:{nodes:[item('credit','Vendor credit',0,-50)]}});assert(!auditedLedger(credit,'2026-09-01','2026-10-22').exceptions.some(e=>e.code==='UNCOMMITTED_COST'&&e.detail.startsWith('credit:')));
console.log('Dashboard repair: selected discounts, optional scope exclusion, price history across months, scoped withholding, unrelated KPIs, stale snapshots, exact-scope pass-throughs, zero charges and vendor credits passed.');
// Impossible calendar dates must never turn invoice issue dates into approvals.
const invalidDate=structuredClone(api);invalidDate.payload.organization.documents.nodes.push({...invoice,id:'bad-date',priceWithTax:100,balance:100,cost:10,costItems:{nodes:[item('bad-date','Additional scope — approved 02/31/26',100,10)]}});
const invalidModel=auditedLedger(invalidDate,'2026-01-01','2026-10-22');assert(!invalidModel.salesEntries.some(s=>s.id==='bad-date'));assert(invalidModel.exceptions.some(e=>e.code==='ITEM_APPROVAL_DATE_INVALID'));
// Optional positive scope must remain excluded whether zero, one, or several reductions exist.
for(const reduction of [1,25.25,100,374.99]){
 const total=750-reduction;
 const h={nodes:[{...order,priceWithTax:total}]};
 const rawRows={nodes:[{...labor,document:{id:'order'}}, {...discount,price:-reduction,priceWithTax:-reduction,document:{id:'order'}}, {...item('option','Optional ceiling upgrade',600,200,{isSelected:false}),document:{id:'order'}}]};
 const result=attachCostItems(h,rawRows).nodes[0];assert.equal(result.costItems.nodes.length,2);assert.equal(Math.round(result.costItems.nodes.reduce((n,i)=>n+i.priceWithTax,0)*100),Math.round(total*100));
}
// An accepted below-cost proposal remains visible without becoming an urgent new approval.
const {buildActionQueue}=await import('../src/actionQueue.js');
const pricingModel=auditedLedger(api,'2026-09-01','2026-10-22');const q=buildActionQueue({...pricingModel,exceptions:[]});const approvedPricing=q.find(g=>g.pricing.length);assert(approvedPricing);assert.equal(approvedPricing.priority,5);

const {paymentRatifications}=await import('../src/paymentRatifications.js');
const paidJob={id:'paid-job',name:'Water Heater - CS'};
const paidItem=item('new-scope','Plumbing Labor',333.33,250);
const paidInvoice={id:'paid-invoice',job:paidJob,type:'customerInvoice',status:'approved',account:{id:'customer'},createdAt:'2026-10-14T12:00:00Z',priceWithTax:333.33,amountPaid:333.33,balance:0,costItems:{nodes:[paidItem]}};
const payment={id:'payment',account:{id:'customer'},type:'credit',amount:333.33,amountApplied:333.33,amountUnapplied:0,paidAt:'2026-10-16T15:00:00Z'};
const allocation={id:'allocation',amount:333.33,document:{id:paidInvoice.id},payment:{id:payment.id}};
const paymentData={docs:[paidInvoice],payments:[payment],documentPayments:[allocation]};
const ratify=d=>paymentRatifications(d,new Set(),new Set());
assert.equal(ratify(paymentData)[0].date,'2026-10-16');assert.equal(ratify(paymentData)[0].value,333.33);
assert.equal(ratify({...paymentData,documentPayments:[]}).length,0);
assert.equal(ratify({...paymentData,payments:[{...payment,description:'Returned payment'}]}).length,0);
assert.equal(ratify({...paymentData,payments:[{...payment,account:{id:'other-customer'}}]}).length,0);
assert.equal(ratify({...paymentData,docs:[{...paidInvoice,status:'draft'}]}).length,0);
assert.equal(ratify({...paymentData,docs:[paidInvoice,{...paidInvoice,id:'second-invoice'}]}).length,0);
assert.equal(ratify({...paymentData,docs:[{...paidInvoice,amountPaid:100,balance:233.33}]}).length,0);
assert.equal(paymentRatifications(paymentData,new Set(['paid-job|new-scope']),new Set()).length,0);
assert.equal(paymentRatifications(paymentData,new Set(),new Set(['new-scope'])).length,0);
const first={...payment,id:'partial1',amount:100,amountApplied:100,paidAt:'2026-10-15T15:00:00Z'},last={...payment,id:'partial2',amount:233.33,amountApplied:233.33};
const installments={...paymentData,payments:[first,last],documentPayments:[{...allocation,id:'first',amount:100,payment:{id:first.id}},{...allocation,id:'last',amount:233.33,payment:{id:last.id}}]};
assert.equal(ratify(installments)[0].date,'2026-10-16');
console.log('Payment acceptance: complete/partial allocations, final-payment date, returned cash, wrong customer, draft/duplicate scope and double-recognition guards passed.');
// Equal totals on distinct scopes are not duplicate-document evidence.
const distinct=structuredClone(api);distinct.payload.organization.documents.nodes.push({...invoice,id:'different-scope-invoice',costItems:{nodes:[item('distinct-scope','Other repair',375,100)]}});
assert(!auditedLedger(distinct,'2026-09-01','2026-10-22').exceptions.some(e=>e.code==='POSSIBLE_DUPLICATE_FINANCIAL'));
const similar=structuredClone(api);similar.payload.organization.documents.nodes.push({...invoice,id:'similar-invoice'});
const suspected=auditedLedger(similar,'2026-09-01','2026-10-22').exceptions.find(e=>e.code==='POSSIBLE_DUPLICATE_FINANCIAL');assert(suspected);assert.equal(suspected.severity,'Review');
