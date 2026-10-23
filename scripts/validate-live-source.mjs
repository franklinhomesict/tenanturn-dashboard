import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditedLedger} from '../src/auditedLedger.js';
import {ownerSignals} from '../src/ownerSignals.js';
import {metricHealth} from '../src/metricHealth.js';
const path=process.argv[2];if(!path)throw new Error('Pass a private, complete source snapshot path. Never commit it.');
const api=JSON.parse(fs.readFileSync(path,'utf8'));assert(api.ok&&api.sourceCoverage.complete);assert.equal(api.organizationId,'22Pa5G229Dc7');
const cents=n=>Math.round(n*100);let checkedJobs=0;
for(const [start,end] of [['2026-09-01','2026-09-30'],['2026-10-01','2026-10-22'],['2026-01-01','2026-10-22']]){
 const models=['Overall','MR','CS'].map(line=>auditedLedger(api,start,end,line));
 for(const m of models){
  assert.equal(m.critical,0,JSON.stringify(m.exceptions.filter(e=>e.severity==='Critical')));
  assert.equal(cents(m.sales),m.salesEntries.reduce((n,s)=>n+cents(s.value),0));
  assert.equal(cents(m.projectedProfit),m.current.reduce((n,j)=>n+cents(j.projectedProfit),0));
  assert.equal(cents(m.futureCost),m.current.reduce((n,j)=>n+cents(j.remainingBudget),0));
  assert.equal(cents(m.ar),m.arDocs.reduce((n,d)=>n+cents(d.balance),0));
  assert.equal(cents(m.ap),m.apDocs.reduce((n,d)=>n+cents(d.balance),0));
  const signals=ownerSignals(m,end);assert.equal(cents(m.ar),signals.aging.reduce((n,b)=>n+cents(b.amount),0));
  for(const j of m.jobs){assert.equal(cents(j.profitRecorded),cents(j.billed)-cents(j.cost));assert.equal(cents(j.projectedProfit),cents(j.approved)-cents(j.projectedCost));checkedJobs++;}
  const health=metricHealth(m);for(const k of ['sales','billed','ar','ap','customerPaymentsApplied','futureCost','closedProfit','projectedProfit'])assert(health.canShow(k));
 }
 for(const key of ['sales','billed','futureCost','projectedProfit','closedProfit'])assert.equal(cents(models[0][key]),cents(models[1][key])+cents(models[2][key]),key);
 for(const j of models[0].jobs){const mr=models[1].jobs.find(x=>x.job.id===j.job.id),cs=models[2].jobs.find(x=>x.job.id===j.job.id);for(const key of ['approved','billed','cost','projectedCost','projectedProfit'])assert.equal(cents(j[key]),cents(mr[key])+cents(cs[key]),`${j.job.id} ${key}`);}
}
const m=auditedLedger(api,'2026-10-01','2026-10-22');
console.log(JSON.stringify({result:'PASS',sourceRecords:api.sourceCoverage.counts,periods:3,businessViews:3,jobChecks:checkedJobs,critical:m.critical,review:m.review,sourceRelease:api.release}));
