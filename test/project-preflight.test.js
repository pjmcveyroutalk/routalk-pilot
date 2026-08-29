const assert=require("node:assert");
const projects=require("../config/projects");
assert.equal(projects["pjmcveyroutalk/routalk-pilot"].role,"control");
for(const repo of ["pjmcveyroutalk/Personal-website-","pjmcveyroutalk/flock-tuah","pjmcveyroutalk/wisconsin-vehicle-recovery"]){
 assert.equal(projects[repo].role,"target");
 assert.equal(projects[repo].production_verifier.auth,"vercel_oidc");
 assert.ok(projects[repo].production_verifier.url.startsWith("https://"));
}
console.log("Project preflight registry contract — PASS");
