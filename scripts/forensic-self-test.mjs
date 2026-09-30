import assert from 'node:assert/strict';
import {buildForensicModel, eventBusinessDate, productionRevenue, passRevenue} from '../src/forensicModel.js';

const empty=()=>({jobs:[],docs:[],comments:[],logs:[],tasks:[],payments:[],documentPayments:[]});
const job=(id,name,extra={})=>({id,number:id,name,description:'',closedOn:null,actualCost:null,taskSummary:{started:0},location:{account:{id:`c-${id}`,name:'316 Rentals',type:'customer'}},...extra});
const item=(id,name,price,cost,extra={})=>({id,name,price,priceWithTax:price,cost,quantity:1,jobCostItem:{id:`scope-${id}`,name},sourceCostItem:null,...extra});
const weakItem=(id,name,price,cost,extra={})=>({id,name,price,priceWithTax:price,cost,quantity:1,jobCostItem:null,sourceCostItem:null,...extra});
const doc=(id,type,status,j,amount,extra={})=>({id,type,status,createdAt:'2026-08-01T12:00:00Z',issueDate:'2026-08-01',closedAt:null,signedAt:null,priceWithTax:type.startsWith('customer')?amount:0,cost:type.startsWith('vendor')?amount:0,amountPaid:0,balance:amount,fullName:`${type} ${id}`,job:{id:j.id,number:j.number,name:j.name},account:type.startsWith('customer')?j.location.account:{id:`v-${id}`,name:'Vendor A',type:'vendor'},costItems:{nodes:[]},...extra});
const run=(d,a='2026-08-01',b='2026-09-30')=>buildForensicModel(d,a,b);

// 1. Denied financial documents remain audit history, never money.
{ const d=empty(),j=job('1','Denied Docs',{closedOn:'2026-08-10',actualCost:0});d.jobs=[j]; d.docs=[doc('i1','customerInvoice','denied',j,100),doc('b1','vendorBill','denied',j,50)]; const m=run(d);assert.equal(m.periodBilled,0);assert.equal(m.arDocs.length,0);assert.equal(m.apDocs.length,0);assert.equal(m.exceptions.filter(e=>e.code==='DENIED_FINANCIAL_EXCLUDED').length,2); }

// 2. A denied proposal is a true loss only with final loss communication.
{ const d=empty(),j=job('2','Lost Job');d.jobs=[j]; d.docs=[doc('o2','customerOrder','denied',j,1000,{closedAt:'2026-09-04T18:00:00Z',issueDate:'2026-09-01'})]; d.comments=[{id:'c2',createdAt:'2026-09-04T18:05:00Z',isPinned:true,message:'Owner went with another contractor.',job:{id:j.id}}]; const m=run(d,'2026-09-01','2026-09-30');assert.equal(m.losses.length,1);assert.equal(m.winRate,0); }

// 3. Cross-month jobs keep lifetime economics intact while dated billing stays in invoice month.
{ const d=empty(),j=job('3','Cross Month',{closedOn:'2026-09-03',actualCost:100});d.jobs=[j]; const oi=item('labor','Labor',160,100);const vi={...oi,price:0,priceWithTax:0,cost:100}; d.docs=[doc('o3','customerOrder','approved',j,160,{closedAt:'2026-08-01T10:00:00Z',costItems:{nodes:[oi]}}),doc('i3','customerInvoice','approved',j,160,{issueDate:'2026-08-30',priceWithTax:160,amountPaid:160,balance:0,costItems:{nodes:[oi]}}),doc('wo3','vendorOrder','approved',j,100,{costItems:{nodes:[vi]}}),doc('b3','vendorBill','approved',j,100,{issueDate:'2026-09-02',cost:100,amountPaid:100,balance:0,costItems:{nodes:[vi]}})]; d.documentPayments=[{id:'dpi3',amount:160,document:{id:'i3',type:'customerInvoice',status:'approved',job:{id:j.id}},payment:{id:'pi3',type:'credit',amount:160,paidAt:'2026-08-30T12:00:00Z',source:'Meritrust deposit 1294',description:'TenanTurn deposit'}},{id:'dpb3',amount:100,document:{id:'b3',type:'vendorBill',status:'approved',job:{id:j.id}},payment:{id:'pb3',type:'debit',amount:100,paidAt:'2026-09-02T12:00:00Z',source:'Meritrust ACH 1294',description:'Vendor payment'}}]; const aug=run(d,'2026-08-01','2026-08-31'),sep=run(d,'2026-09-01','2026-09-30');assert.equal(aug.periodBilled,160);assert.equal(sep.periodBilled,0);assert.equal(aug.reconciledGP,60);assert.equal(sep.reconciledGP,60); }

// 4. Billed added scope without approved scope is Critical.
{ const d=empty(),j=job('4','Uncontracted Scope');d.jobs=[j];const approved=item('base','Base',500,300),added=item('added','Added Plumbing',2250,1800); d.docs=[doc('o4','customerOrder','approved',j,500,{closedAt:'2026-08-01T10:00:00Z',costItems:{nodes:[approved]}}),doc('i4','customerInvoice','pending',j,2250,{issueDate:'2026-09-03',costItems:{nodes:[added]}})]; const m=run(d);assert.ok(m.critical.some(e=>e.code==='BILLED_UNCONTRACTED_SCOPE')); }

// 5. Returned vendor payment followed by successful resend counts only once.
{ const d=empty();d.payments=[{id:'r1',type:'debit',amount:698,amountApplied:0,amountUnapplied:698,paidAt:'2026-08-25T12:00:00Z',source:'Meritrust Pay A Person',description:'Wrong acct - returned by bank',account:{id:'v1',name:'Ethan',type:'vendor'}},{id:'r2',type:'debit',amount:698,amountApplied:698,amountUnapplied:0,paidAt:'2026-09-03T12:00:00Z',source:'Meritrust bank transfer 1294',description:'Replacement vendor payment',account:{id:'v1',name:'Ethan',type:'vendor'}}]; const m=run(d);assert.equal(m.verifiedCashOut,698);assert.ok(m.exceptions.some(e=>e.code==='RESOLVED_RETURNED_PAYMENT'));assert.ok(!m.exceptions.some(e=>e.code==='RETURNED_PAYMENT')); }

// 6. Misrouted customer money is not TenanTurn cash until corrective deposit.
{ const d=empty();d.payments=[{id:'m1',type:'credit',amount:331.44,amountApplied:331.44,amountUnapplied:0,paidAt:'2026-07-28T12:00:00Z',source:'AppFolio',description:'Routed to Franklin Homes instead of TenanTurn',account:{id:'c1',name:'316 Rentals',type:'customer'}},{id:'m2',type:'credit',amount:331.44,amountApplied:0,amountUnapplied:331.44,paidAt:'2026-08-05T12:00:00Z',source:'Meritrust eDeposit 1294',description:'Franklin Homes settling the misrouted TenanTurn payment',account:{id:'fh',name:'Franklin Homes LLC',type:'vendor'}}]; const m=run(d,'2026-07-01','2026-08-31');assert.equal(m.verifiedCashIn,331.44);assert.ok(m.exceptions.some(e=>e.code==='RESOLVED_CASH_MISROUTE'));assert.ok(!m.exceptions.some(e=>e.code==='CASH_MISROUTE')); }

// 7. Explicit pass-throughs are excluded from performance revenue and cost.
{ const d=empty(),j=job('7','Pass Through',{closedOn:'2026-08-10',actualCost:150});d.jobs=[j];const prod=item('prod','Make Ready Labor',160,100),reimb=item('reimb','Reimbursement - Paint',50,50);const vprod={...prod,price:0,priceWithTax:0,cost:100},vreimb={...reimb,price:0,priceWithTax:0,cost:50}; d.docs=[doc('o7','customerOrder','approved',j,160,{closedAt:'2026-08-01T10:00:00Z',costItems:{nodes:[prod]}}),doc('i7','customerInvoice','approved',j,210,{priceWithTax:210,costItems:{nodes:[prod,reimb]}}),doc('wo7','vendorOrder','approved',j,100,{costItems:{nodes:[vprod]}}),doc('b7','vendorBill','approved',j,100,{costItems:{nodes:[vprod]}}),doc('br7','vendorBill','approved',j,50,{account:{id:'fh',name:'Franklin Homes LLC',type:'vendor'},costItems:{nodes:[vreimb]}})]; const m=run(d),x=m.jobs.find(x=>x.job.id===j.id);assert.equal(x.billedProduction,160);assert.equal(x.actualProductionCost,100);assert.equal(x.passCost,50);assert.equal(x.profit,60); }

// 8. Real-world customer refund is leakage even if JobTread typed 316 as a vendor.
{ const d=empty(),j=job('8','Customer Refund',{closedOn:'2026-08-10',actualCost:120});d.jobs=[j];const prod=item('p8','Labor',160,100),vprod={...prod,price:0,priceWithTax:0,cost:100},refund={id:'refund8',name:'Flooring issue refund',price:0,priceWithTax:0,cost:20,quantity:1,jobCostItem:{id:'scope-refund',name:'Flooring issue refund'}}; d.docs=[doc('o8','customerOrder','approved',j,160,{closedAt:'2026-08-01T10:00:00Z',costItems:{nodes:[prod]}}),doc('i8','customerInvoice','approved',j,160,{costItems:{nodes:[prod]}}),doc('wo8','vendorOrder','approved',j,100,{costItems:{nodes:[vprod]}}),doc('b8','vendorBill','approved',j,100,{costItems:{nodes:[vprod]}}),doc('refund8','vendorBill','approved',j,20,{account:{id:'c8',name:'316 Rentals',type:'vendor'},amountPaid:20,balance:0,costItems:{nodes:[refund]}})]; d.documentPayments=[{id:'dpr8',amount:20,document:{id:'refund8',type:'vendorBill',status:'approved',job:{id:j.id}},payment:{id:'pr8',type:'debit',amount:20,amountApplied:20,amountUnapplied:0,paidAt:'2026-08-10T12:00:00Z',source:'Check',description:'Refund for flooring issues',account:{id:'c8',name:'316 Rentals',type:'vendor'}}}]; const m=run(d),x=m.jobs.find(x=>x.job.id===j.id);assert.equal(x.customerRefundCost,20);assert.equal(x.profit,40);assert.ok(!m.vendors.some(v=>v.name==='316 Rentals')); }

// 9. Duplicate valid financial documents are Critical.
{ const d=empty(),j=job('9','Duplicate');d.jobs=[j];d.docs=[doc('d91','customerInvoice','pending',j,100,{issueDate:'2026-09-01'}),doc('d92','customerInvoice','approved',j,100,{issueDate:'2026-09-01'})];const m=run(d);assert.ok(m.critical.some(e=>e.code==='POSSIBLE_DUPLICATE_FINANCIAL')); }

// 10. PM attribution resolves original pinned scope by referenced comment ID.
{ const d=empty(),j=job('10','PM Resolve',{description:'Original scope: org comment scope10'});d.jobs=[j];d.comments=[{id:'scope10',createdAt:'2026-09-01T10:00:00Z',isPinned:true,message:'Notes\nPm ben316\nUtilities yes\nLockbox 1415\nScope',job:null}];d.docs=[doc('o10','customerOrder','approved',j,1000,{closedAt:'2026-09-02T12:00:00Z'})];const m=run(d,'2026-09-01','2026-09-30');assert.equal(m.jobs[0].src.pm,'Ben');assert.equal(m.jobs[0].src.workSource,'316 Rentals');assert.equal(m.jobs[0].src.billingCustomer,'316 Rentals'); }

// 11. Later active evidence keeps a phased job WIP after earlier completion phrase.
{ const d=empty(),j=job('11','Phased');d.jobs=[j];const prod=item('p11','Labor',5000,3000),vprod={...prod,price:0,priceWithTax:0,cost:3000};d.docs=[doc('o11','customerOrder','approved',j,5000,{closedAt:'2026-08-01T10:00:00Z',costItems:{nodes:[prod]}}),doc('wo11','vendorOrder','approved',j,3000,{costItems:{nodes:[vprod]}})];d.comments=[{id:'done11',createdAt:'2026-08-20T10:00:00Z',isPinned:true,message:'Job is complete.',job:{id:j.id}}];d.logs=[{id:'log11',date:'2026-09-02',notes:'Crew working today on added plumbing.',job:{id:j.id}}];const m=run(d);assert.equal(m.jobs[0].stage,'WIP'); }

// 12. Reimbursement-only no-line invoice is pass-through, never production.
{ const d=empty(),j=job('12','Reimb Only');d.jobs=[j];const inv=doc('i12','customerInvoice','approved',j,331.44,{fullName:'Reimbursement Invoice 12-1',priceWithTax:331.44,issueDate:'2026-08-05'});d.docs=[inv];assert.equal(productionRevenue(inv),0);assert.equal(passRevenue(inv),331.44);const m=run(d);assert.equal(m.periodBilled,0);assert.equal(m.periodPass,331.44); }

// 13. Weak generic scope names never silently count as strong reconciliation.
{ const d=empty(),j=job('13','Weak Scope');d.jobs=[j];const c=weakItem('a','Labor',1000,600),v=weakItem('b','Labor',0,650);d.docs=[doc('o13','customerOrder','approved',j,1000,{costItems:{nodes:[c]}}),doc('b13','vendorBill','approved',j,650,{costItems:{nodes:[v]}})];const m=run(d);assert.ok(m.review.some(e=>e.code==='WEAK_SCOPE_MATCH')); }

// 14. Wichita business date prevents late-evening local approvals moving to next UTC day.
{ const d=doc('tz','customerOrder','approved',job('tzj','TZ'),100,{closedAt:'2026-09-01T02:30:00Z'});assert.equal(eventBusinessDate(d),'2026-08-31'); }

// 15. Negative approved change order reduces contract value and remains visible.
{ const d=empty(),j=job('15','Negative CO');d.jobs=[j];const base=item('b15','Labor',1000,600),credit=item('c15','Credit',-100,0);d.docs=[doc('o15','customerOrder','approved',j,1000,{costItems:{nodes:[base]}}),doc('co15','customerOrder','approved',j,-100,{fullName:'Make Ready Change Order 15-2',costItems:{nodes:[credit]}})];const m=run(d);assert.equal(m.jobs[0].contractedProduction,900);assert.ok(m.info.some(e=>e.code==='NEGATIVE_CHANGE_ORDER')); }

// 16. Unapplied ordinary cash is surfaced for review.
{ const d=empty();d.payments=[{id:'u16',type:'credit',amount:500,amountApplied:100,amountUnapplied:400,paidAt:'2026-09-01T12:00:00Z',source:'Meritrust deposit 1294',description:'Customer deposit',account:{id:'c16',name:'316 Rentals',type:'customer'}}];const m=run(d);assert.ok(m.review.some(e=>e.code==='UNAPPLIED_CASH')); }

// 17. Closed job with later active evidence is Critical.
{ const d=empty(),j=job('17','Closed But Active',{closedOn:'2026-09-01T12:00:00Z'});d.jobs=[j];d.logs=[{id:'l17',date:'2026-09-03',notes:'Crew working today',job:{id:j.id}}];const m=run(d);assert.ok(m.critical.some(e=>e.code==='ACTIVE_AFTER_JOB_CLOSED')); }

// 18. Multiple approved non-change proposals are review, not silently treated as one revision chain.
{ const d=empty(),j=job('18','Multiple Bases');d.jobs=[j];d.docs=[doc('o181','customerOrder','approved',j,1000,{closedAt:'2026-08-01T12:00:00Z'}),doc('o182','customerOrder','approved',j,1200,{closedAt:'2026-08-02T12:00:00Z'})];const m=run(d);assert.ok(m.info.some(e=>e.code==='MULTIPLE_APPROVED_BASE_ORDERS')); }

// 19. Brandon/Blu pinned scope can authorize Ops without inventing accounting approval.
{ const d=empty(),j=job('19','Blu Start',{description:'org comment blu19'});d.jobs=[j];d.comments=[{id:'blu19',createdAt:'2026-09-01T12:00:00Z',isPinned:true,message:'Notes\nPm blu2 Brandon\nUtilities yes\nLockbox 1415\nScope',job:null}];const m=run(d);assert.equal(m.jobs[0].src.operationallyAuthorized,true);assert.equal(m.jobs[0].baseApproval,null);assert.equal(m.jobs[0].stage,'Backlog'); }

// 20. "Complete besides..." is not whole-job completion.
{ const d=empty(),j=job('20','257 N Poplar');d.jobs=[j];const p=item('p20','Labor',1000,600),v={...p,price:0,priceWithTax:0,cost:600};d.docs=[doc('o20','customerOrder','approved',j,1000,{closedAt:'2026-08-20T12:00:00Z',costItems:{nodes:[p]}}),doc('wo20','vendorOrder','approved',j,600,{costItems:{nodes:[v]}})];d.logs=[{id:'l20a',date:'2026-09-02',notes:'Installing flooring today.',job:{id:j.id}},{id:'l20b',date:'2026-09-04',notes:'Job is complete besides the issues with the toilet line.',job:{id:j.id}}];const m=run(d);assert.equal(m.jobs[0].stage,'WIP'); }

// 21. Phase completion and a progress draw do not complete the overall job.
{ const d=empty(),j=job('21','113 W 10th');d.jobs=[j];const p=item('p21','Phase 2 Labor',5364,3352),v={...p,price:0,priceWithTax:0,cost:3352};d.docs=[doc('o21','customerOrder','approved',j,5364,{closedAt:'2026-08-25T12:00:00Z',costItems:{nodes:[p]}}),doc('wo21','vendorOrder','approved',j,3352,{costItems:{nodes:[v]}})];d.logs=[{id:'l21',date:'2026-09-02',notes:'Installed new hot water heater. Installing a clean out as well.',job:{id:j.id}}];d.comments=[{id:'c21',createdAt:'2026-09-03T13:38:24Z',message:'Phase 1 is complete and has been paid. Need to add the plumbing change order for the project next.',job:{id:j.id}}];const m=run(d);assert.equal(m.jobs[0].stage,'WIP'); }

// 22. Instructions to post a job sheet on site do not mean the crew is on site.
{ const d=empty(),j=job('22','1847 S Gold');d.jobs=[j];const p=item('p22','Foundation',4375,3500),v={...p,price:0,priceWithTax:0,cost:3500};d.docs=[doc('o22','customerOrder','approved',j,4375,{closedAt:'2026-09-01T12:00:00Z',costItems:{nodes:[p]}}),doc('wo22','vendorOrder','approved',j,3500,{costItems:{nodes:[v]}})];d.comments=[{id:'c22',createdAt:'2026-09-01T21:55:00Z',message:'Job Sheet — print this and post it on site, check off each item as you go.',job:{id:j.id}}];const m=run(d);assert.equal(m.jobs[0].stage,'Assigned / Not Started'); }

// 23. Bare scope verbs such as Demo/Painting are not proof work started.
{ const d=empty(),j=job('23','Heritage 111');d.jobs=[j];const p=item('p23','Make Ready',1481,925),v={...p,price:0,priceWithTax:0,cost:925};d.docs=[doc('o23','customerOrder','approved',j,1481,{closedAt:'2026-08-20T12:00:00Z',costItems:{nodes:[p]}}),doc('wo23','vendorOrder','pending',j,925,{costItems:{nodes:[v]}})];d.comments=[{id:'c23',createdAt:'2026-08-06T12:00:00Z',message:'Scope:\n- Demo loose lay $51\n- Painting walls $272\n- Install one blind $10',job:{id:j.id}}];const m=run(d);assert.equal(m.jobs[0].stage,'Assigned / Not Started'); }

// 24. A Wichita 316 phone area code cannot turn a PMI job into a 316 Rentals source.
{ const d=empty(),j=job('24','1847 S Gold',{description:'Contractor Services job. Property manager PMI Wichita (Stephanie G.). Tenant phone: (316) 804-9461.',location:{account:{id:'1439',name:'1439 Homes',type:'customer'}}});d.jobs=[j];const m=run(d);assert.equal(m.jobs[0].src.workSource,'PMI'); }

// 25. Closed original scope with a separate same-address follow-on job is resolved, not Review.
{ const d=empty(),j=job('25','600 S Spruce - Make Ready',{closedOn:'2026-07-31T12:00:00Z'}),follow=job('25b','600 S Spruce - Punch List',{createdAt:'2026-08-06T16:00:00Z',closedOn:'2026-08-25T12:00:00Z'});d.jobs=[j,follow];d.comments=[{id:'c25',createdAt:'2026-08-06T16:13:00Z',message:'Need a couple more things done. Crew working today on the new scope.',job:{id:j.id}}];const m=run(d);assert.ok(m.info.some(e=>e.code==='FOLLOW_ON_SCOPE_SEPARATED'));assert.ok(!m.review.some(e=>e.code==='POST_CLOSE_NEW_SCOPE')); }

console.log('Forensic self-test: 25 scenarios passed.');