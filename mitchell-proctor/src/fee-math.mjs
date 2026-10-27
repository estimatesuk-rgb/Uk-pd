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
  const feasibilityRate=payload.feasibilityPercent===null||payload.feasibilityPercent===undefined||payload.feasibilityPercent===''?null:n(payload.feasibilityPercent);
  const costExVat=Math.max(0,n(payload.area))*Math.max(0,n(payload.buildRate));
  // New quotations use an automatic percentage. A bespoke/individual quote may
  // expressly override it; older saved quotations without a percent remain unchanged.
  function feasibilityFee(item){
    if(item.id!=='feasibility'||feasibilityRate===null)return null;
    if(mode!=='sqm'&&item.quotedFee!==null&&item.quotedFee!==undefined&&item.quotedFee!=='')return n(item.quotedFee);
    return Math.round(costExVat*Math.max(0,feasibilityRate))/100;
  }
  const out=[];
  for(const item of payload.stages||[]){
    if(item.selected)out.push({name:item.title||'Architectural service',kind:'stage',fee:getAmount(item,n(item.rate)*stageArea)});
  }
  for(const item of payload.extras||[]){
    if(item.selected){
      const special=feasibilityFee(item);
      const usesAuto=item.id==='feasibility'&&special!==null&&(mode==='sqm'||item.quotedFee==null||item.quotedFee==='');
      out.push({name:item.title||'Additional service',kind:'extra',
        fee:special===null?getAmount(item,n(item.amount)):special,
        basis:usesAuto?feasibilityRate+'% of estimated construction cost ex VAT':null});
    }
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
