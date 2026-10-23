const cents=n=>Math.round(Number(n||0)*100);
export const isPriceReduction=i=>cents(i.priceWithTax??i.price)<0&&cents(i.cost)===0&&/\b(?:discount|credit|price reduction|allowance deduction)\b/i.test(`${i.name||''} ${i.description||''}`);

// Selection applies to optional scope. Price reductions can remain unselected
// even though JobTread includes them in the approved document total.
export function attachCostItems(documents,costItems){
 const grouped=new Map();
 for(const item of costItems.nodes||[]){const id=item.document?.id;if(id)(grouped.get(id)||grouped.set(id,[]).get(id)).push(item);}
 return {...documents,nodes:(documents.nodes||[]).map(doc=>{
  const raw=grouped.get(doc.id)||[];
  let included=raw;
  if(doc.type==='customerOrder'&&doc.status==='approved'){
   included=raw.filter(i=>i.isSelected!==false);
   const reductions=raw.filter(i=>i.isSelected===false&&isPriceReduction(i));
   const price=xs=>xs.reduce((n,i)=>n+cents(i.priceWithTax??i.price),0);
   const cost=xs=>xs.reduce((n,i)=>n+cents(i.cost),0);
   if(reductions.length&&Math.abs(price([...included,...reductions])-cents(doc.priceWithTax))<=2&&Math.abs(cost([...included,...reductions])-cents(doc.cost))<=2)included=[...included,...reductions];
  }
  return {...doc,costItems:{nodes:included.map(({document,...item})=>item)}};
 })};
}

// Only exact, chronological event-to-line matches establish dated reductions.
// Do not invent an approval or allocate an unexplained document-wide delta.
export function orderPriceRevisions(doc){
 const events=(doc.approvalHistory?.nodes||[]).filter(e=>e.nextPrice!=null&&e.previousPrice!=null&&cents(e.nextPrice)!==cents(e.previousPrice)&&new Date(e.createdAt)>new Date(doc.closedAt)).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 if(!events.length)return null;
 const items=doc.costItems?.nodes||[],used=new Set(),matches=[];
 for(const [index,event] of events.entries()){
  if(index&&cents(events[index-1].nextPrice)!==cents(event.previousPrice))return null;
  const delta=cents(event.nextPrice)-cents(event.previousPrice);
  const found=items.filter(i=>!used.has(i.id)&&isPriceReduction(i)&&cents(i.priceWithTax??i.price)===delta);
  if(found.length!==1)return null;
  used.add(found[0].id);matches.push({item:found[0],event,value:delta/100});
 }
 const sum=xs=>xs.reduce((n,i)=>n+cents(i.priceWithTax??i.price),0);
 if(cents(events.at(-1).nextPrice)!==cents(doc.priceWithTax)||sum(items)!==cents(doc.priceWithTax)||sum(items.filter(i=>!used.has(i.id)))!==cents(events[0].previousPrice))return null;
 return {original:{...doc,costItems:{nodes:items.filter(i=>!used.has(i.id))}},matches};
}
