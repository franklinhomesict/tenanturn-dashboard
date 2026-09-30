import {digest} from './evidenceFingerprints.js';

// Audited matches for progress/replacement lines whose JobTread scope IDs differ.
// These change matching only; original line IDs, prices, costs and dates remain.
const rules=[
  {
    "itemId": "22PejR5WpTJq",
    "jobId": "22PdHtfqrKCQ",
    "documentId": "22PejR5WAWQW",
    "target": "22PdHtpENgCc",
    "commentId": "22PfPRkYaCge",
    "itemHash": "d749e1ba",
    "commentHash": "92678b4b"
  },
  {
    "itemId": "22PfPSHGb2yn",
    "jobId": "22PdHtfqrKCQ",
    "documentId": "22PfPSGbC8Qt",
    "target": "22PdHtpENgCc",
    "commentId": "22PfPRkYaCge",
    "itemHash": "7385a8e9",
    "commentHash": "92678b4b"
  },
  {
    "itemId": "22Pf7bFvhwYA",
    "jobId": "22PdHtfqrKCQ",
    "documentId": "22Pf7bFvDxCe",
    "target": "22PdHtpENgCc",
    "commentId": "22Pf7bQsvbzx",
    "itemHash": "2a962e94",
    "commentHash": "56013f5a"
  },
  {
    "itemId": "22PegsswEsMz",
    "jobId": "22Pc5Ftsk5D4",
    "documentId": "22PegsgFRgNP",
    "target": "22Pc5Fxf8zb6",
    "commentId": "22PeveXHwH2D",
    "itemHash": "2c0b25ac",
    "commentHash": "c3725864"
  }
];
export function reconcileAuditedScopes(data,auditRules=rules){
 const issues=[], applied=[];
 const comments=new Map(data.comments.map(c=>[c.id,c]));
 const byItem=new Map(data.docs.flatMap(d=>(d.costItems?.nodes||[]).map(i=>[i.id,{d,i}])));
 const aliases=new Map();
 for(const r of auditRules){
  if(!data.jobs.some(j=>j.id===r.jobId))continue;
  const found=byItem.get(r.itemId),c=comments.get(r.commentId);
  const target=data.docs.some(d=>d.job?.id===r.jobId&&d.type==='customerOrder'&&d.status==='approved'&&(d.costItems?.nodes||[]).some(i=>i.jobCostItem?.id===r.target));
  if(!found||found.d.id!==r.documentId||found.d.job?.id!==r.jobId||!target||!c||c.job?.id!==r.jobId||r.itemHash!==digest(JSON.stringify([found.i.name,found.i.description,found.i.jobCostItem?.id,found.i.priceWithTax,found.i.cost]))||r.commentHash!==digest(c.message)){
   issues.push({job:found?.d.job?.name||'Source',severity:'Critical',code:'AUDITED_SCOPE_MATCH_CHANGED',detail:`Audited progress/replacement matching for ${r.itemId} no longer matches its source evidence.`});continue;
  }
  aliases.set(r.itemId,r.target);
  applied.push({job:found.d.job.name,severity:'Info',code:'AUDITED_PROGRESS_SCOPE_MATCH',detail:`${found.d.fullName}: ${found.i.name} matches original approved scope ${r.target}; evidence ${r.commentId}. Original source amounts are retained.`});
 }
 return {data:{...data,docs:data.docs.map(d=>({...d,costItems:{nodes:(d.costItems?.nodes||[]).map(i=>aliases.has(i.id)?{...i,auditScopeKey:aliases.get(i.id)}:i)}}))},issues,applied};
}
