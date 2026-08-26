const DEFAULT_DELAYS_MS = [250, 500, 750, 1000, 1500];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function settleMergeability({
  readPr,
  delaysMs = DEFAULT_DELAYS_MS,
  wait = sleep
} = {}) {
  if (typeof readPr !== "function") {
    throw new TypeError("readPr_required");
  }

  let snapshot = await readPr();

  if (snapshot?.mergeable === true || snapshot?.mergeable === false) {
    return { settled: true, attempts: 1, snapshot };
  }

  let attempts = 1;

  for (const delay of delaysMs) {
    await wait(delay);
    snapshot = await readPr();
    attempts += 1;

    if (snapshot?.mergeable === true || snapshot?.mergeable === false) {
      return { settled: true, attempts, snapshot };
    }
  }

  return { settled: false, attempts, snapshot };
}
