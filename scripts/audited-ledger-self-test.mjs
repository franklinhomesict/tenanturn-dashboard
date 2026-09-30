import assert from 'node:assert/strict';
import {auditedLedger} from '../src/auditedLedger.js';
import {inRange} from '../src/forensicModel.js';

const j={id:'test-job',name:'Example - Make Ready',number:'1',closedOn:null,actualCost:0,location:{account:{name:'Customer',type:'customer'}},taskSummary:{}};
const line=(id,name,price,cost)=>({id,name,price,priceWithTax:price,cost,jobCostItem:{id,name}});
const d=(id,type,status,items,date='2026-09-01')=>({id,type,status,job:j,account:{name:type.startsWith('customer')?'Customer':'Vendor'},createdAt:date+'T15:00:00Z',closedAt:type==='customerOrder'?date+'T16:00:00Z':null,issueDate:date,priceWithTax:type.startsWith('customer')?items.reduce((n,i)=>n+i.price,0):0,cost:items.reduce((n,i)=>n+i.cost,0),amountPaid:0,balance:type.startsWith('customer')?items.reduce((n,i)=>n+i.price,0):items.reduce((n,i)=>n+i.cost,0),fullName:type==='customerOrder'?'Make Ready Proposal':type==='customerInvoice'?'Make Ready Invoice':'Vendor Bill',costItems:{nodes:items},approvalHistory:{nextPage:null,nodes:[{createdAt:date+'T16:00:00Z',nextStatus:'approved'}]}});
const base=line('base','Make Ready Labor',1000,600),reimb=line('reimb','Materials reimbursement',100,100);
const make=()=>({ok:true,organizationId:'22Pa5G229Dc7',sourceCoverage:{complete:true},fetchedAt:'2026-09-30T15:00:00Z',payload:{organization:{jobs:{nodes:[j]},documents:{nodes:[d('order','customerOrder','approved',[base]),d('inv','customerInvoice','pending',[base,reimb]),d('draft','customerInvoice','draft',[line('draft-scope','Labor',500,300)]),d('denied','vendorBill','denied',[line('denied-scope','Labor',0,999)])]},comments:{nodes:[]},dailyLogs:{nodes:[]},tasks:{nodes:[]},payments:{nodes:[]},documentPayments:{nodes:[]}}}});
const run=a=>auditedLedger(a,'2026-09-01','2026-09-30');
{
 const a=make(),m=run(a);assert.equal(m.sales,1000);assert.equal(m.billed,1000);assert.equal(m.ar,1100);assert.equal(m.jobs[0].cost,0);assert.equal(m.current.length,1);
 assert.equal(m.sales,m.salesEntries.reduce((n,s)=>n+s.value,0));
 const mr=auditedLedger(a,'2026-09-01','2026-09-30','MR'),cs=auditedLedger(a,'2026-09-01','2026-09-30','CS');assert.equal(m.sales,mr.sales+cs.sales);assert.equal(m.billed,mr.billed+cs.billed);
}
{
 const a=make();a.sourceCoverage.complete=false;assert.ok(run(a).exceptions.some(e=>e.code==='SOURCE_NOT_VERIFIED'&&e.severity==='Critical'));
}
{
 const a=make();a.payload.organization.documents.nodes.push(a.payload.organization.documents.nodes[0]);assert.ok(run(a).exceptions.some(e=>e.code==='DUPLICATE_SOURCE_ID'));
}
{
 const a=make();a.payload.organization.documents.nodes[0].closedAt=null;assert.equal(run(a).sales,0);assert.ok(run(a).exceptions.some(e=>e.code==='APPROVAL_DATE_MISSING'));
}
{
 const a=make();a.payload.organization.documents.nodes[1].priceWithTax=999;assert.ok(run(a).exceptions.some(e=>e.code==='DOCUMENT_LINE_MISMATCH'));
}
{
 const a=make();const extra={...line('extra','Roof repair (Change Order — approved 09/16/26)',160,100)};a.payload.organization.documents.nodes.push(d('extra-inv','customerInvoice','pending',[extra],'2026-09-17'));assert.equal(run(a).sales,1160);
}
{
 const a=make();a.payload.organization.documents.nodes.push(d('unknown','customerInvoice','approved',[line('unknown','Remaining labor balance',300,200)]));assert.equal(run(a).sales,1000);assert.ok(run(a).exceptions.some(e=>e.code==='INVOICE_SCOPE_NEEDS_APPROVAL'));
}
assert.ok(!inRange('2026-09-01T04:59:59Z','2026-09-01','2026-09-30'));
assert.ok(inRange('2026-09-01T05:00:00Z','2026-09-01','2026-09-30'));
assert.ok(inRange('2026-10-01T04:59:59Z','2026-09-01','2026-09-30'));
assert.ok(!inRange('2026-10-01T05:00:00Z','2026-09-01','2026-09-30'));
console.log('Audited ledger: source failures, duplicate IDs, dates, document totals, pending/draft/denied statuses, pass-throughs, progress balances, dated extras, and split invariants passed.');
