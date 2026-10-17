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
// Photo-label discussions must not manufacture production after completion.
const closedModel=(message,at='2026-09-04T17:00:00Z',closedOn='2026-09-03')=>{
 const closedJob={...job,closedOn};
 return buildForensicModel({...data,jobs:[closedJob],comments:[
  {...comment,id:'done',createdAt:'2026-09-02T18:00:00Z',message:'Job is complete.'},
  {...comment,id:'later',createdAt:at,message}
 ]},'2026-09-01','2026-09-30');
};
const hasClosedActivity=m=>m.critical.some(e=>e.code==='ACTIVE_AFTER_JOB_CLOSED');
assert.equal(hasClosedActivity(closedModel('The photos were labeled completion but reverted to in progress.')),false);
assert.equal(closedModel('The pictures status is in progress.').jobs[0].ev.done,true);
// A metadata discussion cannot hide a separate production statement.
assert.equal(hasClosedActivity(closedModel('The photos reverted to in progress. Crew working today.')),true);
assert.equal(hasClosedActivity(closedModel('Crew working today.')),true);
// A date-only close covers the entire Chicago calendar day, including after UTC midnight.
assert.equal(hasClosedActivity(closedModel('Crew working today.','2026-09-04T04:59:59Z')),false);
assert.equal(hasClosedActivity(closedModel('Crew working today.','2026-09-04T05:00:00Z')),true);
// Winter uses Chicago standard time; exact timestamps still retain their precision.
assert.equal(hasClosedActivity(closedModel('Crew working today.','2026-12-04T05:59:59Z','2026-12-03')),false);
assert.equal(hasClosedActivity(closedModel('Crew working today.','2026-12-04T06:00:00Z','2026-12-03')),true);
assert.equal(hasClosedActivity(closedModel('Crew working today.','2026-09-03T17:00:01Z','2026-09-03T17:00:00Z')),true);
assert.equal(hasClosedActivity(closedModel('Crew working today.','2026-09-03T16:59:59Z','2026-09-03T17:00:00Z')),false);
console.log('Photo status and closure boundaries: 10 regression checks passed.');
