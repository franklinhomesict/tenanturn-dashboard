// Scope-level audit decisions, not cached totals. Each decision is revalidated
// against the live invoice line and its source evidence on every refresh.
// Future changes in amount, source, or status invalidate the decision.
export const approvalEvidence = [
 {itemId:'22PeEMyttuK6',amount:320,date:'2026-09-02',basis:'Dated approval on line'},
 {itemId:'22Pds22G2gek',amount:2250,date:'2026-09-02',basis:'Dated approval on line'},
 {itemId:'22PeL3yjHvhJ',amount:375,date:'2026-09-16',basis:'Customer payment ratification',paymentId:'22PedjbZHNQf'},
 {itemId:'22PedC99Jbkv',amount:160,date:'2026-09-16',basis:'Dated approval on line'},
 {itemId:'22PejR5WpTJr',amount:400,date:'2026-09-25',basis:'Customer payment ratification',paymentId:'22PfAaC4nshx'},
 ...['22PejR6yTu65','22PejR6yTu66','22PejR6yTu67','22PejR6yTu68','22PejR6yTu69','22PejR6yTu6A'].map((itemId,i)=>({itemId,amount:[160,120,80,320,160,80][i],date:'2026-09-18',basis:'Job-thread approval',commentId:'22PejBziEaSN'})),
 {itemId:'22PevJ3mSBiL',amount:2312,date:'2026-09-21',basis:'Job-thread approval',commentId:'22PevBhxV7kP'},
 {itemId:'22Pey9rHJGcj',amount:375,date:'2026-09-22',basis:'Completed change and customer payment',commentId:'22Pey7BR6bye',paymentId:'22PeysLtXEnC'},
 {itemId:'22PeHmSRAQRZ',amount:250,date:'2026-09-10',basis:'Job-thread approval',commentId:'22PeHjgxcGJ5'}
];
