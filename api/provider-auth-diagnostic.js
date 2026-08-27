const provider=require("../lib/providers/vercel.js");

module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({ok:false,error:"method_not_allowed"});
  }

  const config=provider.envConfig();

  async function probe(path){
    if(!config.token)return{ok:false,status:null,error:"missing_vercel_token"};
    try{
      const response=await fetch(`https://api.vercel.com${path}`,{
        headers:{Authorization:`Bearer ${config.token}`,"Content-Type":"application/json"},
        cache:"no-store"
      });
      const text=await response.text();
      let body={};
      try{body=text?JSON.parse(text):{}}catch{}
      return{
        ok:response.ok,
        status:response.status,
        error:response.ok?null:(body?.error?.code||body?.error?.message||`vercel_http_${response.status}`)
      };
    }catch(error){
      return{ok:false,status:null,error:error?.message||"vercel_request_failed"};
    }
  }

  const identity=await probe("/v2/user");
  const team=config.teamId
    ? await probe(`/v2/teams/${encodeURIComponent(config.teamId)}`)
    : {ok:false,status:null,error:"missing_vercel_team_id"};
  const project=config.projectId
    ? await probe(`/v9/projects/${encodeURIComponent(config.projectId)}?teamId=${encodeURIComponent(config.teamId||"")}`)
    : {ok:false,status:null,error:"missing_vercel_project_id"};

  let classification="unknown";
  if(!identity.ok)classification="token_authentication_failed";
  else if(!team.ok)classification="team_authorization_failed";
  else if(!project.ok)classification="project_authorization_failed";
  else classification="authorized";

  return res.status(200).json({
    ok:true,
    diagnostic:"vercel-authorization",
    providerSubsystem:"v1",
    classification,
    tokenAuthentication:{authenticated:identity.ok,status:identity.status,error:identity.error},
    teamAuthorization:{accessible:team.ok,status:team.status,error:team.error},
    projectAuthorization:{accessible:project.ok,status:project.status,error:project.error}
  });
};
