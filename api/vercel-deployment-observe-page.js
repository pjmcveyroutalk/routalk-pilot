module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pilot Deployment Observation</title>
<style>
body{font-family:system-ui;background:#08111f;color:#eef6ff;margin:0;padding:20px}
main{max-width:650px;margin:auto;background:#0e1d31;border:1px solid #294767;border-radius:18px;padding:20px}
label{display:block;margin:12px 0 5px;font-weight:700}input,button{width:100%;box-sizing:border-box;padding:13px;border-radius:11px;font:inherit}
input{background:#07101b;color:#fff;border:1px solid #385979}button{margin-top:16px;border:0;font-weight:900}
pre{white-space:pre-wrap;word-break:break-word;background:#07101b;padding:13px;border-radius:11px}
</style><main><h1>Deployment observation</h1>
<p>Read-only. Observes the exact known Vercel deployment directly.</p>
<label>Pilot trigger secret</label><input id="secret" type="password">
<label>Deployment ID</label><input id="deployment" value="Hbi3EfvxEVpBPVqs4R7BdVDH4ajx" readonly>
<button id="run">Observe deployment</button><pre id="out">Ready.</pre>
<script>
run.onclick=async()=>{out.textContent="Observing…";try{
const q=new URLSearchParams({deployment_id:deployment.value.trim()});
const r=await fetch("/api/vercel-deployment-observe?"+q,{headers:{Authorization:"Bearer "+secret.value}});
secret.value="";
const d=await r.json().catch(()=>({error:"Non-JSON response"}));
out.textContent=JSON.stringify(d,null,2);
}catch(e){secret.value="";out.textContent="Request failed: "+e.message}};
</script></main>`);
};
