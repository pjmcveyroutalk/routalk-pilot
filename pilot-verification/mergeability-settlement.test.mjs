import test from "node:test";
import assert from "node:assert/strict";
import { settleMergeability } from "./mergeability-settlement.mjs";

test("returns immediately when GitHub already reports mergeable", async () => {
  let calls = 0;
  const result = await settleMergeability({
    readPr: async () => {
      calls++;
      return { mergeable: true, mergeable_state: "clean" };
    },
    wait: async () => {}
  });

  assert.equal(result.settled, true);
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test("waits through transient unknown then settles", async () => {
  const states = [
    { mergeable: null, mergeable_state: "unknown" },
    { mergeable: null, mergeable_state: "unknown" },
    { mergeable: true, mergeable_state: "clean" }
  ];
  let calls = 0;

  const result = await settleMergeability({
    readPr: async () => states[calls++] ?? states.at(-1),
    delaysMs: [1, 1, 1],
    wait: async () => {}
  });

  assert.equal(result.settled, true);
  assert.equal(result.snapshot.mergeable, true);
  assert.equal(calls, 3);
});

test("real conflict settles false immediately", async () => {
  let calls = 0;
  const result = await settleMergeability({
    readPr: async () => {
      calls++;
      return { mergeable: false, mergeable_state: "dirty" };
    },
    wait: async () => {}
  });

  assert.equal(result.settled, true);
  assert.equal(result.snapshot.mergeable, false);
  assert.equal(calls, 1);
});

test("bounded wait times out safely if GitHub never settles", async () => {
  let calls = 0;
  const result = await settleMergeability({
    readPr: async () => {
      calls++;
      return { mergeable: null, mergeable_state: "unknown" };
    },
    delaysMs: [1, 1],
    wait: async () => {}
  });

  assert.equal(result.settled, false);
  assert.equal(calls, 3);
});
