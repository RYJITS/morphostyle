import { GoogleGenAI } from "@google/genai";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authCookieHeader,
  authTokenFromRequest,
  clearAuthCookieHeader,
  publicSessionPayload
} from "./auth-session.mjs";
import {
  applySecurityHeaders,
  mimeByExt,
  payloadFromUrlQuery,
  readJsonBody,
  resolveInsideDir,
  sendJson
} from "./http-utils.mjs";
import { createPublicGalleryService } from "./public-gallery.mjs";
import { createUserMemoryStore } from "./user-memory.mjs";
import { preparePortraitBackground, neutralizePortraits, getPortraitBackgroundStatus } from "./portrait-background.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const distDir = path.join(rootDir, "dist");
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const DEFAULT_AI_HORDE_MODELS = ["Realistic Vision", "AbsoluteReality", "Dreamshaper", "stable_diffusion"];
const CENTRAL_ENV_FILE = "D:/00_Cerveau_IA/API/env.Local";
const CENTRAL_SHARP_MODULE = "D:/00_Cerveau_IA/Conpetances/node_modules/sharp";
const DEFAULT_LOCAL_COMFY_API = "http://127.0.0.1:8188";
const DEFAULT_LOCAL_COMFY_SCRIPT = path.join(rootDir, "server", "comfy-hairstyle-inpaint.mjs");
const DEFAULT_LOCAL_COMFY_PREVIEW_SCRIPT = path.join(rootDir, "server", "comfy-hairstyle-preview.mjs");
const DEFAULT_LOCAL_COMFY_INSTANTID_SCRIPT = path.join(rootDir, "server", "comfy-instantid-hairstyle.mjs");
const DEFAULT_LOCAL_COMFY_PHOTOMAKER_SCRIPT = path.join(rootDir, "server", "comfy-photomaker-hairstyle.mjs");
const DEFAULT_LOCAL_STABLEHAIR_SCRIPT = path.join(rootDir, "server", "stablehair-local-runner.py");
const DEFAULT_LOCAL_STABLEHAIR_REPO_ROOT = path.join(rootDir, "output", "external", "Stable-Hair");
const DEFAULT_LOCAL_STABLEHAIR_SHORT_REFERENCE = path.join(rootDir, "server", "references", "stablehair-short-military.png");
const DEFAULT_LOCAL_LANDMARK_FACE_RESTORE_SCRIPT = path.join(rootDir, "server", "landmark-face-restore.py");
const DEFAULT_LOCAL_REFERENCE_SANITIZE_SCRIPT = path.join(rootDir, "server", "sanitize-reference-preview.py");
const REFERENCE_SANITIZE_VERSION = "grid-cell-v4";
const GENERATED_ALIBABA_DIR = path.join(rootDir, "public", "generated-alibaba");
const OPENAI_USAGE_DIR = path.join(rootDir, "server", "data");
const GENERATED_OPENAI_DIR = path.join(OPENAI_USAGE_DIR, "generated-openai");
const LEGACY_GENERATED_OPENAI_DIR = path.join(rootDir, "public", "generated-openai");
const OPENAI_USAGE_FILE = path.join(OPENAI_USAGE_DIR, "openai-daily-usage.json");
const PUBLIC_GENERATIONS_FILE = path.join(OPENAI_USAGE_DIR, "public-generations.json");
const PUBLIC_GALLERY_DIR = path.join(OPENAI_USAGE_DIR, "public-gallery");
const USER_MEMORY_FILE = "user-memory.json";
const PUBLIC_GENERATION_STORE_LIMIT = Math.max(80, Number(process.env.PUBLIC_GENERATION_STORE_LIMIT || 1000));
const PUBLIC_GENERATION_RESPONSE_LIMIT = Math.max(12, Number(process.env.PUBLIC_GENERATION_RESPONSE_LIMIT || 240));
const OPENAI_DAILY_TRIAL_LIMIT = Math.max(1, Number(process.env.OPENAI_DAILY_TRIAL_LIMIT || 1));
const OPENAI_QUOTA_TIME_ZONE = process.env.OPENAI_QUOTA_TIME_ZONE || "Europe/Zurich";
const DEFAULT_OPENAI_EXTRA_TRIAL_CODE_HASHES = [
  "sha256:aacec90536a288fc7cc0a34b94f590f03db9bbe1dca24b26dc00944a8c90a073"
];
const DEFAULT_LOCAL_PYTHON_EXECUTABLE =
  "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe";

let userMemoryStore = null;
const activeOpenAiGenerationsByOwner = new Map();

const getUserMemory = () => {
  if (!userMemoryStore) {
    userMemoryStore = createUserMemoryStore({
      dataDir: OPENAI_USAGE_DIR,
      fileName: USER_MEMORY_FILE,
      timeZone: OPENAI_QUOTA_TIME_ZONE
    });
  }
  return userMemoryStore;
};

const openAiGenerationOwnerKey = (owner = {}) =>
  `${owner.type || "user"}:${owner.id || owner.email || "unknown"}`;

const acquireOpenAiGenerationLock = (owner) => {
  const key = openAiGenerationOwnerKey(owner);
  if (activeOpenAiGenerationsByOwner.has(key)) {
    throw Object.assign(
      new Error("Une generation est deja en cours. Patientez jusqu'au resultat avant d'en lancer une autre."),
      { status: 409 }
    );
  }

  const lockId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  activeOpenAiGenerationsByOwner.set(key, lockId);

  return () => {
    if (activeOpenAiGenerationsByOwner.get(key) === lockId) {
      activeOpenAiGenerationsByOwner.delete(key);
    }
  };
};

const GENERATED_OPENAI_ROUTE_PREFIX = "/generated-openai/";

const getPrivateAssetUrlTtlMs = () =>
  Math.max(5 * 60 * 1000, Number(process.env.PRIVATE_ASSET_URL_TTL_MS || 24 * 60 * 60 * 1000));

const getPrivateAssetSecret = () =>
  process.env.MORPHOSTYLE_PRIVATE_ASSET_SECRET ||
  process.env.PRIVATE_ASSET_SECRET ||
  process.env.OPENAI_API_KEY ||
  process.env.API_KEY ||
  "morphostyle-local-private-assets";

const normalizeGeneratedOpenAiAssetPath = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\\") || raw.includes("\u0000")) return "";

  try {
    const parsedUrl = new URL(raw, "http://local");
    const pathname = decodeURIComponent(parsedUrl.pathname || "");
    if (!pathname.startsWith(GENERATED_OPENAI_ROUTE_PREFIX)) return "";

    const relativePath = pathname.slice(GENERATED_OPENAI_ROUTE_PREFIX.length);
    const normalizedRelativePath = path.posix.normalize(relativePath.replace(/\\/g, "/"));
    if (
      !normalizedRelativePath ||
      normalizedRelativePath === "." ||
      normalizedRelativePath === ".." ||
      normalizedRelativePath.startsWith("../") ||
      path.posix.isAbsolute(normalizedRelativePath)
    ) {
      return "";
    }

    return `${GENERATED_OPENAI_ROUTE_PREFIX}${normalizedRelativePath}`;
  } catch {
    return "";
  }
};

const generatedOpenAiRelativePath = (assetPath = "") =>
  normalizeGeneratedOpenAiAssetPath(assetPath).slice(GENERATED_OPENAI_ROUTE_PREFIX.length);

const resolveGeneratedOpenAiAssetPath = (assetUrl = "") => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(assetUrl);
  if (!assetPath) return "";
  const relativePath = generatedOpenAiRelativePath(assetPath);
  const assetDirs = [GENERATED_OPENAI_DIR, LEGACY_GENERATED_OPENAI_DIR];

  for (const baseDir of assetDirs) {
    const filePath = resolveInsideDir(baseDir, relativePath);
    if (filePath && existsSync(filePath)) return filePath;
  }

  return resolveInsideDir(GENERATED_OPENAI_DIR, relativePath);
};

const generatedOpenAiAssetSignature = (assetPath, expiresAt) =>
  createHmac("sha256", getPrivateAssetSecret())
    .update(`${assetPath}\n${expiresAt}`)
    .digest("hex");

const verifyGeneratedOpenAiAssetSignature = (assetPath, expiresAt, signature = "") => {
  if (!assetPath || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(signature))) return false;

  const expected = generatedOpenAiAssetSignature(assetPath, expiresAt);
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(String(signature), "hex");
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
};

const signGeneratedOpenAiAssetUrl = (value = "") => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(value);
  if (!assetPath) return value;
  const expiresAt = Date.now() + getPrivateAssetUrlTtlMs();
  const signature = generatedOpenAiAssetSignature(assetPath, expiresAt);
  return `${assetPath}?expires=${expiresAt}&sig=${signature}`;
};

const stripGeneratedOpenAiAssetAccess = (value = "") => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(value);
  return assetPath || value;
};

const mapPrivateGeneratedAssetUrls = (value, mapper) => {
  if (typeof value === "string") return mapper(value);
  if (Array.isArray(value)) return value.map(item => mapPrivateGeneratedAssetUrls(item, mapper));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapPrivateGeneratedAssetUrls(item, mapper)])
    );
  }
  return value;
};

const withPrivateGeneratedAssetAccess = (value) =>
  mapPrivateGeneratedAssetUrls(value, signGeneratedOpenAiAssetUrl);

const stripPrivateGeneratedAssetAccess = (value) =>
  mapPrivateGeneratedAssetUrls(value, stripGeneratedOpenAiAssetAccess);

const contentTypeFromImagePath = (filePath = "", fallback = "image/jpeg") =>
  mimeByExt.get(path.extname(filePath).toLowerCase()) || fallback;

const persistImageAsset = async ({ assetPath = "", buffer, contentType = "", owner = null } = {}) => {
  const cleanAssetPath = stripGeneratedOpenAiAssetAccess(assetPath);
  if (!cleanAssetPath || !buffer) return;

  try {
    await getUserMemory().storeImageAsset({
      assetPath: cleanAssetPath,
      ownerType: owner?.type || "",
      ownerId: owner?.id || "",
      contentType: contentType || contentTypeFromImagePath(cleanAssetPath),
      buffer
    });
  } catch (error) {
    console.error(`Sauvegarde image MySQL ignoree pour ${cleanAssetPath}:`, error?.message || error);
  }
};

const readPersistedImageAsset = async (assetPath = "") => {
  try {
    return await getUserMemory().getImageAsset(stripGeneratedOpenAiAssetAccess(assetPath));
  } catch (error) {
    console.error(`Lecture image MySQL impossible pour ${assetPath}:`, error?.message || error);
    return null;
  }
};

const deletePersistedImageAsset = async (assetPath = "") => {
  const cleanAssetPath = stripGeneratedOpenAiAssetAccess(assetPath);
  if (!cleanAssetPath) return false;

  try {
    return await getUserMemory().deleteImageAsset(cleanAssetPath);
  } catch (error) {
    console.error(`Suppression image MySQL impossible pour ${cleanAssetPath}:`, error?.message || error);
    return false;
  }
};

const assertGeneratedOpenAiAssetPathOwnedBy = async (assetPath = "", owner = null) => {
  const cleanAssetPath = normalizeGeneratedOpenAiAssetPath(assetPath);
  if (!cleanAssetPath || !owner?.type || !owner?.id) return false;

  const store = getUserMemory();
  const requirePersistedOwner = Boolean(store.mysqlRequired);
  const persisted = await readPersistedImageAsset(cleanAssetPath);
  if (!persisted) {
    if (requirePersistedOwner) {
      throw Object.assign(new Error("Propriete de l'image personnelle impossible a verifier."), { status: 403 });
    }
    return true;
  }

  const storedOwnerType = String(persisted.ownerType || "").trim();
  const storedOwnerId = String(persisted.ownerId || "").trim();
  if (storedOwnerType || storedOwnerId) {
    if (storedOwnerType !== owner.type || storedOwnerId !== owner.id) {
      throw Object.assign(new Error("Cette image personnelle ne peut etre lue que depuis son compte createur."), { status: 403 });
    }
    return true;
  }

  if (requirePersistedOwner) {
    throw Object.assign(new Error("Proprietaire de l'image personnelle manquant."), { status: 403 });
  }
  return true;
};

const canReadGeneratedOpenAiAssetForOwner = async (assetPath = "", owner = null) => {
  try {
    return await assertGeneratedOpenAiAssetPathOwnedBy(assetPath, owner);
  } catch {
    return false;
  }
};

const mapPrivateGeneratedAssetUrlsAsync = async (value, mapper) => {
  if (typeof value === "string") return mapper(value);
  if (Array.isArray(value)) return Promise.all(value.map(item => mapPrivateGeneratedAssetUrlsAsync(item, mapper)));
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [key, await mapPrivateGeneratedAssetUrlsAsync(item, mapper)])
    );
    return Object.fromEntries(entries);
  }
  return value;
};

const signGeneratedOpenAiAssetUrlForOwner = async (value = "", owner = null, accessCache = null) => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(value);
  if (!assetPath) return value;
  if (owner) {
    if (!accessCache?.has(assetPath)) {
      accessCache?.set(assetPath, canReadGeneratedOpenAiAssetForOwner(assetPath, owner));
    }
    const canRead = accessCache ? await accessCache.get(assetPath) : await canReadGeneratedOpenAiAssetForOwner(assetPath, owner);
    if (!canRead) return "";
  }
  return signGeneratedOpenAiAssetUrl(assetPath);
};

const stripGeneratedOpenAiAssetAccessForOwner = async (value = "", owner = null, accessCache = null) => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(value);
  if (!assetPath) return value;
  if (owner) {
    if (!accessCache?.has(assetPath)) {
      accessCache?.set(assetPath, canReadGeneratedOpenAiAssetForOwner(assetPath, owner));
    }
    const canRead = accessCache ? await accessCache.get(assetPath) : await canReadGeneratedOpenAiAssetForOwner(assetPath, owner);
    if (!canRead) return "";
  }
  return assetPath;
};

const withPrivateGeneratedAssetAccessForOwner = (value, owner) => {
  const accessCache = new Map();
  return mapPrivateGeneratedAssetUrlsAsync(value, item => signGeneratedOpenAiAssetUrlForOwner(item, owner, accessCache));
};

const stripPrivateGeneratedAssetAccessForOwner = (value, owner) => {
  const accessCache = new Map();
  return mapPrivateGeneratedAssetUrlsAsync(value, item => stripGeneratedOpenAiAssetAccessForOwner(item, owner, accessCache));
};

const inlineGeneratedOpenAiAsset = async (assetUrl = "", owner = null) => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(assetUrl);
  if (!assetPath) return assetUrl || "";
  if (owner && !await canReadGeneratedOpenAiAssetForOwner(assetPath, owner)) return "";

  const filePath = resolveGeneratedOpenAiAssetPath(assetPath);
  try {
    const buffer = await readFile(filePath);
    return imageBufferToDataUrl(buffer, contentTypeFromImagePath(filePath));
  } catch {
    const stored = await readPersistedImageAsset(assetPath);
    if (stored?.buffer) {
      return imageBufferToDataUrl(stored.buffer, stored.contentType || contentTypeFromImagePath(assetPath));
    }
  }

  return assetUrl || "";
};

const imageSourceFromGeneratedOpenAiAsset = async (assetUrl = "", missingMessage = "Image de reference indisponible.", owner = null) => {
  const assetPath = normalizeGeneratedOpenAiAssetPath(assetUrl);
  if (!assetPath) {
    throw Object.assign(new Error(missingMessage), { status: 400 });
  }
  if (owner) await assertGeneratedOpenAiAssetPathOwnedBy(assetPath, owner);

  const inlineUrl = await inlineGeneratedOpenAiAsset(assetPath, owner);
  const { data, mimeType: dataUrlMime } = stripDataUrl(inlineUrl);
  if (!data || data.length < 100) {
    throw Object.assign(new Error(missingMessage), { status: 404 });
  }

  const mimeType = detectMimeType(data, dataUrlMime);
  return {
    data,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data}`
  };
};

const hydratePrivateAssetsForHistoryItem = async (item = {}, owner = null) => {
  const recommendations = Array.isArray(item.recommendations)
    ? await Promise.all(item.recommendations.map(async (recommendation) => {
      const assetUrl = recommendation.assetPreviewUrl || recommendation.previewUrl || recommendation.imageUrl || "";
      const inlineUrl = await inlineGeneratedOpenAiAsset(assetUrl, owner);
      return {
        ...recommendation,
        previewUrl: inlineUrl || recommendation.previewUrl || "",
        imageUrl: inlineUrl || recommendation.imageUrl || "",
        assetPreviewUrl: stripGeneratedOpenAiAssetAccess(assetUrl) || recommendation.assetPreviewUrl || ""
      };
    }))
    : item.recommendations;
  const additionalViews = item.additionalViews && typeof item.additionalViews === "object"
    ? Object.fromEntries(await Promise.all(Object.entries(item.additionalViews).map(async ([key, value]) => [
      key,
      await inlineGeneratedOpenAiAsset(value, owner)
    ])))
    : item.additionalViews;
  const firstRecommendationImage = recommendations?.[0]?.previewUrl || "";
  const shouldUseRecommendationCover = item.status === "recommendations_ready" && firstRecommendationImage;

  return {
    ...item,
    imageUrl: shouldUseRecommendationCover ? firstRecommendationImage : await inlineGeneratedOpenAiAsset(item.imageUrl, owner),
    originalImageUrl: await inlineGeneratedOpenAiAsset(item.originalImageUrl, owner),
    additionalViews,
    recommendations
  };
};

const isPlaceholderEnvValue = (value = "") =>
  !String(value).trim() || /PLACEHOLDER|votre_cle|your_server_key/i.test(String(value));

const shouldProtectEnvKey = (key = "") => /KEY|TOKEN|SECRET|PASS/i.test(key);

const setEnvValue = (key, value) => {
  const current = process.env[key];
  const incomingIsPlaceholder = isPlaceholderEnvValue(value);
  const currentIsPlaceholder = isPlaceholderEnvValue(current);

  if (shouldProtectEnvKey(key) && current && !currentIsPlaceholder && incomingIsPlaceholder) return;
  if (!current || currentIsPlaceholder || !incomingIsPlaceholder || !shouldProtectEnvKey(key)) {
    process.env[key] = value;
  }
};

const loadLocalEnv = async () => {
  const currentDir = process.cwd();
  const files = [
    CENTRAL_ENV_FILE,
    path.join(rootDir, ".env.local"),
    path.join(rootDir, ".env"),
    path.join(currentDir, ".env.local"),
    path.join(currentDir, ".env"),
    path.join(rootDir, "..", ".env.local"),
    path.join(rootDir, "..", ".env"),
    path.join(currentDir, "..", ".env.local"),
    path.join(currentDir, "..", ".env")
  ].map((filePath) => path.resolve(filePath));

  for (const filePath of [...new Set(files)]) {
    if (!existsSync(filePath)) continue;
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      setEnvValue(key, value);
    }
  }
};

const stripDataUrl = (value = "") => {
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { data: match[2], mimeType: match[1] };
  return { data: String(value), mimeType: "" };
};

const imageBufferToDataUrl = (buffer, contentType = "image/jpeg") =>
  `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;

const {
  normalizePublicGenerationLimit,
  readPublicGenerations,
  addPublicGeneration,
  removePublicGeneration,
  findOwnedGenerationForPublication,
  publicGenerationPayloadFromOwnedGeneration
} = createPublicGalleryService({
  openAiUsageDir: OPENAI_USAGE_DIR,
  publicGenerationsFile: PUBLIC_GENERATIONS_FILE,
  publicGalleryDir: PUBLIC_GALLERY_DIR,
  generatedOpenAiRoutePrefix: GENERATED_OPENAI_ROUTE_PREFIX,
  generatedAlibabaDir: GENERATED_ALIBABA_DIR,
  demoProfilesDir: path.join(rootDir, "public", "demo-profiles"),
  publicGenerationStoreLimit: PUBLIC_GENERATION_STORE_LIMIT,
  publicGenerationResponseLimit: PUBLIC_GENERATION_RESPONSE_LIMIT,
  resolveInsideDir,
  resolveGeneratedOpenAiAssetPath,
  normalizeGeneratedOpenAiAssetPath,
  stripGeneratedOpenAiAssetAccess,
  stripPrivateGeneratedAssetAccess,
  getUserMemory,
  assertGeneratedOpenAiAssetPathOwnedBy,
  contentTypeFromImagePath,
  readPersistedImageAsset,
  persistImageAsset,
  deletePersistedImageAsset
});

const detectMimeType = (base64, fallback = "") => {
  if (fallback) return fallback;
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
};

const imageDataUrlFromPayload = (payload) => {
  const { data, mimeType: dataUrlMime } = stripDataUrl(payload.imageBase64 || payload.originalBase64 || "");
  if (!data || data.length < 100) {
    throw Object.assign(new Error("Image source manquante."), { status: 400 });
  }

  const mimeType = detectMimeType(data, payload.mimeType || dataUrlMime);
  return {
    data,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data}`
  };
};

const hasImageDataPayload = (payload = {}) => {
  const { data } = stripDataUrl(payload.imageBase64 || payload.originalBase64 || "");
  return Boolean(data && data.length >= 100);
};

const normalizeStyle = (style = {}) => ({
  id: style.id || "style",
  name: style.name || style.styleName || "Coupe personnalisee",
  description: style.description || "Nouvelle coupe adaptee au visage.",
  color: style.color || "couleur naturelle",
  beardStyle: style.beardStyle || "Aucune",
  whyItWorks: style.whyItWorks || "",
  faceShape: style.faceShape || "",
  recipe: style.recipe || null,
  referenceCacheKey: style.referenceCacheKey || "",
  previewUrl: style.previewUrl || "",
  assetPreviewUrl: style.assetPreviewUrl || "",
  resultImageUrl: style.resultImageUrl || "",
  sourceProvider: style.sourceProvider || "",
  generationSessionId: style.generationSessionId || "",
  selectedReferenceAssetUrl: style.selectedReferenceAssetUrl || ""
});

const buildHairPrompt = ({ style, gender, ageGroup, angle }) => {
  const normalizedStyle = normalizeStyle(style);
  const isYoung = ageGroup === "baby" || ageGroup === "child" || ageGroup === "teen";
  const beardInstruction = normalizedStyle.beardStyle && !/aucune|n\/a|none/i.test(normalizedStyle.beardStyle) && !isYoung
    ? `Apply this facial hair only if it fits the source face: ${normalizedStyle.beardStyle}.`
    : "Do not add facial hair.";

  return [
    "Edit the uploaded portrait as a realistic salon hairstyle simulation.",
    "Preserve the same person, face identity, facial structure, age, skin tone, expression, pose, clothes, background, lighting, and camera framing.",
    "Only modify visible hair and, if requested, facial hair. Do not beautify the face, change the jaw, change the nose, change the eyes, or change the body.",
    `Target haircut: ${normalizedStyle.name}.`,
    `Hair description: ${normalizedStyle.description}.`,
    `Hair color: ${normalizedStyle.color}.`,
    normalizedStyle.faceShape ? `Face shape guidance: ${normalizedStyle.faceShape}.` : "",
    `User gender context: ${gender}. Age group: ${ageGroup}. Requested view: ${angle}.`,
    beardInstruction,
    "Return only the edited portrait image, no text, no labels, no watermark."
  ].filter(Boolean).join("\n");
};

const buildKontextHairPrompt = (payload) => {
  const normalizedStyle = normalizeStyle(payload.style);
  return [
    "Realistic image edit of the uploaded portrait.",
    "Keep the exact same person, face identity, facial features, expression, skin, body, clothes, background, lighting, camera framing and photo quality.",
    "Change only the real hairstyle, not by overlay, sticker, hat, wig, drawing or extra object.",
    `Target haircut: ${normalizedStyle.name}.`,
    `Hair shape: ${normalizedStyle.description}.`,
    `Hair color: ${normalizedStyle.color}.`,
    normalizedStyle.faceShape ? `Adapt naturally to this face shape: ${normalizedStyle.faceShape}.` : "",
    `Context: ${payload.gender || "non-binary"}, ${payload.ageGroup || "adult"}, ${payload.angle || "front"} view.`,
    "Return one natural edited portrait photo with no text and no watermark."
  ].filter(Boolean).join(" ");
};

const fetchJsonWithTimeout = async (url, init = {}, timeoutMs = 180000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const execFileAsync = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      timeout: options.timeout || 600000,
      maxBuffer: 1024 * 1024 * 4,
      cwd: options.cwd || rootDir
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const seedFromText = (value = "") =>
  Math.abs([...String(value)].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) % 2147483647, 17));

const csvEnv = (value, fallback) =>
  String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 5)
    .length
    ? String(value || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 5)
    : fallback;

const getAiHordeApiKey = () => process.env.AI_HORDE_API_KEY || "0000000000";

const getAiHordeModels = () => csvEnv(process.env.AI_HORDE_MODELS, DEFAULT_AI_HORDE_MODELS);

const loadSharp = () => {
  try {
    return require(CENTRAL_SHARP_MODULE);
  } catch {
    try {
      return require("sharp");
    } catch {
      return null;
    }
  }
};

const consultationLabels = {
  length: {
    short: "court",
    medium: "mi-long",
    long: "long",
    any: "libre adapte au visage"
  },
  maintenance: {
    low: "entretien rapide",
    medium: "entretien modere",
    high: "rituel soigne"
  },
  lifestyle: {
    classic: "classique",
    modern: "moderne",
    bold: "signature audacieux"
  },
  gender: {
    male: "homme",
    female: "femme",
    "non-binary": "personne"
  },
  age: {
    baby: "bebe",
    child: "enfant",
    teen: "adolescent",
    adult: "adulte",
    mature: "senior"
  }
};

const buildProfessionalMorphologyAdvice = (consultation = {}, warning = "") => {
  const length = consultationLabels.length[consultation.targetLength] || "longueur adaptee";
  const maintenance = consultationLabels.maintenance[consultation.maintenance] || "entretien adapte";
  const lifestyle = consultationLabels.lifestyle[consultation.lifestyle] || "style adapte";

  const lengthAdvice = {
    short: "La longueur courte degage le regard, clarifie la ligne de machoire et evite d'alourdir les traits.",
    medium: "Le mi-long garde de la douceur autour des joues tout en permettant une vraie structure de coupe.",
    long: "La longueur longue encadre le visage, accompagne les proportions et apporte du mouvement sans durcir les contours.",
    any: "La longueur reste ouverte afin de choisir la forme la plus flatteuse pour les proportions visibles du visage."
  }[consultation.targetLength] || "La longueur est choisie pour equilibrer les volumes visibles du visage.";

  const maintenanceAdvice = {
    low: "L'entretien rapide privilegie des lignes faciles a replacer et une repousse qui reste propre.",
    medium: "L'entretien modere permet un resultat plus dessine tout en restant simple a vivre.",
    high: "Le rituel soigne autorise davantage de precision, de mouvement et de finition."
  }[consultation.maintenance] || "Le niveau d'entretien garde la coupe realiste pour le quotidien.";

  const lifestyleAdvice = {
    classic: "L'univers classique apporte une lecture sobre, elegante et durable.",
    modern: "L'univers moderne donne plus de fraicheur et une silhouette actuelle.",
    bold: "L'univers signature affirme davantage la personnalite sans perdre l'equilibre du visage."
  }[consultation.lifestyle] || "L'univers choisi oriente le caractere general de la coupe.";

  return [
    "Votre morphologie appelle une coupe qui met le regard en valeur, equilibre le front, les pommettes, la machoire et la longueur du cou.",
    `Avec un choix ${length}, ${maintenance} et un univers ${lifestyle}, les propositions cherchent une forme flatteuse, lisible et credible pour votre visage.`,
    lengthAdvice,
    maintenanceAdvice,
    lifestyleAdvice,
    "Les quatre options comparent une solution equilibree, une ligne plus douce, une structure plus nette et une signature plus affirmee.",
    warning ? "Certaines variantes peuvent etre limitees aujourd'hui; les propositions visibles restent prioritaires pour votre choix." : ""
  ].filter(Boolean).join(" ");
};

const openAiVariantPlans = {
  primary: "new balanced morphology-focused haircut, very wearable, visible silhouette change, never the source hairstyle",
  soft: "new softer haircut, natural movement, light volume, realistic upkeep, clearly different from the source hairstyle",
  structured: "new structured haircut, cleaner lines, stronger contour, clearly different from the soft option",
  signature: "new signature haircut, more distinctive but realistic and age-appropriate, clearly different from all other recommendations"
};

const openAiVariantLabels = {
  primary: "Equilibre morphologie",
  soft: "Doux naturel",
  structured: "Structure nette",
  signature: "Signature controlee"
};

const openAiLengthConstraint = (targetLength = "") => {
  switch (targetLength) {
    case "short":
      return [
        "Mandatory length rule: every recommendation must be unmistakably SHORT.",
        "Transform the source hair into a pixie, crop, bixie or short bob adapted to the face.",
        "No hair may fall below the jawline or rest on the shoulders. No long layers, no medium-length lob, no unchanged source hairstyle."
      ].join(" ");
    case "medium":
      return [
        "Mandatory length rule: every recommendation must be clearly MEDIUM length.",
        "Use chin-to-collarbone haircuts such as lob, layered bob or medium shag adapted to the face.",
        "Do not create long hair below the collarbone and do not leave the original hairstyle unchanged."
      ].join(" ");
    case "long":
      return [
        "Mandatory length rule: every recommendation must be clearly LONG.",
        "Keep length below the collarbone with visible restyling, layers, movement, contouring or fringe adapted to the face.",
        "Do not copy the source hairstyle without a visible salon transformation."
      ].join(" ");
    case "any":
    default:
      return [
        "Length choice rule: choose the most flattering length according to the visible face morphology.",
        "Every recommendation still needs a clearly visible haircut transformation, not a copy of the uploaded photo."
      ].join(" ");
  }
};

const openAiMaintenanceConstraint = (maintenance = "") => {
  switch (maintenance) {
    case "low":
      return "Maintenance rule: easy daily upkeep, natural fall, no styling that requires long daily work.";
    case "high":
      return "Maintenance rule: polished salon finish, precise texture and controlled styling are allowed.";
    case "medium":
    default:
      return "Maintenance rule: balanced upkeep, shaped but realistic for regular daily styling.";
  }
};

const openAiLifestyleConstraint = (lifestyle = "") => {
  switch (lifestyle) {
    case "classic":
      return "Style universe: classic, timeless, elegant, natural proportions, no extreme fashion effect.";
    case "bold":
      return "Style universe: signature and expressive but still wearable, believable and age-appropriate.";
    case "modern":
    default:
      return "Style universe: modern salon result, current shape, clean but natural finish.";
  }
};

const openAiMorphologyInstruction = [
  "First visually analyze the face morphology from the uploaded portrait: apparent face length, forehead width, cheekbone width, jawline, chin, neck length and global balance.",
  "Use that morphology to choose volume placement, parting direction, fringe length, side weight and outline.",
  "Adapt only the haircut to the existing face. Never reshape, rebalance, slim or symmetrize the face itself."
].join(" ");

const openAiPortraitPreservationInstruction = [
  "Treat the original uploaded portrait as the photograph to edit, not as inspiration for a new portrait.",
  "Preserving the original face takes priority over salon presentation or beautification. Change only the requested hair and permitted existing facial-hair grooming.",
  "Preserve the exact visible facial proportions, eyes, eyelids, eyebrows, nose, lips, jaw, ears, asymmetries, wrinkles, skin texture and apparent age from the original photo.",
  "Do not smooth skin, retouch the face, rejuvenate, apply makeup, change expression or replace facial details with those of a generic model.",
  "Keep the original clothing, accessories, background, light direction, shadows, exposure and white balance. Do not introduce a studio background or studio relighting.",
  "Age, gender and style selections guide only appropriate hair styling; they never override the appearance visible in the original portrait."
].join(" ");

const openAiNoSourceCopyInstruction = [
  "Do not return the unedited source hairstyle as a recommendation or final result.",
  "Preserve the original photograph outside the hair while visibly changing the haircut to the requested length and silhouette.",
  "A visible hairstyle change must come from the hair alone, never from changing the face, pose, lighting or background."
].join(" ");

const getOpenAiDailyTrialLimit = () =>
  Math.max(1, Number(process.env.OPENAI_DAILY_TRIAL_LIMIT || OPENAI_DAILY_TRIAL_LIMIT || 1));

const getOpenAiQuotaTimeZone = () => process.env.OPENAI_QUOTA_TIME_ZONE || OPENAI_QUOTA_TIME_ZONE;

const getOpenAiExtraTrialUses = () =>
  Math.max(1, Number(process.env.OPENAI_EXTRA_TRIAL_USES || 5));

const normalizeOpenAiTrialCode = (value = "") =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9-]/g, "");

const hashOpenAiTrialCode = (value) =>
  createHash("sha256").update(normalizeOpenAiTrialCode(value)).digest("hex");

const getOpenAiExtraTrialCodeEntries = () => {
  const envCodes = [
    process.env.OPENAI_EXTRA_TRIAL_CODES || "",
    process.env.OPENAI_EXTRA_TRIAL_CODE || ""
  ]
    .join(",")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  return [...DEFAULT_OPENAI_EXTRA_TRIAL_CODE_HASHES, ...envCodes];
};

const getEnvOpenAiExtraTrialCodeMatch = (code) => {
  const normalizedCode = normalizeOpenAiTrialCode(code);
  if (normalizedCode.length < 8) return null;
  const codeHash = hashOpenAiTrialCode(normalizedCode);

  const matched = getOpenAiExtraTrialCodeEntries().some((entry) => {
    const rawEntry = String(entry || "").trim();
    if (!rawEntry) return false;
    if (/^sha256:/i.test(rawEntry)) {
      return rawEntry.slice(7).trim().toLowerCase() === codeHash;
    }
    return normalizeOpenAiTrialCode(rawEntry) === normalizedCode;
  });

  return matched
    ? {
      id: "env-extra",
      codeHash,
      usesAdded: getOpenAiExtraTrialUses(),
      source: "env"
    }
    : null;
};

const resolveOpenAiExtraTrialCode = async (code) => {
  const normalizedCode = normalizeOpenAiTrialCode(code);
  if (normalizedCode.length < 8) return null;
  const codeHash = hashOpenAiTrialCode(normalizedCode);

  const managedCode = await getUserMemory()
    .findActiveTrialPromoCodeByHash(codeHash)
    .catch(() => null);

  if (managedCode) {
    return {
      id: managedCode.id || "trial-extra",
      codeHash,
      usesAdded: Math.max(1, Number(managedCode.usesAdded || 1)),
      source: "admin"
    };
  }

  return getEnvOpenAiExtraTrialCodeMatch(normalizedCode);
};

const getOpenAiQuotaDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: getOpenAiQuotaTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const getOpenAiQuotaResetLabel = () => `demain (${getOpenAiQuotaTimeZone()})`;

const readOpenAiUsage = async () => {
  const date = getOpenAiQuotaDate();
  try {
    const parsed = JSON.parse(await readFile(OPENAI_USAGE_FILE, "utf8"));
    if (parsed?.date === date && parsed?.clients && typeof parsed.clients === "object") return parsed;
  } catch {
    // Missing or invalid quota file: start a clean day bucket.
  }
  return { date, clients: {} };
};

const writeOpenAiUsage = async (usage) => {
  await mkdir(OPENAI_USAGE_DIR, { recursive: true });
  await writeFile(OPENAI_USAGE_FILE, `${JSON.stringify(usage, null, 2)}\n`, "utf8");
};

const clientHashFromRequest = (req, payload = {}) => {
  const clientId = String(payload.clientId || "").slice(0, 160);
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  return createHash("sha256").update(`${clientId}|${userAgent}|${ip}`).digest("hex").slice(0, 32);
};

const authenticatedOwnerFromRequest = async (req, payload = {}) => {
  const token = authTokenFromRequest(req);
  if (!token) return null;
  const session = await getUserMemory().getSessionByToken(token);
  return session?.owner || null;
};

const guestOwnerFromRequest = (req, payload = {}) => ({
  type: "guest",
  id: clientHashFromRequest(req, payload)
});

const ownerFromRequest = async (req, payload = {}) => {
  const authenticatedOwner = await authenticatedOwnerFromRequest(req, payload);
  return authenticatedOwner || guestOwnerFromRequest(req, payload);
};

const requireAuthenticatedUserOwner = async (
  req,
  payload = {},
  message = "Connexion utilisateur requise."
) => {
  const owner = await authenticatedOwnerFromRequest(req, payload);
  if (!owner || owner.type !== "user") {
    throw Object.assign(new Error(message), { status: 401 });
  }
  return owner;
};

const requireAdminOwner = async (req, payload = {}) => {
  const owner = await authenticatedOwnerFromRequest(req, payload);
  if (!owner) {
    throw Object.assign(new Error("Connexion administrateur requise."), { status: 401 });
  }
  if (owner.role !== "admin") {
    throw Object.assign(new Error("Acces administrateur refuse."), { status: 403 });
  }
  return owner;
};

const quotaClientKeyFromOwner = (owner, req, payload = {}) =>
  owner?.type === "user"
    ? `user:${owner.id}`
    : `guest:${clientHashFromRequest(req, payload)}`;

const emptyOpenAiUsageClient = () => ({
  used: 0,
  sessions: {},
  bonusTrials: 0,
  trialCodes: {}
});

const mergeOpenAiUsageIntoUser = async (req, payload = {}, userOwner) => {
  if (!userOwner?.id) return;
  const guestOwner = guestOwnerFromRequest(req, payload);
  const guestKey = quotaClientKeyFromOwner(guestOwner, req, payload);
  const userKey = quotaClientKeyFromOwner(userOwner, req, payload);
  if (guestKey === userKey) return;

  const usage = await readOpenAiUsage();
  const guest = usage.clients?.[guestKey];
  if (!guest) return;
  guest.mergedIntoUsers = guest.mergedIntoUsers || {};
  if (guest.mergedIntoUsers[userOwner.id]) return;

  const target = usage.clients[userKey] || emptyOpenAiUsageClient();
  target.sessions = { ...(target.sessions || {}), ...(guest.sessions || {}) };
  target.trialCodes = target.trialCodes || {};

  let bonusToAdd = Math.max(0, Number(guest.bonusTrials || 0));
  for (const [codeHash, entry] of Object.entries(guest.trialCodes || {})) {
    if (target.trialCodes[codeHash]) {
      bonusToAdd -= Math.max(0, Number(entry?.usesAdded || 0));
    } else {
      target.trialCodes[codeHash] = entry;
    }
  }

  target.used = Math.max(0, Number(target.used || 0)) + Math.max(0, Number(guest.used || 0));
  target.bonusTrials = Math.max(0, Number(target.bonusTrials || 0) + Math.max(0, bonusToAdd));
  guest.mergedIntoUsers[userOwner.id] = new Date().toISOString();
  usage.clients[userKey] = target;
  usage.clients[guestKey] = guest;
  await writeOpenAiUsage(usage);
};

const sourceHashFromImage = (source) =>
  createHash("sha256").update(source.data.slice(0, 16000)).digest("hex").slice(0, 32);

const imageExtensionFromMime = (mimeType = "") => {
  if (/png/i.test(mimeType)) return ".png";
  if (/webp/i.test(mimeType)) return ".webp";
  return ".jpg";
};

const storePrivateOriginalPreview = async ({ source, sessionId, owner = null }) => {
  const raw = Buffer.from(source.data, "base64");
  const outDir = path.join(GENERATED_OPENAI_DIR, sessionId);
  await mkdir(outDir, { recursive: true });

  const sharp = loadSharp();
  if (sharp) {
    try {
      const preview = await sharp(raw)
        .rotate()
        .resize(768, 1152, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      const filename = "original.jpg";
      await writeFile(path.join(outDir, filename), preview);
      const assetUrl = `${GENERATED_OPENAI_ROUTE_PREFIX}${sessionId}/${filename}`;
      await persistImageAsset({ assetPath: assetUrl, buffer: preview, contentType: "image/jpeg", owner });
      return assetUrl;
    } catch {
      // Fallback below keeps the original available even if preview conversion fails.
    }
  }

  const extension = imageExtensionFromMime(source.mimeType);
  const filename = `original${extension}`;
  await writeFile(path.join(outDir, filename), raw);
  const assetUrl = `${GENERATED_OPENAI_ROUTE_PREFIX}${sessionId}/${filename}`;
  await persistImageAsset({ assetPath: assetUrl, buffer: raw, contentType: source.mimeType, owner });
  return assetUrl;
};

const comboFromConsultation = (consultation = {}) => [
  consultation.targetLength || "any",
  consultation.maintenance || "medium",
  consultation.lifestyle || "modern"
].join("-");

const getOpenAiClientQuota = (client = {}) => {
  const baseLimit = getOpenAiDailyTrialLimit();
  const bonus = Math.max(0, Number(client.bonusTrials || 0));
  const limit = baseLimit + bonus;
  const used = Math.max(0, Number(client.used || 0));

  return {
    baseLimit,
    bonus,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetLabel: getOpenAiQuotaResetLabel()
  };
};

const getOpenAiQuotaForPayload = async (req, payload = {}) => {
  const owner = await ownerFromRequest(req, payload);
  return getOpenAiQuotaForOwner(req, payload, owner);
};

const getOpenAiQuotaForOwner = async (req, payload = {}, owner = null) => {
  const usage = await readOpenAiUsage();
  const clientKey = quotaClientKeyFromOwner(owner, req, payload);
  return getOpenAiClientQuota(usage.clients?.[clientKey] || {});
};

const getGuestSessionState = async (req, payload = {}) => {
  const owner = await ownerFromRequest(req, payload);
  if (owner.type === "guest") await getUserMemory().ensureGuest(owner.id);
  const quota = await getOpenAiQuotaForPayload(req, payload);
  const generations = await getUserMemory().listGenerations(owner, { scope: payload.scope || "today" });
  const credits = await getUserMemory().getCreditWallet({ ownerType: owner.type, ownerId: owner.id });

  return {
    owner: {
      type: owner.type,
      id: owner.id,
      email: owner.email,
      status: owner.status || "active",
      role: owner.role
    },
    quota,
    credits,
    generations: await withPrivateGeneratedAssetAccessForOwner(generations, owner),
    storage: getUserMemory().backend
  };
};

const registerUserAccount = async (req, payload = {}) => {
  const guestOwner = guestOwnerFromRequest(req, payload);
  const user = await getUserMemory().createUser({
    email: payload.email,
    password: payload.password
  });
  await getUserMemory().mergeGuestIntoUser(guestOwner.id, user.id);
  const session = await getUserMemory().createSession(user.id);
  await mergeOpenAiUsageIntoUser(req, payload, session.owner);
  const quota = await getOpenAiQuotaForOwner(req, payload, session.owner);
  const generations = await getUserMemory().listGenerations(session.owner, { scope: payload.scope || "today" });
  const credits = await getUserMemory().getCreditWallet({ ownerType: session.owner.type, ownerId: session.owner.id });
  return {
    owner: session.owner,
    token: session.token,
    expiresAt: session.expiresAt,
    quota,
    credits,
    generations: await withPrivateGeneratedAssetAccessForOwner(generations, session.owner),
    storage: getUserMemory().backend
  };
};

const loginUserAccount = async (req, payload = {}) => {
  const user = await getUserMemory().verifyUserPassword({
    email: payload.email,
    password: payload.password
  });
  const session = await getUserMemory().createSession(user.id);
  const guestOwner = guestOwnerFromRequest(req, payload);
  await getUserMemory().mergeGuestIntoUser(guestOwner.id, session.owner.id);
  await mergeOpenAiUsageIntoUser(req, payload, session.owner);
  const quota = await getOpenAiQuotaForOwner(req, payload, session.owner);
  const generations = await getUserMemory().listGenerations(session.owner, { scope: payload.scope || "today" });
  const credits = await getUserMemory().getCreditWallet({ ownerType: session.owner.type, ownerId: session.owner.id });
  return {
    owner: session.owner,
    token: session.token,
    expiresAt: session.expiresAt,
    quota,
    credits,
    generations: await withPrivateGeneratedAssetAccessForOwner(generations, session.owner),
    storage: getUserMemory().backend
  };
};

const logoutUserAccount = async (req, payload = {}) => {
  await getUserMemory().deleteSession(authTokenFromRequest(req));
  return getGuestSessionState(req, payload);
};

const activateOpenAiExtraTrialCode = async (req, payload = {}) => {
  const normalizedCode = normalizeOpenAiTrialCode(payload.code);
  const trialCode = await resolveOpenAiExtraTrialCode(normalizedCode);
  if (!trialCode) {
    throw Object.assign(new Error("Code bonus invalide. Verifiez le code puis reessayez."), { status: 401 });
  }

  const usage = await readOpenAiUsage();
  const owner = await ownerFromRequest(req, payload);
  const clientKey = quotaClientKeyFromOwner(owner, req, payload);
  const client = usage.clients[clientKey] || { used: 0, sessions: {}, bonusTrials: 0, trialCodes: {} };
  const codeHash = trialCode.codeHash;
  const usesAdded = Math.max(1, Number(trialCode.usesAdded || getOpenAiExtraTrialUses()));
  client.sessions = client.sessions || {};
  client.trialCodes = client.trialCodes || {};
  const alreadyActivatedToday = Boolean(client.trialCodes[codeHash]);
  let alreadyActivated = alreadyActivatedToday;

  if (trialCode.source === "admin") {
    const redemption = await getUserMemory().redeemTrialPromoCodeForOwner({
      codeHash,
      ownerType: owner.type,
      ownerId: owner.id
    });
    if (!redemption?.trialCode) {
      throw Object.assign(new Error("Code bonus invalide. Verifiez le code puis reessayez."), { status: 401 });
    }
    alreadyActivated = alreadyActivatedToday || Boolean(redemption.alreadyRedeemed);
  }

  if (!alreadyActivated) {
    client.bonusTrials = Math.max(0, Number(client.bonusTrials || 0)) + usesAdded;
    client.trialCodes[codeHash] = {
      activatedAt: new Date().toISOString(),
      usesAdded,
      source: trialCode.source || "env",
      codeId: trialCode.id || ""
    };
    usage.clients[clientKey] = client;
    await writeOpenAiUsage(usage);
  }

  const quota = getOpenAiClientQuota(client);

  return {
    quota,
    usesAdded,
    alreadyActivated,
    message: alreadyActivated
      ? `Code deja active pour aujourd'hui. Vous avez ${quota.remaining} essai(s) restant(s).`
      : `Code active: ${usesAdded} essais supplementaires ajoutes pour aujourd'hui.`
  };
};

const openAiCreditReason = (reason, sessionId) =>
  `${reason}: OpenAI photo personnelle ${sessionId}`.slice(0, 240);

const refundOpenAiCreditDebit = async ({ owner, sessionId }) => {
  try {
    await getUserMemory().adjustCreditsForAdmin({
      ownerType: owner.type,
      ownerId: owner.id,
      amount: 1,
      reason: openAiCreditReason("refund", sessionId)
    });
  } catch (error) {
    console.error("Remboursement credit OpenAI impossible:", error?.message || error);
  }
};

const releaseOpenAiReservation = async (reservation) => {
  if (!reservation?.sessionId) return;

  const client = reservation.usage?.clients?.[reservation.clientKey];
  if (client?.sessions?.[reservation.sessionId]) {
    delete client.sessions[reservation.sessionId];
    if (reservation.countedInDailyTrial) {
      client.used = Math.max(0, Number(client.used || 0) - 1);
    }
    try {
      await writeOpenAiUsage(reservation.usage);
    } catch (error) {
      console.error("Liberation quota OpenAI impossible:", error?.message || error);
    }
  }

  if (reservation.creditDebited) {
    await refundOpenAiCreditDebit({
      owner: reservation.owner,
      sessionId: reservation.sessionId
    });
  }
};

const reserveOpenAiDailyTrial = async ({ req, payload, sourceHash, combo, owner: providedOwner = null }) => {
  const usage = await readOpenAiUsage();
  const owner = providedOwner || await ownerFromRequest(req, payload);
  const clientKey = quotaClientKeyFromOwner(owner, req, payload);
  const client = usage.clients[clientKey] || { used: 0, sessions: {}, bonusTrials: 0, trialCodes: {} };
  const beforeQuota = getOpenAiClientQuota(client);
  const sessionId = `${Date.now().toString(36)}-${createHash("sha1").update(`${clientKey}-${sourceHash}-${combo}`).digest("hex").slice(0, 10)}`;
  let creditDebit = null;
  let quotaSource = "daily_trial";
  let countedInDailyTrial = false;

  if (beforeQuota.remaining <= 0) {
    const wallet = await getUserMemory().getCreditWallet({ ownerType: owner.type, ownerId: owner.id });
    if (Number(wallet.balance || 0) <= 0) {
      throw Object.assign(new Error(`Votre essai photo du jour est deja utilise. Revenez ${getOpenAiQuotaResetLabel()}, ajoutez un credit ou utilisez un profil exemple.`), {
        status: 429,
        allowCodeActivation: true,
        quota: beforeQuota
      });
    }

    creditDebit = await getUserMemory().adjustCreditsForAdmin({
      ownerType: owner.type,
      ownerId: owner.id,
      amount: -1,
      reason: openAiCreditReason("generation_debit", sessionId)
    });
    quotaSource = "credit_wallet";
  } else {
    client.used = (client.used || 0) + 1;
    countedInDailyTrial = true;
  }

  client.sessions = client.sessions || {};
  client.sessions[sessionId] = {
    sourceHash,
    combo,
    finalRemaining: true,
    quotaSource,
    countedInDailyTrial,
    creditDebited: Boolean(creditDebit),
    creditLedgerEntryId: creditDebit?.entry?.id || "",
    createdAt: new Date().toISOString()
  };
  usage.clients[clientKey] = client;
  try {
    await writeOpenAiUsage(usage);
  } catch (error) {
    if (creditDebit) {
      await refundOpenAiCreditDebit({ owner, sessionId });
    }
    throw error;
  }

  return {
    sessionId,
    quota: getOpenAiClientQuota(client),
    usage,
    clientKey,
    owner,
    countedInDailyTrial,
    creditDebited: Boolean(creditDebit),
    quotaSource
  };
};

const privateOpenAiAssetPathFromValues = (...values) =>
  values
    .map(value => normalizeGeneratedOpenAiAssetPath(value))
    .find(Boolean) || "";

const recommendationPreviewAssetPath = (recommendation = {}) =>
  privateOpenAiAssetPathFromValues(
    recommendation.assetPreviewUrl,
    recommendation.previewUrl,
    recommendation.imageUrl
  );

const isOpenAiRecommendationHistoryItem = (item = {}) =>
  Boolean(
    item &&
    (item.status === "recommendations_ready" || Array.isArray(item.recommendations)) &&
    Array.isArray(item.recommendations) &&
    item.recommendations.some(recommendation => recommendationPreviewAssetPath(recommendation)) &&
    privateOpenAiAssetPathFromValues(item.originalImageUrl)
  );

const selectedReferenceAssetPathFromPayload = (payload = {}, style = {}) =>
  privateOpenAiAssetPathFromValues(
    payload.selectedReferenceAssetUrl,
    style.selectedReferenceAssetUrl,
    style.assetPreviewUrl,
    style.previewUrl,
    style.resultImageUrl
  );

const findOpenAiHistoryItemForSession = async (owner, sessionId) => {
  if (!sessionId) return null;
  const generations = await getUserMemory().listGenerations(owner, { scope: "all", limit: 240 });
  return generations.find(item => (item.personalGenerationId || item.id) === sessionId) || null;
};

const canResumeOpenAiFinalFromHistory = async ({ owner, sessionId, combo, sourceAssetUrl }) => {
  if (!sessionId || !sourceAssetUrl) return false;
  const sourceAssetPath = stripGeneratedOpenAiAssetAccess(sourceAssetUrl);
  if (!sourceAssetPath) return false;

  try {
    const historyItem = await findOpenAiHistoryItemForSession(owner, sessionId);
    if (!isOpenAiRecommendationHistoryItem(historyItem)) return false;
    if (comboFromConsultation(historyItem.consultation || {}) !== combo) return false;

    const originalAssetPath = stripGeneratedOpenAiAssetAccess(historyItem.originalImageUrl || "");
    return Boolean(originalAssetPath && originalAssetPath === sourceAssetPath);
  } catch {
    return false;
  }
};

const assertOpenAiSelectedRecommendationReference = async ({ owner, sessionId, combo, selectedReferenceAssetPath, styleId }) => {
  if (!selectedReferenceAssetPath) {
    throw Object.assign(new Error("Image de la proposition selectionnee manquante. Reprenez les recommandations depuis votre fiche resultat puis reessayez."), { status: 400 });
  }

  const historyItem = await findOpenAiHistoryItemForSession(owner, sessionId);
  if (!isOpenAiRecommendationHistoryItem(historyItem)) {
    throw Object.assign(new Error("Recommandations sauvegardees introuvables pour cette finale."), { status: 403 });
  }
  if (comboFromConsultation(historyItem.consultation || {}) !== combo) {
    throw Object.assign(new Error("Les reglages ne correspondent plus aux recommandations initiales."), { status: 403 });
  }

  const recommendations = Array.isArray(historyItem.recommendations) ? historyItem.recommendations : [];
  const matchingRecommendation = recommendations.find(recommendation =>
    recommendationPreviewAssetPath(recommendation) === selectedReferenceAssetPath
  );
  if (!matchingRecommendation) {
    throw Object.assign(new Error("La proposition selectionnee ne correspond pas aux 4 images sauvegardees des recommandations."), { status: 403 });
  }

  const normalizedStyleId = String(styleId || "").trim();
  const recommendationId = String(matchingRecommendation.id || "").trim();
  if (normalizedStyleId && normalizedStyleId !== "style" && recommendationId && normalizedStyleId !== recommendationId) {
    throw Object.assign(new Error("La proposition selectionnee ne correspond pas au style sauvegarde des recommandations."), { status: 403 });
  }

  return {
    historyItem,
    matchingRecommendation,
    selectedReferenceAssetPath
  };
};

const reserveOpenAiAdditionalFinalCredit = async ({ owner, sessionId }) => {
  const wallet = await getUserMemory().getCreditWallet({ ownerType: owner.type, ownerId: owner.id });
  if (Number(wallet.balance || 0) <= 0) {
    throw Object.assign(new Error("Cette serie a deja produit sa finale incluse. Ajoutez un credit pour generer une autre finale depuis ces recommandations."), {
      status: 429
    });
  }

  const creditDebit = await getUserMemory().adjustCreditsForAdmin({
    ownerType: owner.type,
    ownerId: owner.id,
    amount: -1,
    reason: openAiCreditReason("finale_supplementaire_debit", sessionId)
  });

  return {
    owner,
    sessionId,
    creditDebited: true,
    creditLedgerEntryId: creditDebit?.entry?.id || ""
  };
};

const releaseOpenAiAdditionalFinalReservation = async (reservation) => {
  if (!reservation?.creditDebited) return;
  await refundOpenAiCreditDebit({
    owner: reservation.owner,
    sessionId: reservation.sessionId
  });
};

const getOpenAiFinalSession = async ({ req, payload, sourceHash, combo, owner: providedOwner = null }) => {
  const usage = await readOpenAiUsage();
  const owner = providedOwner || await ownerFromRequest(req, payload);
  const clientKey = quotaClientKeyFromOwner(owner, req, payload);
  const sessionId = String(payload.generationSessionId || "").trim();
  const client = usage.clients[clientKey];
  const session = client?.sessions?.[sessionId];
  const historyResumeAllowed = payload.resumeFromHistory
    ? await canResumeOpenAiFinalFromHistory({
      owner,
      sessionId,
      combo,
      sourceAssetUrl: payload.sourceAssetUrl
    })
    : false;

  if (!sessionId || (!session && !historyResumeAllowed)) {
    throw Object.assign(new Error("Session de generation introuvable. Relancez un essai demain ou choisissez un profil exemple."), { status: 403 });
  }
  if (!session && historyResumeAllowed) {
    const extraFinalReservation = await reserveOpenAiAdditionalFinalCredit({ owner, sessionId });
    return { usage, clientKey, sessionId, session: null, extraFinalReservation };
  }
  if (session.sourceHash !== sourceHash || session.combo !== combo) {
    if (!historyResumeAllowed) {
      throw Object.assign(new Error("La photo ou les reglages ne correspondent plus a la session initiale."), { status: 403 });
    }
  }
  if (!session.finalRemaining) {
    if (!historyResumeAllowed) {
      throw Object.assign(new Error("Le resultat final de cet essai a deja ete genere."), { status: 429 });
    }
    const extraFinalReservation = await reserveOpenAiAdditionalFinalCredit({ owner, sessionId });
    return { usage, clientKey, sessionId, session, extraFinalReservation };
  }

  return { usage, clientKey, sessionId, session };
};

const markOpenAiFinalSessionUsed = async ({ usage, clientKey, sessionId }) => {
  const session = usage.clients?.[clientKey]?.sessions?.[sessionId];
  if (session) {
    session.finalRemaining = false;
    session.finalCount = Math.max(0, Number(session.finalCount || 0)) + 1;
    session.finalGeneratedAt = session.finalGeneratedAt || new Date().toISOString();
    session.lastFinalGeneratedAt = new Date().toISOString();
    await writeOpenAiUsage(usage);
  }
};

const alibabaVariantPlans = {
  primary: "proposition principale naturelle, tres portable, equilibre morphologique prioritaire",
  soft: "proposition douce, mouvement naturel, volume leger, entretien realiste",
  structured: "proposition structuree, lignes plus nettes, silhouette differente de la proposition douce",
  signature: "proposition signature plus distinctive, toujours realiste et adaptee a l'age"
};

const alibabaVariantLabels = {
  primary: "Equilibre naturel",
  soft: "Doux morphologie",
  structured: "Structure nette",
  signature: "Signature controlee"
};

const getAlibabaApiKey = () =>
  process.env.Alibaba_API_KEY ||
  process.env.ALIBABA_API_KEY ||
  process.env.DASHSCOPE_API_KEY ||
  "";

const alibabaEndpointsFor = (asyncMode = false) => {
  const suffix = asyncMode
    ? "/api/v1/services/aigc/image-generation/generation"
    : "/api/v1/services/aigc/multimodal-generation/generation";
  const bases = [
    process.env.Alibaba_API_ENDPOINT,
    process.env.ALIBABA_API_ENDPOINT,
    process.env.DASHSCOPE_ENDPOINT,
    process.env.QWEN_IMAGE_ENDPOINT,
    "https://dashscope-intl.aliyuncs.com",
    "https://dashscope.aliyuncs.com"
  ].filter(Boolean);

  return [...new Set(bases.map((base) => base.endsWith("/generation") ? base : `${base.replace(/\/$/, "")}${suffix}`))];
};

const alibabaImageFromResponse = (json) => {
  const choiceContent = json?.output?.choices?.[0]?.message?.content || [];
  for (const item of choiceContent) {
    if (item?.image) return item.image;
    if (item?.image_url) return item.image_url;
  }

  const result = json?.output?.results?.[0];
  if (result?.url) return result.url;
  if (result?.image) return result.image;
  if (result?.image_url) return result.image_url;

  const data = json?.data?.[0];
  if (data?.url) return data.url;
  if (data?.b64_json) return `data:image/png;base64,${data.b64_json}`;

  return "";
};

const alibabaErrorText = (payload) => {
  if (!payload) return "empty response";
  if (typeof payload === "string") return payload.slice(0, 800);
  return JSON.stringify({
    code: payload.code,
    message: payload.message,
    request_id: payload.request_id,
    output: payload.output
  }).slice(0, 1200);
};

const friendlyAlibabaError = (payload, fallbackStatus) => {
  const code = typeof payload === "object" ? payload?.code : "";
  if (code === "AllocationQuota.FreeTierOnly") {
    return {
      status: 429,
      message: "Le quota gratuit du service image est epuise. Pour continuer, il faut attendre le renouvellement du quota ou verifier la configuration du compte."
    };
  }
  if (code === "InvalidApiKey") {
    return {
      status: 401,
      message: "La cle du service image n'est pas acceptee. Verifiez la configuration cote serveur."
    };
  }
  if (fallbackStatus === 429) {
    return {
      status: 429,
      message: "Le service image refuse la generation pour une limite de quota ou de debit. Reessayez plus tard."
    };
  }
  return {
    status: fallbackStatus || 502,
    message: `Service image indisponible: ${alibabaErrorText(payload)}`
  };
};

const postAlibabaJson = async (endpoint, apiKey, body, asyncMode = false) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(asyncMode ? { "X-DashScope-Async": "enable" } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const friendly = friendlyAlibabaError(payload, response.status);
    const error = new Error(friendly.message);
    error.status = friendly.status;
    error.payload = payload;
    error.providerMessage = alibabaErrorText(payload);
    throw error;
  }

  return payload;
};

const pollAlibabaTask = async (endpoint, apiKey, taskId) => {
  const base = endpoint.replace(/\/api\/v1\/services\/aigc\/.*$/, "");
  const taskUrl = `${base}/api/v1/tasks/${taskId}`;
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(5000);
    const response = await fetch(taskUrl, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const json = await response.json().catch(() => ({}));
    const status = json?.output?.task_status || json?.task_status;
    if (status === "SUCCEEDED") return json;
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(status)) {
      throw Object.assign(new Error(`Generation distante ${status}: ${alibabaErrorText(json)}`), { status: 502 });
    }
  }
  throw Object.assign(new Error("Timeout du service image pendant la generation."), { status: 504 });
};

const callAlibabaImage = async ({ body }) => {
  const apiKey = getAlibabaApiKey();
  if (isPlaceholderEnvValue(apiKey)) {
    throw Object.assign(new Error("Cle du service image manquante cote serveur."), { status: 503 });
  }

  const errors = [];
  for (const endpoint of alibabaEndpointsFor(false)) {
    try {
      return await postAlibabaJson(endpoint, apiKey, body, false);
    } catch (error) {
      errors.push(error);
    }
  }

  for (const endpoint of alibabaEndpointsFor(true)) {
    try {
      const submitted = await postAlibabaJson(endpoint, apiKey, body, true);
      const taskId = submitted?.output?.task_id || submitted?.task_id;
      if (!taskId) throw Object.assign(new Error(`Service image: aucune tache retournee.`), { status: 502 });
      return await pollAlibabaTask(endpoint, apiKey, taskId);
    } catch (error) {
      errors.push(error);
    }
  }

  const firstQuota = errors.find((error) => error.status === 429);
  if (firstQuota) throw firstQuota;
  const last = errors[errors.length - 1];
  throw Object.assign(new Error(last?.message || "Service image indisponible."), { status: last?.status || 502 });
};

const downloadAlibabaImageBuffer = async (image) => {
  if (image.startsWith("data:image/")) {
    const [, base64] = image.split(",", 2);
    return Buffer.from(base64, "base64");
  }

  const response = await fetch(image);
  if (!response.ok) {
    throw Object.assign(new Error(`Telechargement image impossible: HTTP ${response.status}`), { status: 502 });
  }
  return Buffer.from(await response.arrayBuffer());
};

const buildAlibabaUploadPrompt = ({ consultation = {}, variant }) => {
  const length = consultationLabels.length[consultation.targetLength] || "longueur adaptee";
  const maintenance = consultationLabels.maintenance[consultation.maintenance] || "entretien adapte";
  const lifestyle = consultationLabels.lifestyle[consultation.lifestyle] || "style adapte";
  const gender = consultationLabels.gender[consultation.gender] || "personne";
  const age = consultationLabels.age[consultation.ageGroup] || "adulte";
  const isYoung = ["baby", "child", "teen"].includes(consultation.ageGroup);
  const facialHairInstruction = consultation.gender === "male" && !isYoung
    ? "If facial hair exists in the source, adapt beard/moustache grooming naturally to the selected hairstyle. Do not add facial hair if the source has none."
    : "Do not add facial hair.";

  return [
    "Create one single high-resolution photorealistic studio contact sheet image, portrait orientation, 2 columns by 2 rows.",
    "Use the uploaded image as identity reference. Preserve the same person, age, face structure, skin tone, expression and believable morphology.",
    `User context: ${age} ${gender}. Exact selection: ${length}, ${maintenance}, univers ${lifestyle}.`,
    `Variant to generate: ${variant} - ${alibabaVariantPlans[variant]}.`,
    "The recommendation must be based on face morphology, not fashion alone. Respect the age group and avoid adult styling for children.",
    facialHairInstruction,
    "",
    "Grid structure:",
    "Top-left = front view portrait.",
    "Top-right = true left-side profile photo: almost pure side profile, one ear fully visible, eye mostly in profile, lower shoulder visible.",
    "Bottom-left = true right-side three-quarter profile photo: opposite direction but turned slightly back toward camera, one eye partly visible, different ear visibility, higher opposite shoulder, different hair fall.",
    "Bottom-right = back view focused on haircut shape and neckline.",
    "",
    "Quality requirements:",
    "Use the same haircut recommendation consistently in all four views.",
    "Keep realistic skin texture, individual hair strands, natural studio light and clean neutral gray background.",
    "Left and right profiles must not be mirrored duplicates. After horizontal flip they must still look different.",
    "No text, no labels, no watermark, no logo, no outer white border.",
    "Use thin internal light dividers only between cells so the 4 cells can be sliced cleanly.",
    "Fill the full image with the grid, no margins around the outside."
  ].join("\n");
};

const buildAlibabaRequestBody = ({ imageDataUrl, prompt }) => ({
  model: process.env.ALIBABA_IMAGE_MODEL || process.env.QWEN_IMAGE_MODEL || "qwen-image-3.0",
  input: {
    messages: [
      {
        role: "user",
        content: [
          { image: imageDataUrl },
          { text: prompt }
        ]
      }
    ]
  },
  parameters: {
    prompt_extend: true,
    prompt_extend_mode: "direct",
    enable_thinking: true,
    n: 1,
    size: process.env.ALIBABA_UPLOAD_SIZE || "1360*2040",
    watermark: false,
    negative_prompt: [
      "cartoon",
      "illustration",
      "painting",
      "plastic skin",
      "beauty filter",
      "changed identity",
      "different person",
      "text",
      "label",
      "logo",
      "watermark",
      "white outside border",
      "mirrored left and right profiles",
      "same side photo flipped",
      "duplicate views",
      "landscape sheet"
    ].join(", ")
  }
});

const cropAlibabaVariantViews = async ({ sheetBuffer, sessionId, combo, variant }) => {
  const sharp = loadSharp();
  if (!sharp) {
    throw Object.assign(new Error("Outil de decoupage indisponible pour preparer la planche."), { status: 503 });
  }

  const metadata = await sharp(sheetBuffer).metadata();
  const width = metadata.width || 1360;
  const height = metadata.height || 2040;
  const midX = Math.round(width / 2);
  const midY = Math.round(height / 2);
  const inset = Math.max(6, Math.round(Math.min(width, height) * 0.006));
  const views = {
    front: { left: inset, top: inset, width: midX - inset * 2, height: midY - inset * 2 },
    left: { left: midX + inset, top: inset, width: width - midX - inset * 2, height: midY - inset * 2 },
    right: { left: inset, top: midY + inset, width: midX - inset * 2, height: height - midY - inset * 2 },
    back: { left: midX + inset, top: midY + inset, width: width - midX - inset * 2, height: height - midY - inset * 2 }
  };

  const outDir = path.join(GENERATED_ALIBABA_DIR, sessionId);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${combo}-${variant}-sheet.png`), sheetBuffer);

  const urls = {};
  for (const [view, box] of Object.entries(views)) {
    const buffer = await sharp(sheetBuffer)
      .extract(box)
      .resize(768, 1152, { fit: "cover", position: "center" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const filename = `${combo}-${variant}-${view}.jpg`;
    await writeFile(path.join(outDir, filename), buffer);
    urls[view] = `/generated-alibaba/${sessionId}/${filename}`;
  }

  return urls;
};

const buildAlibabaStyle = ({ consultation, variant, urls }) => {
  const length = consultationLabels.length[consultation.targetLength] || "adapte";
  const lifestyle = consultationLabels.lifestyle[consultation.lifestyle] || "personnalise";
  const maintenance = consultationLabels.maintenance[consultation.maintenance] || "entretien adapte";
  const canBeard = consultation.gender === "male" && !["baby", "child", "teen"].includes(consultation.ageGroup);
  const morphologyAdvice = {
    primary: "Equilibre les proportions avec une coupe portable et un volume bien place.",
    soft: "Adoucit les contours avec une ligne souple et un mouvement naturel.",
    structured: "Dessine plus nettement la silhouette du visage et donne une tenue plus precise.",
    signature: "Affirme le style tout en gardant une forme adaptee a la morphologie visible."
  }[variant] || "Adapte la coupe a la morphologie visible du visage.";

  return {
    id: `alibaba-upload-${consultation.targetLength}-${consultation.maintenance}-${consultation.lifestyle}-${variant}`,
    name: `${lengthLabelsFr(consultation.targetLength)} ${lifestyle} ${alibabaVariantLabels[variant]}`,
    description: `Recommandation ${length}, ${maintenance}, univers ${lifestyle}, pensee pour l'equilibre du visage.`,
    color: consultation.gender === "female" ? "Naturel lumineux" : "Naturel",
    beardStyle: canBeard ? "Toilettage barbe adapte" : "Aucune",
    whyItWorks: `${morphologyAdvice} Le choix ${length}, ${maintenance} et l'univers ${lifestyle} gardent la coupe coherente au quotidien.`,
    faceShape: "morphologie personnalisee",
    previewUrl: urls.front,
    resultImageUrl: urls.front,
    additionalViews: {
      left: urls.left,
      right: urls.right,
      back: urls.back
    },
    isPreparedAsset: true
  };
};

const lengthLabelsFr = (length) => ({
  short: "Court",
  medium: "Mi-long",
  long: "Long",
  any: "Libre"
}[length] || "Style");

const generateAlibabaUploadRecommendations = async (payload) => {
  const source = imageDataUrlFromPayload(payload);
  const consultation = payload.consultation || {};
  const combo = [
    consultation.targetLength || "any",
    consultation.maintenance || "medium",
    consultation.lifestyle || "modern"
  ].join("-");
  const sessionId = `${Date.now().toString(36)}-${createHash("sha1").update(source.data.slice(0, 4000)).digest("hex").slice(0, 10)}`;
  const variants = ["primary", "soft", "structured", "signature"];
  const styles = [];
  let warning = "";

  for (const variant of variants) {
    try {
      const prompt = buildAlibabaUploadPrompt({ consultation, variant });
      const body = buildAlibabaRequestBody({ imageDataUrl: source.dataUrl, prompt });
      const result = await callAlibabaImage({ body });
      const generatedImage = alibabaImageFromResponse(result);
      if (!generatedImage) throw Object.assign(new Error("Le service image n'a pas retourne d'image."), { status: 502 });
      const sheetBuffer = await downloadAlibabaImageBuffer(generatedImage);
      const urls = await cropAlibabaVariantViews({ sheetBuffer, sessionId, combo, variant });
      styles.push(buildAlibabaStyle({ consultation, variant, urls }));
    } catch (error) {
      warning = error.message || "Generation interrompue.";
      if (!styles.length) throw error;
      break;
    }
  }

  return {
    faceShape: "morphologie personnalisee",
    hairTexture: "Texture detectee depuis la photo chargee",
    skinTone: "Teint preserve depuis la photo chargee",
    detectedGender: consultation.gender || "non-binary",
    professionalAdvice: buildProfessionalMorphologyAdvice(consultation, warning),
    recommendedStyles: styles,
    partial: Boolean(warning)
  };
};

const getOpenAiApiKey = () =>
  process.env.OPENAI_API_KEY ||
  process.env.OpenAI_API_KEY ||
  "";

const openAiErrorText = (payload) => {
  if (!payload) return "empty response";
  if (typeof payload === "string") return payload.slice(0, 800);
  return JSON.stringify({
    error: payload.error,
    status: payload.status,
    message: payload.message
  }).slice(0, 1200);
};

const friendlyOpenAiError = (payload, fallbackStatus) => {
  const code = payload?.error?.code || payload?.code || "";
  const type = payload?.error?.type || "";
  const raw = `${code} ${type} ${openAiErrorText(payload)}`;
  if (fallbackStatus === 401 || code === "invalid_api_key") {
    return {
      status: 401,
      message: "La cle du service image n'est pas acceptee. Verifiez la configuration cote serveur."
    };
  }
  if (fallbackStatus === 429 || /quota|rate/i.test(`${code} ${type}`)) {
    return {
      status: 429,
      message: "Le service image refuse la generation pour une limite de quota ou de debit. Reessayez plus tard."
    };
  }
  if (
    fallbackStatus === 400 ||
    /invalid_image|unsupported_image|image_file|failed_to_process|content_policy|safety|moderation/i.test(raw)
  ) {
    return {
      status: fallbackStatus || 400,
      message: "Cette photo n'a pas pu etre traitee. Essayez un portrait net JPG ou PNG, avec une seule personne bien visible."
    };
  }
  return {
    status: fallbackStatus || 502,
    message: `Service image indisponible: ${openAiErrorText(payload)}`
  };
};

const imageExtensionForMime = (mimeType = "") =>
  mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

const normalizeOpenAiInputMimeType = (mimeType = "") => {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/webp"].includes(normalized)) return normalized;
  return "";
};

const prepareOpenAiSourceImage = async (source = {}) => {
  const raw = Buffer.from(source.data || "", "base64");
  if (!raw.length) {
    throw Object.assign(new Error("Photo chargee vide ou illisible."), { status: 400 });
  }

  const acceptedMime = normalizeOpenAiInputMimeType(source.mimeType);
  const maxDirectBytes = Number(process.env.OPENAI_SOURCE_MAX_BYTES || 8 * 1024 * 1024);
  if (acceptedMime && raw.length <= maxDirectBytes) {
    return {
      buffer: raw,
      mimeType: acceptedMime,
      extension: imageExtensionForMime(acceptedMime)
    };
  }

  const sharp = loadSharp();
  if (!sharp) {
    if (acceptedMime) {
      return {
        buffer: raw,
        mimeType: acceptedMime,
        extension: imageExtensionForMime(acceptedMime)
      };
    }
    throw Object.assign(
      new Error("Cette photo doit etre au format JPG, PNG ou WebP pour etre traitee."),
      { status: 400 }
    );
  }

  try {
    const converted = await sharp(raw)
      .rotate()
      .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    return {
      buffer: converted,
      mimeType: "image/jpeg",
      extension: "jpg"
    };
  } catch {
    throw Object.assign(
      new Error("Cette photo n'a pas pu etre preparee. Essayez un portrait JPG ou PNG plus net."),
      { status: 400 }
    );
  }
};

const appendOpenAiImageFormField = async (form, source, filenamePrefix = "source", fieldName = "image") => {
  const preparedSource = await prepareOpenAiSourceImage(source);
  form.append(
    fieldName,
    new Blob([preparedSource.buffer], { type: preparedSource.mimeType }),
    `${filenamePrefix}.${preparedSource.extension}`
  );
};

const buildOpenAiImageForm = async ({ source, prompt, size, referenceImages = [] }) => {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "medium";
  const outputFormat = process.env.OPENAI_IMAGE_OUTPUT_FORMAT || "png";
  const form = new FormData();
  const imageFieldName = referenceImages.length ? "image[]" : "image";

  form.append("model", model);
  await appendOpenAiImageFormField(form, source, "source", imageFieldName);
  for (const [index, reference] of referenceImages.entries()) {
    await appendOpenAiImageFormField(
      form,
      reference.source || reference,
      reference.filenamePrefix || `reference-${index + 1}`,
      imageFieldName
    );
  }
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", "1");
  form.append("quality", quality);
  form.append("output_format", outputFormat);

  return form;
};

const callOpenAiImageEdit = async ({ source, prompt, size, referenceImages = [] }) => {
  const apiKey = getOpenAiApiKey();
  if (isPlaceholderEnvValue(apiKey)) {
    throw Object.assign(new Error("Cle du service image manquante cote serveur."), { status: 503 });
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: await buildOpenAiImageForm({ source, prompt, size, referenceImages })
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const friendly = friendlyOpenAiError(payload, response.status);
    const error = new Error(friendly.message);
    error.status = friendly.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const openAiImageFromResponse = (json) => {
  const data = json?.data?.[0];
  if (data?.b64_json) return `data:image/png;base64,${data.b64_json}`;
  if (data?.url) return data.url;
  if (data?.image) return data.image;
  return "";
};

const downloadOpenAiImageBuffer = async (image) => {
  if (image.startsWith("data:image/")) {
    const [, base64] = image.split(",", 2);
    return Buffer.from(base64, "base64");
  }

  const response = await fetch(image);
  if (!response.ok) {
    throw Object.assign(new Error(`Telechargement image impossible: HTTP ${response.status}`), { status: 502 });
  }
  return Buffer.from(await response.arrayBuffer());
};

const buildOpenAiRecommendationPrompt = ({ consultation = {} }) => {
  const length = consultationLabels.length[consultation.targetLength] || "longueur adaptee";
  const maintenance = consultationLabels.maintenance[consultation.maintenance] || "entretien adapte";
  const lifestyle = consultationLabels.lifestyle[consultation.lifestyle] || "style adapte";
  const gender = consultationLabels.gender[consultation.gender] || "personne";
  const age = consultationLabels.age[consultation.ageGroup] || "adulte";
  const lengthConstraint = openAiLengthConstraint(consultation.targetLength);
  const maintenanceConstraint = openAiMaintenanceConstraint(consultation.maintenance);
  const lifestyleConstraint = openAiLifestyleConstraint(consultation.lifestyle);
  const isYoung = ["baby", "child", "teen"].includes(consultation.ageGroup);
  const facialHairInstruction = consultation.gender === "male" && !isYoung
    ? "If facial hair exists in the source, adapt beard/moustache grooming naturally. Do not add facial hair if the source has none."
    : "Do not add facial hair.";

  return [
    "Create one single photorealistic hairstyle comparison sheet in portrait orientation, exactly 2 columns by 2 rows, four images total.",
    openAiPortraitPreservationInstruction,
    openAiMorphologyInstruction,
    openAiNoSourceCopyInstruction,
    `User context: ${age} ${gender}. Exact selection: ${length}, ${maintenance}, univers ${lifestyle}.`,
    lengthConstraint,
    maintenanceConstraint,
    lifestyleConstraint,
    "The requested length is not optional. If the source hairstyle conflicts with the requested length, override the source hairstyle and cut/restyle it visibly.",
    "The four cells are four clearly different haircut recommendations based on face morphology and the selected criteria.",
    `Top-left = ${openAiVariantPlans.primary}.`,
    `Top-right = ${openAiVariantPlans.soft}.`,
    `Bottom-left = ${openAiVariantPlans.structured}.`,
    `Bottom-right = ${openAiVariantPlans.signature}.`,
    "In all four cells, keep the source portrait's exact head tilt, camera angle, perspective, expression and framing. Do not straighten or rotate the head into a passport-photo pose.",
    "Show only the source camera view with a different haircut in each cell. Do not generate side or back views at this recommendation stage.",
    "Keep the whole hairstyle visible, with matching framing and scale in all four cells. Preserve natural hair color including gray strands.",
    "Respect the age group; never use adult styling on children.",
    facialHairInstruction,
    "No text, no labels, no watermark, no logo, no outer white border.",
    "Use only thin internal dividers and fill the entire image with the grid."
  ].join("\n");
};

const buildOpenAiFinalPrompt = ({ consultation = {}, style = {}, hasSelectedReference = false }) => {
  const length = consultationLabels.length[consultation.targetLength] || "longueur adaptee";
  const maintenance = consultationLabels.maintenance[consultation.maintenance] || "entretien adapte";
  const lifestyle = consultationLabels.lifestyle[consultation.lifestyle] || "style adapte";
  const gender = consultationLabels.gender[consultation.gender] || "personne";
  const age = consultationLabels.age[consultation.ageGroup] || "adulte";
  const normalizedStyle = normalizeStyle(style);
  const lengthConstraint = openAiLengthConstraint(consultation.targetLength);
  const maintenanceConstraint = openAiMaintenanceConstraint(consultation.maintenance);
  const lifestyleConstraint = openAiLifestyleConstraint(consultation.lifestyle);
  const isYoung = ["baby", "child", "teen"].includes(consultation.ageGroup);
  const facialHairInstruction = normalizedStyle.beardStyle && !/aucune|n\/a|none/i.test(normalizedStyle.beardStyle) && !isYoung
    ? `Adapt facial hair naturally only if it already exists. Target facial hair: ${normalizedStyle.beardStyle}.`
    : "Do not add facial hair.";

  return [
    "Create one single photorealistic hairstyle result sheet in portrait orientation, exactly 2 columns by 2 rows.",
    "Input image 1 is the user's original portrait and is the sole authority for the person's face and photographic appearance.",
    openAiPortraitPreservationInstruction,
    hasSelectedReference
      ? "Input image 2 is the exact recommendation selected by the user. Use only its haircut as the visual blueprint: same silhouette, length, fringe, side weight, volume, texture and finish. Ignore its face, skin, expression, pose, clothing, background and lighting; those must come from image 1. Never blend or average the two faces. Do not switch to another recommendation."
      : "",
    openAiMorphologyInstruction,
    openAiNoSourceCopyInstruction,
    `Selected haircut: ${normalizedStyle.name}.`,
    `Hair description: ${normalizedStyle.description}. Hair color: ${normalizedStyle.color}.`,
    `User context: ${age} ${gender}. Exact selection: ${length}, ${maintenance}, univers ${lifestyle}.`,
    lengthConstraint,
    maintenanceConstraint,
    lifestyleConstraint,
    "The requested length and selected haircut are mandatory; do not keep the uploaded hairstyle if it does not match.",
    normalizedStyle.whyItWorks ? `Morphology objective: ${normalizedStyle.whyItWorks}.` : "",
    facialHairInstruction,
    "Grid structure: top-left source camera view, top-right left three-quarter view, bottom-left right three-quarter view not mirrored, bottom-right back view.",
    "For the two side views, use a gentle turn of about 45 degrees, keeping both eyes visible where possible. Do not invent a strict 90-degree profile from this single source portrait.",
    "Top-left is the primary comparison portrait: edit image 1's hair while preserving its exact head tilt, camera angle, perspective, expression and framing. Do not rotate or straighten it into a new frontal pose.",
    "The other three cells are inferred hairstyle views from the available portrait, not observed photographs. Change viewpoint only in those cells, preserve visible facial details where supported, and prioritize showing the haircut without beautifying the face.",
    "All four views must show the same selected haircut consistently.",
    "Keep the whole hairstyle visible at a consistent portrait scale. Preserve image 1's photographic setting and natural skin texture, with realistic individual hair strands.",
    "No text, no labels, no watermark, no logo, no outer white border.",
    "Use only thin internal dividers and fill the entire image with the grid."
  ].filter(Boolean).join("\n");
};

const cropOpenAiRecommendationPreviews = async ({ sheetBuffer, sessionId, combo, owner = null }) => {
  const sharp = loadSharp();
  if (!sharp) {
    throw Object.assign(new Error("Outil de decoupage indisponible pour preparer la planche."), { status: 503 });
  }

  const metadata = await sharp(sheetBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1536;
  // Quatre propositions en 2x2 ; les anciennes recommandations conservent leurs crops deja stockes.
  const cellW = Math.floor(width / 2);
  const cellH = Math.floor(height / 2);
  const inset = Math.max(4, Math.round(Math.min(width, height) * 0.004));
  const outDir = path.join(GENERATED_OPENAI_DIR, sessionId);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${combo}-recommendations-sheet.png`), sheetBuffer);

  const assets = {};
  for (const [index, variant] of Object.keys(openAiVariantPlans).entries()) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = column * cellW + inset;
    const top = row * cellH + inset;
    const cropWidth = (column === 1 ? width - cellW : cellW) - inset * 2;
    const cropHeight = (row === 1 ? height - cellH : cellH) - inset * 2;
    const buffer = await sharp(sheetBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(768, 1152, { fit: "cover", position: "center" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const filename = `${combo}-recommendation-${variant}.jpg`;
    await writeFile(path.join(outDir, filename), buffer);
    const assetUrl = `/generated-openai/${sessionId}/${filename}`;
    await persistImageAsset({ assetPath: assetUrl, buffer, contentType: "image/jpeg", owner });
    assets[variant] = {
      assetUrl,
      displayUrl: imageBufferToDataUrl(buffer, "image/jpeg")
    };
  }

  return assets;
};

const cropOpenAiFinalViews = async ({ sheetBuffer, sessionId, combo, styleId, owner = null }) => {
  const sharp = loadSharp();
  if (!sharp) {
    throw Object.assign(new Error("Outil de decoupage indisponible pour preparer la planche."), { status: 503 });
  }

  const metadata = await sharp(sheetBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1536;
  const midX = Math.round(width / 2);
  const midY = Math.round(height / 2);
  const inset = Math.max(6, Math.round(Math.min(width, height) * 0.006));
  const views = {
    front: { left: inset, top: inset, width: midX - inset * 2, height: midY - inset * 2 },
    left: { left: midX + inset, top: inset, width: width - midX - inset * 2, height: midY - inset * 2 },
    right: { left: inset, top: midY + inset, width: midX - inset * 2, height: height - midY - inset * 2 },
    back: { left: midX + inset, top: midY + inset, width: width - midX - inset * 2, height: height - midY - inset * 2 }
  };
  const outDir = path.join(GENERATED_OPENAI_DIR, sessionId);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${combo}-${styleId}-final-sheet.png`), sheetBuffer);

  // Le detourage fait partie de la finale : les memes pixels sont affiches et persistes.
  // Garder les recommandations dans leur decor pour la reference de coupe suivante.
  const crops = [];
  for (const box of Object.values(views)) {
    crops.push(await sharp(sheetBuffer)
      .extract(box)
      .resize(768, 1152, { fit: "cover", position: "center" })
      .png()
      .toBuffer());
  }
  const { buffers, backgroundTreatment } = await neutralizePortraits(crops);
  const assets = {};
  for (const [index, view] of Object.keys(views).entries()) {
    const buffer = await sharp(buffers[index])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const filename = `${combo}-${styleId}-${view}.jpg`;
    await writeFile(path.join(outDir, filename), buffer);
    const assetUrl = `/generated-openai/${sessionId}/${filename}`;
    await persistImageAsset({ assetPath: assetUrl, buffer, contentType: "image/jpeg", owner });
    assets[view] = {
      assetUrl,
      displayUrl: imageBufferToDataUrl(buffer, "image/jpeg")
    };
  }

  return { assets, backgroundTreatment };
};

const buildOpenAiStyle = ({ consultation, variant, previewUrl, sessionId }) => {
  const length = consultationLabels.length[consultation.targetLength] || "adapte";
  const lifestyle = consultationLabels.lifestyle[consultation.lifestyle] || "personnalise";
  const maintenance = consultationLabels.maintenance[consultation.maintenance] || "entretien adapte";
  const canBeard = consultation.gender === "male" && !["baby", "child", "teen"].includes(consultation.ageGroup);
  const morphologyAdvice = {
    primary: "Equilibre les proportions du visage avec une ligne portable et un volume mesure.",
    soft: "Adoucit les contours du visage avec une ligne souple et un mouvement naturel.",
    structured: "Structure la silhouette du visage avec des contours plus nets et un volume mieux place.",
    signature: "Affirme le style tout en gardant une forme credible pour la morphologie visible."
  }[variant] || "Adapte la coupe a la morphologie visible du visage.";

  return {
    id: `openai-upload-${consultation.targetLength}-${consultation.maintenance}-${consultation.lifestyle}-${variant}`,
    name: `${lengthLabelsFr(consultation.targetLength)} ${lifestyle} ${openAiVariantLabels[variant]}`,
    description: `Recommandation ${length}, ${maintenance}, univers ${lifestyle}, ajustee a l'equilibre du visage.`,
    color: consultation.gender === "female" ? "Naturel lumineux" : "Naturel",
    beardStyle: canBeard ? "Toilettage barbe adapte" : "Aucune",
    whyItWorks: `${morphologyAdvice} Le choix ${length}, ${maintenance} et l'univers ${lifestyle} gardent la coupe coherente au quotidien.`,
    faceShape: "morphologie personnalisee",
    previewUrl,
    sourceProvider: "openai-upload",
    generationSessionId: sessionId
  };
};

const safeStyleId = (style = {}) =>
  String(style.id || "style").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "style";

const generateOpenAiUploadRecommendations = async (req, payload) => {
  const historyOwner = await requireAuthenticatedUserOwner(
    req,
    payload,
    "Connexion requise pour utiliser une photo personnelle."
  );
  const releaseGenerationLock = acquireOpenAiGenerationLock(historyOwner);

  try {
    const source = imageDataUrlFromPayload(payload);
    const consultation = payload.consultation || {};
    const combo = comboFromConsultation(consultation);
    const sourceHash = sourceHashFromImage(source);
    const reservation = await reserveOpenAiDailyTrial({ req, payload, sourceHash, combo, owner: historyOwner });
    const { sessionId, quota } = reservation;

    try {
      const prompt = buildOpenAiRecommendationPrompt({ consultation });
      const size = process.env.OPENAI_RECOMMENDATION_SIZE || process.env.OPENAI_IMAGE_SIZE || "1024x1536";
      const result = await callOpenAiImageEdit({ source, prompt, size });
      const generatedImage = openAiImageFromResponse(result);
      if (!generatedImage) throw Object.assign(new Error(`Le service image n'a pas retourne d'image: ${openAiErrorText(result)}`), { status: 502 });

      const sheetBuffer = await downloadOpenAiImageBuffer(generatedImage);
      const previewAssets = await cropOpenAiRecommendationPreviews({ sheetBuffer, sessionId, combo, owner: historyOwner });
      const originalImageUrl = await storePrivateOriginalPreview({ source, sessionId, owner: historyOwner });
      const storedStyles = Object.keys(openAiVariantPlans).map((variant) =>
        buildOpenAiStyle({ consultation, variant, previewUrl: previewAssets[variant]?.assetUrl || "", sessionId })
      );
      const styles = Object.keys(openAiVariantPlans).map((variant) => ({
        ...buildOpenAiStyle({ consultation, variant, previewUrl: previewAssets[variant]?.displayUrl || previewAssets[variant]?.assetUrl || "", sessionId }),
        assetPreviewUrl: previewAssets[variant]?.assetUrl || "",
        selectedReferenceAssetUrl: previewAssets[variant]?.assetUrl || ""
      }));
      const historyItem = await getUserMemory().upsertGeneration(historyOwner, {
        id: sessionId,
        status: "recommendations_ready",
        title: "Recommandations personnalisees",
        sourceLabel: "Photo personnelle",
        faceShape: "morphologie personnalisee",
        consultation,
        originalImageUrl,
        recommendations: storedStyles.map(style => ({
          id: style.id,
          styleName: style.name,
          previewUrl: style.previewUrl,
          assetPreviewUrl: style.previewUrl,
          color: style.color,
          whyItWorks: style.whyItWorks
        }))
      });

      return {
        faceShape: "morphologie personnalisee",
        hairTexture: "Texture detectee depuis la photo chargee",
        skinTone: "Teint preserve depuis la photo chargee",
        detectedGender: consultation.gender || "non-binary",
        professionalAdvice: buildProfessionalMorphologyAdvice(consultation),
        recommendedStyles: await withPrivateGeneratedAssetAccessForOwner(styles, historyOwner),
        generationSessionId: sessionId,
        quota,
        historyItem: await withPrivateGeneratedAssetAccessForOwner(historyItem, historyOwner)
      };
    } catch (error) {
      await releaseOpenAiReservation(reservation);
      throw error;
    }
  } finally {
    releaseGenerationLock();
  }
};

const generateOpenAiSelectedResult = async (req, payload) => {
  const historyOwner = await requireAuthenticatedUserOwner(
    req,
    payload,
    "Connexion requise pour finaliser une photo personnelle."
  );
  const releaseGenerationLock = acquireOpenAiGenerationLock(historyOwner);

  try {
  const source = imageDataUrlFromPayload(payload);
  const consultation = payload.consultation || {};
  const style = normalizeStyle(payload.style || {});
  const combo = comboFromConsultation(consultation);
  const sourceHash = sourceHashFromImage(source);
  let session = null;
  try {
    session = await getOpenAiFinalSession({ req, payload, sourceHash, combo, owner: historyOwner });
    const selectedReferenceAssetPath = selectedReferenceAssetPathFromPayload(payload, style);
    const selectedReference = await assertOpenAiSelectedRecommendationReference({
      owner: historyOwner,
      sessionId: session.sessionId,
      combo,
      selectedReferenceAssetPath,
      styleId: style.id
    });
    const selectedReferenceSource = await imageSourceFromGeneratedOpenAiAsset(
      selectedReference.selectedReferenceAssetPath,
      "Image de la proposition selectionnee indisponible. Reprenez les recommandations depuis votre fiche resultat puis reessayez.",
      historyOwner
    );
    const prompt = buildOpenAiFinalPrompt({ consultation, style, hasSelectedReference: true });
    const size = process.env.OPENAI_FINAL_SIZE || process.env.OPENAI_IMAGE_SIZE || "1024x1536";
    // Charge le traitement du fond avant l'appel payant; son echec n'invalide pas la coupe.
    await preparePortraitBackground();
    const result = await callOpenAiImageEdit({
      source,
      prompt,
      size,
      referenceImages: [{ source: selectedReferenceSource, filenamePrefix: "selected-recommendation" }]
    });
    const generatedImage = openAiImageFromResponse(result);
    if (!generatedImage) throw Object.assign(new Error(`Le service image n'a pas retourne d'image: ${openAiErrorText(result)}`), { status: 502 });

    const sheetBuffer = await downloadOpenAiImageBuffer(generatedImage);
    const styleId = safeStyleId(style);
    const createdAt = new Date().toISOString();
    const finalHistoryId = `${session.sessionId}-final-${styleId}-${Date.now().toString(36)}`.slice(0, 120);
    // Une nouvelle finale ne doit pas reecrire les vues d'une ancienne fiche de la meme coupe.
    const finalAssetKey = `${styleId}-${randomBytes(6).toString("hex")}`;
    const { assets: views, backgroundTreatment } = await cropOpenAiFinalViews({
      sheetBuffer, sessionId: session.sessionId, combo, styleId: finalAssetKey, owner: historyOwner
    });
    await markOpenAiFinalSessionUsed(session);
    const assetAdditionalViews = {
      left: views.left?.assetUrl || "",
      right: views.right?.assetUrl || "",
      back: views.back?.assetUrl || ""
    };
    const displayAdditionalViews = {
      left: views.left?.displayUrl || assetAdditionalViews.left,
      right: views.right?.displayUrl || assetAdditionalViews.right,
      back: views.back?.displayUrl || assetAdditionalViews.back
    };
    const proposal = {
      id: `openai-final-${styleId}`,
      imageUrl: views.front?.displayUrl || views.front?.assetUrl || "",
      assetImageUrl: views.front?.assetUrl || "",
      styleName: style.name,
      description: style.description,
      whyItWorks: `${style.whyItWorks || "Resultat final base sur la morphologie et les reglages choisis."} Resultat complet prepare selon la coupe selectionnee.`,
      color: style.color,
      beardStyle: style.beardStyle,
      additionalViews: displayAdditionalViews,
      assetAdditionalViews,
      backgroundTreatment,
      isPreparedAsset: true
    };
    const previousFinalIds = Array.isArray(selectedReference.historyItem.generatedFinalIds)
      ? selectedReference.historyItem.generatedFinalIds
      : [];
    const existingFinal = selectedReference.historyItem.final || (
      selectedReference.historyItem.status !== "recommendations_ready" && selectedReference.historyItem.imageUrl
        ? {
          id: `openai-final-${safeStyleId({ id: selectedReference.historyItem.selectedProposalKey || "previous" })}`,
          imageUrl: selectedReference.historyItem.imageUrl,
          styleName: selectedReference.historyItem.styleName || selectedReference.historyItem.title || "Resultat MorphoStyle",
          description: selectedReference.historyItem.description || "",
          whyItWorks: selectedReference.historyItem.whyItWorks || "",
          color: selectedReference.historyItem.color || "Naturel",
          beardStyle: selectedReference.historyItem.beardStyle || "Aucune",
          additionalViews: selectedReference.historyItem.additionalViews || {}
        }
        : null
    );
    const existingFinalCopyId = `${session.sessionId}-final-existing-${safeStyleId({ id: selectedReference.historyItem.selectedProposalKey || "previous" })}`.slice(0, 120);
    const generatedFinalIds = [
      finalHistoryId,
      ...(existingFinal?.imageUrl ? [existingFinalCopyId] : []),
      ...previousFinalIds
    ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).slice(0, 24);

    if (existingFinal?.imageUrl && !previousFinalIds.includes(existingFinalCopyId)) {
      await getUserMemory().upsertGeneration(historyOwner, {
        id: existingFinalCopyId,
        status: "final_ready",
        title: existingFinal.styleName || selectedReference.historyItem.title || "Resultat MorphoStyle",
        sourceLabel: selectedReference.historyItem.sourceLabel || "Photo personnelle",
        faceShape: selectedReference.historyItem.faceShape || "morphologie personnalisee",
        consultation: selectedReference.historyItem.consultation || consultation,
        originalImageUrl: selectedReference.historyItem.originalImageUrl,
        selectedProposalKey: selectedReference.historyItem.selectedProposalKey || "",
        selectedProposalAssetUrl: selectedReference.historyItem.selectedProposalAssetUrl || "",
        recommendationSessionId: session.sessionId,
        parentGenerationId: session.sessionId,
        recommendations: selectedReference.historyItem.recommendations || [],
        createdAt: selectedReference.historyItem.updatedAt || selectedReference.historyItem.createdAt || createdAt,
        final: existingFinal
      });
    }

    await getUserMemory().upsertGeneration(historyOwner, {
      id: session.sessionId,
      status: "recommendations_ready",
      title: selectedReference.historyItem.title || "Recommandations personnalisees",
      sourceLabel: selectedReference.historyItem.sourceLabel || "Photo personnelle",
      faceShape: selectedReference.historyItem.faceShape || "morphologie personnalisee",
      consultation: selectedReference.historyItem.consultation || consultation,
      originalImageUrl: selectedReference.historyItem.originalImageUrl,
      recommendations: selectedReference.historyItem.recommendations || [],
      selectedProposalKey: style.id,
      selectedProposalAssetUrl: selectedReference.selectedReferenceAssetPath,
      generatedFinalIds,
      lastFinalGeneratedAt: createdAt,
      final: undefined,
      imageUrl: undefined,
      additionalViews: undefined
    });

    const historyItem = await getUserMemory().upsertGeneration(historyOwner, {
      id: finalHistoryId,
      status: "final_ready",
      title: proposal.styleName || "Resultat MorphoStyle",
      sourceLabel: selectedReference.historyItem.sourceLabel || "Photo personnelle",
      faceShape: selectedReference.historyItem.faceShape || "morphologie personnalisee",
      consultation: selectedReference.historyItem.consultation || consultation,
      originalImageUrl: selectedReference.historyItem.originalImageUrl,
      selectedProposalKey: style.id,
      selectedProposalAssetUrl: selectedReference.selectedReferenceAssetPath,
      recommendationSessionId: session.sessionId,
      parentGenerationId: session.sessionId,
      recommendations: selectedReference.historyItem.recommendations || [],
      createdAt,
      final: {
        id: proposal.id,
        imageUrl: proposal.assetImageUrl || proposal.imageUrl,
        styleName: proposal.styleName,
        description: proposal.description,
        whyItWorks: proposal.whyItWorks,
        color: proposal.color,
        beardStyle: proposal.beardStyle,
        backgroundTreatment: proposal.backgroundTreatment,
        additionalViews: proposal.assetAdditionalViews || proposal.additionalViews
      }
    });

    return {
      ...await withPrivateGeneratedAssetAccessForOwner(proposal, historyOwner),
      historyItem: await withPrivateGeneratedAssetAccessForOwner(historyItem, historyOwner)
    };
  } catch (error) {
    await releaseOpenAiAdditionalFinalReservation(session?.extraFinalReservation);
    throw error;
  }
  } finally {
    releaseGenerationLock();
  }
};

const getLocalComfyApi = () => process.env.LOCAL_COMFY_API || process.env.COMFY_API_URL || DEFAULT_LOCAL_COMFY_API;

const isLocalComfyEnabled = () => process.env.LOCAL_COMFY_ENABLED !== "false";

const isLocalInstantIDEnabled = () => process.env.LOCAL_COMFY_INSTANTID_ENABLED !== "false";

const isLocalPhotoMakerEnabled = () => process.env.LOCAL_COMFY_PHOTOMAKER_ENABLED !== "false";

const isLocalStableHairEnabled = () => process.env.LOCAL_STABLEHAIR_ENABLED === "true";

const isLocalLandmarkFaceRestoreEnabled = () => process.env.LOCAL_LANDMARK_FACE_RESTORE_ENABLED === "true";

const pingLocalComfy = async (timeoutMs = 2500) => {
  if (!isLocalComfyEnabled()) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getLocalComfyApi()}/system_stats`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const powershellString = (value = "") => `'${String(value).replace(/'/g, "''")}'`;

const getLocalComfyPort = () => {
  try {
    const url = new URL(getLocalComfyApi());
    return Number(url.port || (url.protocol === "https:" ? 443 : 80));
  } catch {
    return 8188;
  }
};

const stopLocalComfyForStableHair = async () => {
  if (process.env.LOCAL_STABLEHAIR_STOP_COMFY_BEFORE_RUN === "false" || process.platform !== "win32") return false;
  const port = Math.max(1, Math.min(65535, getLocalComfyPort()));
  const script = [
    `$conn = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    "if ($conn) {",
    "  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue",
    "  Write-Output \"STOPPED:$($conn.OwningProcess)\"",
    "}"
  ].join("\n");

  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], { timeout: 30000, cwd: rootDir });
    return stdout.includes("STOPPED:");
  } catch (error) {
    console.warn("Impossible d'arreter ComfyUI avant Stable-Hair:", error.message);
    return false;
  }
};

const restartLocalComfyAfterStableHair = async (shouldRestart) => {
  if (!shouldRestart || process.env.LOCAL_STABLEHAIR_RESTART_COMFY_AFTER_RUN !== "true" || process.platform !== "win32") return;
  const startBat = process.env.LOCAL_COMFY_START_BAT;
  if (!startBat || !existsSync(startBat)) return;

  const script = [
    `$bat = ${powershellString(startBat)}`,
    "$workdir = Split-Path -Parent $bat",
    "Start-Process -FilePath $bat -WorkingDirectory $workdir -WindowStyle Hidden",
    "Write-Output \"STARTED:$bat\""
  ].join("\n");

  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], { timeout: 30000, cwd: rootDir });
  } catch (error) {
    console.warn("Impossible de relancer ComfyUI apres Stable-Hair:", error.message);
  }
};

const restoreGeneratedFaceWithLandmarks = async ({ sourcePath, generatedPath, outputPath, width, height }) => {
  if (!isLocalLandmarkFaceRestoreEnabled()) return false;
  const scriptPath = process.env.LOCAL_LANDMARK_FACE_RESTORE_SCRIPT || DEFAULT_LOCAL_LANDMARK_FACE_RESTORE_SCRIPT;
  const pythonPath = process.env.LOCAL_PYTHON_EXECUTABLE || DEFAULT_LOCAL_PYTHON_EXECUTABLE;
  if (!existsSync(scriptPath) || !existsSync(pythonPath)) return false;

  const timeoutMs = Math.max(60000, Number(process.env.LOCAL_LANDMARK_FACE_RESTORE_TIMEOUT_MS || 240000));
  const args = [
    scriptPath,
    "--source", sourcePath,
    "--target", generatedPath,
    "--output", outputPath,
    "--width", String(width),
    "--height", String(height),
    "--mode", process.env.LOCAL_LANDMARK_FACE_RESTORE_MODE || "alpha",
    "--mask-dilate", String(Math.max(0, Math.min(64, Number(process.env.LOCAL_LANDMARK_FACE_RESTORE_MASK_DILATE || 14)))),
    "--mask-blur", String(Math.max(0, Math.min(48, Number(process.env.LOCAL_LANDMARK_FACE_RESTORE_MASK_BLUR || 10)))),
    "--top-protect", String(Math.max(0.1, Math.min(0.45, Number(process.env.LOCAL_LANDMARK_FACE_RESTORE_TOP_PROTECT || 0.275)))),
    "--alpha-strength", String(Math.max(0.1, Math.min(1, Number(process.env.LOCAL_LANDMARK_FACE_RESTORE_ALPHA_STRENGTH || 0.94))))
  ];

  try {
    await execFileAsync(pythonPath, args, { timeout: timeoutMs, cwd: rootDir });
    return existsSync(outputPath);
  } catch (error) {
    console.warn("Landmark face restore skipped:", error.message);
    return false;
  }
};

const buildAiHordePrompt = (payload, mode = "img2img") => {
  const normalizedStyle = normalizeStyle(payload.style);
  const base = mode === "preview"
    ? [
      "realistic professional hair salon catalog portrait",
      `haircut: ${normalizedStyle.name}`,
      `hair shape: ${normalizedStyle.description}`,
      `hair color: ${normalizedStyle.color}`,
      normalizedStyle.faceShape ? `face shape guidance: ${normalizedStyle.faceShape}` : "",
      `person context: ${payload.gender || "non-binary"}, ${payload.ageGroup || "adult"}`,
      "front view, head and shoulders, neutral studio background, natural skin texture, realistic lighting"
    ]
    : [
      "realistic portrait photo edit, same person from source image",
      "preserve face identity, facial features, expression, skin, clothes, background, lighting and camera framing",
      "change only the real hairstyle, no overlay, no sticker, no hat, no wig",
      `target haircut: ${normalizedStyle.name}`,
      `hair shape: ${normalizedStyle.description}`,
      `hair color: ${normalizedStyle.color}`,
      normalizedStyle.faceShape ? `adapt naturally to face shape: ${normalizedStyle.faceShape}` : ""
    ];

  return `${base.filter(Boolean).join(", ")} ### text, logo, watermark, deformed face, changed identity, extra person, hat, cap, wig, cartoon`;
};

const getPreviewPreferences = (style = {}) => {
  const parts = String(style.id || "").split("-");
  const lifestyle = parts.at(-1) || "";
  const maintenance = parts.at(-2) || "";
  const length = parts.at(-3) || "";
  const lengthMap = {
    short: "selected length: short haircut",
    medium: "selected length: medium haircut",
    long: "selected length: long or medium-long haircut",
    any: "selected length: free, use the haircut's natural best length"
  };
  const maintenanceMap = {
    low: "selected maintenance: simple low-maintenance finish",
    medium: "selected maintenance: moderate styling effort",
    high: "selected maintenance: styled salon finish with more detail"
  };
  const lifestyleMap = {
    classic: "selected style universe: classic, sober and timeless",
    modern: "selected style universe: modern, clean and current",
    bold: "selected style universe: audacious, more expressive texture and visible character"
  };

  return [
    lengthMap[length] || "",
    maintenanceMap[maintenance] || "",
    lifestyleMap[lifestyle] || "",
    style.whyItWorks ? `selection rationale: ${style.whyItWorks}` : ""
  ].filter(Boolean);
};

const buildLocalComfyPreviewPrompt = (payload) => {
  const normalizedStyle = normalizeStyle(payload.style);
  const gender = payload.gender || "non-binary";
  const ageGroup = payload.ageGroup || "adult";
  const genderText = String(gender).toLowerCase();
  const genderInstruction = genderText === "male"
    ? "masculine adult man, male face, male hair salon model"
    : genderText === "female"
      ? "adult woman, feminine face, female hair salon model"
      : "androgynous adult person";
  return [
    "a single 512x640 realistic professional hair salon portrait photograph",
    "the entire image must contain exactly one person and exactly one face",
    "one front view only, one head and shoulders crop only",
    "no panels, no comparison chart, no before-and-after, no contact sheet",
    genderInstruction,
    "centered face, neutral light grey studio background",
    "natural skin texture, realistic lighting, clean photo",
    `person context: ${gender}, ${ageGroup}`,
    ...getPreviewPreferences(payload.style),
    `target haircut: ${normalizedStyle.name}`,
    `hair shape: ${normalizedStyle.description}`,
    `hair color: ${normalizedStyle.color}`,
    normalizedStyle.faceShape ? `face shape guidance: ${normalizedStyle.faceShape}` : "",
    "show the haircut clearly, no text, no logo, no watermark, no collage, no grid"
  ].filter(Boolean).join(", ");
};

const buildLocalComfyPreviewNegativePrompt = (payload = {}) => {
  const genderText = String(payload.gender || "").toLowerCase();
  const genderNegative = genderText === "male"
    ? ["woman", "female face", "feminine face", "makeup", "lipstick"]
    : genderText === "female"
      ? ["man", "male face", "beard"]
      : [];
  return [
  "text",
  "logo",
  "watermark",
  ...genderNegative,
  "collage",
  "grid",
  "panel",
  "panels",
  "four panels",
  "two portraits",
  "three portraits",
  "four portraits",
  "multiple portraits",
  "multiple faces",
  "split screen",
  "contact sheet",
  "before and after",
  "comparison chart",
  "pigtails",
  "ponytail",
  "twin tails",
  "double side bunches",
  "side hair clumps",
  "hair knots",
  "hair buns",
  "blurry",
  "low quality",
  "deformed face",
  "extra person",
  "hat",
  "cap",
  "cartoon",
  "illustration",
  "drawing"
].join(", ");
};

const buildPreviewColorInstruction = (color = "natural brown") => {
  const colorText = String(color || "natural brown").toLowerCase();
  if (/reflet|highlight|balayage|miel|honey|caramel|lumineux/.test(colorText)) {
    return `natural brown base hair with subtle ${color} blended highlights, no solid blonde or orange blocks`;
  }
  return `natural ${color} hair color blended evenly`;
};

const buildPreviewHairFamilyInstruction = (styleText = "", color = "natural brown") => {
  const colorInstruction = buildPreviewColorInstruction(color);
  if (/volume|vertical|height|quiff|layered/.test(styleText)) {
    return `target hairstyle family: men's vertical textured quiff, high brushed-up volume on top, clean controlled sides, dense natural hair, ${colorInstruction}`;
  }
  if (/curtain|rideau/.test(styleText)) {
    return `target hairstyle family: men's curtain fringe, soft center part, medium length front fringe falling naturally near the forehead and temples, tidy connected side layers, connected to the scalp, ${colorInstruction}`;
  }
  if (/wave|ondulation|wavy|curl|boucle/.test(styleText)) {
    return `target hairstyle family: men's soft natural waves with controlled texture, tidy salon shape, connected hairline, ${colorInstruction}`;
  }
  if (/balayage|side|raie|lateral|sweep|part/.test(styleText)) {
    return `target hairstyle family: men's side swept haircut with one clean diagonal part, natural lateral movement across the top, tidy connected sides, ${colorInstruction}`;
  }
  if (/taper|crop|court|short|fondu|degrade|degrad/.test(styleText)) {
    return `target hairstyle family: structured modern taper haircut, short textured quiff, clipped tapered sides, dense visible hair on top, ${colorInstruction}`;
  }
  if (/long|flow|frame/.test(styleText)) {
    return `target hairstyle family: men's medium length flow, natural connected layers around the forehead and temples, tidy salon shape, ${colorInstruction}`;
  }
  return `target hairstyle family: tidy professional salon haircut with dense connected hair, ${colorInstruction}`;
};

const buildLocalComfyPreviewImagePrompt = (payload) => {
  const normalizedStyle = normalizeStyle(payload.style);
  const genderContext = String(payload.gender || "").toLowerCase();
  const isMale = genderContext === "male" || genderContext === "man" || genderContext === "masculin";
  const styleText = getStyleSearchText(payload.style);
  const hairFamilyInstruction = buildPreviewHairFamilyInstruction(styleText, normalizedStyle.color);
  const colorInstruction = buildPreviewColorInstruction(normalizedStyle.color);
  const shortCutPrompt = /taper|crop|court|short|fondu|degrade|degrad/.test(styleText)
    ? `target short haircut rendering: structured modern taper haircut with dense visible ${normalizedStyle.color} hair on top, short textured quiff, clipped tapered sides, full natural hairline, thick real hair strands, not bald, not buzz cut, no shaved scalp`
    : "";
  const shortCutInstruction = /taper|crop|court|short|fondu|degrade|d[eÃ©]grad[eÃ©]/.test(styleText)
    ? "dense visible hair on top, short textured quiff, clipped tapered sides, full natural hairline, thick real hair strands, not bald, not buzz cut, no shaved scalp"
    : "";
  return [
    "realistic salon preview edit of the uploaded portrait",
    "keep the exact same person, face identity, expression, skin, eyes, nose, mouth, jaw, neck, clothes, background, lighting and camera framing",
    "modify only the real hair inside the masked hair area",
    "replace the current haircut with the selected target haircut, realistic hair growing from the scalp",
    "make the haircut visible enough for a recommendation card, but preserve the original portrait as the reference",
    "keep full visible dense natural hair coverage, never bald, no receding hairline, no bare scalp, no exposed scalp",
    "all hair must stay connected to the scalp and hairline, no detached side bunches, no mirrored twin clumps",
    isMale ? "masculine adult haircut, natural male hairline, salon-ready men's styling" : "",
    hairFamilyInstruction,
    shortCutPrompt || shortCutInstruction,
    `target haircut: ${normalizedStyle.name}`,
    `hair shape: ${normalizedStyle.description}`,
    `hair color instruction: ${colorInstruction}`,
    normalizedStyle.faceShape ? `face shape guidance: ${normalizedStyle.faceShape}` : "",
    ...getPreviewPreferences(payload.style),
    "one person, one face, no text, no logo, no watermark, no collage, no grid, no split screen"
  ].filter(Boolean).join(", ");
};

const buildLocalComfyPreviewImageNegativePrompt = (payload = {}) => {
  const genderText = String(payload.gender || "").toLowerCase();
  const genderNegative = genderText === "male"
    ? ["woman", "female face", "feminine face", "makeup", "lipstick"]
    : genderText === "female"
      ? ["man", "male face", "beard"]
      : [];
  return [
    "changed identity",
    "different person",
    "new person",
    "changed face",
    "deformed face",
    "changed eyes",
    "changed nose",
    "changed mouth",
    "changed ears",
    ...genderNegative,
    "bald",
    "shaved head",
    "buzz cut",
    "receding hairline",
    "bare scalp",
    "exposed scalp",
    "hair loss",
    "thinning hair",
    "pigtails",
    "ponytail",
    "twin tails",
    "double side bunches",
    "side hair clumps",
    "stray top hair clumps",
    "hair spikes above head",
    "messy flyaway clumps",
    "hair knots above head",
    "detached hair",
    "floating hair",
    "hair blobs",
    "solid blonde blocks",
    "solid orange blocks",
    "bright orange patches",
    "colored side patches",
    "pasted wig",
    "sticker",
    "overlay",
    "hat",
    "cap",
    "text",
    "logo",
    "watermark",
    "collage",
    "grid",
    "multiple faces",
    "second face",
    "stacked portraits",
    "photo strip",
    "split screen"
  ].join(", ");
};

const getLocalComfyPreviewSeed = (payload) => {
  const styleText = getStyleSearchText(payload.style);
  if (/volume|vertical|hauteur/.test(styleText)) return 42;
  if (/raie|side|lat[eé]ral|lateral|sweep/.test(styleText)) return 42;
  return seedFromText(`${payload.style?.id || ""}-${payload.style?.name || ""}-${payload.gender || ""}-${payload.ageGroup || ""}-single-preview-v2`);
};

const getLocalComfyPreviewImageSeed = (payload) => {
  const styleText = getStyleSearchText(payload.style);
  if (/taper|crop|court|short|fondu|degrade|degrad/.test(styleText)) return 1234567;
  if (/volume|vertical|height|quiff|layered/.test(styleText)) return 24680;
  if (/curtain|rideau/.test(styleText)) return 424242;
  if (/wave|ondulation|wavy|curl|boucle/.test(styleText)) return 1234567;
  if (/balayage|side|raie|lateral|sweep|part/.test(styleText)) return 271828;
  if (/long|flow|frame/.test(styleText)) return 161803;
  return seedFromText(`${payload.style?.id || ""}-${payload.style?.name || ""}-${payload.gender || ""}-${payload.ageGroup || ""}-preview-i2i-v2`);
};

const getLocalComfyFinalSeed = (payload) => {
  const styleText = getStyleSearchText(payload.style);
  if (/taper|crop|court|short|fondu|degrade|degrad/.test(styleText)) return 1234567;
  if (/volume|vertical|height|quiff|layered/.test(styleText)) return 24680;
  if (/curtain|rideau/.test(styleText)) return 424242;
  if (/wave|ondulation|wavy|curl|boucle/.test(styleText)) return 1234567;
  if (/balayage|side|raie|lateral|sweep|part/.test(styleText)) return 271828;
  return Number(process.env.LOCAL_COMFY_SEED) || seedFromText(`${payload.style?.id || ""}-${payload.style?.name || ""}-${payload.gender || ""}-${payload.ageGroup || ""}`);
};

const getLocalComfyPreviewImageDenoise = (payload) => {
  const styleText = getStyleSearchText(payload.style);
  const configured = Number(process.env.LOCAL_COMFY_PREVIEW_I2I_DENOISE);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (/curtain|rideau|long|flow|frame/.test(styleText)) return 0.74;
  if (/volume|vertical|height|quiff|layered/.test(styleText)) return 0.78;
  if (/wave|ondulation|wavy|curl|boucle/.test(styleText)) return 0.72;
  if (/balayage|side|raie|lateral|sweep|part/.test(styleText)) return 0.74;
  if (/taper|crop|court|short|fondu|degrade|degrad/.test(styleText)) return 0.72;
  return 0.7;
};

const getStyleSearchText = (style = {}) =>
  `${style.id || ""} ${style.name || ""} ${style.styleName || ""} ${style.description || ""} ${style.color || ""}`.toLowerCase();

const isShortHairStyle = (style = {}) =>
  /taper|crop|court|short|fondu|degrade|degrad|pixie/.test(getStyleSearchText(style));

const getMaskProfileForStyle = (style = {}) => {
  const text = getStyleSearchText(style);
  if (/rideau|curtain|long|mi-long|longue|longueur|shag|wolf|mullet/.test(text)) return "long";
  if (/ondulation|wave|wavy|boucle|curl/.test(text)) return "wave";
  if (/raie|side|lateral|lat[eé]ral|sweep/.test(text)) return "side";
  if (/taper|crop|buzz|court|short|fondu|degrade|d[eé]grad[eé]/.test(text)) return "short";
  return "balanced";
};

const getConfiguredStableHairReferencePath = (style = {}) => {
  const configured = process.env.LOCAL_STABLEHAIR_REFERENCE_IMAGE;
  if (configured) {
    const projectPath = path.resolve(rootDir, configured);
    if (existsSync(projectPath)) return projectPath;
    if (existsSync(configured)) return configured;
  }
  if (isShortHairStyle(style) && existsSync(DEFAULT_LOCAL_STABLEHAIR_SHORT_REFERENCE)) {
    return DEFAULT_LOCAL_STABLEHAIR_SHORT_REFERENCE;
  }
  return "";
};

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

const inferReferenceFamily = (style = {}) => {
  const text = getStyleSearchText(style);
  if (/pixie/.test(text)) return "pixie";
  if (/bob|carre|carr/.test(text)) return "bob";
  if (/curtain|rideau/.test(text)) return "curtain";
  if (/frange|fringe/.test(text)) return "fringe";
  if (/side|raie|lateral|lat[eé]ral|balayage|sweep/.test(text)) return "side_part";
  if (/wave|ondulation|wavy|boucle|curl/.test(text)) return "waves";
  if (/volume|vertical|height|quiff/.test(text)) return "volume";
  if (/long|fluide|flow|face-frame|frame/.test(text)) return "long_flow";
  if (/crop/.test(text)) return "crop";
  if (/taper|texture|contour|court|short|fondu|degrade/.test(text)) return "taper";
  return "layered";
};

const getStylePreferenceParts = (style = {}) => {
  const parts = String(style.id || "").split("-");
  return {
    lifestyle: parts.at(-1) || "modern",
    maintenance: parts.at(-2) || "medium",
    length: parts.at(-3) || "medium"
  };
};

const normalizeReferenceRecipe = (payload = {}) => {
  const style = normalizeStyle(payload.style);
  const configuredRecipe = style.recipe && typeof style.recipe === "object" ? style.recipe : {};
  const preferenceParts = getStylePreferenceParts(style);
  const family = configuredRecipe.family || inferReferenceFamily(style);
  const faceShape = configuredRecipe.faceShape || style.faceShape || "visage ovale";
  const faceText = String(faceShape).toLowerCase();
  const length = configuredRecipe.length || preferenceParts.length;
  const maintenance = configuredRecipe.maintenance || preferenceParts.maintenance;
  const lifestyle = configuredRecipe.lifestyle || preferenceParts.lifestyle;
  const isRound = /rond/.test(faceText);
  const isLong = /allonge|long/.test(faceText);

  return {
    family,
    length,
    maintenance,
    lifestyle,
    faceShape,
    volume: configuredRecipe.volume || (family === "volume" && !isLong ? "high" : isLong ? "low" : "medium"),
    sides: configuredRecipe.sides || ((family === "taper" || family === "crop" || (isRound && length === "short")) ? "tight" : family === "long_flow" || family === "bob" ? "layered" : "natural"),
    fringe: configuredRecipe.fringe || (family === "curtain" ? "curtain" : family === "side_part" ? "side" : family === "fringe" || isLong ? "short" : "none"),
    texture: configuredRecipe.texture || (family === "waves" ? "wavy" : family === "long_flow" || family === "bob" ? "soft" : lifestyle === "bold" ? "textured" : "clean"),
    color: configuredRecipe.color || style.color || "natural brown",
    beard: configuredRecipe.beard || style.beardStyle || "Aucune",
    gender: configuredRecipe.gender || payload.gender || "non-binary",
    ageGroup: configuredRecipe.ageGroup || payload.ageGroup || "adult",
    objective: configuredRecipe.objective || style.whyItWorks || "adapted hairstyle recommendation"
  };
};

const referenceRecipePromptVersion = (recipe = {}) => {
  if (recipe.family === "curtain") return 17;
  if (recipe.family === "taper") return 17;
  if (recipe.family === "crop") return 13;
  if (recipe.family === "fringe") return 15;
  if (recipe.family === "waves") return 15;
  return 14;
};

const referenceRecipeCacheKey = (payload = {}) => {
  const style = normalizeStyle(payload.style);
  const recipe = normalizeReferenceRecipe(payload);
  const keyData = {
    v: referenceRecipePromptVersion(recipe),
    id: style.id,
    name: style.name,
    recipe
  };
  return createHash("sha256").update(stableStringify(keyData)).digest("hex").slice(0, 20);
};

const referenceCachePathForKey = (key) =>
  path.join(rootDir, "output", "cache", "references", `${key}.png`);

const referenceFamilyInstruction = (recipe) => {
  const color = recipe.color || "natural brown";
  const lengthGuide = recipe.length === "long"
    ? "long salon length visible on both sides of the neck and shoulders, controlled ends"
    : recipe.length === "medium"
      ? "medium salon length with enough front and side length for the selected shape, controlled ends"
      : "short salon length, compact silhouette, no hair below the ears";
  const common = `${color} hair, ${recipe.texture} finish, ${recipe.volume} volume, ${recipe.sides} sides, ${lengthGuide}`;
  switch (recipe.family) {
    case "taper":
      return `structured taper haircut on one single centered person, close clean sides, clean temples, short textured top, natural hairline, no second model, no comparison portrait, ${common}`;
    case "crop":
      return `single-person textured crop haircut, compact top, low profile silhouette, visible short fringe line across the forehead, clean tapered nape, one face and one head only, ${common}`;
    case "side_part":
      if (recipe.gender === "male") {
        return `classic men's business side part haircut, short-to-medium top combed to one side, tapered around the ears, clean nape, hair ends above the ears, no long back hair, no shoulder length, ${common}`;
      }
      if (recipe.length === "long") {
        return `long side-swept layered hairstyle, one clean diagonal side part, long hair falls past the shoulders, face-framing layers sweep laterally across one side, not a bob, not neck length, ${common}`;
      }
      return `soft side part hairstyle, one clean diagonal part, natural lateral movement across the top, tidy sides around the ears, controlled back length, ${common}`;
    case "curtain":
      return `medium-length curtain fringe haircut, exact middle part visible as a vertical line, two front curtains split symmetrically from the center part, longer front strands falling over the forehead toward the cheekbones, connected temple layers, ${common}`;
    case "fringe":
      if (recipe.gender === "male") {
        return `men's textured French crop with a clear short forward fringe, soft bangs falling downward across the upper forehead, controlled side volume, forehead visibly shortened, not slicked back, not side parted, ${common}`;
      }
      return `balanced fringe hairstyle, visible soft bangs falling downward across the upper forehead near the eyebrows, controlled side volume, clear fringe line, not slicked back, not bare forehead, ${common}`;
    case "waves":
      if (recipe.gender === "male") {
        return `medium-length men's loose wavy surfer haircut, obvious S-shaped waves and soft curls visible on the top and sides, hair reaches around the ears, natural lateral wave movement, not a business side part, not a quiff, not slicked back, ${common}`;
      }
      return `natural wavy layered hairstyle on one person, visible S-shaped waves on both sides of the face, soft lateral movement, balanced horizontal volume, tidy salon shape, one continuous portrait only, no before-after comparison, ${common}`;
    case "volume":
      return `vertical textured volume haircut, brushed-up top, controlled sides, salon texture, ${common}`;
    case "long_flow":
      return `long flowing layered hairstyle, hair falls past the shoulders on both sides, face-framing long layers, soft ends, natural movement, not a bob, ${common}`;
    case "bob":
      return `soft layered bob haircut, volume around cheekbones, clean rounded perimeter, ${common}`;
    case "pixie":
      return `soft pixie haircut, short nape, rounded textured top, natural feminine contour, ${common}`;
    default:
      return `layered salon haircut, visible staggered face-framing layers around the cheeks and collarbone, natural contour around the face, single front-facing portrait only, no rear view, no second view, not a blunt bob, ${common}`;
  }
};

const referencePreferenceInstruction = (recipe) => {
  const maintenance = {
    low: "easy low-maintenance finish, simple natural shape, minimal styling product, no fragile salon-only details",
    medium: "wearable salon finish, controlled texture, shape remains practical but visibly styled",
    high: "high-styling finish, polished and intentional shape, detailed texture, more sculpted salon result"
  }[recipe.maintenance] || "wearable salon finish";

  const lifestyle = {
    classic: "classic and professional mood, conservative silhouette, clean timeless contour",
    modern: "modern salon mood, current but wearable silhouette, fresh texture and clean edges",
    bold: "bold expressive mood, stronger silhouette, visible texture, more character while staying realistic"
  }[recipe.lifestyle] || "modern salon mood";

  const length = {
    short: "selected target length is short: compact haircut, ears and nape remain mostly clear",
    medium: "selected target length is medium: visible front and side movement, controlled length around ears and jaw",
    long: "selected target length is long: length is visibly preserved around the neck and shoulders",
    any: "selected target length is flexible: choose the most flattering balanced length for the face"
  }[recipe.length] || "selected target length is flexible";

  const faceText = String(recipe.faceShape || "").toLowerCase();
  const morphology = /rond/.test(faceText)
    ? "round face adaptation: add vertical lift or diagonal movement, avoid width at the cheeks"
    : /allonge|long/.test(faceText)
      ? "long face adaptation: avoid extra height, add balance near the eyes and sides"
      : /carre/.test(faceText)
        ? "square face adaptation: soften jaw angles with rounded or diagonal movement"
        : "oval face adaptation: preserve balanced proportions";

  return `${length}; ${maintenance}; ${lifestyle}; ${morphology}`;
};

const referenceSubjectTerm = (recipe) => {
  const gender = recipe.gender === "female" ? "female" : recipe.gender === "male" ? "male" : "androgynous";
  if (recipe.ageGroup === "baby") {
    if (gender === "female") return "toddler girl";
    if (gender === "male") return "toddler boy";
    return "toddler child";
  }
  if (recipe.ageGroup === "child") {
    if (gender === "female") return "young girl child";
    if (gender === "male") return "young boy child";
    return "young child";
  }
  if (recipe.ageGroup === "teen") {
    if (gender === "female") return "teenage girl";
    if (gender === "male") return "teenage boy";
    return "androgynous teenager";
  }
  if (recipe.ageGroup === "mature") {
    if (gender === "female") return "mature adult woman";
    if (gender === "male") return "mature adult man";
    return "mature androgynous adult person";
  }
  if (gender === "female") return "adult woman";
  if (gender === "male") return "adult man";
  return "androgynous adult person";
};

const curtainLengthInstruction = (recipe) => {
  const color = recipe.color || "natural brown";
  if (recipe.length === "long") {
    return `long layered curtain hairstyle, ${color} hair, exact center part, long face-framing curtain bangs split from the middle, front layers continue past the jaw and shoulders, length visibly preserved below the shoulders, not a bob, not neck length`;
  }
  if (recipe.length === "medium") {
    return `medium-length curtain fringe haircut, ${color} hair, exact center part, two soft front curtains split from the middle and falling toward the cheekbones, sides connected around the ears, no side part`;
  }
  return `short curtain fringe haircut, ${color} hair, exact center part, two compact front curtains split from the middle, tidy tapered sides, no side part`;
};

const buildStableHairReferencePrompt = (payload = {}) => {
  const recipe = normalizeReferenceRecipe(payload);
  const subjectTerm = referenceSubjectTerm(recipe);

  if (recipe.family === "curtain") {
    return [
      `realistic close-up studio headshot photograph of one ${subjectTerm}`,
      curtainLengthInstruction(recipe),
      "natural hair attached to scalp, symmetrical front view, visible middle part line, no pigtails, no side bunches, no floating hair pieces",
      "one face only, one head only, clean gray studio background, professional salon hair catalog photo",
      `selection criteria: ${referencePreferenceInstruction(recipe)}`,
      `morphology goal: ${recipe.objective}`,
      `face shape adaptation: ${recipe.faceShape}`,
      "realistic strands, clean scalp connection, no panels, no collage, no text, no logo, no watermark"
    ].join(", ");
  }

  return [
    `single realistic professional hair salon portrait photograph of one ${subjectTerm}`,
    "one person only, one head only, one face only, single full-frame image, strict front-facing passport-style headshot, centered face, symmetrical camera angle, head fills most of the frame, neutral studio background, even soft lighting",
    referenceFamilyInstruction(recipe),
    `selection criteria: ${referencePreferenceInstruction(recipe)}`,
    `morphology goal: ${recipe.objective}`,
    `face shape adaptation: ${recipe.faceShape}`,
    "hair clearly visible, realistic strands, clean scalp connection, single continuous portrait, no border, no frame, no panels, no collage, no text, no logo, no watermark"
  ].join(", ");
};

const buildStableHairReferenceNegativePrompt = (payload = {}) => {
  const recipe = normalizeReferenceRecipe(payload);
  const negatives = [
    "text",
    "logo",
    "watermark",
    "collage",
    "photo collage",
    "montage",
    "split screen",
    "side by side",
    "before after",
    "before and after",
    "two images",
    "three images",
    "four images",
    "image grid",
    "panel layout",
    "two panel portrait",
    "split portrait",
    "diptych",
    "framed photo",
    "photo border",
    "black border",
    "white border",
    "picture frame",
    "matted photo",
    "framed headshot",
    "partial face at edge",
    "cropped second face",
    "second portrait",
    "front and back view",
    "back view",
    "rear view",
    "back of head",
    "contact sheet",
    "small inset image",
    "circular inset",
    "round inset",
    "zoomed detail",
    "detail view",
    "hair swatch",
    "hair sample",
    "magnifying glass",
    "duplicate person",
    "duplicate face",
    "extra head",
    "extra face",
    "multiple people",
    "multiple faces",
    "pigtails",
    "twin tails",
    "double side bunches",
    "side hair clumps",
    "hair knots",
    "hair buns",
    "hat",
    "cap",
    "wig",
    "detached hair",
    "floating hair",
    "cartoon",
    "illustration",
    "deformed face",
    "blurry",
    "three quarter view",
    "turned body",
    "side view",
    "full torso",
    "wide crop"
  ];
  if (recipe.length === "short") negatives.push("long hair", "shoulder length hair", "large side hair");
  if (recipe.length !== "long") negatives.push("hair below jaw", "hair below neck", "shoulder length hair", "long back hair", "tail of hair behind neck", "ponytail");
  if (recipe.family === "side_part") negatives.push("center part", "curtain hair", "mullet", "neck-length hair");
  if (recipe.family === "crop") negatives.push("mirror portrait", "twin portrait", "two heads", "two faces");
  if (recipe.family === "curtain") {
    negatives.push("side part", "bare forehead", "slicked back hair", "crew cut", "buzz cut", "short crop", "mullet");
    if (recipe.length !== "long") negatives.push("shoulder length hair", "long hair below jaw", "hair below neck");
  }
  if (recipe.family === "fringe") negatives.push("bare forehead", "exposed forehead", "no bangs", "side part only", "slicked back hair");
  if (recipe.family === "waves") negatives.push("straight hair", "flat hair", "slick hair");
  if (recipe.family === "waves") negatives.push("brushed-up quiff", "high quiff", "pompadour top", "business side part", "straight side part", "short slick haircut");
  if (recipe.family === "side_part" && recipe.length === "long") negatives.push("bob haircut", "short bob", "neck length hair", "hair above shoulders");
  if (recipe.family === "curtain" && recipe.length === "long") negatives.push("bob haircut", "short bob", "neck length hair", "hair above shoulders");
  if (recipe.family === "long_flow") negatives.push("short hair", "bob haircut", "hair above shoulders", "cropped neck");
  if (recipe.family === "layered") negatives.push("blunt bob", "single length bob", "straight flat hair");
  if (recipe.family !== "volume") negatives.push("pompadour", "oversized quiff");
  if (recipe.fringe === "none") negatives.push("heavy bangs");
  return negatives.join(", ");
};

const getStableHairReferenceSeed = (key, recipe) => {
  if (recipe.family === "curtain") return 606;
  if (recipe.family === "taper" && recipe.gender === "male" && recipe.ageGroup === "adult") return 2129204103;
  if (recipe.family === "taper" && recipe.gender === "male" && recipe.ageGroup === "teen") return 1290767138;
  if (recipe.family === "taper" && recipe.gender === "non-binary") return 803101897;
  if (recipe.family === "waves" && recipe.gender === "male") return 426225346;
  return seedFromText(`${key}-${recipe.family}`);
};

const sanitizeDynamicReferenceImage = async (imagePath) => {
  if (process.env.LOCAL_REFERENCE_SANITIZE_ENABLED === "false") return false;
  const scriptPath = process.env.LOCAL_REFERENCE_SANITIZE_SCRIPT || DEFAULT_LOCAL_REFERENCE_SANITIZE_SCRIPT;
  const pythonPath = process.env.LOCAL_PYTHON_EXECUTABLE || DEFAULT_LOCAL_PYTHON_EXECUTABLE;
  if (!existsSync(scriptPath) || !existsSync(pythonPath) || !existsSync(imagePath)) return false;

  const markerPath = `${imagePath}.sanitize-${REFERENCE_SANITIZE_VERSION}`;
  try {
    if (existsSync(markerPath)) {
      const [imageStat, markerStat] = await Promise.all([stat(imagePath), stat(markerPath)]);
      if (markerStat.mtimeMs >= imageStat.mtimeMs) return false;
    }
  } catch {
    // Re-run the sanitizer when the marker cannot be checked.
  }

  const size = Math.max(384, Math.min(768, Number(process.env.LOCAL_COMFY_REFERENCE_WIDTH || 512)));
  try {
    await execFileAsync(pythonPath, [
      scriptPath,
      "--input", imagePath,
      "--output", imagePath,
      "--size", String(size),
      "--always-crop"
    ], {
      timeout: Math.max(30000, Number(process.env.LOCAL_REFERENCE_SANITIZE_TIMEOUT_MS || 180000)),
      cwd: rootDir
    });
    await writeFile(markerPath, `${REFERENCE_SANITIZE_VERSION}\n${new Date().toISOString()}\n`, "utf8");
    return true;
  } catch (error) {
    console.warn("Reference sanitizer skipped:", error.message);
    return false;
  }
};

const getStableHairScale = (payload = {}) => {
  const recipe = normalizeReferenceRecipe(payload);
  const familyKey = String(recipe.family || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const familyValue = process.env[`LOCAL_STABLEHAIR_${familyKey}_HAIR_SCALE`];
  if (familyValue !== undefined) {
    return Math.max(0.2, Math.min(2, Number(familyValue || 1)));
  }
  if (recipe.family === "curtain") return 0.8;
  return Math.max(0.2, Math.min(2, Number(process.env.LOCAL_STABLEHAIR_HAIR_SCALE || 1)));
};

const ensureDynamicStableHairReference = async (payload = {}) => {
  if (process.env.LOCAL_DYNAMIC_STABLEHAIR_REFERENCES === "false") {
    throw Object.assign(new Error("References dynamiques desactivees."), { status: 503 });
  }
  const key = referenceRecipeCacheKey(payload);
  const outputPath = referenceCachePathForKey(key);
  if (existsSync(outputPath)) {
    await sanitizeDynamicReferenceImage(outputPath);
    return { key, path: outputPath, fromCache: true };
  }
  if (!isLocalComfyEnabled() || !(await pingLocalComfy())) {
    throw Object.assign(new Error("ComfyUI requis pour generer la reference dynamique."), { status: 503 });
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const scriptPath = process.env.LOCAL_COMFY_PREVIEW_SCRIPT || DEFAULT_LOCAL_COMFY_PREVIEW_SCRIPT;
  const timeoutMs = Math.max(120000, Number(process.env.LOCAL_COMFY_REFERENCE_TIMEOUT_MS || process.env.LOCAL_COMFY_PREVIEW_TIMEOUT_MS || 600000));
  const recipe = normalizeReferenceRecipe(payload);
  const args = [
    scriptPath,
    "--api", getLocalComfyApi(),
    "--output", outputPath,
    "--prompt", buildStableHairReferencePrompt(payload),
    "--negative", buildStableHairReferenceNegativePrompt(payload),
    "--width", String(Math.max(384, Math.min(768, Number(process.env.LOCAL_COMFY_REFERENCE_WIDTH || 512)))),
    "--height", String(Math.max(384, Math.min(768, Number(process.env.LOCAL_COMFY_REFERENCE_HEIGHT || 512)))),
    "--steps", String(Math.max(6, Math.min(28, Number(process.env.LOCAL_COMFY_REFERENCE_STEPS || process.env.LOCAL_COMFY_PREVIEW_STEPS || 14)))),
    "--guidance", String(Math.max(1, Math.min(12, Number(process.env.LOCAL_COMFY_REFERENCE_GUIDANCE || process.env.LOCAL_COMFY_PREVIEW_GUIDANCE || 6.5)))),
    "--seed", String(getStableHairReferenceSeed(key, recipe)),
    "--prefix", `morphostyle-reference-${key}`
  ];

  await execFileAsync(process.execPath, args, { timeout: timeoutMs, cwd: rootDir });
  if (!existsSync(outputPath)) {
    throw Object.assign(new Error("Reference dynamique non generee."), { status: 502 });
  }
  await sanitizeDynamicReferenceImage(outputPath);
  return { key, path: outputPath, fromCache: false };
};

const resolveLocalStableHairReferencePath = async (payload = {}) => {
  try {
    const dynamicReference = await ensureDynamicStableHairReference(payload);
    return dynamicReference.path;
  } catch (error) {
    console.warn("Reference dynamique indisponible, fallback reference configuree.", error.message);
  }
  const configuredFallback = getConfiguredStableHairReferencePath(payload.style);
  if (configuredFallback && isShortHairStyle(payload.style)) return configuredFallback;
  return "";
};

const getPreviewMaskProfileForStyle = (style = {}) => {
  const text = getStyleSearchText(style);
  if (/taper|crop|court|short|fondu|degrade|degrad/.test(text)) return "preview-short";
  if (/volume|vertical|height|quiff|layered/.test(text)) return "preview-top";
  if (/curtain|rideau|long|flow|frame/.test(text)) return "preview-medium";
  if (/wave|ondulation|wavy|curl|boucle/.test(text)) return "preview-medium";
  if (/balayage|side|raie|lateral|sweep|part/.test(text)) return "preview-side";
  return "preview-top";
};

const maskGeometryFor = (profile, width, height) => {
  const cx = Math.round(width * 0.5);
  const normalized = String(profile || "balanced").toLowerCase();
  const top = {
    x: cx,
    y: Math.round(height * 0.245),
    rx: Math.round(width * 0.39),
    ry: Math.round(height * 0.165)
  };
  const crown = {
    x: cx,
    y: Math.round(height * 0.18),
    rx: Math.round(width * 0.29),
    ry: Math.round(height * 0.1)
  };
  const faceCut = {
    x: cx,
    y: Math.round(height * 0.43),
    rx: Math.round(width * 0.25),
    ry: Math.round(height * 0.29)
  };

  const sideHeight = normalized.includes("long") || normalized.includes("wave")
    ? Math.round(height * 0.3)
    : Math.round(height * 0.28);
  const sides = normalized.includes("short")
    ? []
    : [
      {
        x: Math.round(width * 0.2),
        y: Math.round(height * 0.35),
        rx: Math.round(width * 0.075),
        ry: Math.round(sideHeight * 0.5)
      },
      {
        x: Math.round(width * 0.8),
        y: Math.round(height * 0.35),
        rx: Math.round(width * 0.075),
        ry: Math.round(sideHeight * 0.5)
      }
    ];

  if (normalized.includes("side")) {
    sides[0] = {
      x: Math.round(width * 0.2),
      y: Math.round(height * 0.34),
      rx: Math.round(width * 0.075),
      ry: Math.round(height * 0.17)
    };
  }

  return { top, crown, sides, faceCut };
};

const createAiHordeHairMaskBase64 = async ({ sharp, profile, width, height }) => {
  const geometry = maskGeometryFor(profile, width, height);
  const whiteShapes = [
    `<ellipse cx="${geometry.top.x}" cy="${geometry.top.y}" rx="${geometry.top.rx}" ry="${geometry.top.ry}" fill="white" />`,
    `<ellipse cx="${geometry.crown.x}" cy="${geometry.crown.y}" rx="${geometry.crown.rx}" ry="${geometry.crown.ry}" fill="white" />`,
    ...geometry.sides.map(side => `<ellipse cx="${side.x}" cy="${side.y}" rx="${side.rx}" ry="${side.ry}" fill="white" />`)
  ].join("");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="black" />
      ${whiteShapes}
      <ellipse cx="${geometry.faceCut.x}" cy="${geometry.faceCut.y}" rx="${geometry.faceCut.rx}" ry="${geometry.faceCut.ry}" fill="black" />
    </svg>`;

  return (await sharp(Buffer.from(svg)).blur(7).webp({ quality: 96 }).toBuffer()).toString("base64");
};

const prepareAiHordeInpaintSource = async ({ data, style }) => {
  const sharp = loadSharp();
  if (!sharp) {
    throw new Error("Sharp indisponible pour preparer le masque AI Horde.");
  }

  const width = Math.max(384, Math.min(768, Number(process.env.AI_HORDE_WIDTH || 512)));
  const height = Math.max(384, Math.min(768, Number(process.env.AI_HORDE_HEIGHT || 640)));
  const source = await sharp(Buffer.from(data, "base64"))
    .rotate()
    .resize(width, height, { fit: "cover", position: "center" })
    .webp({ quality: 92 })
    .toBuffer();
  const sourceMask = await createAiHordeHairMaskBase64({
    sharp,
    profile: getMaskProfileForStyle(style),
    width,
    height
  });

  return {
    sourceImageBase64: source.toString("base64"),
    sourceMaskBase64: sourceMask,
    sourceProcessing: "inpainting",
    width,
    height
  };
};

const buildLocalComfyPrompt = (payload) => {
  const normalizedStyle = normalizeStyle(payload.style);
  const genderContext = String(payload.gender || "").toLowerCase();
  const isMale = genderContext === "male" || genderContext === "man" || genderContext === "masculin";
  const styleText = getStyleSearchText(payload.style);
  const colorInstruction = buildPreviewColorInstruction(normalizedStyle.color);
  const familyInstruction = (() => {
    if (/taper|crop|court|short|fondu|degrade|degrad/.test(styleText)) {
      return [
        "final hairstyle family: true short men's haircut",
        "short textured top about 1 to 3 cm, low volume, close tapered sides, clean temples, clean natural hairline",
        "remove tall quiff volume and remove medium curtain length"
      ].join(", ");
    }
    if (/volume|vertical|height|quiff|layered/.test(styleText)) {
      return "final hairstyle family: vertical textured volume, brushed-up top, controlled sides, visible salon texture";
    }
    if (/curtain|rideau/.test(styleText)) {
      return "final hairstyle family: men's curtain fringe, soft center part, medium length front fringe near forehead and temples";
    }
    if (/wave|ondulation|wavy|curl|boucle/.test(styleText)) {
      return "final hairstyle family: men's natural wavy hairstyle, medium length waves on top, tidy side layers";
    }
    if (/balayage|side|raie|lateral|sweep|part/.test(styleText)) {
      return "final hairstyle family: side swept men's haircut, one clean diagonal part, lateral movement across the top";
    }
    return "final hairstyle family: tidy professional men's salon haircut";
  })();
  return [
    "realistic professional salon portrait edit of the uploaded person",
    "replace the existing haircut inside the hair area with the target haircut",
    "make the new haircut clearly visible and structurally different from the source when needed",
    "keep the exact same person and preserve face identity, facial structure, expression, skin, clothing, background and lighting",
    "do not alter the eyes, nose, mouth, jaw, neck, clothes or background",
    isMale ? "for a male adult, keep a natural masculine salon haircut fitted to the requested family" : "",
    familyInstruction,
    `target haircut: ${normalizedStyle.name}`,
    `hair shape: ${normalizedStyle.description}`,
    `hair color instruction: ${colorInstruction}`,
    normalizedStyle.faceShape ? `adapt to ${normalizedStyle.faceShape}` : "",
    "natural real hair growing from the scalp, realistic hairline, professional retouch",
    "no overlay, no sticker, no drawn shape, no pasted wig, no hat, no cap, no text, no watermark"
  ].filter(Boolean).join(", ");
};

const buildLocalComfyNegativePrompt = (payload = {}) => {
  const genderContext = String(payload.gender || "").toLowerCase();
  const styleText = getStyleSearchText(payload.style);
  const maleOnly = genderContext === "male" || genderContext === "man" || genderContext === "masculin"
    ? ["woman", "feminine face", "shoulder-length hair", "long feminine hair"]
    : [];
  const shortOnly = /taper|crop|court|short|fondu|degrade|degrad/.test(styleText)
    ? ["medium curtain length", "long top", "tall quiff", "high pompadour", "large volume hair", "messy high hair", "side swept long hair"]
    : [];
  return [
  "changed identity",
  "different person",
  ...maleOnly,
  ...shortOnly,
  "deformed face",
  "beautified face",
  "changed eyes",
  "changed nose",
  "changed mouth",
  "extra hair object",
  "pasted wig",
  "hat",
  "cap",
  "sticker",
  "overlay",
  "cartoon",
  "painting",
  "background halo",
  "visible mask",
  "grey blob",
  "text",
  "logo",
  "watermark"
].join(", ");
};

const buildLocalPhotoMakerPrompt = (payload = {}) => {
  const normalizedStyle = normalizeStyle(payload.style);
  const genderContext = String(payload.gender || "").toLowerCase();
  const personTerm = genderContext === "female"
    ? "woman"
    : genderContext === "male"
      ? "man"
      : "person";
  const styleText = getStyleSearchText(payload.style);
  const target = genderContext === "female"
    ? "short pixie crop, clean neckline"
    : /taper|fondu|degrade|degrad/.test(styleText)
      ? "short textured crop, low taper fade"
      : "short crew cut, low taper";
  const color = /blond|miel|honey|caramel|lumineux|reflet/.test(String(normalizedStyle.color || "").toLowerCase())
    ? "natural brown hair with subtle warm highlights"
    : "natural brown hair";

  return [
    `photo of photomaker ${personTerm}`,
    "same face",
    "grey t-shirt",
    target,
    color,
    "grey studio portrait"
  ].join(", ");
};

const buildLocalPhotoMakerNegativePrompt = (payload = {}) => {
  const genderContext = String(payload.gender || "").toLowerCase();
  const genderNegative = genderContext === "male"
    ? "woman, feminine face"
    : genderContext === "female"
      ? "man, beard"
      : "";
  return [
    "different person",
    genderNegative,
    "long hair",
    "medium hair",
    "tall quiff",
    "high volume",
    "pompadour",
    "wig",
    "hat",
    "text",
    "watermark"
  ].filter(Boolean).join(", ");
};

const buildLocalInstantIDPrompt = (payload = {}) => {
  const normalizedStyle = normalizeStyle(payload.style);
  const genderContext = String(payload.gender || "").toLowerCase();
  const personTerm = genderContext === "female"
    ? "woman"
    : genderContext === "male"
      ? "man"
      : "person";
  const styleText = getStyleSearchText(payload.style);
  const target = genderContext === "female"
    ? "short pixie crop, clean neckline"
    : /buzz|crew|taper|crop|court|short|fondu|degrade|degrad/.test(styleText)
      ? "short cropped crew cut, compact low top about 1 to 2 cm, clipped tapered sides, low flat hair silhouette, clean temples, no quiff"
      : "short salon haircut";
  const color = /blond|miel|honey|caramel|lumineux|reflet/.test(String(normalizedStyle.color || "").toLowerCase())
    ? "natural brown hair with subtle warm highlights"
    : "natural brown hair";

  return [
    `realistic inpaint edit of the uploaded portrait of the same ${personTerm}`,
    "keep the exact same face identity, eyes, nose, mouth, jaw, ears, skin, expression, clothes, background, lighting, and camera framing",
    "change only the real hair inside the hair mask",
    "grey t-shirt",
    "neutral grey background",
    target,
    color
  ].join(", ");
};

const buildLocalInstantIDNegativePrompt = (payload = {}) => {
  const genderContext = String(payload.gender || "").toLowerCase();
  const genderNegative = genderContext === "male"
    ? "woman, feminine face"
    : genderContext === "female"
      ? "man, beard"
      : "";
  return [
    "different person",
    "changed identity",
    "changed eye color",
    genderNegative,
    "long hair",
    "medium hair",
    "tall quiff",
    "high hair",
    "high volume",
    "pompadour",
    "fringe",
    "styled quiff",
    "big hair",
    "wig",
    "hat",
    "suit",
    "tie",
    "text",
    "watermark"
  ].filter(Boolean).join(", ");
};

const createPhotoMakerIdentityCrop = async ({ sourcePath, outputPath }) => {
  const sharp = loadSharp();
  if (!sharp) return false;

  const image = sharp(sourcePath).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) return false;

  const left = Math.max(0, Math.round(width * 0.16));
  const top = Math.max(0, Math.round(height * 0.04));
  const cropWidth = Math.min(width - left, Math.round(width * 0.68));
  const cropHeight = Math.min(height - top, Math.round(height * 0.64));
  if (cropWidth < 64 || cropHeight < 64) return false;

  await sharp(sourcePath)
    .rotate()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(768, 768, { fit: "cover", position: "center" })
    .png()
    .toFile(outputPath);

  return true;
};

const submitAiHordeGeneration = async ({
  prompt,
  sourceImageBase64 = "",
  sourceMaskBase64 = "",
  sourceProcessing = "img2img",
  width,
  height,
  timeoutMs = 180000
}) => {
  const models = getAiHordeModels();
  const isInpainting = sourceProcessing === "inpainting";
  const body = {
    prompt,
    params: {
      sampler_name: process.env.AI_HORDE_SAMPLER || "k_euler_a",
      cfg_scale: Math.max(1, Math.min(12, Number(process.env.AI_HORDE_CFG_SCALE || 7))),
      denoising_strength: Math.max(0.15, Math.min(0.95, Number(
        isInpainting
          ? process.env.AI_HORDE_INPAINT_DENOISING || 0.78
          : process.env.AI_HORDE_DENOISING || 0.55
      ))),
      height: height || Math.max(384, Math.min(768, Number(process.env.AI_HORDE_HEIGHT || 640))),
      width: width || Math.max(384, Math.min(768, Number(process.env.AI_HORDE_WIDTH || 512))),
      steps: Math.max(6, Math.min(30, Number(process.env.AI_HORDE_STEPS || 12))),
      n: 1
    },
    nsfw: false,
    trusted_workers: false,
    validated_backends: true,
    slow_workers: true,
    extra_slow_workers: true,
    censor_nsfw: true,
    models,
    r2: false,
    shared: false,
    replacement_filter: true,
    allow_downgrade: true
  };

  if (sourceImageBase64) {
    body.source_image = sourceImageBase64;
    body.source_processing = sourceProcessing;
  }
  if (sourceMaskBase64) {
    body.source_mask = sourceMaskBase64;
  }

  const headers = {
    "Content-Type": "application/json",
    "apikey": getAiHordeApiKey(),
    "Client-Agent": "MorphoStyle:0.1:codex"
  };

  const submit = await fetchJsonWithTimeout("https://aihorde.net/api/v2/generate/async", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }, 45000);

  if (!submit.response.ok || !submit.payload?.id) {
    const detail = submit.payload?.message || submit.payload?.error || `HTTP ${submit.response.status}`;
    throw Object.assign(new Error(`AI Horde n'a pas accepte la generation: ${detail}`), { status: submit.response.status || 502 });
  }

  const id = submit.payload.id;
  const startedAt = Date.now();
  let lastStatus = null;
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(Math.max(2500, Math.min(10000, Number(lastStatus?.wait_time || 3) * 1000)));
    const status = await fetchJsonWithTimeout(`https://aihorde.net/api/v2/generate/status/${id}`, {
      headers
    }, 30000);

    if (!status.response.ok) {
      throw Object.assign(new Error(`AI Horde status indisponible: HTTP ${status.response.status}`), { status: status.response.status || 502 });
    }

    lastStatus = status.payload;
    if (lastStatus?.faulted) {
      throw Object.assign(new Error("AI Horde a marque la generation en erreur."), { status: 502 });
    }
    if (lastStatus?.is_possible === false) {
      throw Object.assign(new Error("AI Horde n'a pas de worker disponible pour cette generation."), { status: 503 });
    }
    const generation = lastStatus?.generations?.find(item => item?.img);
    if (generation?.img) {
      const img = generation.img;
      return img.startsWith("http") || img.startsWith("data:")
        ? img
        : `data:image/webp;base64,${img}`;
    }
    if (lastStatus?.done) break;
  }

  throw Object.assign(new Error("AI Horde n'a pas retourne d'image dans le delai gratuit."), { status: 504 });
};

const generateWithGemini = async (payload) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  if (!apiKey || /PLACEHOLDER/i.test(apiKey)) {
    throw Object.assign(new Error("GEMINI_API_KEY manquante ou placeholder."), { status: 503 });
  }

  const { data, mimeType } = imageDataUrlFromPayload(payload);
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_IMAGE_MODEL || process.env.VITE_GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const prompt = buildHairPrompt({
    style: payload.style,
    gender: payload.gender || "non-binary",
    ageGroup: payload.ageGroup || "adult",
    angle: payload.angle || "front"
  });

  const response = await ai.models.generateContent({
    model,
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data
        }
      }
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || response.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const outputMime = part.inlineData.mimeType || "image/png";
      return {
        imageUrl: `data:${outputMime};base64,${part.inlineData.data}`,
        mimeType: outputMime,
        model
      };
    }
  }

  throw Object.assign(new Error("Gemini n'a pas retourne d'image."), { status: 502 });
};

const generateWithLocalStableHair = async (payload) => {
  if (!isLocalStableHairEnabled()) {
    throw Object.assign(new Error("Stable-Hair local desactive."), { status: 503 });
  }

  const scriptPath = process.env.LOCAL_STABLEHAIR_SCRIPT || DEFAULT_LOCAL_STABLEHAIR_SCRIPT;
  const pythonPath = process.env.LOCAL_PYTHON_EXECUTABLE || DEFAULT_LOCAL_PYTHON_EXECUTABLE;
  const repoRoot = process.env.LOCAL_STABLEHAIR_REPO_ROOT || DEFAULT_LOCAL_STABLEHAIR_REPO_ROOT;
  const referencePath = await resolveLocalStableHairReferencePath(payload);
  if (!existsSync(scriptPath) || !existsSync(pythonPath) || !existsSync(repoRoot) || !existsSync(referencePath)) {
    throw Object.assign(new Error("Stable-Hair local incomplet."), { status: 503 });
  }

  const { data, mimeType } = imageDataUrlFromPayload(payload);
  const tmpDir = path.join(rootDir, "output", "tmp", "stablehair");
  await mkdir(tmpDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const inputPath = path.join(tmpDir, `stablehair-source-${stamp}.${extension}`);
  const outputPath = path.join(tmpDir, `stablehair-result-${stamp}.png`);
  const restoredOutputPath = path.join(tmpDir, `stablehair-restored-${stamp}.png`);
  await writeFile(inputPath, Buffer.from(data, "base64"));

  const size = Math.max(384, Math.min(768, Number(process.env.LOCAL_STABLEHAIR_SIZE || 512)));
  const timeoutMs = Math.max(300000, Number(process.env.LOCAL_STABLEHAIR_TIMEOUT_MS || 1200000));
  const args = [
    scriptPath,
    "--repo-root", repoRoot,
    "--source", inputPath,
    "--reference", referencePath,
    "--output", outputPath,
    "--pretrained-model", process.env.LOCAL_STABLEHAIR_PRETRAINED_MODEL || "stable-diffusion-v1-5/stable-diffusion-v1-5",
    "--size", String(size),
    "--steps", String(Math.max(10, Math.min(40, Number(process.env.LOCAL_STABLEHAIR_STEPS || 25)))),
    "--seed", String(Number(process.env.LOCAL_STABLEHAIR_SEED || 1234) || 1234),
    "--guidance-scale", String(Math.max(0.5, Math.min(6, Number(process.env.LOCAL_STABLEHAIR_GUIDANCE || 1.5)))),
    "--hair-scale", String(getStableHairScale(payload)),
    "--bald-scale", String(Math.max(0.2, Math.min(1.5, Number(process.env.LOCAL_STABLEHAIR_BALD_SCALE || 0.9)))),
    "--controlnet-scale", String(Math.max(0.2, Math.min(2, Number(process.env.LOCAL_STABLEHAIR_CONTROLNET_SCALE || 1)))),
    "--dtype", process.env.LOCAL_STABLEHAIR_DTYPE === "fp32" ? "fp32" : "fp16"
  ];

  let stoppedComfy = false;
  try {
    stoppedComfy = await stopLocalComfyForStableHair();
    await execFileAsync(pythonPath, args, { timeout: timeoutMs, cwd: rootDir });
    const restored = await restoreGeneratedFaceWithLandmarks({
      sourcePath: inputPath,
      generatedPath: outputPath,
      outputPath: restoredOutputPath,
      width: size,
      height: size
    });
    const output = await readFile(restored ? restoredOutputPath : outputPath);
    return {
      imageUrl: `data:image/png;base64,${output.toString("base64")}`,
      mimeType: "image/png",
      model: restored
        ? "Local Stable-Hair hair transfer + landmark face restore"
        : "Local Stable-Hair hair transfer"
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
    await rm(restoredOutputPath, { force: true }).catch(() => {});
    await restartLocalComfyAfterStableHair(stoppedComfy);
  }
};

const generateWithLocalInstantID = async (payload) => {
  if (!isLocalComfyEnabled() || !isLocalInstantIDEnabled()) {
    throw Object.assign(new Error("InstantID local desactive."), { status: 503 });
  }
  if (!(await pingLocalComfy())) {
    throw Object.assign(new Error("ComfyUI local indisponible."), { status: 503 });
  }

  const { data, mimeType } = imageDataUrlFromPayload(payload);
  const tmpDir = path.join(rootDir, "output", "tmp", "comfy");
  await mkdir(tmpDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const inputPath = path.join(tmpDir, `instantid-source-${stamp}.${extension}`);
  const outputPath = path.join(tmpDir, `instantid-result-${stamp}.png`);
  const restoredOutputPath = path.join(tmpDir, `instantid-restored-${stamp}.png`);
  await writeFile(inputPath, Buffer.from(data, "base64"));

  const scriptPath = process.env.LOCAL_COMFY_INSTANTID_SCRIPT || DEFAULT_LOCAL_COMFY_INSTANTID_SCRIPT;
  const timeoutMs = Math.max(120000, Number(process.env.LOCAL_COMFY_INSTANTID_TIMEOUT_MS || process.env.LOCAL_COMFY_TIMEOUT_MS || 600000));
  const outputWidth = Math.max(384, Math.min(1024, Number(process.env.LOCAL_COMFY_INSTANTID_WIDTH || process.env.LOCAL_COMFY_WIDTH || 640)));
  const outputHeight = Math.max(384, Math.min(1024, Number(process.env.LOCAL_COMFY_INSTANTID_HEIGHT || process.env.LOCAL_COMFY_HEIGHT || 800)));
  const args = [
    scriptPath,
    "--api", getLocalComfyApi(),
    "--input", inputPath,
    "--output", outputPath,
    "--prompt", buildLocalInstantIDPrompt(payload),
    "--negative", buildLocalInstantIDNegativePrompt(payload),
    "--width", String(outputWidth),
    "--height", String(outputHeight),
    "--mode", process.env.LOCAL_COMFY_INSTANTID_MODE || "inpaint",
    "--mask-profile", process.env.LOCAL_COMFY_INSTANTID_MASK_PROFILE || "clipseg-safe",
    "--steps", String(Math.max(8, Math.min(36, Number(process.env.LOCAL_COMFY_INSTANTID_STEPS || 32)))),
    "--guidance", String(Math.max(1, Math.min(12, Number(process.env.LOCAL_COMFY_INSTANTID_GUIDANCE || 7)))),
    "--denoise", String(Math.max(0.2, Math.min(1, Number(process.env.LOCAL_COMFY_INSTANTID_DENOISE || 1)))),
    "--seed", String(Number(process.env.LOCAL_COMFY_INSTANTID_SEED || 314159) || 314159),
    "--ip-weight", String(Math.max(0.1, Math.min(2.5, Number(process.env.LOCAL_COMFY_INSTANTID_IP_WEIGHT || 0.95)))),
    "--control-strength", String(Math.max(0.1, Math.min(2.5, Number(process.env.LOCAL_COMFY_INSTANTID_CONTROL_STRENGTH || 0.35)))),
    "--noise", String(Math.max(0, Math.min(1, Number(process.env.LOCAL_COMFY_INSTANTID_NOISE || 0.35)))),
    "--clipseg-text", process.env.LOCAL_COMFY_INSTANTID_CLIPSEG_TEXT || "hair on the head",
    "--clipseg-threshold", String(Math.max(0.05, Math.min(0.95, Number(process.env.LOCAL_COMFY_INSTANTID_CLIPSEG_THRESHOLD || 0.38)))),
    "--clipseg-expand", String(Math.max(0, Math.min(64, Number(process.env.LOCAL_COMFY_INSTANTID_CLIPSEG_EXPAND || 18)))),
    "--clipseg-blur", String(Math.max(0, Math.min(48, Number(process.env.LOCAL_COMFY_INSTANTID_CLIPSEG_BLUR || 8)))),
    "--clipseg-use-cuda", process.env.LOCAL_COMFY_INSTANTID_CLIPSEG_USE_CUDA === "false" ? "false" : "true",
    "--prefix", `morphostyle-instantid-${stamp}`
  ];

  try {
    await execFileAsync(process.execPath, args, { timeout: timeoutMs, cwd: rootDir });
    const restored = await restoreGeneratedFaceWithLandmarks({
      sourcePath: inputPath,
      generatedPath: outputPath,
      outputPath: restoredOutputPath,
      width: outputWidth,
      height: outputHeight
    });
    const output = await readFile(restored ? restoredOutputPath : outputPath);
    return {
      imageUrl: `data:image/png;base64,${output.toString("base64")}`,
      mimeType: "image/png",
      model: restored
        ? "Local ComfyUI InstantID inpaint + CLIPSeg hair mask + landmark face restore"
        : "Local ComfyUI InstantID inpaint + CLIPSeg hair mask"
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
    await rm(restoredOutputPath, { force: true }).catch(() => {});
  }
};

const generateWithLocalPhotoMaker = async (payload) => {
  if (!isLocalComfyEnabled() || !isLocalPhotoMakerEnabled()) {
    throw Object.assign(new Error("PhotoMaker local desactive."), { status: 503 });
  }
  if (!(await pingLocalComfy())) {
    throw Object.assign(new Error("ComfyUI local indisponible."), { status: 503 });
  }

  const { data, mimeType } = imageDataUrlFromPayload(payload);
  const tmpDir = path.join(rootDir, "output", "tmp", "comfy");
  await mkdir(tmpDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const inputPath = path.join(tmpDir, `photomaker-source-${stamp}.${extension}`);
  const identityPath = path.join(tmpDir, `photomaker-identity-${stamp}.png`);
  const outputPath = path.join(tmpDir, `photomaker-result-${stamp}.png`);
  await writeFile(inputPath, Buffer.from(data, "base64"));

  const hasIdentityCrop = await createPhotoMakerIdentityCrop({
    sourcePath: inputPath,
    outputPath: identityPath
  }).catch(() => false);

  const scriptPath = process.env.LOCAL_COMFY_PHOTOMAKER_SCRIPT || DEFAULT_LOCAL_COMFY_PHOTOMAKER_SCRIPT;
  const timeoutMs = Math.max(120000, Number(process.env.LOCAL_COMFY_PHOTOMAKER_TIMEOUT_MS || process.env.LOCAL_COMFY_TIMEOUT_MS || 600000));
  const args = [
    scriptPath,
    "--api", getLocalComfyApi(),
    "--input", inputPath,
    ...(hasIdentityCrop ? ["--identity-input", identityPath] : []),
    "--output", outputPath,
    "--mode", "text",
    "--controlnet", process.env.LOCAL_COMFY_PHOTOMAKER_CONTROLNET || "openpose",
    "--control-strength", String(Math.max(0.2, Math.min(1.4, Number(process.env.LOCAL_COMFY_PHOTOMAKER_CONTROL_STRENGTH || 0.9)))),
    "--prompt", buildLocalPhotoMakerPrompt(payload),
    "--negative", buildLocalPhotoMakerNegativePrompt(payload),
    "--width", String(Math.max(384, Math.min(1024, Number(process.env.LOCAL_COMFY_PHOTOMAKER_WIDTH || process.env.LOCAL_COMFY_WIDTH || 640)))),
    "--height", String(Math.max(384, Math.min(1024, Number(process.env.LOCAL_COMFY_PHOTOMAKER_HEIGHT || process.env.LOCAL_COMFY_HEIGHT || 800)))),
    "--steps", String(Math.max(8, Math.min(32, Number(process.env.LOCAL_COMFY_PHOTOMAKER_STEPS || 28)))),
    "--guidance", String(Math.max(1, Math.min(12, Number(process.env.LOCAL_COMFY_PHOTOMAKER_GUIDANCE || 5.5)))),
    "--seed", String(Number(process.env.LOCAL_COMFY_PHOTOMAKER_SEED || 5555) || 5555),
    "--prefix", `morphostyle-photomaker-${stamp}`
  ];

  try {
    await execFileAsync(process.execPath, args, { timeout: timeoutMs, cwd: rootDir });
    const output = await readFile(outputPath);
    return {
      imageUrl: `data:image/png;base64,${output.toString("base64")}`,
      mimeType: "image/png",
      model: "Local ComfyUI PhotoMaker + OpenPose short-hair generation"
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(identityPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
};

const generateWithLocalComfy = async (payload) => {
  if (!isLocalComfyEnabled()) {
    throw Object.assign(new Error("ComfyUI local desactive."), { status: 503 });
  }
  if (!(await pingLocalComfy())) {
    throw Object.assign(new Error("ComfyUI local indisponible."), { status: 503 });
  }

  const { data, mimeType } = imageDataUrlFromPayload(payload);
  const tmpDir = path.join(rootDir, "output", "tmp", "comfy");
  await mkdir(tmpDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const inputPath = path.join(tmpDir, `source-${stamp}.${extension}`);
  const outputPath = path.join(tmpDir, `result-${stamp}.png`);
  await writeFile(inputPath, Buffer.from(data, "base64"));

  const scriptPath = process.env.LOCAL_COMFY_IMG2IMG_SCRIPT || DEFAULT_LOCAL_COMFY_SCRIPT;
  const timeoutMs = Math.max(120000, Number(process.env.LOCAL_COMFY_TIMEOUT_MS || 600000));
  const args = [
    scriptPath,
    "--api", getLocalComfyApi(),
    "--input", inputPath,
    "--output", outputPath,
    "--prompt", buildLocalComfyPrompt(payload),
    "--width", String(Math.max(384, Math.min(1024, Number(process.env.LOCAL_COMFY_WIDTH || 640)))),
    "--height", String(Math.max(384, Math.min(1024, Number(process.env.LOCAL_COMFY_HEIGHT || 800)))),
    "--steps", String(Math.max(4, Math.min(20, Number(process.env.LOCAL_COMFY_STEPS || 8)))),
    "--denoise", String(Math.max(0.45, Math.min(0.98, Number(process.env.LOCAL_COMFY_DENOISE || 0.9)))),
    "--guidance", String(Math.max(1, Math.min(12, Number(process.env.LOCAL_COMFY_GUIDANCE || 7)))),
    "--seed", String(getLocalComfyFinalSeed(payload)),
    "--negative", buildLocalComfyNegativePrompt(payload),
    "--mask-profile", getMaskProfileForStyle(payload.style),
    "--prefix", `morphostyle-${stamp}`
  ];

  try {
    await execFileAsync(process.execPath, args, { timeout: timeoutMs, cwd: rootDir });
    const output = await readFile(outputPath);
    return {
      imageUrl: `data:image/png;base64,${output.toString("base64")}`,
      mimeType: "image/png",
      model: "Local ComfyUI SDXL masked hair inpaint"
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
};

const generateWithAiHorde = async (payload) => {
  const { data } = imageDataUrlFromPayload(payload);
  const timeoutMs = Math.max(60000, Number(process.env.AI_HORDE_TIMEOUT_MS || 180000));
  const prompt = buildAiHordePrompt(payload, "img2img");
  const prepared = await prepareAiHordeInpaintSource({ data, style: payload.style });
  const imageUrl = await submitAiHordeGeneration({
    prompt,
    ...prepared,
    timeoutMs
  });

  return {
    imageUrl,
    mimeType: imageUrl.startsWith("data:image/") ? imageUrl.slice(5, imageUrl.indexOf(";")) : "image/webp",
    model: `AI Horde inpainting: ${getAiHordeModels().join(", ")}`
  };
};

const generatePreviewWithLocalComfyText = async (payload) => {
  if (!isLocalComfyEnabled()) {
    throw Object.assign(new Error("ComfyUI local desactive."), { status: 503 });
  }
  if (!(await pingLocalComfy())) {
    throw Object.assign(new Error("ComfyUI local indisponible."), { status: 503 });
  }

  const tmpDir = path.join(rootDir, "output", "tmp", "comfy");
  await mkdir(tmpDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const outputPath = path.join(tmpDir, `preview-${stamp}.png`);
  const scriptPath = process.env.LOCAL_COMFY_PREVIEW_SCRIPT || DEFAULT_LOCAL_COMFY_PREVIEW_SCRIPT;
  const timeoutMs = Math.max(120000, Number(process.env.LOCAL_COMFY_PREVIEW_TIMEOUT_MS || 600000));
  const args = [
    scriptPath,
    "--api", getLocalComfyApi(),
    "--output", outputPath,
    "--prompt", buildLocalComfyPreviewPrompt(payload),
    "--negative", buildLocalComfyPreviewNegativePrompt(payload),
    "--width", String(Math.max(384, Math.min(768, Number(process.env.LOCAL_COMFY_PREVIEW_WIDTH || 512)))),
    "--height", String(Math.max(384, Math.min(896, Number(process.env.LOCAL_COMFY_PREVIEW_HEIGHT || 640)))),
    "--steps", String(Math.max(6, Math.min(24, Number(process.env.LOCAL_COMFY_PREVIEW_STEPS || 14)))),
    "--guidance", String(Math.max(1, Math.min(12, Number(process.env.LOCAL_COMFY_PREVIEW_GUIDANCE || 6.5)))),
    "--seed", String(getLocalComfyPreviewSeed(payload)),
    "--prefix", `morphostyle-preview-${stamp}`
  ];

  try {
    await execFileAsync(process.execPath, args, { timeout: timeoutMs, cwd: rootDir });
    const output = await readFile(outputPath);
    return {
      imageUrl: `data:image/png;base64,${output.toString("base64")}`,
      mimeType: "image/png",
      model: "Local ComfyUI SDXL text-to-image preview"
    };
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
  }
};

const generatePreviewWithLocalComfyImage = async (payload) => {
  if (!isLocalComfyEnabled()) {
    throw Object.assign(new Error("ComfyUI local desactive."), { status: 503 });
  }
  if (!(await pingLocalComfy())) {
    throw Object.assign(new Error("ComfyUI local indisponible."), { status: 503 });
  }

  const { data, mimeType } = imageDataUrlFromPayload(payload);
  const tmpDir = path.join(rootDir, "output", "tmp", "comfy");
  await mkdir(tmpDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const inputPath = path.join(tmpDir, `preview-source-${stamp}.${extension}`);
  const outputPath = path.join(tmpDir, `preview-result-${stamp}.png`);
  await writeFile(inputPath, Buffer.from(data, "base64"));

  const scriptPath = process.env.LOCAL_COMFY_IMG2IMG_SCRIPT || DEFAULT_LOCAL_COMFY_SCRIPT;
  const timeoutMs = Math.max(120000, Number(process.env.LOCAL_COMFY_PREVIEW_TIMEOUT_MS || 600000));
  const args = [
    scriptPath,
    "--api", getLocalComfyApi(),
    "--input", inputPath,
    "--output", outputPath,
    "--prompt", buildLocalComfyPreviewImagePrompt(payload),
    "--width", String(Math.max(384, Math.min(768, Number(process.env.LOCAL_COMFY_PREVIEW_I2I_WIDTH || process.env.LOCAL_COMFY_PREVIEW_WIDTH || 512)))),
    "--height", String(Math.max(384, Math.min(896, Number(process.env.LOCAL_COMFY_PREVIEW_I2I_HEIGHT || process.env.LOCAL_COMFY_PREVIEW_HEIGHT || 640)))),
    "--steps", String(Math.max(6, Math.min(20, Number(process.env.LOCAL_COMFY_PREVIEW_I2I_STEPS || process.env.LOCAL_COMFY_PREVIEW_STEPS || 16)))),
    "--denoise", String(Math.max(0.45, Math.min(0.92, getLocalComfyPreviewImageDenoise(payload)))),
    "--guidance", String(Math.max(1, Math.min(12, Number(process.env.LOCAL_COMFY_PREVIEW_I2I_GUIDANCE || process.env.LOCAL_COMFY_PREVIEW_GUIDANCE || 7)))),
    "--seed", String(getLocalComfyPreviewImageSeed(payload)),
    "--negative", buildLocalComfyPreviewImageNegativePrompt(payload),
    "--mask-profile", getPreviewMaskProfileForStyle(payload.style),
    "--prefix", `morphostyle-preview-i2i-${stamp}`
  ];

  try {
    await execFileAsync(process.execPath, args, { timeout: timeoutMs, cwd: rootDir });
    const output = await readFile(outputPath);
    return {
      imageUrl: `data:image/png;base64,${output.toString("base64")}`,
      mimeType: "image/png",
      model: "Preview locale"
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
};

const generatePreviewWithDynamicStableHairReference = async (payload) => {
  const reference = await ensureDynamicStableHairReference(payload);
  const output = await readFile(reference.path);
  return {
    imageUrl: `data:image/png;base64,${output.toString("base64")}`,
    mimeType: "image/png",
    model: reference.fromCache
      ? "Reference locale en cache"
      : "Reference locale generee",
    referenceCacheKey: reference.key
  };
};

const generatePreviewWithLocalComfy = async (payload) =>
  process.env.LOCAL_REFERENCE_PREVIEWS === "false"
    ? hasImageDataPayload(payload)
      ? generatePreviewWithLocalComfyImage(payload)
      : generatePreviewWithLocalComfyText(payload)
    : generatePreviewWithDynamicStableHairReference(payload);

const generatePreviewWithAiHorde = async (payload) => {
  const timeoutMs = Math.max(60000, Number(process.env.AI_HORDE_PREVIEW_TIMEOUT_MS || 150000));
  const imageUrl = await submitAiHordeGeneration({
    prompt: buildAiHordePrompt(payload, "preview"),
    timeoutMs
  });

  return {
    imageUrl,
    mimeType: imageUrl.startsWith("data:image/") ? imageUrl.slice(5, imageUrl.indexOf(";")) : "image/webp",
    model: "Generation communautaire"
  };
};

const getServerImageProvider = () =>
  (
    process.env.SERVER_IMAGE_TO_IMAGE_PROVIDER ||
    process.env.IMAGE_TO_IMAGE_SERVER_PROVIDER ||
    process.env.IMAGE_TO_IMAGE_PROVIDER ||
    process.env.VITE_SERVER_IMAGE_TO_IMAGE_PROVIDER ||
    ""
  ).toLowerCase();

const generateServerImage = async (payload) => {
  const provider = getServerImageProvider();
  if (provider === "fal-kontext" || provider === "fal") {
    throw Object.assign(new Error("Ce service image est desactive: la chaine doit rester gratuite."), { status: 403 });
  }
  if (provider === "free-chain") {
    try {
      try {
        return await generateWithLocalStableHair(payload);
      } catch (stableHairError) {
        console.warn("Stable-Hair local indisponible, tentative chaines locales suivantes.", stableHairError);
      }
      if (isShortHairStyle(payload.style)) {
        try {
          return await generateWithLocalInstantID(payload);
        } catch (instantIDError) {
          console.warn("InstantID local indisponible, tentative PhotoMaker local.", instantIDError);
        }
        try {
          return await generateWithLocalPhotoMaker(payload);
        } catch (photoMakerError) {
          console.warn("PhotoMaker local indisponible, tentative inpainting ComfyUI.", photoMakerError);
        }
      }
      return await generateWithLocalComfy(payload);
    } catch (comfyError) {
      console.warn("Fallback ComfyUI local indisponible, tentative AI Horde inpainting gratuit.", comfyError);
      return generateWithAiHorde(payload);
    }
  }
  if (provider === "ai-horde") return generateWithAiHorde(payload);
  if (provider === "disabled") {
    throw Object.assign(new Error("Fallback serveur desactive."), { status: 503 });
  }
  if (provider === "gemini" || provider === "server" || !provider) return generateWithGemini(payload);

  throw Object.assign(new Error(`Service image serveur inconnu: ${provider}`), { status: 400 });
};

const handleApi = async (req, res) => {
  const parsedApiUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const apiPath = parsedApiUrl.pathname;

  if (req.method === "GET" && req.url === "/api/health") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    const hasKey = !isPlaceholderEnvValue(apiKey);
    const provider = getServerImageProvider() || "gemini";
    const alibabaKey = getAlibabaApiKey();
    const hasAlibabaKey = !isPlaceholderEnvValue(alibabaKey);
    const openAiKey = getOpenAiApiKey();
    const hasOpenAiKey = !isPlaceholderEnvValue(openAiKey);
    const localComfyAvailable = await pingLocalComfy();
    const localStableHairAvailable =
      isLocalStableHairEnabled() &&
      existsSync(process.env.LOCAL_STABLEHAIR_SCRIPT || DEFAULT_LOCAL_STABLEHAIR_SCRIPT) &&
      existsSync(process.env.LOCAL_PYTHON_EXECUTABLE || DEFAULT_LOCAL_PYTHON_EXECUTABLE) &&
      existsSync(process.env.LOCAL_STABLEHAIR_REPO_ROOT || DEFAULT_LOCAL_STABLEHAIR_REPO_ROOT);
    const userMemory = getUserMemory();
    sendJson(res, 200, {
      ok: true,
      provider,
      hasGeminiKey: hasKey,
      hasAlibabaKey,
      alibabaUploadRecommendations: hasAlibabaKey,
      hasOpenAiKey,
      openAiUploadRecommendations: hasOpenAiKey,
      openAiDailyTrialLimit: getOpenAiDailyTrialLimit(),
      openAiExtraTrialCodeConfigured: getOpenAiExtraTrialCodeEntries().length > 0,
      openAiExtraTrialUses: getOpenAiExtraTrialUses(),
      sharpAvailable: Boolean(loadSharp()),
      portraitBackground: getPortraitBackgroundStatus(),
      userStorage: userMemory.backend,
      userStorageMysqlRequired: userMemory.mysqlRequired,
      userStorageMysqlConfigured: userMemory.mysqlConfigured,
      userStorageMysqlAvailable: userMemory.mysqlAvailable,
      userStorageJsonFallbackEnabled: userMemory.jsonFallbackEnabled,
      falEnabled: false,
      freeFallbacks: provider === "free-chain" || provider === "ai-horde",
      localComfyAvailable,
      localStableHairAvailable,
      freeGenerators: [
        "References dynamiques locales pour resultat final",
        "Generation locale de coupes courtes",
        "Generation locale avec pose guidee",
        "Retouche locale masquee",
        "Fallback communautaire anonyme",
        "Preview locale avec photo chargee",
        "Preview locale sans photo",
        "Previews vectorielles locales"
      ],
      imageModel: provider === "fal-kontext"
        ? "Service desactive"
        : provider === "free-chain" || provider === "ai-horde"
          ? localStableHairAvailable
            ? "Chaine locale avec fallbacks"
            : localComfyAvailable
              ? "Chaine locale de retouche et generation"
            : "Fallback communautaire"
        : "Service image principal"
    });
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/auth/register") {
    try {
      const payload = await readJsonBody(req);
      const session = await registerUserAccount(req, payload);
      if (session.token) res.setHeader("Set-Cookie", authCookieHeader(session.token, req));
      sendJson(res, 200, { ok: true, ...publicSessionPayload(session) });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Creation du compte impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/auth/login") {
    try {
      const payload = await readJsonBody(req);
      const session = await loginUserAccount(req, payload);
      if (session.token) res.setHeader("Set-Cookie", authCookieHeader(session.token, req));
      sendJson(res, 200, { ok: true, ...publicSessionPayload(session) });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Connexion impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/auth/logout") {
    try {
      const payload = await readJsonBody(req);
      const session = await logoutUserAccount(req, payload);
      res.setHeader("Set-Cookie", clearAuthCookieHeader(req));
      sendJson(res, 200, { ok: true, ...session });
    } catch (error) {
      res.setHeader("Set-Cookie", clearAuthCookieHeader(req));
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Deconnexion impossible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/me") {
    try {
      const payload = payloadFromUrlQuery(req);
      const admin = await requireAdminOwner(req, payload);
      sendJson(res, 200, { ok: true, admin });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Acces administrateur indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/dashboard") {
    try {
      const payload = payloadFromUrlQuery(req);
      const admin = await requireAdminOwner(req, payload);
      const overview = await getUserMemory().getAdminOverview();
      const users = await getUserMemory().listAdminUsers({ limit: 8 });
      const generations = await getUserMemory().listAdminGenerations({ limit: 12 });
      sendJson(res, 200, { ok: true, admin, overview, users, generations });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Tableau administrateur indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/users") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const users = await getUserMemory().listAdminUsers({
        search: payload.search,
        limit: payload.limit || 80
      });
      sendJson(res, 200, { ok: true, users });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Liste utilisateurs indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/users/detail") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const user = await getUserMemory().getAdminUserDetail({
        userId: payload.userId,
        limit: payload.limit || 80
      });
      sendJson(res, 200, { ok: true, user });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Fiche utilisateur indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/generations/detail") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const generation = await getUserMemory().getAdminGenerationDetail({
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        generationId: payload.generationId
      });
      sendJson(res, 200, { ok: true, generation: withPrivateGeneratedAssetAccess(generation) });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Fiche generation indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/generations") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const generations = await getUserMemory().listAdminGenerations({
        search: payload.search,
        limit: payload.limit || 80
      });
      sendJson(res, 200, { ok: true, generations });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Liste generations indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/credits") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const ownerType = payload.ownerType || "user";
      const ownerId = payload.ownerId || payload.userId || "";
      const wallet = await getUserMemory().getCreditWallet({ ownerType, ownerId });
      const ledger = await getUserMemory().listCreditLedgerForAdmin({
        ownerType,
        ownerId,
        limit: payload.limit || 40
      });
      sendJson(res, 200, { ok: true, wallet, ledger });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Credits indisponibles."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/trial-code") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const [trialCode, history] = await Promise.all([
        getUserMemory().getAdminTrialPromoCode({
          defaultUses: getOpenAiExtraTrialUses()
        }),
        getUserMemory().listAdminTrialPromoCodes({ limit: 20 })
      ]);
      sendJson(res, 200, { ok: true, trialCode, history });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Code bonus indisponible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/admin/trial-code") {
    try {
      const payload = await readJsonBody(req);
      const admin = await requireAdminOwner(req, payload);
      const trialCode = await getUserMemory().saveAdminTrialPromoCode({
        actorUserId: admin.id,
        code: payload.code,
        usesAdded: payload.usesAdded || getOpenAiExtraTrialUses(),
        regenerate: Boolean(payload.regenerate)
      });
      const history = await getUserMemory().listAdminTrialPromoCodes({ limit: 20 });
      sendJson(res, 200, { ok: true, trialCode, history });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Mise a jour du code bonus impossible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/admin/audit-log") {
    try {
      const payload = payloadFromUrlQuery(req);
      await requireAdminOwner(req, payload);
      const entries = await getUserMemory().listAdminAuditLog({
        search: payload.search,
        limit: payload.limit || 80
      });
      sendJson(res, 200, { ok: true, entries });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Journal administrateur indisponible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/admin/users/status") {
    try {
      const payload = await readJsonBody(req);
      const admin = await requireAdminOwner(req, payload);
      const result = await getUserMemory().setUserStatusForAdmin({
        actorUserId: admin.id,
        userId: payload.userId,
        status: payload.status
      });
      const removedPublicGenerations = Array.isArray(result?.removedPublicGenerations)
        ? result.removedPublicGenerations
        : [];
      for (const item of removedPublicGenerations) {
        if (item?.publicGenerationId) {
          await removePublicGeneration(item.publicGenerationId, item.publicGeneration).catch(() => false);
        }
      }
      const user = result?.user || result;
      sendJson(res, 200, { ok: true, user });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Mise a jour utilisateur impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/admin/credits/adjust") {
    try {
      const payload = await readJsonBody(req);
      const admin = await requireAdminOwner(req, payload);
      const result = await getUserMemory().adjustCreditsForAdmin({
        actorUserId: admin.id,
        ownerType: payload.ownerType || "user",
        ownerId: payload.ownerId || payload.userId || "",
        amount: payload.amount,
        reason: payload.reason
      });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Ajustement credits impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/admin/generations/hide") {
    try {
      const payload = await readJsonBody(req);
      const admin = await requireAdminOwner(req, payload);
      const generation = await getUserMemory().hideGenerationForAdmin({
        actorUserId: admin.id,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        generationId: payload.generationId
      });
      if (generation.publicGenerationId) {
        await removePublicGeneration(generation.publicGenerationId);
      }
      sendJson(res, 200, { ok: true, generation });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Masquage generation impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/admin/generations/unpublish") {
    try {
      const payload = await readJsonBody(req);
      const admin = await requireAdminOwner(req, payload);
      const result = await getUserMemory().unpublishGenerationForAdmin({
        actorUserId: admin.id,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        generationId: payload.generationId
      });
      if (result.publicGenerationId) {
        await removePublicGeneration(result.publicGenerationId, result.publicGeneration);
      }
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Retrait de la vitrine impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/session/guest") {
    try {
      const payload = await readJsonBody(req);
      const session = await getGuestSessionState(req, payload);
      sendJson(res, 200, { ok: true, ...session });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Session invite indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/me") {
    try {
      const payload = payloadFromUrlQuery(req);
      const token = authTokenFromRequest(req);
      const session = await getGuestSessionState(req, payload);
      if (token && session.owner?.type === "user") {
        res.setHeader("Set-Cookie", authCookieHeader(token, req));
      }
      sendJson(res, 200, { ok: true, ...publicSessionPayload(session) });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Profil invite indisponible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath.startsWith("/api/me/generations/") && apiPath.endsWith("/assets")) {
    try {
      const payload = payloadFromUrlQuery(req);
      const owner = await ownerFromRequest(req, payload);
      if (owner.type === "guest") await getUserMemory().ensureGuest(owner.id);
      const generationId = decodeURIComponent(
        apiPath.slice("/api/me/generations/".length, -"/assets".length)
      );
      const generations = await getUserMemory().listGenerations(owner, { scope: "all", limit: 240 });
      const generation = generations.find(item =>
        item.id === generationId ||
        item.personalGenerationId === generationId ||
        item.publicGenerationId === generationId
      );

      if (!generation) {
        throw Object.assign(new Error("Fiche introuvable pour ce compte."), { status: 404 });
      }

      const hydrated = await hydratePrivateAssetsForHistoryItem(generation, owner);
      sendJson(res, 200, {
        ok: true,
        generation: await withPrivateGeneratedAssetAccessForOwner(hydrated, owner)
      });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Images de fiche indisponibles."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/me/generations") {
    try {
      const payload = payloadFromUrlQuery(req);
      const owner = await ownerFromRequest(req, payload);
      if (owner.type === "guest") await getUserMemory().ensureGuest(owner.id);
      const scope = payload.scope || "today";
      const requestedLimit = Number(payload.limit || (scope === "all" ? 120 : 48));
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(240, Math.round(requestedLimit)))
        : scope === "all" ? 120 : 48;
      const generations = await getUserMemory().listGenerations(owner, { scope, limit });
      sendJson(res, 200, {
        ok: true,
        generations: await withPrivateGeneratedAssetAccessForOwner(generations, owner)
      });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Historique personnel indisponible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/me/generations") {
    try {
      const payload = await readJsonBody(req);
      const owner = await ownerFromRequest(req, payload);
      if (owner.type === "guest") await getUserMemory().ensureGuest(owner.id);
      const item = await stripPrivateGeneratedAssetAccessForOwner(payload.generation || {}, owner);
      const saved = await getUserMemory().upsertGeneration(owner, {
        id: item.id || item.imageUrl,
        status: item.publicGenerationId ? "published" : "final_ready",
        title: item.styleName || "Resultat MorphoStyle",
        sourceLabel: item.sourceLabel || "Photo personnelle",
        faceShape: item.faceShape || "morphologie personnalisee",
        consultation: item.consultation,
        originalImageUrl: item.originalImageUrl,
        publicGenerationId: item.publicGenerationId,
        createdAt: item.createdAt,
        final: {
          id: item.id,
          imageUrl: item.imageUrl,
          styleName: item.styleName,
          color: item.color,
          additionalViews: item.additionalViews
        }
      });
      sendJson(res, 200, {
        ok: true,
        generation: await withPrivateGeneratedAssetAccessForOwner(saved, owner)
      });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Sauvegarde historique impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/me/generations/delete") {
    try {
      const payload = await readJsonBody(req);
      const owner = await ownerFromRequest(req, payload);
      if (owner.type === "guest") await getUserMemory().ensureGuest(owner.id);
      const deleted = await getUserMemory().deleteGenerationForOwner(
        owner,
        {
          ...stripPrivateGeneratedAssetAccess(payload),
          generationId: payload.personalGenerationId || payload.generationId || payload.publicGenerationId,
          candidateIds: Array.isArray(payload.candidateIds) ? payload.candidateIds : []
        }
      );
      if (deleted.publicGenerationId) {
        await removePublicGeneration(deleted.publicGenerationId);
      }
      sendJson(res, 200, {
        ok: true,
        generation: await withPrivateGeneratedAssetAccessForOwner(deleted, owner)
      });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Suppression fiche impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/generate-hairstyle") {
    try {
      const payload = await readJsonBody(req);
      const result = await generateServerImage(payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = error.status || (error.message === "IMAGE_TOO_LARGE" ? 413 : 500);
      sendJson(res, status, {
        ok: false,
        error: error.message || "Erreur de retouche photo."
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/free-preview") {
    try {
      const payload = await readJsonBody(req);
      const result = await generatePreviewWithLocalComfy(payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = error.status || (error.message === "IMAGE_TOO_LARGE" ? 413 : 500);
      sendJson(res, status, {
        ok: false,
        error: error.message || "Erreur preview gratuite."
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/alibaba-upload-recommendations") {
    try {
      const payload = await readJsonBody(req);
      const result = await generateAlibabaUploadRecommendations(payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = error.status || (error.message === "IMAGE_TOO_LARGE" ? 413 : 500);
      sendJson(res, status, {
        ok: false,
        error: error.message || "Generation image impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/openai-upload-recommendations") {
    try {
      const payload = await readJsonBody(req);
      const result = await generateOpenAiUploadRecommendations(req, payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = error.status || (error.message === "IMAGE_TOO_LARGE" ? 413 : 500);
      sendJson(res, status, {
        ok: false,
        error: error.message || "Generation image impossible.",
        quota: error.quota,
        allowCodeActivation: Boolean(error.allowCodeActivation)
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/openai-activate-trial-code") {
    try {
      const payload = await readJsonBody(req);
      const result = await activateOpenAiExtraTrialCode(req, payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Activation du code impossible."
      });
    }
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/public-generations") {
    try {
      const payload = payloadFromUrlQuery(req);
      const limit = normalizePublicGenerationLimit(payload.limit);
      const generations = await readPublicGenerations();
      sendJson(res, 200, { ok: true, generations: generations.slice(0, limit) });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message || "Historique public indisponible."
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/public-generations") {
    try {
      const payload = await readJsonBody(req);
      const owner = await requireAuthenticatedUserOwner(
        req,
        payload,
        "Connexion requise pour publier dans la vitrine."
      );
      const ownedGeneration = await findOwnedGenerationForPublication(owner, payload);
      const publicPayload = publicGenerationPayloadFromOwnedGeneration(payload, ownedGeneration);
      const generation = await addPublicGeneration(publicPayload);
      const personalGenerationId = ownedGeneration.personalGenerationId || ownedGeneration.id;
      const published = await getUserMemory().markPublished(owner, personalGenerationId, generation.id, generation);
      if (!published) {
        await removePublicGeneration(generation.id).catch(() => false);
        throw Object.assign(new Error("Fiche personnelle introuvable pour confirmer la publication."), { status: 403 });
      }
      sendJson(res, 200, { ok: true, generation });
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "Publication vitrine impossible."
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/openai-selected-result") {
    try {
      const payload = await readJsonBody(req);
      const proposal = await generateOpenAiSelectedResult(req, payload);
      sendJson(res, 200, { ok: true, ...proposal, proposal });
    } catch (error) {
      const status = error.status || (error.message === "IMAGE_TOO_LARGE" ? 413 : 500);
      sendJson(res, status, {
        ok: false,
        error: error.message || "Resultat image impossible."
      });
    }
    return true;
  }

  return false;
};

const serveGeneratedAlibabaAsset = async (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  if (!requestedPath.startsWith("/generated-alibaba/")) return false;

  const relativePath = requestedPath.replace(/^\/generated-alibaba\//, "");
  const filePath = resolveInsideDir(GENERATED_ALIBABA_DIR, relativePath);

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeByExt.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable"
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { ok: false, error: "Image generee introuvable." });
  }

  return true;
};

const servePublicGalleryAsset = async (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  if (!requestedPath.startsWith("/public-gallery/")) return false;

  const relativePath = requestedPath.replace(/^\/public-gallery\//, "");
  const filePath = resolveInsideDir(PUBLIC_GALLERY_DIR, relativePath);

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeByExt.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable"
    });
    res.end(data);
  } catch {
    const stored = await readPersistedImageAsset(requestedPath);
    if (stored?.buffer) {
      await mkdir(path.dirname(filePath), { recursive: true }).catch(() => null);
      await writeFile(filePath, stored.buffer).catch(() => null);
      res.writeHead(200, {
        "Content-Type": stored.contentType || mimeByExt.get(path.extname(filePath)) || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      res.end(stored.buffer);
      return true;
    }
    sendJson(res, 404, { ok: false, error: "Image vitrine introuvable." });
  }

  return true;
};

const serveGeneratedOpenAiAsset = async (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  if (!requestedPath.startsWith(GENERATED_OPENAI_ROUTE_PREFIX)) return false;

  const assetPath = normalizeGeneratedOpenAiAssetPath(requestedPath);
  const expiresAt = Number(parsedUrl.searchParams.get("expires") || 0);
  const signature = parsedUrl.searchParams.get("sig") || "";

  if (!assetPath || !verifyGeneratedOpenAiAssetSignature(assetPath, expiresAt, signature)) {
    sendJson(res, 403, { ok: false, error: "Lien image privee expire ou invalide." });
    return true;
  }

  const filePath = resolveGeneratedOpenAiAssetPath(assetPath);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeByExt.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "private, max-age=3600"
    });
    res.end(data);
  } catch {
    const stored = await readPersistedImageAsset(assetPath);
    if (stored?.buffer) {
      await mkdir(path.dirname(filePath), { recursive: true }).catch(() => null);
      await writeFile(filePath, stored.buffer).catch(() => null);
      res.writeHead(200, {
        "Content-Type": stored.contentType || mimeByExt.get(path.extname(filePath)) || "application/octet-stream",
        "Cache-Control": "private, max-age=3600"
      });
      res.end(stored.buffer);
      return true;
    }
    sendJson(res, 404, { ok: false, error: "Image generee introuvable." });
  }

  return true;
};

const serveStatic = async (req, res) => {
  if (!existsSync(distDir)) {
    sendJson(res, 404, {
      ok: false,
      error: "Build dist introuvable. Lance npm run build ou utilise npm run dev avec le proxy Vite."
    });
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distDir, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    let data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeByExt.get(path.extname(filePath)) || "application/octet-stream"
    });
    res.end(data);
  } catch {
    filePath = path.join(distDir, "index.html");
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  }
};

export const loadMorphoStyleEnvironment = async () => {
  await loadLocalEnv();
  void preparePortraitBackground();
};

export const handleMorphoStyleRequest = async (req, res) => {
  applySecurityHeaders(res);

  if (await handleApi(req, res)) return;
  if (req.method === "GET" || req.method === "HEAD") {
    if (await servePublicGalleryAsset(req, res)) return;
    if (await serveGeneratedAlibabaAsset(req, res)) return;
    if (await serveGeneratedOpenAiAsset(req, res)) return;
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed" });
};

export const startMorphoStyleServer = async () => {
  await loadMorphoStyleEnvironment();
  createServer(handleMorphoStyleRequest).listen(PORT, () => {
    console.log(`MorphoStyle API ready on port ${PORT}`);
  });
};

const isCliEntry = path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url);

if (isCliEntry) {
  await startMorphoStyleServer();
}
