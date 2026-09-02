const assert = require("node:assert");
const catalog = require("../lib/project-catalog")._test;

function response(items, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => items,
  };
}

(async () => {
  assert.equal(catalog.validRepository("pjmcveyroutalk/example"), true);
  assert.equal(catalog.validRepository("../bad"), false);

  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    full_name: `pjmcveyroutalk/repo-${String(index).padStart(3, "0")}`,
    default_branch: "main",
    private: true,
  }));
  const secondPage = [
    { full_name: "pjmcveyroutalk/repo-100", default_branch: "main", private: false },
    { full_name: "other-owner/ignored", default_branch: "main", private: true },
  ];
  let calls = 0;
  const fetchImpl = async () => response(calls++ === 0 ? firstPage : secondPage);

  const discovered = await catalog.listAuthorizedRepositories(
    "token", "pjmcveyroutalk", fetchImpl
  );
  assert.equal(calls, 2);
  assert.equal(discovered.length, 101);
  assert.equal(discovered.some(item => item.repository === "other-owner/ignored"), false);

  const entries = catalog.buildCatalog([
    { repository: "pjmcveyroutalk/new-project", default_branch: "main", private: true }
  ]);
  const available = entries.find(item => item.repository === "pjmcveyroutalk/new-project");
  assert.equal(available.registered, false);
  assert.equal(available.authorized, true);
  assert.equal(available.role, "available");

  const registered = entries.find(item => item.repository === "pjmcveyroutalk/routalk-pilot");
  assert.equal(registered.registered, true);
  assert.equal(registered.role, "control");

  for (const entry of entries) {
    assert.equal("token" in entry, false);
    assert.equal("authorization" in entry, false);
  }

  const rendered = catalog.renderProjects({
    "pjmcveyroutalk/routalk-pilot": { role: "control" }
  });
  assert.match(rendered, /routalk-pilot/);
  assert.match(catalog.gitBlobSha(rendered), /^[0-9a-f]{40}$/);

  console.log("Project catalog discovery — PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
