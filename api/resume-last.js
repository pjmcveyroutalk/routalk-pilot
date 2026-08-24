module.exports = function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const commandIdValue = Array.isArray(request.query.command_id)
    ? request.query.command_id[0]
    : request.query.command_id;
  const commandId =
    typeof commandIdValue === "string" ? commandIdValue.trim() : "";

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(commandId)) {
    return response.status(400).json({ error: "Invalid command_id" });
  }

  return response.redirect(
    302,
    `/resume.html?command_id=${encodeURIComponent(commandId)}`,
  );
};
