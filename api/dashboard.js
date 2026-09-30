import {auditedLedger} from '../src/auditedLedger.js';
import { buildForensicModel, normalize } from '../src/forensicModel.js';
import { manualOperationalOverrides, manualOverrideComment } from '../src/manualOverrides.js';

const ORG_ID = '22Pa5G229Dc7';
const ORG_NAME = 'TenanTurn LLC';
const ENDPOINT = 'https://api.jobtread.com/pave';

async function pave(query, label = 'query') {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${label}: JobTread ${response.status}: ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  return json?.data || json;
}

async function fetchPaged(grantKey, field, buildConnection) {
  const nodes = [];
  let page = null;
  let pages = 0;
  let expectedCount = null;
  const seenPages=new Set();
  do {
    const root = await pave({
      $: { grantKey },
      organization: { $: { id: ORG_ID }, [field]: {...buildConnection(page),count:{}} }
    }, field);
    const result = root?.organization?.[field];
    if (!result) throw new Error(`${field}: JobTread did not return organization.${field}`);
    if(!Array.isArray(result.nodes)||typeof result.count!=='number')throw new Error(`${field}: incomplete connection response`);
    if(expectedCount==null)expectedCount=result.count;
    if(expectedCount!==result.count)throw new Error(`${field}: source changed during pagination; refresh again`);
    nodes.push(...result.nodes);
    page = result.nextPage ?? null;
    if(page!=null){if(seenPages.has(page))throw new Error(`${field}: repeated pagination cursor`);seenPages.add(page);}
    pages += 1;
    if (pages > 100) throw new Error(`${field}: Pagination safety stop reached`);
  } while (page!=null);
  if(nodes.length!==expectedCount||new Set(nodes.map(n=>n.id)).size!==nodes.length)throw new Error(`${field}: record coverage mismatch`);
  return { nodes, nextPage: null, count:expectedCount };
}

const jobConnection = page => ({
  $: { size: 100, ...(page ? { page } : {}), sortBy: [{ field: 'createdAt', order: 'desc' }] },
  nodes: {
    id: {}, number: {}, name: {}, description: {}, createdAt: {}, closedOn: {},
    projectedCost: {}, projectedPrice: {}, actualCost: {},
    taskSummary: { started: {}, completed: {}, unstarted: {}, startDate: {}, endDate: {} },
    location: { account: { id: {}, name: {}, type: {} }, contact: { name: {} } }
  },
  nextPage: {}
});

const documentConnection = page => ({
  $: {
    size: 100, ...(page ? { page } : {}),
    where: { or: [['type', 'customerOrder'], ['type', 'customerInvoice'], ['type', 'vendorBill'], ['type', 'vendorOrder']] },
    sortBy: [{ field: 'createdAt', order: 'desc' }]
  },
  nodes: {
    id: {}, type: {}, status: {}, createdAt: {}, issueDate: {}, closedAt: {}, signedAt: {}, includeInBudget: {},
    priceWithTax: {}, cost: {}, amountPaid: {}, balance: {}, fullName: {},
    job: { id: {}, number: {}, name: {} },
    account: { id: {}, name: {}, type: {} }
  },
  nextPage: {}
});

const costItemConnection = page => ({
  $: {
    size: 100,
    ...(page ? { page } : {}),
    where: [['document', 'id'], '!=', null]
  },
  nodes: {
    id: {}, name: {}, description: {}, cost: {}, price: {}, priceWithTax: {}, quantity: {}, unitCost: {}, unitPrice: {}, isSelected: {},
    document: { id: {}, type: {}, status: {}, fullName: {}, job: { id: {}, number: {}, name: {} } },
    jobCostItem: { id: {}, name: {} },
    sourceCostItem: { id: {}, name: {} }
  },
  nextPage: {}
});

const commentConnection = page => ({
  $: { size: 100, ...(page ? { page } : {}), sortBy: [{ field: 'createdAt', order: 'desc' }] },
  nodes: { id: {}, createdAt: {}, isPinned: {}, name: {}, message: {}, job: { id: {}, number: {}, name: {} } },
  nextPage: {}
});

const logConnection = page => ({
  $: { size: 100, ...(page ? { page } : {}), sortBy: [{ field: 'date', order: 'desc' }] },
  nodes: { id: {}, date: {}, notes: {}, job: { id: {}, number: {}, name: {} } },
  nextPage: {}
});

const taskConnection = page => ({
  $: { size: 100, ...(page ? { page } : {}), sortBy: [{ field: 'startDate', order: 'asc' }] },
  nodes: {
    id: {}, name: {}, startDate: {}, endDate: {}, startsAt: {}, endsAt: {}, progress: {}, completed: {},
    account: { id: {}, name: {}, type: {} }, job: { id: {}, number: {}, name: {} }
  },
  nextPage: {}
});

const paymentConnection = page => ({
  $: { size: 100, ...(page ? { page } : {}), sortBy: [{ field: 'paidAt', order: 'desc' }] },
  nodes: {
    id: {}, type: {}, amount: {}, amountApplied: {}, amountUnapplied: {}, feeAmount: {}, paidAt: {}, source: {}, description: {},
    account: { id: {}, name: {}, type: {} }
  },
  nextPage: {}
});

const documentPaymentConnection = page => ({
  $: { size: 100, ...(page ? { page } : {}) },
  nodes: {
    id: {}, amount: {},
    document: {
      id: {}, type: {}, status: {}, issueDate: {}, fullName: {}, balance: {}, amountPaid: {},
      job: { id: {}, number: {}, name: {} }, account: { id: {}, name: {}, type: {} }
    },
    payment: {
      id: {}, type: {}, amount: {}, amountApplied: {}, amountUnapplied: {}, paidAt: {}, description: {}, source: {},
      account: { id: {}, name: {}, type: {} }
    }
  },
  nextPage: {}
});

function attachCostItems(documents, costItems) {
  const byDocument = {};
  for (const item of costItems.nodes || []) {
    const documentId = item.document?.id;
    if (!documentId) continue;
    if (item.document?.type === 'customerOrder' && item.document?.status === 'approved' && item.isSelected === false) continue;
    (byDocument[documentId] ||= []).push({
      id: item.id,
      name: item.name,
      description: item.description,
      cost: item.cost,
      price: item.price,
      priceWithTax: item.priceWithTax,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      isSelected: item.isSelected,
      jobCostItem: item.jobCostItem,
      sourceCostItem: item.sourceCostItem
    });
  }
  return {
    nodes: (documents.nodes || []).map(doc => ({
      ...doc,
      costItems: { nodes: byDocument[doc.id] || [] }
    })),
    nextPage: null
  };
}

async function approvalHistories(grantKey,documents){
  for(let offset=0;offset<documents.length;offset+=4){
    await Promise.all(documents.slice(offset,offset+4).map(async d=>{
      let page=null;const events=[],seen=new Set();
      do{
        const result=await pave({$:{grantKey},document:{$:{id:d.id},events:{$:{size:100,...(page?{page}:{})},nodes:{createdAt:{},data:{}},nextPage:{}}}},'approval history');
        const c=result.document?.events;
        if(!c||!Array.isArray(c.nodes))throw new Error('Incomplete approval history');
        events.push(...c.nodes.map(e=>({createdAt:e.createdAt,nextStatus:e.data?.next?.status,previousStatus:e.data?.previous?.status,nextPrice:e.data?.next?.price,previousPrice:e.data?.previous?.price})));
        page=c.nextPage??null;
        if(page){if(seen.has(page))throw new Error('Repeated approval history cursor');seen.add(page);}
      }while(page);
      d.approvalHistory={nodes:events,nextPage:null};
    }));
  }
}

function enrichOperationalEvidence(jobs, comments) {
  const jobById = Object.fromEntries((jobs.nodes || []).map(j => [j.id, j]));
  const raw = comments.nodes || [];
  const narrativeByJob = {};
  for (const c of raw) {
    const jobId = c.job?.id;
    if (!jobId) continue;
    narrativeByJob[jobId] = `${narrativeByJob[jobId] || ''} ${c.message || ''}`;
  }

  const normalized = raw.map(c => {
    const jobId = c.job?.id;
    const message = String(c.message || '');
    if (!jobId || !c.isPinned || !/(?:^|\n)\s*(?:pm|property manager)\s*[:=-]?\s*pmi\s*(?=\n|$)/im.test(message)) return c;
    const narrative = narrativeByJob[jobId] || '';
    const explicitBrad = /\bapproved by Brad\b|\bBrad\b.{0,80}\b(?:approved|approval|schedule|update)\b|\b(?:schedule|update)\b.{0,80}\bBrad\b/i.test(narrative);
    if (!explicitBrad) return c;
    return {
      ...c,
      message: message.replace(/((?:^|\n)\s*(?:pm|property manager)\s*[:=-]?\s*)pmi\s*(?=\n|$)/im, '$1Brad PMI'),
      evidenceSource: 'derived-from-jobtread-thread'
    };
  });

  const nodes = [...normalized];
  const highConfidenceFieldUpdate = /(?:^|[.!?\n]\s*)(?:(?:i|we|they|he|crew|vendor|contractor)\s+)?(?:took down|cut down|removed|replaced|upsized|treated|repaired|painted|installed|hung|laid|fixed|scrubbed|cleaned|hauled)\b|\bgetting close to finished\b|\bfinish tomorrow\b/i;

  for (const c of normalized) {
    const message = String(c.message || '').trim();
    const jobId = c.job?.id;
    if (!jobId || !message || !highConfidenceFieldUpdate.test(message)) continue;
    nodes.push({
      id: `derived-start-${c.id}`,
      createdAt: c.createdAt,
      isPinned: false,
      name: 'Dashboard derived field evidence',
      message: `started work — derived from field update: ${message.slice(0, 500)}`,
      job: c.job,
      evidenceSource: 'derived-from-jobtread-comment'
    });
  }

  for (const override of manualOperationalOverrides) {
    const job=jobById[override.jobId];
    if (!job || job.closedOn) continue;
    const newerRaw=(raw||[]).filter(c=>c.job?.id===override.jobId&&new Date(c.createdAt)>new Date(override.confirmedAt));
    const superseded=newerRaw.some(c=>highConfidenceFieldUpdate.test(String(c.message||''))||/\b(?:job|project|all work|work) (?:is )?(?:complete|completed|finished)\b|\bready to bill\b/i.test(String(c.message||'')));
    if (!superseded) nodes.push(manualOverrideComment(override,job));
  }

  return { nodes, nextPage: null };
}

function compactAudit(apiResponse,start,end){
 const m=auditedLedger(apiResponse,start,end);
 return {version:'2026.09.30',period:{start,end,timeZone:'America/Chicago'},trust:m.trust,criticalCount:m.critical,reviewCount:m.review,sales:{total:m.sales,formalOrderCount:m.formalCount,entries:m.salesEntries.map(s=>({id:s.id,job:s.job,date:s.date,value:s.value,basis:s.basis,kind:s.kind}))},finance:{issuedProduction:m.billed,receivable:m.ar,payable:m.ap,projectedOpenJobProfit:m.projectedProfit,closedRecordedJobProfit:m.closedProfit,checkedClosedJobProfit:m.checkedProfit,customerPaymentsApplied:m.customerPaymentsApplied,futureCostBudget:m.futureCost},jobs:m.jobs.map(j=>({job:j.job,stage:j.stage,status:j.status,approved:j.approved,billed:j.billed,cost:j.cost,recordedProfit:j.profitRecorded,projectedProfit:j.projectedProfit,reviews:j.reviews})),exceptions:m.exceptions};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const startedAt=new Date().toISOString();
  const grantKey = process.env.JOBTREAD_GRANT_KEY;
  if (!grantKey) return res.status(503).json({ ok: false, code: 'JOBTREAD_NOT_CONFIGURED', error: 'JOBTREAD_GRANT_KEY is not configured for this Vercel project.' });

  try {
    const identity = await pave({ $: { grantKey }, currentGrant: { organization: { id: {}, name: {} } } }, 'identity');
    const org = identity?.currentGrant?.organization;
    if (!org || org.id !== ORG_ID || org.name !== ORG_NAME) {
      return res.status(403).json({ ok: false, code: 'WRONG_JOBTREAD_ORG', error: `Connected JobTread organization must be ${ORG_NAME}.` });
    }

    const jobs = await fetchPaged(grantKey, 'jobs', jobConnection);
    const documentHeaders = await fetchPaged(grantKey, 'documents', documentConnection);
    const costItems = await fetchPaged(grantKey, 'costItems', costItemConnection);
    const documents = attachCostItems(documentHeaders, costItems);
    const rawComments = await fetchPaged(grantKey, 'comments', commentConnection);
    const comments = enrichOperationalEvidence(jobs, rawComments);
    const dailyLogs = await fetchPaged(grantKey, 'dailyLogs', logConnection);
    const tasks = await fetchPaged(grantKey, 'tasks', taskConnection);
    const payments = await fetchPaged(grantKey, 'payments', paymentConnection);
    const documentPayments = await fetchPaged(grantKey, 'documentPayments', documentPaymentConnection);

    await approvalHistories(grantKey,documents.nodes.filter(d=>d.type==='customerOrder'&&d.status==='approved'));

    const finalHeaders=await fetchPaged(grantKey,'documents',documentConnection);
    const fingerprint=rows=>JSON.stringify(rows.slice().sort((a,b)=>a.id.localeCompare(b.id)));
    if(fingerprint(documentHeaders.nodes)!==fingerprint(finalHeaders.nodes))throw new Error('JobTread documents changed during refresh; retry to get a consistent ledger.');
    const apiResponse = {
      sourceCoverage:{complete:true,startedAt,checkedAt:new Date().toISOString(),documentsStable:true,counts:{jobs:jobs.count,documents:documentHeaders.count,costItems:costItems.count,comments:rawComments.count,dailyLogs:dailyLogs.count,tasks:tasks.count,payments:payments.count,documentPayments:documentPayments.count}},
      ok: true,
      fetchedAt: new Date().toISOString(),
      organizationId: org.id,
      organizationName: org.name,
      payload: { organization: { jobs, documents, comments, dailyLogs, tasks, payments, documentPayments } }
    };

    if (String(req.query?.audit || '') === '1') {
      const start = String(req.query?.start || new Date().toISOString().slice(0,7)+'-01');
      const end = String(req.query?.end || new Date().toISOString().slice(0,10));
      return res.status(200).json({ ok: true, fetchedAt: apiResponse.fetchedAt, organizationId: org.id, organizationName: org.name, audit: compactAudit(apiResponse, start, end) });
    }

    return res.status(200).json(apiResponse);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'JobTread request failed' });
  }
}
