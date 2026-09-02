const assert = require("node:assert/strict");
const {
  observeDeploymentByRevision,
  resolveProjectId,
} = require("../lib/vercel-deployment-observer");

const originalFetch = global.fetch;
const EXPECTED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

async function run() {
  const calls = [];

  global.fetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes("/v9/projects/routalk-daycare?")) {
      return response(200, { id: "prj_authoritative" });
    }

    if (String(url).includes("/v6/deployments?")) {
      return response(200, {
        deployments: [{
          uid: "dpl_revision_test_01",
          url: "routalk-daycare.vercel.app",
          readyState: "READY",
          target: "production",
          createdAt: 10,
          meta: {},
        }],
      });
    }

    if (String(url).includes("/v13/deployments/dpl_revision_test_01?")) {
      return response(200, {
        uid: "dpl_revision_test_01",
        url: "routalk-daycare.vercel.app",
        readyState: "READY",
        target: "production",
        createdAt: 10,
        gitSource: { sha: EXPECTED },
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const resolved = await resolveProjectId(
    "routalk-daycare",
    "token",
    "team_test",
  );
  assert.deepEqual(resolved, {
    ok: true,
    project_id: "prj_authoritative",
    resolved: true,
  });

  const observed = await observeDeploymentByRevision({
    projectId: "routalk-daycare",
    revision: EXPECTED,
    token: "token",
    teamId: "team_test",
  });

  assert.equal(observed.ready, true);
  assert.equal(observed.revision_match, true);
  assert.equal(observed.project_id, "prj_authoritative");
  assert.equal(observed.deployment.git_sha, EXPECTED);
  assert.ok(calls.some((url) => url.includes("projectId=prj_authoritative")));
  assert.ok(calls.some((url) => url.includes("withGitRepoInfo=true")));

  global.fetch = async (url) => {
    if (String(url).includes("/v6/deployments?")) {
      return response(200, {
        deployments: [{
          uid: "dpl_revision_test_02",
          readyState: "READY",
          target: "production",
          createdAt: 20,
          meta: { githubCommitSha: OTHER },
        }],
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const mismatch = await observeDeploymentByRevision({
    projectId: "prj_authoritative",
    revision: EXPECTED,
    token: "token",
    teamId: "team_test",
  });

  assert.equal(mismatch.ready, false);
  assert.equal(mismatch.revision_match, false);
  assert.equal(mismatch.state, "WAITING_FOR_DEPLOYMENT");

  global.fetch = async () => response(403, {});
  const denied = await resolveProjectId(
    "routalk-daycare",
    "token",
    "team_test",
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.state, "VERCEL_PROJECT_LOOKUP_FAILED");
  assert.equal(denied.http_status, 403);

  console.log("Vercel deployment observer tests passed");
}

run()
  .finally(() => { global.fetch = originalFetch; })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
