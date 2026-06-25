import { GoogleGenAI } from "@google/genai";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const distDir = path.join(rootDir, "dist");
const PORT = Number(process.env.PORT || 8787);
const BODY_LIMIT_BYTES = Number(process.env.REQUEST_BODY_LIMIT_BYTES || 24 * 1024 * 1024);
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
const DEFAULT_LOCAL_PYTHON_EXECUTABLE =
  "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe";

const mimeByExt = new Map([
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
  const files = [
    CENTRAL_ENV_FILE,
    path.join(rootDir, ".env.local"),
    path.join(rootDir, ".env")
  ];

  for (const filePath of files) {
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

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
};

const readJsonBody = (req) =>
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

const stripDataUrl = (value = "") => {
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { data: match[2], mimeType: match[1] };
  return { data: String(value), mimeType: "" };
};

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
  referenceCacheKey: style.referenceCacheKey || ""
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
    return null;
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
    "realistic image-to-image salon preview edit of the uploaded portrait",
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
      model: "Local ComfyUI SDXL image-to-image preview"
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
      ? "Local cached Stable-Hair reference preview"
      : "Local ComfyUI generated Stable-Hair reference preview",
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
    model: `AI Horde: ${getAiHordeModels().join(", ")}`
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
    throw Object.assign(new Error("FAL est desactive: la chaine doit rester gratuite."), { status: 403 });
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

  throw Object.assign(new Error(`Provider image serveur inconnu: ${provider}`), { status: 400 });
};

const handleApi = async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    const hasKey = !isPlaceholderEnvValue(apiKey);
    const provider = getServerImageProvider() || "gemini";
    const localComfyAvailable = await pingLocalComfy();
    const localStableHairAvailable =
      isLocalStableHairEnabled() &&
      existsSync(process.env.LOCAL_STABLEHAIR_SCRIPT || DEFAULT_LOCAL_STABLEHAIR_SCRIPT) &&
      existsSync(process.env.LOCAL_PYTHON_EXECUTABLE || DEFAULT_LOCAL_PYTHON_EXECUTABLE) &&
      existsSync(process.env.LOCAL_STABLEHAIR_REPO_ROOT || DEFAULT_LOCAL_STABLEHAIR_REPO_ROOT);
    sendJson(res, 200, {
      ok: true,
      provider,
      hasGeminiKey: hasKey,
      falEnabled: false,
      freeFallbacks: provider === "free-chain" || provider === "ai-horde",
      localComfyAvailable,
      localStableHairAvailable,
      freeGenerators: [
        "Local Stable-Hair dynamic recipe references + landmark face restore (final generation)",
        "Local ComfyUI InstantID (final short-hair identity generation)",
        "Local ComfyUI PhotoMaker + OpenPose (final short-hair identity generation)",
        "Local ComfyUI SDXL masked inpaint (final image-to-image)",
        "AI Horde anonymous inpainting (final image-to-image fallback)",
        "Local ComfyUI SDXL image-to-image (preview cards with uploaded photo)",
        "Local ComfyUI SDXL text-to-image (preview fallback without photo)",
        "Local SVG hairstyle previews (preview fallback)"
      ],
      imageModel: provider === "fal-kontext"
        ? "FAL disabled"
        : provider === "free-chain" || provider === "ai-horde"
          ? localStableHairAvailable
            ? "Local Stable-Hair dynamic recipe references + landmark face restore + local/anonymous fallbacks"
            : localComfyAvailable
              ? "Local ComfyUI InstantID/PhotoMaker for short hair + SDXL masked inpaint + AI Horde fallback"
            : `AI Horde inpainting: ${getAiHordeModels().join(", ")}`
        : process.env.GEMINI_IMAGE_MODEL || process.env.VITE_GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL
    });
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
        error: error.message || "Erreur image-to-image."
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

  return false;
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

await loadLocalEnv();

createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (await handleApi(req, res)) return;
  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed" });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`MorphoStyle API ready on http://127.0.0.1:${PORT}`);
});
