const provider=require("../lib/providers/vercel.js");
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,error:"method_not_allowed"})}
  const access=await provider.inspectProjectAccess();
  const base=provider.sanitizedStatus();
  return res.status(200).json({
    ok:true,
    provider:base.provider,
    providerSubsystem:base.providerSubsystem,
    configured:base.configured,
    authorization:{projectAccessible:access.ok,projectStatus:access.status,projectError:access.error}
  });
};
