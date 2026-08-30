module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pilot GitHub Merge Diagnostic</title>
<style>
body{font-family:system-ui;background:#08111f;color:#eef6ff;margin:0;padding:24px}
main{max-width:620px;margin:auto;background:#0e1d31;border:1px solid #294767;border-radius:20px;padding:24px}
h1{margin-top:0}label{display:block;margin:14px 0 6px;font-weight:700}
input,button{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;font:inherit}
input{background:#07101b;color:#fff;border:1px solid #385979}
button{margin-top:18px;background:#6fe7d2;color:#06131d;border:0;font-weight:900}
pre{white-space:pre-wrap;word-break:break-word;background:#07101b;padding:14px;border-radius:12px;margin-top:18px}
</style>
<main>
<h1>GitHub merge diagnostic</h1>
<p>Read-only. Tests the exact GitHub reads Pilot needs before merge. No token values are displayed or saved.</p>
<label>Pilot trigger secret</label><input id="secret" type="password">
<label>Repository</label><input id="repo" value="pjmcveyroutalk/pilot-fresh-project-test">
<label>PR number</label><input id="pr" value="2" inputmode="numeric">
<button id="run">Run diagnostic</button>
<pre id="out">Ready.</pre>
<script>
run.onclick=async()=>{out.textContent="Testing…";try{
const r=await fetch("/api/github-merge-diagnose",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+secret.value},body:JSON.stringify({repository:repo.value.trim(),pr_number:Number(pr.value)})});
secret.value="";
const d=await r.json().catch(()=>({error:"Non-JSON response"}));
out.textContent=JSON.stringify(d,null,2);
}catch(e){secret.value="";out.textContent="Request failed: "+e.message}};
</script>
</main>`);
};
