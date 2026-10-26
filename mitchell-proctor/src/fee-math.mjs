// Single source of truth for professional fee amounts, reused by Cloudflare API and PDF.
const n=value=>{const num=Number(value);return Number.isFinite(num)?num:0;};
export function proposalFeeLines(payload,minArea=25){
  const stageArea=Math.max(n(payload.area),n(minArea));
  const mode=payload.feeMode||'sqm',band=payload.pricingBand;
  function getAmount(item,legacy){
    if(mode!=='band'&&mode!=='bespoke')return legacy;
    if(item.quotedFee!==null&&item.quotedFee!==undefined&&item.quotedFee!=='')return n(item.quotedFee);
    return mode==='bespoke'?0:n(item.bandFees?.[band]);
  }
  const out=[];
  for(const item of payload.stages||[]){
    if(item.selected)out.push({name:item.title||'Architectural service',kind:'stage',fee:getAmount(item,n(item.rate)*stageArea)});
  }
  for(const item of payload.extras||[]){
    if(item.selected)out.push({name:item.title||'Additional service',kind:'extra',fee:getAmount(item,n(item.amount))});
  }
  for(const item of payload.adjustments||[]){
    if(n(item.amount)>0)out.push({name:item.description||'Fee adjustment',kind:item.kind==='omission'?'omission':'addition',fee:(item.kind==='omission'?-1:1)*n(item.amount)});
  }
  return out;
}
export function calculateProfessionalFee(payload,minArea=25){
  const sum=proposalFeeLines(payload,minArea).reduce((v,line)=>v+line.fee,0);
  return Math.max(0,Math.round(sum*100)/100);
}
