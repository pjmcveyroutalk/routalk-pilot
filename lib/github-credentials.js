function resolveTargetGithubToken(env = process.env) {
  return (
    env.PILOT_TARGET_GITHUB_TOKEN ||
    env.PILOT_GITHUB_TOKEN ||
    env.GITHUB_TOKEN ||
    ""
  );
}

module.exports = { resolveTargetGithubToken };
