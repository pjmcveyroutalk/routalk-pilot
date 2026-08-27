const crypto=require("node:crypto");
const provider=require("../lib/providers/vercel.js");
const REPO="pjmcveyroutalk/routalk-pilot";const CONFIRMATION="LIVE_PROVIDER_PROOF_ONCE";
function safeEqual(l,r){const a=Buffer.from(l||"");const b=Buffer.from(r||"");return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function bearer(req){const v=req.headers?.authorization||"";return v.startsWith("Bearer ")?v.slice(7):""}
async function githubMainSha(){const headers={Accept:"application/vnd.github+json","User-Agent":"routalk-pilot-live-provider-proof"};const token=process.env.GITHUB_TOKEN||process.env.PILOT_GITHUB_TOKEN||"";if(token)headers.Authorization=`Bearer ${token}`;const r=await fetch(`https://api.github.com/repos/${REPO}/commits/main`,{headers,cache:"no-store"});if(!r.ok)throw new Error(`github_main_sha_http_${r.status}`);const b=await r.json();if(!b?.sha||!/^[0-9a-f]{40}$/i.test(b.sha))throw new Error("invalid_github_main_sha");return b.sha}
module.exports=async function handler(req,res){
 const requestId=crypto.randomUUID();res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("X-Pilot-Request-Id",requestId);
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false,error:"method_not_allowed",requestId})}
 const secret=process.env.PILOT_TRIGGER_SECRET||"";if(!secret||!safeEqual(bearer(req),secret))return res.status(401).json({ok:false,error:"unauthorized",requestId});
 if(req.body?.confirmation!==CONFIRMATION||req.body?.approvalIntent!==true)return res.status(400).json({ok:false,error:"explicit_live_proof_confirmation_required",providerInvocations:0,requestId});
 const access=await provider.inspectProjectAccess();if(!access.ok)return res.status(503).json({ok:false,error:"live_provider_not_ready",providerInvocations:0,providerStatus:access.status,providerError:access.error,requestId});
 try{
  const sourceRevision=await githubMainSha();const releaseCandidateId=`pilot-live-proof-${sourceRevision.slice(0,12)}`;
  const{runGuardedLiveProviderControl}=await import("../pilot-verification/live-provider-proof-control.mjs");
  const result=await runGuardedLiveProviderControl({confirmation:CONFIRMATION,approvalIntent:true,sourceRevision,releaseCandidateId,approver:"authenticated-phone-operator",packages:[{packageId:`provider-independent-main-${sourceRevision.slice(0,12)}`,verificationStatus:"PASSED"}]},{vercelClient:{deploy:provider.deployProduction},observeProduction:provider.observeProduction});
  const verified=result.status==="PRODUCTION_VERIFIED"&&result.providerInvocations===1;
  return res.status(verified?200:503).json({ok:verified,status:result.status,providerInvocations:result.providerInvocations??0,releaseCandidateId,sourceRevision,deploymentId:result.release?.dispatch?.result?.deploymentId||null,production:result.production||null,requestId});
 }catch(error){return res.status(500).json({ok:false,error:error?.message||"live_provider_proof_failed",providerInvocations:0,requestId})}
};
module.exports._test={safeEqual,bearer};
