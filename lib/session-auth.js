const crypto = require("node:crypto");

const COOKIE_NAME = "__Host-pilot_session";
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const SESSION_VERSION = 1;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signingKey(triggerSecret) {
  return crypto.createHash("sha256").update(`routalk-pilot-session:${triggerSecret}`).digest();
}

function sign(value, triggerSecret) {
  return crypto.createHmac("sha256", signingKey(triggerSecret)).update(value).digest("base64url");
}

function parseCookies(request) {
  const header = String(request?.headers?.cookie || "");
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function createSessionToken(triggerSecret, now = Date.now()) {
  if (!triggerSecret) throw new Error("Missing Pilot trigger secret");
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    v: SESSION_VERSION,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, triggerSecret)}`;
}

function verifySessionToken(token, triggerSecret, now = Date.now()) {
  if (!token || !triggerSecret || typeof token !== "string") return false;
  const pieces = token.split(".");
  if (pieces.length !== 2) return false;
  const [encoded, signature] = pieces;
  if (!safeEqual(signature, sign(encoded, triggerSecret))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const current = Math.floor(now / 1000);
    return (
      payload?.v === SESSION_VERSION &&
      Number.isSafeInteger(payload?.iat) &&
      Number.isSafeInteger(payload?.exp) &&
      payload.iat <= current + 60 &&
      payload.exp > current &&
      payload.exp - payload.iat <= SESSION_TTL_SECONDS &&
      typeof payload?.nonce === "string" &&
      payload.nonce.length >= 16
    );
  } catch {
    return false;
  }
}

function bearerSecret(request) {
  const authorization = String(request?.headers?.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function isAuthenticated(request, triggerSecret) {
  const supplied = bearerSecret(request);
  if (supplied && safeEqual(supplied, triggerSecret)) return true;
  const token = parseCookies(request)[COOKIE_NAME] || "";
  return verifySessionToken(token, triggerSecret);
}

function setSessionCookie(response, triggerSecret) {
  const token = createSessionToken(triggerSecret);
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  );
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  bearerSecret,
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  setSessionCookie,
  verifySessionToken,
};
