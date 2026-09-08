import path from "node:path";

const BODY_LIMIT_BYTES = Number(process.env.REQUEST_BODY_LIMIT_BYTES || 24 * 1024 * 1024);

export const mimeByExt = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"]
]);

export const resolveInsideDir = (baseDir, relativePath = "") => {
  const resolvedBase = path.resolve(baseDir);
  const filePath = path.resolve(resolvedBase, relativePath);
  if (filePath === resolvedBase || filePath.startsWith(`${resolvedBase}${path.sep}`)) return filePath;
  return "";
};

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

export const applySecurityHeaders = (res) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    res.setHeader(name, value);
  }
  res.removeHeader("X-Powered-By");
};

export const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
};

export const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error("IMAGE_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });

export const payloadFromUrlQuery = (req) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  return {
    clientId: parsedUrl.searchParams.get("clientId") || "",
    scope: parsedUrl.searchParams.get("scope") || "",
    limit: parsedUrl.searchParams.get("limit") || "",
    search: parsedUrl.searchParams.get("search") || "",
    userId: parsedUrl.searchParams.get("userId") || "",
    ownerType: parsedUrl.searchParams.get("ownerType") || "",
    ownerId: parsedUrl.searchParams.get("ownerId") || "",
    generationId: parsedUrl.searchParams.get("generationId") || ""
  };
};
