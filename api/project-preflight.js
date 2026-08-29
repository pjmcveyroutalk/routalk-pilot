const crypto=require("node:crypto");
const projects=require("../config/projects");

function safeEqual(a,b){
 const x=Buffer.from(a||""),y=Buffer.from(b||"");
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function send(res,status,body){
 res.setHeader("Cache-Control","no-store, max-age=0");
 res.setHeader("X-Content-Type-Options","nosniff");
 return res.status(status).json(body);
}
async function githubRepo(repository,token){
 const r=await fetch(`https://api.github.com/repos/${repository}`,{
  headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"User-Agent":"routalk-pilot","X-GitHub-Api-Version":"2022-11-28"}
 });
 return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};
}
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return send(res,405,{error:"Method not allowed"})}
 const trigger=process.env.PILOT_TRIGGER_SECRET,token=process.env.PILOT_TARGET_GITHUB_TOKEN||process.env.GITHUB_TOKEN;
 const auth=(req.headers.authorization||"").replace(/^Bearer /,"");
 if(!trigger||!safeEqual(auth,trigger))return send(res,401,{error:"Unauthorized"});
 const repository=String(req.body?.repository||"");
 const project=projects[repository];
 if(!project||project.role!=="target")return send(res,400,{ready:false,repository,reason:"PROJECT_NOT_REGISTERED"});
 if(!token)return send(res,503,{ready:false,repository,reason:"TARGET_ACCESS_NOT_CONFIGURED"});
 const repo=await githubRepo(repository,token);
 if(!repo.ok)return send(res,200,{ready:false,repository,registered:true,repository_access:false,reason:repo.status===404?"TARGET_REPO_NOT_ACCESSIBLE":"TARGET_REPO_CHECK_FAILED"});
 const defaultBranch=repo.data.default_branch||null;
 const verifier=project.production_verifier||null;
 return send(res,200,{
  ready:!!(defaultBranch&&verifier?.url&&verifier?.auth==="vercel_oidc"),
  repository,registered:true,repository_access:true,
  default_branch:defaultBranch,
  production_verifier:verifier?{configured:true,auth:verifier.auth,url:verifier.url}:{configured:false},
  next:!defaultBranch?"INITIALIZE_MAIN":!verifier?"REGISTER_PRODUCTION_VERIFIER":"READY_FOR_PILOT"
 });
};
