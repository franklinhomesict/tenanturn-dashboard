import {isPassThroughItem} from './businessLineRules.js';
const knownPMs = ['Ben', 'Jessica', 'Lexi', 'Melinda', 'Brandon', 'Brad', 'Ally', 'Randy'];
const passRx = /\b(reimbursement|reimbursements|reimbursable|pass[- ]?through)\b/i;
const feeRx = /payment processing fee|instant pay/i;
const changeRx = /change order/i;
const creditRx = /\b(credit|refund)\b/i;
const lossRx = /went with another|went forward with another bid|selected another bid|selected a different bid|chose another bid|chose (?:a )?cheaper|another contractor|not moving forward|decided not to|declined (?:the )?(?:bid|work)|lost (?:the )?(?:job|bid)|owner chose|customer chose/i;
const activeRx = /\b(work(?:ing)? today|work underway|in progress|installed|installing|demoing|(?:is|are|was|were) painting|crew (?:is|was|are|were) (?:there|on site|onsite)|(?:he|they|we) (?:is|are|was|were)?\s*(?:on site|onsite)|wrapping up|finishing|started work|starting work|materials delivered|delivered today)\b/i;
const wholeDoneRx = /\b(?:job|project) (?:is )?(?:complete|completed|finished)\b|\b(?:work|all work) (?:is )?(?:complete|completed|finished)\b|\ball done\b|\bready to bill\b|\bjob finished\b|\bwrapped up the job\b|\bcomplete and has been paid\b/i;
const prepayRx = /paid in advance|before work started|prepayment|paid up front|deposit invoice|mobilization deposit/i;
const correctiveDepositRx = /reimbursement received from franklin homes|settling the misrouted|franklin repaid|correcting the misrouted|reimburse(?:d|ment).*from franklin/i;
const postCloseNewScopeRx = /need (?:a couple|some|more).*done|more things done|new (?:work|scope)|additional (?:work|scope)|send me a list of everything you need done/i;
const approvalRx = /\bapproved\b|\byes please\b|go ahead|customer (?:said|approved)|owner (?:said|approved)|called .* told him|send .* invoice|collect \$|pay .* \$/i;
const structuredPmRx = /^\s*[-*•]?\s*(?:notes?\s*[:=-]?\s*)?(?:pm|property manager)\s*[:=-]?\s*\S+/im;
const TOL = 0.02;
const TZ = 'America/Chicago';

export const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
export const pct = n => `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
export const sum = (a, f = x => x) => (a || []).reduce((t, x) => t + (Number(f(x)) || 0), 0);
export const ymd = d => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
};
const localDate = s => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return String(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : ymd(d);
};
const day = s => s ? new Date(`${String(s).slice(0, 10)}T12:00:00`) : null;
export const inRange = (s, a, b) => { const d = localDate(s); return !!d && !!a && !!b && day(d) >= day(a) && day(d) <= day(b); };
export const eventDate = d => d?.closedAt || d?.signedAt || d?.issueDate || d?.createdAt || null;
export const eventBusinessDate = d => localDate(eventDate(d));
const validMoneyStatus = s => s === 'pending' || s === 'approved';
const cleanName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const strongScopeKey = i => i?.jobCostItem?.id || i?.sourceCostItem?.id || null;
const weakScopeKey = i => i?.name ? `NAME:${cleanName(i.name)}` : null;
const lineRevenue = i => Number(i?.priceWithTax ?? i?.price ?? 0) || 0;
const lineCost = i => Number(i?.cost ?? 0) || 0;

const isPassItem = isPassThroughItem;
const isPassDoc = d => passRx.test(String(d?.fullName || ''));
const isFeeDoc = d => String(d?.account?.name || '').trim() === '316 Payment Processing Fee' || feeRx.test(`${d?.account?.name || ''} ${d?.fullName || ''}`);
const isChange = d => changeRx.test(d?.fullName || '');
export const productionRevenue = d => {
  const items = d?.costItems?.nodes || [];
  if (!items.length) return isPassDoc(d) ? 0 : Number(d?.priceWithTax || 0);
  return sum(items, i => isPassItem(i) ? 0 : lineRevenue(i));
};
export const passRevenue = d => {
  const items = d?.costItems?.nodes || [];
  if (!items.length) return isPassDoc(d) ? Number(d?.priceWithTax || 0) : 0;
  return sum(items, i => isPassItem(i) ? lineRevenue(i) : 0);
};

export function rangeFor(mode, customStart, customEnd) {
  const today = ymd(new Date());
  const base = new Date(`${today}T12:00:00`);
  let x = new Date(base);
  if (mode === 'Week') { const wd = (base.getDay() + 6) % 7; x.setDate(base.getDate() - wd); }
  if (mode === 'Month') x = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  if (mode === 'Quarter') x = new Date(base.getFullYear(), Math.floor(base.getMonth() / 3) * 3, 1, 12);
  if (mode === 'Custom') return { start: customStart, end: customEnd };
  return { start: ymd(x), end: today };
}

export function normalize(api) {
  const p = api?.payload?.data || api?.payload || {};
  const o = p.organization || {};
  return {
    jobs: o.jobs?.nodes || [], docs: o.documents?.nodes || [], comments: o.comments?.nodes || [],
    logs: o.dailyLogs?.nodes || [], tasks: o.tasks?.nodes || [], payments: o.payments?.nodes || [],
    documentPayments: o.documentPayments?.nodes || [], fetchedAt: api?.fetchedAt || null,
  };
}

function add(map, key, val) { if (key) map[key] = (map[key] || 0) + (Number(val) || 0); }
function entries(doc, kind) {
  const items = doc?.costItems?.nodes || [];
  if (!items.length) return [{ key: `DOC:${doc.id}`, strong: false, weak: true, item: null, amount: kind === 'revenue' ? Number(doc.priceWithTax || 0) : Number(doc.cost || 0), pass: isPassDoc(doc) }];
  return items.map(i => ({ key: strongScopeKey(i) || weakScopeKey(i) || `ITEM:${i.id}`, strong: !!strongScopeKey(i), weak: !strongScopeKey(i), item: i, amount: kind === 'revenue' ? lineRevenue(i) : lineCost(i), pass: isPassItem(i) }));
}
function documentLineTotal(doc) {
  const items = doc?.costItems?.nodes || [];
  if (!items.length) return null;
  return doc.type?.startsWith('customer') ? sum(items, lineRevenue) : sum(items, lineCost);
}
function documentTotal(doc) { return doc.type?.startsWith('customer') ? Number(doc.priceWithTax || 0) : Number(doc.cost || 0); }

function sourceScopeScore(job, c) {
  const j = cleanName(job?.name || ''), t = cleanName(c?.message || '');
  let score = 10;
  const specialized = [['tree', /\btree\b/], ['roof', /\broof\b/], ['siding', /\bsiding\b/], ['water heater', /water heater/]];
  for (const [token, rx] of specialized) if (j.includes(token)) score += rx.test(t) ? 5 : -5;
  if (/make ready|\bmr\b/.test(j)) score += /tree work|tree removal|\broof\b|\bsiding\b/.test(t) ? -3 : 1;
  if (structuredPmRx.test(c?.message || '')) score += 2;
  if (/316|blu\s*2|\bblu\b|\bsb\b|pmi|jn investments/i.test(c?.message || '')) score += 1;
  return score;
}
function sourceComment(job, jobComments, commentsById) {
  const ref = String(job?.description || '').match(/org comment\s+([A-Za-z0-9]+)/i)?.[1];
  if (ref && commentsById[ref]?.isPinned) return commentsById[ref];
  const local = (jobComments || []).filter(c => c.isPinned && structuredPmRx.test(c.message || '')).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
  if (local) return local;
  const address = cleanName(String(job?.name || '').split(' - ')[0]);
  if (address.length < 6) return null;
  const candidates = Object.values(commentsById).filter(c => c?.isPinned && !c?.job?.id && cleanName(c.message || '').includes(address)).map(c => ({ c, score: sourceScopeScore(job, c) })).sort((a, b) => b.score - a.score || new Date(a.c.createdAt) - new Date(b.c.createdAt));
  if (!candidates.length || candidates[0].score < 9) return null;
  if (candidates[1] && candidates[0].score === candidates[1].score) return null;
  return candidates[0].c;
}
function titleCase(s) { return String(s || '').toLowerCase().replace(/\b[a-z]/g, m => m.toUpperCase()); }
function sourceIdentity(job, jobComments, commentsById) {
  const c = sourceComment(job, jobComments, commentsById);
  const text = c?.message || job?.description || '';
  const pmLine = text.split(/\r?\n/).find(l => structuredPmRx.test(l)) || '';
  const sourceProbe = pmLine || text.slice(0, 800);
  const billingCustomer = job?.location?.account?.name || 'Unknown';
  const allNarrative = `${job?.description || ''} ${(jobComments || []).map(x => x.message || '').join(' ')}`;
  let workSource = 'Unknown';
  const explicit316 = /\b(?:pm|property manager)\b[^\n]{0,50}316\b|\b316\s*(?:rentals?|pm)\b/i;
  if (/\bpmi\b/i.test(sourceProbe)) workSource = 'PMI';
  else if (/\bjn\b|jn investments/i.test(sourceProbe)) workSource = 'JN Investments';
  else if (/\bsb\b|sb investments/i.test(sourceProbe)) workSource = 'SB Investments';
  else if (/blu\s*2|\bblu2\b/i.test(sourceProbe)) workSource = 'Blu 2';
  else if (/\bblu\b/i.test(sourceProbe)) workSource = 'Blu';
  else if (explicit316.test(sourceProbe)) workSource = '316 Rentals';
  if (workSource === 'Unknown') {
    if (/316/i.test(billingCustomer)) workSource = '316 Rentals';
    else if (/^blu\s*2$|^blu2$/i.test(billingCustomer.trim())) workSource = 'Blu 2';
    else if (/^blu$/i.test(billingCustomer.trim())) workSource = 'Blu';
    else if (/sb investments/i.test(billingCustomer)) workSource = 'SB Investments';
    else if (/jn investments/i.test(billingCustomer)) workSource = 'JN Investments';
  }
  let pm = 'Unattributed';
  for (const n of knownPMs) if (new RegExp(`\\b${n}(?=\\b|\\d)|${n}(?=316\\b)`, 'i').test(pmLine)) { pm = n; break; }
  if (pm === 'Unattributed' && pmLine) {
    const stop = new Set(['with','rentals','rental','property','manager','management','notes','note','this','that','conf','confirmed','customer','owner','pmi','investments','investment','homes','home','one','sent','send','be']);
    const stripped = pmLine.replace(/^\s*[-*•]?\s*(?:notes?\s*[:=-]?\s*)?(?:pm|property manager)\s*[:=-]?/i, ' ').replace(/\b(?:316|blu\s*2|blu2|blu|sb investments|sb|pmi|jn investments|jn)\b/ig, ' ').replace(/\d+/g, ' ').replace(/[^a-z]+/ig, ' ').trim();
    const candidate = stripped.split(/\s+/).find(x => x.length >= 2 && !stop.has(x.toLowerCase()));
    if (candidate) pm = titleCase(candidate);
  }
  if (pm === 'Unattributed' && /\bPM\s+Melinda\s+Haslam\b/i.test(job?.description || '')) pm = 'Melinda';
  if (pm === 'Unattributed' && /(?:\bJessica,\s*(?:touching|following)|\bJessica\b.{0,80}\bproposal\b|\btake this to the owner\b)/i.test(allNarrative)) pm = 'Jessica';
  if (pm === 'Unattributed' && /(?:Ally feedback|confirmed with Ally|Ally viewed|sent .* Ally)/i.test(allNarrative)) pm = 'Ally';
  if (pm === 'Unattributed' && workSource === 'PMI') { const named=allNarrative.match(/\b(?:approved by|approval (?:from|by)|sent to|texted)\s+(Brad|Randy|Ben|Jessica|Lexi|Ally)\b/i); if(named) pm=titleCase(named[1]); }
  if (/since you own this one/i.test(allNarrative)) {
    pm = 'Brandon';
    if (/\bblu\s*2\b|\bblu2\b/i.test(allNarrative)) workSource = 'Blu 2';
    else if (/\bsb(?: investments)?\b/i.test(allNarrative)) workSource = 'SB Investments';
    else if (/\bblu\b/i.test(allNarrative)) workSource = 'Blu';
    else if (workSource === '316 Rentals') workSource = 'Brandon-owned';
  }
  if (/\bblu\b[^.\n]{0,50}\bnot\s+blu\s*2\b/i.test(allNarrative)) workSource = 'Blu';
  if (!job?.closedOn && (pm === 'Melinda' || /taken over for Melinda|Melinda (?:has )?(?:left|quit)|replaced Melinda/i.test(allNarrative))) pm = 'Ben';
  if (workSource === 'Unknown' && billingCustomer && billingCustomer !== 'Unknown') workSource = 'Direct Customer';
  if (pm === 'Unattributed' && ['Blu', 'Blu 2', 'SB Investments'].includes(workSource)) pm = 'Brandon';
  if (pm === 'Unattributed' && workSource === 'Direct Customer') pm = billingCustomer;
  const operationallyAuthorized = !!c && pm === 'Brandon' && ['Blu', 'Blu 2', 'SB Investments'].includes(workSource);
  if (billingCustomer === '1439 Homes' && (pm === 'Unattributed' || pm === billingCustomer)) pm = 'Brad';
  return { pm, workSource, billingCustomer, sourceCommentId: c?.id || null, sourceText: text, operationallyAuthorized };
}
function isWholeDoneText(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(?:except|besides|still need|still needs|remaining|left to|issue(?:s)? with|not complete|not done|but\s+(?:still|not))\b/i.test(t)) return false;
  if (/\b(?:phase|stage)\s*\d+\b[^.\n]{0,80}\b(?:complete|completed|finished|done)\b/i.test(t) && !/\b(?:job|project|all work)\b[^.\n]{0,40}\b(?:complete|completed|finished|done)\b/i.test(t)) return false;
  const explicitWhole = wholeDoneRx.test(t);
  if (/\b(?:flooring|lvp|plumbing|paint(?:ing)?|room|toilet|vanity|door|trim|scope|portion|part)\b[^.\n]{0,60}\b(?:done|complete|completed|finished)\b/i.test(t) && !explicitWhole) return false;
  if (/^(?:done|complete|completed|finished)[.!\s👍]*$/i.test(t)) return true;
  return explicitWhole;
}
function activityBelongsToJob(job, text) {
  const t = String(text || '');
  if (!activeRx.test(t)) return false;
  if (/\b(?:print|post|upload|attach|link|job sheet|work order)\b[^.\n]{0,50}\b(?:on site|onsite|delivered)\b/i.test(t)) return false;
  const current = cleanName(String(job?.name || '').split(' - ')[0]);
  const refs = [...t.matchAll(/\b(?:finishing|working|starting|started|wrapping up|on site|onsite)\b[^.\n]{0,80}\b(?:at|on)\s+(\d{2,5}\s+[A-Za-z][A-Za-z0-9 .'-]{1,40})/ig)].map(m => cleanName(m[1]));
  if (refs.length && current && refs.every(r => r && !r.includes(current) && !current.includes(r))) return false;
  return true;
}
function operationalEvidence(job, comments, logs) {
  const ops = [];
  for (const l of logs || []) if (l.date && String(l.notes || '').trim()) {
    const t = l.notes || '';
    if (isWholeDoneText(t)) ops.push({ at: l.date, type: 'done', text: t, kind: 'log' });
    else if (activityBelongsToJob(job, t)) ops.push({ at: l.date, type: 'active', text: t, kind: 'log' });
  }
  for (const c of comments || []) {
    const t = c.message || '';
    if (isWholeDoneText(t)) ops.push({ at: c.createdAt, type: 'done', text: t, kind: 'comment' });
    else if (activityBelongsToJob(job, t)) ops.push({ at: c.createdAt, type: 'active', text: t, kind: 'comment' });
  }
  ops.sort((a, b) => new Date(a.at) - new Date(b.at));
  const latest = ops.at(-1) || null;
  return { started: ops.some(x => x.type === 'active') || Number(job?.taskSummary?.started || 0) > 0, done: latest?.type === 'done', firstStart: ops.find(x => x.type === 'active')?.at || null, latest };
}

function paymentText(p) { return `${p?.source || ''} ${p?.description || ''}`; }
function isCorrectiveDeposit(p) { return p?.type === 'credit' && correctiveDepositRx.test(paymentText(p)); }
function isReturnedEvent(p) {
  if (!p || isCorrectiveDeposit(p)) return false;
  const t = paymentText(p);
  return /wrong acct(?:ount)?(?: #)?[^.]{0,40}returned|returned (?:to|by) (?:the )?bank|bank returned|payment (?:was )?returned|reversed by (?:the )?bank|failed payment|payment failed|voided payment/i.test(t);
}
function isBadMisroute(p) {
  if (p?.type !== 'credit' || isCorrectiveDeposit(p)) return false;
  const t = paymentText(p);
  return /(?:appfolio )?routed (?:this|it|the payment|funds|payment)[^.]{0,160}(?:to|into) (?:franklin homes|the wrong account|wrong account|wrong card)|(?:appfolio )?funded (?:this|it|the payment|funds|payment)[^.]{0,160}(?:to|into) (?:franklin homes|the wrong account|wrong account|wrong card)|routed to franklin homes[^.]{0,100}(?:not|instead of) tenanturn/i.test(t);
}
function cashInClass(p) {
  if (p?.type !== 'credit' || isReturnedEvent(p) || isBadMisroute(p)) return 'none';
  const t = paymentText(p);
  if (isCorrectiveDeposit(p)) return 'confirmed';
  if (/net (?:deposit|deposited|received)|\bdeposited\b|\bedeposit\b|mobile deposit|check[^.]{0,80}deposited|funded[^.]{0,100}(?:tenanturn|6268|1294)|received[^.]{0,80}(?:tenanturn|6268|1294)/i.test(t)) return 'confirmed';
  // AppFolio payment-initiated language is trusted as confirmed cash: TenanTurn always
  // records the payment against the actual invoice when AppFolio shows it, so that
  // linkage is the real evidence — no separate bank confirmation required.
  if (/appfolio|instant pay|^instant\b/i.test(t) && /paid|payment|reimburse|instant|initiated/i.test(t)) return 'confirmed';
  if (/\bcheck\b|meritrust|businesspro|1294|6268|tenanturn/i.test(t)) return 'confirmed';
  return 'unverified';
}
function isWithheldFeePayment(p) { return p?.type === 'debit' && /withheld at source|netted|deducted at source|no separate cash outlay|never left the account/i.test(paymentText(p)); }
function isVerifiedCashIn(p) { return cashInClass(p) === 'confirmed'; }
function isVerifiedCashOut(p) {
  const t = paymentText(p);
  if (p?.type !== 'debit' || isReturnedEvent(p) || isWithheldFeePayment(p) || Number(p?.amountApplied || 0) <= TOL) return false;
  return /1294|6268|tenanturn|businesspro|meritrust|\bach\b|\bcheck\b|pay a person|bank transfer/i.test(t);
}
function findCorrection(p, payments) {
  const acct = p.account?.name || '', amt = Number(p.amount || 0), badMisroute = isBadMisroute(p);
  return (payments || []).find(q => {
    if (q.id === p.id || Math.abs(Number(q.amount || 0) - amt) > TOL || new Date(q.paidAt) <= new Date(p.paidAt)) return false;
    if (badMisroute) return q.type === 'credit' && isCorrectiveDeposit(q) && cashInClass(q) === 'confirmed';
    return q.account?.name === acct && p.type === 'debit' && q.type === 'debit' && Number(q.amountApplied || 0) > TOL && !isReturnedEvent(q);
  });
}
function completionDateForJob(j) { if (j.job?.closedOn) return j.job.closedOn; if (j.ev?.done && j.ev?.latest?.at) return j.ev.latest.at; return null; }
function weeksBetween(a, b) { return Math.max(1, Math.ceil((day(b) - day(a)) / (7 * 86400000)) + 1); }
function buildVendorCapacity(jobs, asOf) {
  const out = {}, completed = jobs.filter(j => completionDateForJob(j));
  for (const j of completed) {
    const completedAt = completionDateForJob(j);
    for (const [vendor, keyed] of Object.entries(j.vendorActualByKey || {})) {
      const cost = sum(Object.values(keyed)); if (!cost) continue;
      out[vendor] ||= { vendor, completed: [] };
      out[vendor].completed.push({ completedAt, cost, jobId: j.job.id, jobName: j.job.name });
    }
  }
  const asOfDate = asOf || ymd(new Date()), cutoff = new Date(day(asOfDate)); cutoff.setDate(cutoff.getDate() - 55);
  for (const v of Object.values(out)) {
    const recent = v.completed.filter(x => day(localDate(x.completedAt)) >= cutoff && day(localDate(x.completedAt)) <= day(asOfDate));
    const recentTotal = sum(recent, x => x.cost), lifetimeTotal = sum(v.completed, x => x.cost);
    const firstRecent = recent.length ? recent.map(x => day(localDate(x.completedAt))).sort((a, b) => a - b)[0] : null;
    const recentWeeks = firstRecent ? Math.min(8, weeksBetween(ymd(firstRecent), asOfDate)) : 0;
    const lifetimeDates = v.completed.map(x => day(localDate(x.completedAt))).sort((a, b) => a - b);
    const lifetimeWeeks = lifetimeDates.length ? weeksBetween(ymd(lifetimeDates[0]), asOfDate) : 0;
    v.rolling8WeeklyCost = recentWeeks ? recentTotal / recentWeeks : 0;
    v.lifetimeWeeklyCost = lifetimeWeeks ? lifetimeTotal / lifetimeWeeks : 0;
    v.sampleJobs8 = recent.length; v.sampleJobsLifetime = v.completed.length;
    v.confidence = recent.length >= 6 ? 'High' : recent.length >= 3 ? 'Medium' : 'Low';
  }
  return out;
}

function refundReason(doc, dpRows) {
  const text = `${doc?.fullName || ''} ${(doc?.costItems?.nodes || []).map(i => `${i.name || ''} ${i.description || ''}`).join(' ')} ${(dpRows || []).map(dp => paymentText(dp.payment)).join(' ')}`;
  if (!creditRx.test(text)) return null;
  const m = text.match(/refund for ([^.\n]+)/i) || text.match(/credit(?: for| -| —)?\s*([^.\n]+)/i);
  return (m?.[1] || 'Customer refund / credit').trim();
}
function hasInformalApproval(narrative, item) {
  const name = cleanName(item?.name || '');
  const keywords = name.split(' ').filter(w => w.length >= 5 && !['change','order','labor','added','scope','replacement'].includes(w)).slice(0, 3);
  if (!approvalRx.test(narrative)) return false;
  if (!keywords.length) return true;
  return keywords.some(k => new RegExp(`\\b${k.slice(0, Math.max(5, k.length - 2))}`, 'i').test(narrative));
}
// A line item's own name/description can carry its own approval record, e.g.
// "Roof Repair (Change Order — approved 09/16)". Treat a clear approved-plus-date
// note on the item itself as real evidence, same as an approval found in the job
// thread — no formal Change Order document required on top of it.
const itemApprovalNoteRx = /\bapproved\b/i;
function hasItemApprovalNote(item) {
  return itemApprovalNoteRx.test(`${item?.name || ''} ${item?.description || ''}`);
}

export function buildModel(data, start, end) {
  const commentsById = Object.fromEntries((data.comments || []).map(c => [c.id, c]));
  const docs = data.docs || [];
  const orders = docs.filter(d => d.type === 'customerOrder' && d.status !== 'draft');
  const invoices = docs.filter(d => d.type === 'customerInvoice' && validMoneyStatus(d.status));
  const vendorOrders = docs.filter(d => d.type === 'vendorOrder' && validMoneyStatus(d.status));
  const vendorBills = docs.filter(d => d.type === 'vendorBill' && validMoneyStatus(d.status));
  const deniedFinancials = docs.filter(d => (d.type === 'customerInvoice' || d.type === 'vendorBill') && d.status === 'denied');
  const by = {}; for (const j of data.jobs || []) by[j.id] = { job: j, orders: [], invoices: [], vendorOrders: [], vendorBills: [], comments: [], logs: [] };
  for (const d of orders) if (by[d.job?.id]) by[d.job.id].orders.push(d);
  for (const d of invoices) if (by[d.job?.id]) by[d.job.id].invoices.push(d);
  for (const d of vendorOrders) if (by[d.job?.id]) by[d.job.id].vendorOrders.push(d);
  for (const d of vendorBills) if (by[d.job?.id]) by[d.job.id].vendorBills.push(d);
  for (const c of data.comments || []) if (by[c.job?.id]) by[c.job.id].comments.push(c);
  for (const l of data.logs || []) if (by[l.job?.id]) by[l.job.id].logs.push(l);

  const dpByDoc = {}, dpRowsByDoc = {};
  for (const dp of data.documentPayments || []) {
    (dpRowsByDoc[dp.document?.id] ||= []).push(dp);
    if (isReturnedEvent(dp.payment)) continue;
    add(dpByDoc, dp.document?.id, dp.amount);
  }
  const jobs = [], exceptions = [];
  // Codes below mean a box wasn't checked (no PM tagged, no formal order on file, job
  // stage unclear) — not that money is missing. They never drive the red/yellow Trust
  // Status badge; they're surfaced separately as Housekeeping so a real $ mismatch never
  // gets buried under routine paperwork noise.
  const HOUSEKEEPING_CODES = new Set([]);
  const push = (job, severity, code, detail, extra = {}) => exceptions.push({ job: job?.name || 'System', severity: (severity !== 'Info' && HOUSEKEEPING_CODES.has(code)) ? 'Housekeeping' : severity, code, detail, ...extra });

  for (const x of Object.values(by)) {
    const approved = x.orders.filter(d => d.status === 'approved'), pending = x.orders.filter(d => d.status === 'pending');
    const approvedBase = approved.filter(d => !isChange(d)), approvedChanges = approved.filter(isChange), pendingChanges = pending.filter(isChange);
    const pendingNew = pending.filter(d => !isChange(d)).sort((a, b) => new Date(eventDate(a)) - new Date(eventDate(b))).at(-1) || null;
    if (approvedBase.length > 1) push(x.job, 'Info', 'MULTIPLE_APPROVED_BASE_ORDERS', `${approvedBase.length} approved non-change-order proposals exist; both are approved so trusted as real scope.`);
    const baseApproval = approvedBase.sort((a, b) => new Date(eventDate(a)) - new Date(eventDate(b)))[0] || null;
    const baseDocs = x.orders.filter(d => !isChange(d)).sort((a, b) => new Date(eventDate(a)) - new Date(eventDate(b))), latestBase = baseDocs.at(-1) || null;
    const narrative = `${x.job.description || ''} ${x.comments.map(c => c.message || '').join(' ')} ${x.logs.map(l => l.notes || '').join(' ')}`;
    const lossEvidence = lossRx.test(narrative), trueLoss = !baseApproval && latestBase?.status === 'denied' && lossEvidence, outcomeReview = !baseApproval && latestBase?.status === 'denied' && !lossEvidence;
    const src = sourceIdentity(x.job, x.comments, commentsById), ev = operationalEvidence(x.job, x.comments, x.logs), scheduledAssignment = /(?:called|spoke to)\s+[A-Z][a-z]+[\s\S]{0,220}(?:approved|schedul|start)|\bwhole week blocked off for you\b|\bcan start (?:the )?week of\b/i.test(narrative);
    for (const c of x.comments.filter(c => c.evidenceSource === 'manual-override' && c.manualOverride)) {
      const o=c.manualOverride, ageDays=Math.max(0,(Date.now()-new Date(o.confirmedAt).getTime())/86400000), stale=ageDays>Number(o.reviewAfterDays||7);
      push(x.job, stale?'Review':'Info', stale?'MANUAL_OVERRIDE_STALE':'MANUAL_OPERATIONAL_OVERRIDE', stale?`Manual override from ${o.confirmedBy} on ${String(o.confirmedAt).slice(0,10)} is now ${Math.floor(ageDays)} days old and needs fresh JobTread evidence.`:`Manual override from ${o.confirmedBy} on ${String(o.confirmedAt).slice(0,10)}: ${o.fact} Auto-review after ${o.reviewAfterDays||7} days if JobTread does not supersede it.`);
    }
    // A vendor bill fully paid is solid proof the work is actually done — you don't pay a
    // vendor in full for unfinished work. But an invoice can legitimately go out mid-job for
    // partial/progress billing (Ian, 09/18/26), so an issued invoice or a partial vendor
    // payment only proves the job is underway (started), never that it's finished (done).
    const vendorBillFullyPaid = x.vendorBills.some(d => Number(d.cost || 0) > TOL && Number(d.amountPaid || 0) >= Number(d.cost || 0) - TOL);
    const vendorBillAnyPaid = x.vendorBills.some(d => Number(d.amountPaid || 0) > TOL);
    if (vendorBillAnyPaid) ev.started = true; // Payment proves recorded activity, never whole-job completion.
    if ((approved.length||x.invoices.length||x.vendorBills.length||x.vendorOrders.length) && /316/i.test(x.job.location?.account?.name || '') && src.pm === 'Unattributed') push(x.job, x.job.closedOn ? 'Info' : 'Review', 'PM_UNATTRIBUTED', '316 job has no defensible current PM attribution.');

    if (x.job.closedOn && ev.latest && new Date(ev.latest.at) > new Date(x.job.closedOn) && ev.latest.type === 'active') {
      const afterCloseText = x.comments.filter(c => new Date(c.createdAt) > new Date(x.job.closedOn)).map(c => c.message || '').join(' ');
      if (postCloseNewScopeRx.test(afterCloseText)) {
        const address = cleanName(String(x.job.name || '').split(' - ')[0]);
        const followOn = (data.jobs || []).find(j => j.id !== x.job.id && cleanName(String(j.name || '').split(' - ')[0]) === address && (!j.createdAt || new Date(j.createdAt) > new Date(x.job.closedOn)));
        if (followOn) push(x.job, 'Info', 'FOLLOW_ON_SCOPE_SEPARATED', `Later scope was captured separately as ${followOn.name}; original closed-job economics remain isolated.`);
        else push(x.job, 'Review', 'POST_CLOSE_NEW_SCOPE', 'New work was requested after the original job closed; keep it out of the closed economics and open a new scope/job if pursued.');
      } else push(x.job, 'Critical', 'ACTIVE_AFTER_JOB_CLOSED', 'Production evidence exists after the JobTread close date.');
    }

    const contractByKey = {}, billedByKey = {}, actualByKey = {}, commitByKey = {}, vendorCommitByKey = {}, vendorActualByKey = {}, billedMeta = {};
    const actualNotedKeys = new Set();
    let billedPass = 0, passCost = 0, feeCost = 0, customerRefundCost = 0;
    const refundEvents = [];
    const weakContract = new Map(), weakBilled = new Map(), weakActual = new Map(), weakCommit = new Map();
    const recordWeak = (map, e, doc) => { if (!e.weak) return; const arr = map.get(e.key) || []; arr.push({ docId: doc.id, docName: doc.fullName, amount: e.amount }); map.set(e.key, arr); };
    for (const d of approved) for (const e of entries(d, 'revenue')) if (!e.pass) { add(contractByKey, e.key, e.amount); recordWeak(weakContract, e, d); }
    for (const d of x.invoices) {
      const lineTotal = documentLineTotal(d); if (lineTotal != null && Math.abs(lineTotal - documentTotal(d)) > TOL) push(x.job, 'Critical', 'INVOICE_TOTAL_MISMATCH', `${d.fullName}: lines ${money(lineTotal)} do not tie to ${money(documentTotal(d))}.`);
      const applied = dpByDoc[d.id] || 0; if (Math.abs(applied - Number(d.amountPaid || 0)) > TOL) push(x.job, 'Critical', 'INVOICE_PAYMENT_MISMATCH', `${d.fullName}: amountPaid ${money(d.amountPaid)} vs linked payments ${money(applied)}.`);
      const expectedBalance = Number(d.priceWithTax || 0) - Number(d.amountPaid || 0); if (Math.abs(expectedBalance - Number(d.balance || 0)) > TOL) push(x.job, 'Critical', 'INVOICE_BALANCE_MISMATCH', `${d.fullName}: expected balance ${money(expectedBalance)}, stored ${money(d.balance)}.`);
      const paid = Number(d.balance || 0) <= TOL && Number(d.amountPaid || 0) >= Number(d.priceWithTax || 0) - TOL;
      for (const e of entries(d, 'revenue')) {
        if (e.pass) billedPass += e.amount;
        else { add(billedByKey, e.key, e.amount); recordWeak(weakBilled, e, d); (billedMeta[e.key] ||= []).push({ doc: d, item: e.item, paid, informal: hasInformalApproval(narrative, e.item), itemNoted: hasItemApprovalNote(e.item) }); }
      }
    }
    for (const d of x.vendorOrders) for (const e of entries(d, 'cost')) { if (e.pass) continue; add(commitByKey, e.key, e.amount); recordWeak(weakCommit, e, d); const vn = d.account?.name || 'Unknown'; vendorCommitByKey[vn] ||= {}; add(vendorCommitByKey[vn], e.key, e.amount); }
    for (const d of x.vendorBills) {
      const applied = dpByDoc[d.id] || 0;
      if (isFeeDoc(d)) {
        feeCost += Number(d.cost || 0);
        if (Math.abs(applied - Number(d.amountPaid || 0)) > TOL) push(x.job, 'Info', 'FEE_WITHHELD_NO_DOCUMENT_PAYMENT', `${d.fullName}: fee is marked paid without a linked payment; this is acceptable when AppFolio withheld/netted it at source.`);
        continue;
      }
      if (Math.abs(applied - Number(d.amountPaid || 0)) > TOL) push(x.job, 'Critical', 'BILL_PAYMENT_MISMATCH', `${d.fullName}: amountPaid ${money(d.amountPaid)} vs linked payments ${money(applied)}.`);
      const reason = refundReason(d, dpRowsByDoc[d.id]);
      const accountLooksCustomer = d.account?.type === 'customer' || d.account?.name === x.job.location?.account?.name || /316 rentals|1439 homes|jn investments|blu\s*2|\bblu\b|sb investments/i.test(d.account?.name || '');
      const customerRefund = !!reason && accountLooksCustomer;
      let billEntries = entries(d, 'cost');
      billEntries = billEntries.map(e => {
        if (e.pass || !e.strong || (commitByKey[e.key] || 0) > TOL) return e;
        const candidates = x.vendorOrders.filter(o => o.account?.name === d.account?.name).flatMap(o => entries(o, 'cost')).filter(v => !v.pass && Math.abs(v.amount - e.amount) <= TOL && cleanName(v.item?.name || '') === cleanName(e.item?.name || ''));
        const unique = [...new Map(candidates.map(v => [v.key, v])).values()];
        if (unique.length === 1) {
          push(x.job, 'Info', 'VENDOR_SCOPE_RELINKED', `${d.fullName}: ${money(e.amount)} matched the sole same-vendor/same-amount work-order line despite JobTread assigning a different cost-item ID.`);
          return { ...e, key: unique[0].key, strong: true, weak: false };
        }
        return e;
      });
      for (const e of billEntries) {
        if (e.pass) { passCost += e.amount; continue; }
        if (customerRefund) { customerRefundCost += e.amount; continue; }
        if (hasItemApprovalNote(e.item)) actualNotedKeys.add(e.key);
        add(actualByKey, e.key, e.amount); recordWeak(weakActual, e, d); const vn = d.account?.name || 'Unknown'; vendorActualByKey[vn] ||= {}; add(vendorActualByKey[vn], e.key, e.amount);
      }
      if (customerRefund) refundEvents.push({ date: d.issueDate || d.createdAt, amount: Number(d.cost || 0), reason, account: d.account?.name || 'Customer', document: d.fullName });
    }

    const allWeakKeys = new Set([...weakContract.keys(), ...weakBilled.keys(), ...weakActual.keys(), ...weakCommit.keys()]);
    for (const k of allWeakKeys) { const groups = [weakContract.get(k) || [], weakBilled.get(k) || [], weakActual.get(k) || [], weakCommit.get(k) || []]; const distinctDocs = new Set(groups.flat().map(y => y.docId)); if (distinctDocs.size > 1) push(x.job, 'Review', 'WEAK_SCOPE_MATCH', `${k} is being reconciled by name rather than a shared JobTread cost-item ID across ${distinctDocs.size} documents.`); }
    const ratifiedKeys = new Set();
    for (const [k, billed] of Object.entries(billedByKey)) if (billed > (contractByKey[k] || 0) + TOL) {
      const meta = billedMeta[k] || [], informal = meta.some(m => m.informal), itemNoted = meta.some(m => m.itemNoted), paid = meta.length && meta.every(m => m.paid);
      if (informal) { ratifiedKeys.add(k); push(x.job, 'Info', 'MESSAGE_APPROVED_SCOPE', `${k}: added scope was supported by job-thread approval evidence; billed ${money(billed)}.`); }
      else if (itemNoted) { ratifiedKeys.add(k); push(x.job, 'Info', 'ITEM_NOTED_APPROVED_SCOPE', `${k}: the line item's own note records an approval date; billed ${money(billed)}.`); }
      else if (paid) { ratifiedKeys.add(k); push(x.job, 'Review', 'PAID_SCOPE_RATIFIED', `${k}: ${money(billed)} was billed and fully paid, but no matching formal customer-order line exists. Preserve the revenue and flag the documentation gap.`); }
      else push(x.job, 'Critical', 'BILLED_UNCONTRACTED_SCOPE', `${k}: billed ${money(billed)} vs approved ${money(contractByKey[k] || 0)}.`);
    }
    for (const [k, actual] of Object.entries(actualByKey)) {
      const committed = commitByKey[k] || 0;
      const trusted = ratifiedKeys.has(k) || (billedMeta[k] || []).some(m => m.informal) || actualNotedKeys.has(k);
      if (actual > committed + TOL) {
        if (trusted) push(x.job, 'Info', 'INFORMAL_VENDOR_SCOPE', `${k}: incurred ${money(actual)} without a matching formal work-order line, but is approved per the thread, payment trail, or the line item's own note.`);
        else push(x.job, 'Review', 'COST_OVER_COMMITMENT', `${k}: incurred ${money(actual)} vs work-order commitment ${money(committed)}.`);
      }
      if (committed <= TOL && !trusted) push(x.job, 'Review', 'UNCOMMITTED_COST', `${k}: incurred ${money(actual)} without a matching valid vendor work order.`);
    }
    if (approvedChanges.some(d => Number(d.priceWithTax || 0) < -TOL)) push(x.job, 'Info', 'NEGATIVE_CHANGE_ORDER', 'Approved negative change order/credit reduces contract value and is retained in the audit trail.');

    const contractedProduction = sum(Object.values(contractByKey)), billedProduction = sum(Object.values(billedByKey)), actualProductionCost = sum(Object.values(actualByKey));
    let unbilledContracted = 0; for (const [k, c] of Object.entries(contractByKey)) unbilledContracted += Math.max(0, c - (billedByKey[k] || 0));
    const remainingCommitByVendor = {}; for (const [vn, keyed] of Object.entries(vendorCommitByKey)) for (const [k, c] of Object.entries(keyed)) add(remainingCommitByVendor, vn, Math.max(0, c - (vendorActualByKey[vn]?.[k] || 0)));
    const activeVendorNames = Object.keys(vendorCommitByKey), hasOperationalApproval = !!baseApproval || src.operationallyAuthorized;
    let stage = pendingNew && !hasOperationalApproval ? 'Pending Bid' : 'No Approved Work';
    if (hasOperationalApproval && !x.job.closedOn) {
      if (!activeVendorNames.length && !ev.started) stage = scheduledAssignment ? 'Assigned / Not Started' : 'Backlog';
      else if (activeVendorNames.length && !ev.started) stage = 'Assigned / Not Started';
      else if (!activeVendorNames.length && ev.started) stage = 'Review';
      else if (ev.started && !ev.done) stage = 'WIP';
      else if (ev.done && unbilledContracted > TOL) stage = 'Ready to Bill';
      else if (ev.done) stage = 'Complete / Billed';
      else stage = 'Review';
    } else if (x.job.closedOn) stage = 'Closed';
    const ar = sum(x.invoices, d => Number(d.balance || 0)), cashAP = sum(x.vendorBills, d => Number(d.balance || 0));
    const customerPaymentDates = (data.documentPayments || []).filter(dp => dp.document?.job?.id === x.job.id && dp.document?.type === 'customerInvoice' && dp.payment?.type === 'credit').map(dp => dp.payment?.paidAt).filter(Boolean);
    if (prepayRx.test(narrative) || x.invoices.some(d => /deposit/i.test(d.fullName || '')) || customerPaymentDates.some(p => ev.firstStart && new Date(p) < new Date(ev.firstStart))) push(x.job, 'Info', 'PREPAYMENT_OR_DEPOSIT', 'Customer funds preceded production; retained as billing/cash activity, never treated as period profit.');
    const profit = billedProduction - actualProductionCost - feeCost - customerRefundCost, margin = billedProduction ? 100 * profit / billedProduction : 0;
    const open = ['Backlog', 'Assigned / Not Started', 'WIP', 'Ready to Bill', 'Review'].includes(stage);
    const hasCritical = exceptions.some(e => e.job === x.job.name && e.severity === 'Critical');
    const commitmentGap = Math.max(0, sum(Object.values(commitByKey)) - actualProductionCost);
    const financialReview = exceptions.some(e => e.job === x.job.name && ['Critical','Review'].includes(e.severity));
    const costGap = Math.abs(Number(x.job.actualCost || 0) - sum(x.vendorBills, d => d.cost));
    if (costGap > TOL) push(x.job, 'Review', 'JOB_COST_LEDGER_MISMATCH', `JobTread actual cost ${money(x.job.actualCost)} differs from valid bill cost ${money(sum(x.vendorBills, d => d.cost))}.`);
    if (x.job.closedOn && Math.abs(billedPass-passCost)>TOL) push(x.job, 'Review', 'PASS_THROUGH_IMBALANCE', `Pass-through billed ${money(billedPass)} vs recorded cost ${money(passCost)}.`);
    if (x.job.closedOn && (ar>TOL || cashAP>TOL || unbilledContracted>TOL)) push(x.job, 'Review', 'CLOSED_WITH_OPEN_BALANCE', 'Closed job has an outstanding balance or scope IDs that do not reconcile between approved orders and invoices.');
    const economicsStatus = !x.job.closedOn ? 'Provisional' : hasCritical || financialReview || costGap>TOL || Math.abs(billedPass-passCost)>TOL || ar>TOL || cashAP>TOL || unbilledContracted>TOL ? 'Exception' : commitmentGap > TOL || (billedProduction>TOL && actualProductionCost<=TOL) ? 'Cost incomplete' : 'Reconciled';
    jobs.push({ ...x, src, ev, scheduledAssignment, baseApproval, latestBase, lossEvidence, approvedChanges, pendingChanges, pendingNew, trueLoss, outcomeReview, contractedProduction, billedProduction, billedPass, passCost, actualProductionCost, feeCost, customerRefundCost, refundEvents, unbilledContracted, remainingCommitByVendor, vendorActualByKey, billedByKey, stage, vendorOrderApproved: x.vendorOrders.some(d => d.status === 'approved'), ar, cashAP, profit, margin, economicsStatus, contractByKey, actualByKey });
  }

  for (const j of jobs) if (j.stage === 'Review' && !exceptions.some(e => e.job === j.job.name && (e.severity === 'Critical' || e.severity === 'Review'))) push(j.job, 'Review', 'OPERATIONAL_STAGE_REVIEW', 'Operational evidence is insufficient to place this active job confidently; review assignment, completion, or vendor evidence.');

  for (const d of deniedFinancials) push(d.job, 'Info', 'DENIED_FINANCIAL_EXCLUDED', `${d.fullName} is denied audit history and excluded from all totals.`);
  const payments = data.payments || [];
  for (const p of payments) {
    const arithmeticGap = Number(p.amount || 0) - Number(p.amountApplied || 0) - Number(p.amountUnapplied || 0);
    if (Math.abs(arithmeticGap) > TOL) push({ name: p.account?.name || 'Cash ledger' }, 'Critical', 'PAYMENT_ARITHMETIC', `${localDate(p.paidAt) || '—'} ${money(p.amount)} does not equal applied + unapplied.`);
    const correction = findCorrection(p, payments), cashClass = cashInClass(p);
    if (isBadMisroute(p)) push({ name: p.account?.name || 'Cash ledger' }, correction ? 'Info' : 'Critical', correction ? 'RESOLVED_CASH_MISROUTE' : 'CASH_MISROUTE', `${localDate(p.paidAt) || '—'} ${money(p.amount)} was routed away from TenanTurn${correction ? ` and corrected on ${localDate(correction.paidAt)}` : ''}.`);
    else if (isReturnedEvent(p)) push({ name: p.account?.name || 'Cash ledger' }, correction ? 'Info' : 'Review', correction ? 'RESOLVED_RETURNED_PAYMENT' : 'RETURNED_PAYMENT', `${localDate(p.paidAt) || '—'} ${money(p.amount)} returned/reversed${correction ? ` and was successfully replaced on ${localDate(correction.paidAt)}` : ''}.`);
    else if (p.type === 'credit' && cashClass === 'directed') push({ name: p.account?.name || 'Cash ledger' }, 'Info', 'CASH_ON_WAY', `${localDate(p.paidAt) || '—'} ${money(p.amount)} is supported as AppFolio/instant-payment money on the way, but not independently bank-settled.`);
    else if (p.type === 'credit' && cashClass === 'unverified') push({ name: p.account?.name || 'Cash ledger' }, 'Review', 'CASH_DESTINATION_UNVERIFIED', `${localDate(p.paidAt) || '—'} credit ${money(p.amount)} has insufficient evidence it reached or is headed to TenanTurn.`);
    if (Number(p.amountUnapplied || 0) > TOL && !isCorrectiveDeposit(p) && !isReturnedEvent(p) && !correction) push({ name: p.account?.name || 'Cash ledger' }, 'Review', 'UNAPPLIED_CASH', `${localDate(p.paidAt) || '—'} ${money(p.amountUnapplied)} remains unapplied.`);
  }

  const fingerprint = new Map();
  for (const d of [...invoices, ...vendorBills]) {
    const key = [d.type, d.job?.id || '', d.account?.id || '', localDate(d.issueDate || d.createdAt) || '', Number(documentTotal(d) || 0).toFixed(2)].join('|');
    const arr = fingerprint.get(key) || []; arr.push(d); fingerprint.set(key, arr);
  }
  for (const arr of fingerprint.values()) if (arr.length > 1) push(arr[0].job, 'Critical', 'POSSIBLE_DUPLICATE_FINANCIAL', `${arr.length} valid financial documents share type/job/account/date/amount: ${arr.map(d => d.fullName).join(', ')}.`);

  const wins = jobs.filter(j => j.baseApproval && inRange(eventDate(j.baseApproval), start, end));
  const losses = jobs.filter(j => j.trueLoss && inRange(eventDate(j.latestBase), start, end));
  const pendingNew = jobs.filter(j => j.pendingNew);
  const approvedChanges = jobs.flatMap(j => j.approvedChanges.map(doc => ({ job: j.job, pm: j.src.pm, source: j.src.workSource, doc }))).filter(x => inRange(eventDate(x.doc), start, end));
  const pendingChanges = jobs.flatMap(j => j.pendingChanges.map(doc => ({ job: j.job, pm: j.src.pm, source: j.src.workSource, doc })));
  const winRate = wins.length + losses.length ? 100 * wins.length / (wins.length + losses.length) : 0, salesWon = sum(wins, j => productionRevenue(j.baseApproval));
  const periodInvoices = invoices.filter(d => inRange(d.issueDate, start, end)), periodBilled = sum(periodInvoices, productionRevenue), periodPass = sum(periodInvoices, passRevenue);
  const periodPayments = payments.filter(p => inRange(p.paidAt, start, end));
  const confirmedCashIn = sum(periodPayments.filter(p => cashInClass(p) === 'confirmed'), p => p.amount);
  const cashDirected = sum(periodPayments.filter(p => cashInClass(p) === 'directed'), p => p.amount);
  const verifiedCashIn = confirmedCashIn;
  const verifiedCashOut = sum(periodPayments.filter(isVerifiedCashOut), p => p.amount);
  const withheldFees = sum(periodPayments.filter(isWithheldFeePayment), p => p.amount);
  const arDocs = invoices.filter(d => Number(d.balance || 0) > TOL), apDocs = vendorBills.filter(d => Number(d.balance || 0) > TOL), current = jobs.filter(j => ['Backlog', 'Assigned / Not Started', 'WIP', 'Ready to Bill', 'Review'].includes(j.stage));
  const reconciledJobsForVendor = jobs.filter(j => j.economicsStatus === 'Reconciled');
  const vendorCapacityModel = buildVendorCapacity(jobs, end || ymd(new Date())), vendorRows = {};
  for (const j of jobs) for (const vn of new Set([...Object.keys(j.vendorActualByKey || {}), ...Object.keys(j.remainingCommitByVendor || {})])) {
    vendorRows[vn] ||= { vendor: vn, actualCost: 0, remainingCommit: 0, jobs: new Set(), revenue: 0 };
    const r = vendorRows[vn]; r.actualCost += sum(Object.values(j.vendorActualByKey?.[vn] || {})); if (!j.job.closedOn) r.remainingCommit += Number(j.remainingCommitByVendor?.[vn] || 0); if (!j.job.closedOn && (Number(j.remainingCommitByVendor?.[vn]||0)>TOL || j.vendorOrders.some(d=>d.account?.name===vn))) r.jobs.add(j.job.id);
    if (j.economicsStatus === 'Reconciled') { for (const [k, vendorCost] of Object.entries(j.vendorActualByKey?.[vn] || {})) { const scopeActual = Number(j.actualByKey?.[k] || 0), scopeBilled = Number(j.billedByKey?.[k] || 0); if (scopeActual > TOL && scopeBilled) r.revenue += scopeBilled * Math.min(Math.max(Number(vendorCost || 0) / scopeActual, 0), 1); } }
  }
  const vendors = Object.values(vendorRows).map(r => { const cap = vendorCapacityModel[r.vendor] || null, weekly = cap?.rolling8WeeklyCost || 0; let finalActualCost = 0; for (const j of reconciledJobsForVendor || []) finalActualCost += sum(Object.values(j.vendorActualByKey?.[r.vendor] || {})); const gp = r.revenue - finalActualCost; return { name: r.vendor, openJobs: [...r.jobs].filter(id => current.some(j => j.job.id === id)).length, remainingCost: r.remainingCommit, attributedRevenue: r.revenue, actualCost: r.actualCost, finalActualCost, gp, margin: r.revenue ? 100 * gp / r.revenue : 0, rolling8WeeklyCost: weekly, lifetimeWeeklyCost: cap?.lifetimeWeeklyCost || 0, capacityConfidence: cap?.confidence || 'Low', capacitySampleJobs: cap?.sampleJobs8 || 0, weeks: weekly > 0 ? r.remainingCommit / weekly : null, read: weekly > 0 ? `${cap.confidence} confidence` : 'Learning' }; }).sort((a, b) => b.actualCost - a.actualCost);
  const pmap = {}; for (const j of jobs) { const name = j.src.pm || 'Unattributed'; pmap[name] ||= { name, approvals: 0, approved: 0, pending: 0, lifetimeBilled: 0, reconciledGP: 0 }; if (j.baseApproval && inRange(eventDate(j.baseApproval), start, end)) { pmap[name].approvals++; pmap[name].approved += productionRevenue(j.baseApproval); } if (j.pendingNew) pmap[name].pending++; pmap[name].lifetimeBilled += j.billedProduction; if (j.economicsStatus === 'Reconciled') pmap[name].reconciledGP += j.profit; }
  const pms = Object.values(pmap).map(p => ({ ...p, margin: p.lifetimeBilled ? 100 * p.reconciledGP / p.lifetimeBilled : 0 })).sort((a, b) => b.approved - a.approved);
  const critical = exceptions.filter(e => e.severity === 'Critical'), review = exceptions.filter(e => e.severity === 'Review'), housekeeping = exceptions.filter(e => e.severity === 'Housekeeping'), info = exceptions.filter(e => e.severity === 'Info');
  const reconciledJobs = jobs.filter(j => j.economicsStatus === 'Reconciled'), reconciledGP = sum(reconciledJobs, j => j.profit), provisionalGP = sum(jobs.filter(j => j.economicsStatus === 'Provisional'), j => j.profit);
  const customerPaymentsApplied = sum((data.documentPayments || []).filter(dp => dp.document?.type === 'customerInvoice' && dp.payment?.type === 'credit' && inRange(dp.payment?.paidAt, start, end) && !isReturnedEvent(dp.payment)), dp => dp.amount);
  const refunds = jobs.flatMap(j => (j.refundEvents || []).map(r => ({ job: j.job.name, ...r })));
  const severityRank = { Critical: 0, Review: 1, Housekeeping: 2, Info: 3 };
  const result = { jobs, exceptions: exceptions.sort((a, b) => (severityRank[a.severity] ?? 4) - (severityRank[b.severity] ?? 4)), trust: critical.length ? 'BLOCKED' : review.length ? 'REVIEW' : 'RECONCILED', critical, review, housekeeping, info, criticalCount: critical.length, reviewCount: review.length, housekeepingCount: housekeeping.length, infoCount: info.length, sales: { wins, losses, pendingNew, approvedChanges, pendingChanges, winRate, salesWon }, finance: { periodBilled, periodPass, verifiedCashIn, confirmedCashIn, cashDirected, verifiedCashOut, withheldFees, ar: sum(arDocs, d => d.balance), ap: sum(apDocs, d => d.balance), refunds }, ops: { current }, people: { vendors, vendorCapacityModel, pms }, wins, losses, pendingNew, approvedChanges, pendingChanges, winRate, salesWon, periodBilled, periodPass, verifiedCashIn, confirmedCashIn, cashDirected, verifiedCashOut, withheldFees, customerPaymentsApplied, netVerifiedCash: confirmedCashIn - verifiedCashOut, arDocs, apDocs, current, vendors, pms, refunds, reconciledJobs, reconciledGP, provisionalGP, outcomeReviews: jobs.filter(j => j.outcomeReview) };
  result.audit = { critical: critical.length, review: review.length, housekeeping: housekeeping.length, info: info.length };
  result.cash = { in: confirmedCashIn, directed: cashDirected, out: verifiedCashOut, withheldFees };
  return result;
}
export const buildForensicModel = buildModel;