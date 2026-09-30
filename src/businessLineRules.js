const passRx=/\b(?:reimbursement|reimbursements|reimbursable|reimburse|pass[- ]?through)\b/i;
const feeRx=/instant pay|processing fee/i;
const explicitMrJobRx=/(?:-\s*(?:make ready|mr)\b|\bmake[- ]?ready\b|\bturnover\b|\bunit turn\b)/i;
const explicitCsJobRx=/(?:-\s*cs\b|\bcontractor services\b|\b(?:roof|roofing|siding|tree work|tree removal|sewer|septic|foundation|gutter|concrete|water heater)\b)/i;
const flooringTurnJobRx=/(?:-\s*(?:lvp|flooring)\b|\bturnover flooring\b)/i;
const turnoverScopeRx=/\b(?:make ready|make-ready|turnover|unit turn|lvp|flooring|paint|painting|drywall|trim|baseboard|door|doors|blind|blinds|clean|cleaning|trash|haul|lock|lockset|hardware|caulk|patch|touch ?up)\b/i;
const specialtyScopeRx=/\b(?:tree|roof|roofing|siding|sewer|septic|foundation|gutter|concrete|exterior paint|water heater|plumbing repair|plumbing replacement|hvac|furnace|air conditioner|electrical service|service panel|panel upgrade)\b/i;

export const isPassThroughItem=i=>{
 const name=`${i?.jobCostItem?.name||''} ${i?.name||''}`;
 if(passRx.test(name))return true;
 return /materials?|supplies?|receipts?|paint|hardware/i.test(name) && /at cost|no markup|reimburs|pass[- ]?through/i.test(i?.description||'') && (Math.abs(Number(i?.priceWithTax??i?.price??0)-Number(i?.cost??0))<=.02 || Number(i?.priceWithTax??i?.price??0)===0);
};
export const isFeeItem=i=>feeRx.test(`${i?.name||''} ${i?.description||''}`);

export function classifyBusinessLine(item,jobName=''){
  const n=`${item?.jobCostItem?.name||''} ${item?.name||''}`;
  const t=`${n} ${item?.description||''}`;
  if(isPassThroughItem(item)||isFeeItem(item))return 'PASS';

  // Structured scope labels are strongest evidence. This preserves mixed jobs:
  // a Make Ready Labor line stays MR even when the same JobTread job also has CS add-ons.
  if(/\b(?:make ready labor|turnover labor)\b/i.test(n))return 'MR';

  // Explicit whole-job CS naming means generic lines belong to CS.
  if(explicitCsJobRx.test(jobName))return 'CS';

  // Ian already uses - Make Ready / - MR in JobTread. Inside those jobs, normal
  // turnover work is MR, but clearly separate specialty/add-on scope can still be CS.
  if(explicitMrJobRx.test(jobName)){
    if(specialtyScopeRx.test(t))return 'CS';
    return 'MR';
  }

  // Flooring/LVP-only turnover jobs are MR even though the job name is trade-specific.
  if(flooringTurnJobRx.test(jobName))return 'MR';

  // Without an explicit job-purpose label, classify only when the scope itself is clear.
  if(specialtyScopeRx.test(t))return 'CS';
  if(turnoverScopeRx.test(t))return 'MR';
  return 'REVIEW';
}

export function classifyDocumentBusinessLine(doc){
  const items=doc?.costItems?.nodes||[];
  if(items.length){
    const lines=new Set(items.map(i=>classifyBusinessLine(i,doc?.job?.name||'')).filter(x=>x!=='PASS'));
    if(lines.size===1)return [...lines][0];
    if(lines.size>1)return 'MIXED';
  }
  const probe=`${doc?.job?.name||''} ${doc?.fullName||''}`;
  if(passRx.test(probe))return 'PASS';
  if(explicitCsJobRx.test(probe))return 'CS';
  if(explicitMrJobRx.test(probe)||flooringTurnJobRx.test(probe))return 'MR';
  return 'REVIEW';
}
