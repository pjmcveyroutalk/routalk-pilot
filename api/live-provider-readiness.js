const crypto = require("node:crypto");
const provider = require("../lib/providers/vercel.js");
function safeEqual(l,r){const a=Buffer.from(l||"");const b=Buffer.from(r||"");return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function bearer(req){const v=req.headers?.authorization||"";return v.startsWith("Bearer ")?v.slice(7):""}
module.exports=async function handler(req,res){
  const requestId=crypto.randomUUID();
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Pilot-Request-Id",requestId);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false,error:"method_not_allowed",requestId})}
  const secret=process.env.PILOT_TRIGGER_SECRET||"";
  if(!secret||!safeEqual(bearer(req),secret))return res.status(401).json({ok:false,error:"unauthorized",requestId});
  const access=await provider.inspectProjectAccess();
  const base=provider.sanitizedStatus();
  const liveProviderProofReady=base.configured.token&&base.configured.project&&base.configured.productionUrl&&Boolean(secret)&&access.ok;
  return res.status(200).json({
    ok:true,
    liveProviderProofReady,
    providerSubsystem:base.providerSubsystem,
    readiness:{...base.configured,pilotTriggerSecret:Boolean(secret)},
    authorization:{projectAccessible:access.ok,projectStatus:access.status,projectError:access.error},
    requestId
  });
};
module.exports._test={safeEqual,bearer};
