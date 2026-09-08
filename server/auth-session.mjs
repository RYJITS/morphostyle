export const parseCookieHeader = (header = "") => {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
};

export const isHttpsRequest = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return forwardedProto === "https" || Boolean(req.socket?.encrypted);
};

export const authCookieHeader = (token, req) => {
  const parts = [
    `morphostyle_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000"
  ];
  if (isHttpsRequest(req)) parts.push("Secure");
  return parts.join("; ");
};

export const clearAuthCookieHeader = (req) => {
  const parts = [
    "morphostyle_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (isHttpsRequest(req)) parts.push("Secure");
  return parts.join("; ");
};

export const publicSessionPayload = (session = {}) => {
  const { token, ...publicSession } = session;
  return publicSession;
};

export const bearerTokenFromRequest = (req) => {
  const header = String(req.headers.authorization || "");
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  return String(bearerMatch?.[1] || "").trim();
};

export const cookieTokenFromRequest = (req) =>
  String(parseCookieHeader(req.headers.cookie || "").morphostyle_session || "").trim();

export const authTokenFromRequest = (req) => {
  const bearerToken = bearerTokenFromRequest(req);
  const cookieToken = cookieTokenFromRequest(req);
  return String(bearerToken || cookieToken || "").trim();
};
