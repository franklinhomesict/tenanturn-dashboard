import assert from 'node:assert/strict';
import { buildForensicModel } from '../src/forensicModel.js';

const job={
  id:'review-job',number:'R1',name:'Operational Review Test',description:'',closedOn:null,actualCost:0,
  taskSummary:{started:0},location:{account:{id:'c1',name:'Direct Customer',type:'customer'}}
};
const order={
  id:'o1',type:'customerOrder',status:'approved',createdAt:'2026-09-01T12:00:00Z',issueDate:'2026-09-01',closedAt:'2026-09-01T12:00:00Z',signedAt:null,
  priceWithTax:1000,cost:0,amountPaid:0,balance:1000,fullName:'Make Ready Proposal',
  job:{id:job.id,number:job.number,name:job.name},account:job.location.account,
  costItems:{nodes:[{id:'i1',name:'Make Ready Labor',price:1000,priceWithTax:1000,cost:600,quantity:1,jobCostItem:{id:'scope1',name:'Make Ready Labor'},sourceCostItem:null}]}
};
const comment={id:'c1',createdAt:'2026-09-02T12:00:00Z',isPinned:false,name:'Field update',message:'Crew started work today.',job:{id:job.id,number:job.number,name:job.name}};
const data={jobs:[job],docs:[order],comments:[comment],logs:[],tasks:[],payments:[],documentPayments:[]};
const model=buildForensicModel(data,'2026-09-01','2026-09-30');
const row=model.jobs.find(x=>x.job.id===job.id);
assert.equal(row.stage,'Review');
assert.ok(model.review.some(e=>e.job===job.name&&e.code==='OPERATIONAL_STAGE_REVIEW'));
assert.equal(model.trust,'REVIEW');
console.log('Operational trust self-test: 1 scenario passed.');