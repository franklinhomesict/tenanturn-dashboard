import assert from 'node:assert/strict';
import {buildForensicModel} from '../src/forensicModel.js';

const j={id:'vendor-scope-job',number:'VS-1',name:'Vendor Scope Attribution',description:'',closedOn:'2026-09-05',actualCost:1000,taskSummary:{started:0},location:{account:{id:'cust',name:'316 Rentals',type:'customer'}}};
const customerItem=(id,name,price)=>({id:`c-${id}`,name,price,priceWithTax:price,cost:0,quantity:1,jobCostItem:{id,name},sourceCostItem:null});
const vendorItem=(id,name,cost)=>({id:`v-${id}`,name,price:0,priceWithTax:0,cost,quantity:1,jobCostItem:{id,name},sourceCostItem:null});
const doc=(id,type,status,account,amount,items)=>({id,type,status,createdAt:'2026-09-01T12:00:00Z',issueDate:'2026-09-01',closedAt:type==='customerOrder'?'2026-09-01T12:00:00Z':null,signedAt:null,priceWithTax:type.startsWith('customer')?amount:0,cost:type.startsWith('vendor')?amount:0,amountPaid:0,balance:amount,fullName:id,job:{id:j.id,number:j.number,name:j.name},account,costItems:{nodes:items}});
const cust=j.location.account;
const vendorA={id:'va',name:'Vendor A',type:'vendor'},vendorB={id:'vb',name:'Vendor B',type:'vendor'};
const aCustomer=customerItem('scope-a','Scope A',1000),bCustomer=customerItem('scope-b','Scope B',1000);
const aVendor=vendorItem('scope-a','Scope A',900),bVendor=vendorItem('scope-b','Scope B',100);
const data={
  jobs:[j],comments:[],logs:[],tasks:[],payments:[],documentPayments:[],
  docs:[
    doc('Proposal','customerOrder','approved',cust,2000,[aCustomer,bCustomer]),
    doc('Invoice','customerInvoice','approved',cust,2000,[aCustomer,bCustomer]),
    doc('WO-A','vendorOrder','approved',vendorA,900,[aVendor]),
    doc('WO-B','vendorOrder','approved',vendorB,100,[bVendor]),
    doc('Bill-A','vendorBill','approved',vendorA,900,[aVendor]),
    doc('Bill-B','vendorBill','approved',vendorB,100,[bVendor])
  ]
};
for(const d of data.docs.filter(d=>['customerInvoice','vendorBill'].includes(d.type))){ const amount=d.type==='customerInvoice'?d.priceWithTax:d.cost; d.amountPaid=amount;d.balance=0;data.documentPayments.push({id:'pay-'+d.id,amount,document:d,payment:{id:'p-'+d.id,type:d.type==='customerInvoice'?'credit':'debit',paidAt:'2026-09-04T12:00:00Z'}}); }
const m=buildForensicModel(data,'2026-09-01','2026-09-30');
const a=m.people.vendors.find(v=>v.name==='Vendor A');
const b=m.people.vendors.find(v=>v.name==='Vendor B');
assert.ok(a&&b,'Both vendors should be present');
assert.equal(a.attributedRevenue,1000,'Vendor A gets Scope A revenue, not a whole-job cost-share allocation');
assert.equal(b.attributedRevenue,1000,'Vendor B gets Scope B revenue, not a whole-job cost-share allocation');
assert.equal(a.finalActualCost,900);
assert.equal(b.finalActualCost,100);
assert.equal(a.gp,100);
assert.equal(b.gp,900);
console.log('Vendor attribution self-test: 1 scenario passed.');