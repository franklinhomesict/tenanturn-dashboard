import {validBusinessDate} from './forensicModel.js';
// Presentation-only signals. The audited ledger remains the financial authority.
const add=xs=>xs.reduce((n,x)=>n+Math.round(Number(x||0)*100),0)/100;
export function ownerSignals(model,today){
 const epoch=value=>validBusinessDate(value)?Date.parse(`${value}T12:00:00Z`):NaN;
 const day=epoch(today);
 const collectFirst=model.arDocs.map(d=>{const issued=epoch(d.issueDate?.slice(0,10));return {...d,issueAge:Number.isFinite(issued)&&Number.isFinite(day)?Math.max(0,Math.floor((day-issued)/86400000)):null};}).sort((a,b)=>(b.issueAge??-1)-(a.issueAge??-1)||b.balance-a.balance);
 const buckets=[['0–14 days',x=>x!=null&&x<=14],['15–30 days',x=>x!=null&&x>14&&x<=30],['31+ days',x=>x!=null&&x>30],['Undated',x=>x==null]];
 const closed=model.jobs.filter(j=>j.job.closedOn&&(j.approved!==0||j.billed!==0||j.cost!==0));
 const revenue=add(closed.map(j=>j.billed));
 return {collectFirst,aging:buckets.map(([label,test])=>({label,amount:add(collectFirst.filter(d=>test(d.issueAge)).map(d=>d.balance))})),marginRisk:model.current.filter(j=>j.approved>0&&j.projectedProfit<=0),closedMargin:revenue>0?100*model.closedProfit/revenue:null};
}
