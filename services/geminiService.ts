import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ConsultationData, AdditionalViews, HairstyleRecipe } from "../types";

const MAX_RETRIES = 2;
const INITIAL_DELAY = 1500;
const API_KEY = process.env.API_KEY || "";
const HAS_GEMINI_KEY = !!API_KEY && !/PLACEHOLDER/i.test(API_KEY);
const FREE_IMAGE_PROVIDER = (process.env.FREE_IMAGE_PROVIDER || "").toLowerCase();
const USE_LOCAL_PREVIEWS = FREE_IMAGE_PROVIDER === "local" || FREE_IMAGE_PROVIDER === "local-preview";
const USE_COMFY_PREVIEWS = FREE_IMAGE_PROVIDER === "comfy" || FREE_IMAGE_PROVIDER === "comfy-preview";
const IMAGE_TO_IMAGE_PROVIDER = (process.env.IMAGE_TO_IMAGE_PROVIDER || "").toLowerCase();
const IMAGE_TO_IMAGE_ENDPOINT = process.env.IMAGE_TO_IMAGE_ENDPOINT || "/api/generate-hairstyle";
const IMAGE_TO_IMAGE_TIMEOUT_MS = Math.max(60000, Number(process.env.IMAGE_TO_IMAGE_TIMEOUT_MS || 180000));
const USE_FREE_IMAGE_TO_IMAGE_FALLBACKS = process.env.FREE_IMAGE_TO_IMAGE_FALLBACKS === "true";
const FREE_PREVIEW_ENDPOINT = process.env.FREE_PREVIEW_ENDPOINT || "/api/free-preview";
const PUTER_FLUX_MODEL = process.env.PUTER_FLUX_MODEL || "black-forest-labs/flux.1-kontext-pro";
const HF_KONTEXT_SPACE_URL = (process.env.HF_KONTEXT_SPACE_URL || "https://black-forest-labs-flux-1-kontext-dev.hf.space").replace(/\/$/, "");
const HF_KONTEXT_STEPS = Number(process.env.HF_KONTEXT_STEPS || 20);
const HF_KONTEXT_ATTEMPTS = Math.max(1, Math.min(5, Number(process.env.HF_KONTEXT_ATTEMPTS || 3)));
const HF_KONTEXT_TIMEOUT_MS = Math.max(30000, Number(process.env.HF_KONTEXT_TIMEOUT_MS || 180000));
const HF_KONTEXT_FALLBACK_ENDPOINT = process.env.HF_KONTEXT_FALLBACK_ENDPOINT || "";
const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || "sana";
const STATIC_DEMO_MODE = process.env.DEMO_MODE === "true";
const RUNTIME_MODE = STATIC_DEMO_MODE
  ? "demo"
  : FREE_IMAGE_PROVIDER === "pollinations"
    ? "free-api"
    : HAS_GEMINI_KEY
      ? "gemini"
      : "demo";
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const USE_GEMINI = RUNTIME_MODE === "gemini";
const USE_POLLINATIONS = RUNTIME_MODE === "free-api";
const USE_SERVER_IMAGE_TO_IMAGE = IMAGE_TO_IMAGE_PROVIDER === "server";
const USE_PUTER_FLUX_IMAGE_TO_IMAGE = IMAGE_TO_IMAGE_PROVIDER === "puter-flux";
const USE_HF_KONTEXT_IMAGE_TO_IMAGE = IMAGE_TO_IMAGE_PROVIDER === "hf-kontext";
const USE_LOCAL_RETOUCH_IMAGE_TO_IMAGE = IMAGE_TO_IMAGE_PROVIDER === "local-retouch";
const USE_IMAGE_TO_IMAGE = USE_SERVER_IMAGE_TO_IMAGE || USE_PUTER_FLUX_IMAGE_TO_IMAGE || USE_HF_KONTEXT_IMAGE_TO_IMAGE || USE_LOCAL_RETOUCH_IMAGE_TO_IMAGE;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = HF_KONTEXT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture image FLUX impossible."));
    reader.readAsDataURL(blob);
  });

export const getRuntimeMode = () => RUNTIME_MODE;
export const isDemoMode = () => RUNTIME_MODE === "demo";
export const isFreeImageApiMode = () => USE_POLLINATIONS;
export const isLocalPreviewMode = () => USE_LOCAL_PREVIEWS;
export const isComfyPreviewMode = () => USE_COMFY_PREVIEWS;
export const isServerImageToImageMode = () => USE_SERVER_IMAGE_TO_IMAGE;
export const isPuterFluxImageToImageMode = () => USE_PUTER_FLUX_IMAGE_TO_IMAGE;
export const isHuggingFaceKontextImageToImageMode = () => USE_HF_KONTEXT_IMAGE_TO_IMAGE;
export const isLocalRetouchImageToImageMode = () => USE_LOCAL_RETOUCH_IMAGE_TO_IMAGE;
export const isImageToImageMode = () => USE_IMAGE_TO_IMAGE;

const normalizeStyle = (style: any) => ({
  id: style?.id || "demo-style",
  name: style?.name || style?.styleName || "Style personnalise",
  description: style?.description || "Adaptation visagiste en mode demo.",
  color: style?.color || "Naturel",
  beardStyle: style?.beardStyle || "Aucune",
  whyItWorks: style?.whyItWorks || "Proportion equilibree pour visualiser le parcours.",
  faceShape: style?.faceShape || "visage ovale",
  recipe: style?.recipe,
  referenceCacheKey: style?.referenceCacheKey || ""
});

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clamp = (value: string, max = 42) => value.length > max ? `${value.slice(0, max - 3)}...` : value;

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const seedFrom = (value: string) =>
  Math.abs([...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) % 1000000, 7));

const getAgeTerm = (ageGroup: string) => {
  switch (ageGroup) {
    case 'baby': return 'toddler baby, 1 to 3 years old';
    case 'child': return 'young child, 5 to 10 years old';
    case 'teen': return 'teenager, 15 to 18 years old';
    case 'mature': return 'mature adult, 55 years old or older';
    default: return 'adult, 25 to 40 years old';
  }
};

const getGenderTerm = (gender: string) => {
  if (gender === 'female') return 'woman';
  if (gender === 'male') return 'man';
  return 'androgynous person';
};

const createPollinationsImageUrl = (
  rawStyle: any,
  gender: string,
  ageGroup: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  size: 'preview' | 'result' = 'result',
  options: { model?: string; seedSalt?: string } = {}
) => {
  const style = normalizeStyle(rawStyle);
  const angleText = angle === 'front'
    ? 'front view'
    : angle === 'left'
      ? 'left profile view'
      : angle === 'right'
        ? 'right profile view'
        : 'back view focused on haircut shape';
  const beardText = style.beardStyle && !/aucune|n\/a/i.test(style.beardStyle)
    ? `, facial hair: ${style.beardStyle}`
    : ', no facial hair unless naturally appropriate';
  const prompt = [
    `professional realistic hair salon consultation preview of a ${getAgeTerm(ageGroup)} ${getGenderTerm(gender)}`,
    `face shape guidance: ${style.faceShape}`,
    `${angleText}, haircut: ${style.name}`,
    `hair description: ${style.description}`,
    `hair color: ${style.color}${beardText}`,
    'centered head and shoulders portrait, clean neutral studio background',
    'natural skin texture, realistic lighting, high detail, no text, no logo, no watermark'
  ].join(', ');
  const params = new URLSearchParams({
    width: size === 'preview' ? '512' : '640',
    height: size === 'preview' ? '640' : '800',
    seed: String(seedFrom(`${style.id}-${gender}-${ageGroup}-${angle}-${options.seedSalt || "primary"}`)),
    enhance: 'false',
    nologo: 'true'
  });
  if (options.model !== "") {
    params.set("model", options.model || POLLINATIONS_MODEL);
  }

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
};

const DATA_URL_IMAGE_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/;

const normalizeImageInput = (imageInput: string) => {
  const trimmed = imageInput.trim();
  const match = trimmed.match(DATA_URL_IMAGE_PATTERN);
  if (match) {
    return {
      dataUrl: trimmed,
      mimeType: match[1],
      base64: match[2]
    };
  }

  return {
    dataUrl: `data:image/jpeg;base64,${trimmed}`,
    mimeType: "image/jpeg",
    base64: trimmed
  };
};

const imageFromBase64 = (imageInput: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const normalized = normalizeImageInput(imageInput);
    const fallbackMimeTypes = ["image/jpeg", "image/png", "image/webp"].filter(type => type !== normalized.mimeType);
    let index = 0;
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (index >= fallbackMimeTypes.length) {
        reject(new Error("Image locale illisible."));
        return;
      }
      image.src = `data:${fallbackMimeTypes[index]};base64,${normalized.base64}`;
      index += 1;
    };
    image.src = normalized.dataUrl;
  });

const detectLocalFaceBox = async (imageInput: string): Promise<DOMRectReadOnly | null> => {
  try {
    const detectorCtor = (window as any).FaceDetector;
    if (!detectorCtor) return null;

    const { dataUrl } = normalizeImageInput(imageInput);
    const blob = await fetch(dataUrl).then(response => response.blob());
    const bitmap = await createImageBitmap(blob);
    const detector = new detectorCtor({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(bitmap);
    bitmap.close();
    return faces?.[0]?.boundingBox || null;
  } catch {
    return null;
  }
};

const ratioToFaceShape = (ratio: number) => {
  if (ratio > 1.34) return "visage allonge";
  if (ratio < 1.06) return "visage rond";
  if (ratio < 1.18) return "visage carre doux";
  return "visage ovale";
};

const estimateLocalFaceShape = async (base64Image: string) => {
  try {
    const detectorCtor = (window as any).FaceDetector;
    if (detectorCtor) {
      const { dataUrl } = normalizeImageInput(base64Image);
      const blob = await fetch(dataUrl).then(response => response.blob());
      const bitmap = await createImageBitmap(blob);
      const detector = new detectorCtor({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(bitmap);
      bitmap.close();
      if (faces?.[0]?.boundingBox) {
        const box = faces[0].boundingBox;
        return ratioToFaceShape(box.height / Math.max(1, box.width));
      }
    }
  } catch {
    // Optional browser face detection is best-effort only.
  }

  try {
    const image = await imageFromBase64(base64Image);
    return ratioToFaceShape((image.naturalHeight / Math.max(1, image.naturalWidth)) * 0.82);
  } catch {
    return "visage ovale";
  }
};

const demoAccentFor = (id: string) => {
  const accents = [
    ["#111827", "#e11d48", "#fdf2f8"],
    ["#172554", "#2563eb", "#eff6ff"],
    ["#1f2937", "#f97316", "#fff7ed"]
  ];
  const index = Math.abs([...id].reduce((total, char) => total + char.charCodeAt(0), 0)) % accents.length;
  return accents[index];
};

const demoHairShapeFor = (id: string) => {
  if (/taper|crop/i.test(id)) {
    return {
      hair: "M158 218c6-73 55-120 113-120 55 0 91 39 96 113-26-18-55-28-86-31-43-4-82 7-123 38Z",
      detail: "M174 218c22-24 61-38 108-34 27 2 51 10 74 25",
      label: "contours nets"
    };
  }
  if (/curtain|rideau/i.test(id)) {
    return {
      hair: "M145 219c10-82 60-132 123-128 61 4 95 48 101 129-37-36-73-47-108-34-40-16-78-6-116 33Z",
      detail: "M255 105c-11 48-16 92-11 137M268 106c18 42 24 82 15 129",
      label: "meches rideau"
    };
  }
  if (/side|raie|sweep|later/i.test(id)) {
    return {
      hair: "M150 220c14-79 65-125 125-117 53 7 85 45 90 113-68-37-137-31-215 4Z",
      detail: "M190 156c47-27 97-34 150-4M206 182c42-18 81-21 120-4",
      label: "mouvement lateral"
    };
  }
  if (/volume|vertical/i.test(id)) {
    return {
      hair: "M146 219c10-43 30-81 56-110 23-27 72-38 105-21 37 18 58 66 61 130-34-30-80-43-137-35-31 4-59 15-85 36Z",
      detail: "M213 119c14-28 38-48 72-53M244 105c30-15 61-12 88 12",
      label: "volume haut"
    };
  }
  if (/wave|ondulation/i.test(id)) {
    return {
      hair: "M145 220c7-74 55-130 119-130 62 0 96 50 104 127-28-18-52-20-77-7-29-26-61-24-94 2-17-12-34-9-52 8Z",
      detail: "M176 187c26-22 47-22 66 0M250 184c26-22 49-20 70 2",
      label: "ondulations"
    };
  }
  return {
    hair: "M151 208c12-82 65-128 121-119 55 8 85 47 90 119-39-26-89-36-154-29-22 3-41 13-57 29Z",
    detail: "M181 191c45-23 98-28 154-4",
    label: "degrade doux"
  };
};

const createDemoPreviewImage = (rawStyle: any) => {
  const style = normalizeStyle(rawStyle);
  const [base, accent, soft] = demoAccentFor(style.id);
  const hairShape = demoHairShapeFor(style.id);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 640">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${soft}" />
          <stop offset="1" stop-color="#ffffff" />
        </linearGradient>
      </defs>
      <rect width="512" height="640" fill="url(#bg)" />
      <circle cx="256" cy="212" r="94" fill="#f2c7b8" />
      <path d="${hairShape.hair}" fill="${base}" />
      <path d="${hairShape.detail}" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" opacity="0.55" />
      <path d="M176 345c36 39 122 39 160 0 32 20 54 58 64 115H112c10-57 32-95 64-115Z" fill="${accent}" opacity="0.88" />
      <rect x="58" y="58" width="178" height="34" rx="17" fill="#ffffff" opacity="0.82" />
      <text x="76" y="81" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800" fill="${base}">${escapeXml(hairShape.label)}</text>
      <rect x="42" y="474" width="428" height="118" rx="26" fill="#111827" opacity="0.88" />
      <text x="64" y="516" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff">${escapeXml(clamp(style.name, 24))}</text>
      <text x="64" y="552" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="#fecdd3">${escapeXml(clamp(style.color, 30))}</text>
      <text x="64" y="580" font-family="Inter, Arial, sans-serif" font-size="15" fill="#f9fafb">Apercu local gratuit</text>
    </svg>`;

  return svgDataUrl(svg);
};

export const createLocalPreviewFallback = createDemoPreviewImage;

const waitForImage = (url: string, timeoutMs = 8000) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("Image preview timeout"));
    }, timeoutMs);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(url);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Image preview failed"));
    };
    image.src = url;
  });

declare global {
  interface Window {
    puter?: {
      ai?: {
        txt2img?: (prompt: string, options?: Record<string, any>) => Promise<any>;
      };
    };
  }
}

const waitForPuter = (timeoutMs = 12000) =>
  new Promise<typeof window.puter>((resolve, reject) => {
    if (!window.puter && !document.querySelector('script[data-puter-sdk="true"]')) {
      const script = document.createElement("script");
      script.src = "https://js.puter.com/v2/";
      script.async = true;
      script.dataset.puterSdk = "true";
      script.onerror = () => reject(new Error("Impossible de charger Puter.js. Verifiez la connexion internet."));
      document.head.appendChild(script);
    }

    const startedAt = Date.now();
    const tick = () => {
      if (window.puter?.ai?.txt2img) {
        resolve(window.puter);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Puter.js n'est pas charge. Verifiez la connexion internet ou le script js.puter.com."));
        return;
      }
      window.setTimeout(tick, 250);
    };
    tick();
  });

const getImageResultSrc = async (result: any): Promise<string> => {
  if (!result) throw new Error("Puter n'a retourne aucune image.");
  if (typeof result === "string") return result;
  if (result instanceof HTMLImageElement && result.src) return result.src;
  if (result.url) return result.url;
  if (result.image_url?.url) return result.image_url.url;
  if (result.image_url) return result.image_url;
  if (result.src) return result.src;
  if (result.data) return result.data.startsWith("data:") ? result.data : `data:image/png;base64,${result.data}`;
  if (result.b64_json) return `data:image/png;base64,${result.b64_json}`;
  throw new Error("Format de reponse Puter image inconnu.");
};

const createPreviewGenerationPrompt = (rawStyle: any, gender: string, ageGroup: string) => {
  const style = normalizeStyle(rawStyle);
  const beardText = style.beardStyle && !/aucune|n\/a/i.test(style.beardStyle)
    ? `subtle facial hair: ${style.beardStyle}`
    : "no facial hair unless naturally appropriate";

  return [
    `realistic professional hair salon catalog portrait of a ${getAgeTerm(ageGroup)} ${getGenderTerm(gender)}`,
    `face shape guidance: ${style.faceShape}`,
    `haircut: ${style.name}`,
    `hair shape: ${style.description}`,
    `hair color: ${style.color}`,
    beardText,
    "front view, head and shoulders, neutral studio background, natural skin texture, realistic lighting",
    "no text, no logo, no watermark"
  ].join(", ");
};

export const generateAlternativePreviewImage = async (style: any, gender: string, ageGroup: string, originalBase64?: string) => {
  if (USE_LOCAL_PREVIEWS) return createDemoPreviewImage(style);
  if (USE_COMFY_PREVIEWS) {
    try {
      if (!FREE_PREVIEW_ENDPOINT) throw new Error("Endpoint preview ComfyUI indisponible.");
      const response = await fetchWithTimeout(FREE_PREVIEW_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          style: normalizeStyle(style),
          gender,
          ageGroup,
          imageBase64: originalBase64 || ""
        })
      }, 600000);

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.imageUrl) {
        throw new Error(payload.error || "Preview ComfyUI indisponible.");
      }
      return payload.imageUrl as string;
    } catch {
      return createDemoPreviewImage(style);
    }
  }

  const prompt = createPreviewGenerationPrompt(style, gender, ageGroup);
  try {
    if (!FREE_PREVIEW_ENDPOINT) throw new Error("Endpoint preview gratuit indisponible.");
    const response = await fetchWithTimeout(FREE_PREVIEW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        style: normalizeStyle(style),
        gender,
        ageGroup
      })
    }, 150000);

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.imageUrl) {
      throw new Error(payload.error || "Preview gratuite alternative indisponible.");
    }
    return payload.imageUrl as string;
  } catch {
    const puter = await waitForPuter(12000);
    const result = await puter?.ai?.txt2img?.(prompt, {
      model: "black-forest-labs/flux-schnell",
      quality: "low"
    });
    return await getImageResultSrc(result);
  }
};

const createHairEditPrompt = (
  rawStyle: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult'
) => {
  const style = normalizeStyle(rawStyle);
  const isYoung = ageGroup === "baby" || ageGroup === "child" || ageGroup === "teen";
  const beardInstruction = style.beardStyle && !/aucune|n\/a|none/i.test(style.beardStyle) && !isYoung
    ? `If facial hair is visible and natural for the person, adapt it subtly to: ${style.beardStyle}.`
    : "Do not add facial hair.";

  return [
    "Edit the provided portrait photo as a realistic hair salon simulation.",
    "Keep the exact same person, face identity, facial structure, expression, skin, body, clothes, lighting, background, and camera framing.",
    "Only change the visible haircut and hair color. Do not replace the face. Do not create a new person. Do not turn it into a catalogue model.",
    `Target haircut: ${style.name}.`,
    `Hair shape and finish: ${style.description}.`,
    `Hair color: ${style.color}.`,
    style.faceShape ? `Face shape guidance: ${style.faceShape}.` : "",
    `Gender context: ${gender}. Age group: ${ageGroup}. Requested view: ${angle}.`,
    beardInstruction,
    "Return one realistic edited portrait image with no text, no watermark, no collage."
  ].filter(Boolean).join("\n");
};

const generatePuterFluxHairstyleImage = async (
  originalBase64: string,
  style: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult'
) => {
  const puter = await waitForPuter();
  const prompt = createHairEditPrompt(style, gender, angle, ageGroup);
  const normalizedImage = normalizeImageInput(originalBase64);
  const options = {
    model: PUTER_FLUX_MODEL,
    image_url: normalizedImage.dataUrl,
    image_base64: normalizedImage.base64,
    prompt_strength: 0.42,
    response_format: "base64"
  };

  const result = await puter?.ai?.txt2img?.(prompt, options);
  return getImageResultSrc(result);
};

const createHairstyleEditPrompt = (
  rawStyle: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult',
  attempt = 0
) => {
  const style = normalizeStyle(rawStyle);
  const beardInstruction = style.beardStyle && !/aucune|n\/a|none/i.test(style.beardStyle) && ageGroup !== "baby" && ageGroup !== "child"
    ? `If facial hair is visible, keep it natural and subtly adapt it to ${style.beardStyle}.`
    : "Do not add facial hair.";
  const shortInstruction = `Change only the hairstyle to ${style.name}, ${style.description}, ${style.color}. Keep the same person, face, identity, clothes, background, lighting, camera angle and framing. Natural realistic photo edit. No hat, no wig, no text.`;

  if (attempt === 1) {
    return `Replace the existing haircut naturally with ${style.name}. Keep identity, face, clothes, background and lighting unchanged. Hair color: ${style.color}. No overlay, no sticker, no hat.`;
  }

  if (attempt >= 2) {
    return `Change hairstyle only: ${style.name}. Natural realistic hair. Same person and same photo.`;
  }

  return [
    shortInstruction,
    style.faceShape ? `Adapt the cut to this face shape: ${style.faceShape}.` : "",
    `Person context: ${gender}, ${ageGroup}, view: ${angle}.`,
    beardInstruction,
    "The final image must look like a real edited portrait photo."
  ].filter(Boolean).join(" ");
};

const requestServerHairstyleImage = async (
  endpoint: string,
  originalBase64: string,
  style: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult'
) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), IMAGE_TO_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        imageBase64: originalBase64,
        style: normalizeStyle(style),
        gender,
        angle,
        ageGroup
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.imageUrl) {
      throw new Error(payload.error || "Image-to-image serveur indisponible.");
    }

    return payload.imageUrl as string;
  } finally {
    window.clearTimeout(timeout);
  }
};

const getSseData = (block: string) =>
  block
    .split(/\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.replace(/^data:\s?/, ""))
    .join("\n")
    .trim();

const parseGradioEventData = (eventStream: string) => {
  const blocks = eventStream.split(/\n\n+/).filter(Boolean);
  const errorBlock = blocks.find(block => block.includes("event: error"));
  if (errorBlock) {
    const rawError = getSseData(errorBlock);
    let message = rawError;
    try {
      const parsed = JSON.parse(rawError);
      message = parsed?.message || parsed?.error || rawError;
    } catch {
      // Keep raw Gradio error text.
    }
    throw new Error(message ? `FLUX Kontext a refuse la retouche: ${message}` : "FLUX Kontext a refuse la retouche.");
  }

  const completeBlock = [...blocks].reverse().find(block => block.includes("event: complete"));
  if (!completeBlock) throw new Error("FLUX Kontext n'a pas termine la file d'attente.");

  const rawData = getSseData(completeBlock);
  if (!rawData || rawData === "null") throw new Error("FLUX Kontext a retourne une reponse vide.");

  const payload = JSON.parse(rawData);
  const result = Array.isArray(payload) ? payload[0] : payload;
  const resultUrl = result?.url || (result?.path ? `${HF_KONTEXT_SPACE_URL}/gradio_api/file=${result.path}` : "");
  if (!resultUrl) throw new Error("FLUX Kontext n'a pas retourne d'image exploitable.");

  return resultUrl as string;
};

const generateHuggingFaceKontextHairstyleImageOnce = async (
  originalBase64: string,
  style: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult',
  attempt = 0
) => {
  const normalizedImage = normalizeImageInput(originalBase64);
  const sourceBlob = await fetch(normalizedImage.dataUrl).then(response => response.blob());
  const extension = normalizedImage.mimeType.includes("png")
    ? "png"
    : normalizedImage.mimeType.includes("webp")
      ? "webp"
      : "jpg";
  const sourceName = `morphostyle-source.${extension}`;
  const uploadForm = new FormData();
  uploadForm.append("files", sourceBlob, sourceName);

  const uploadResponse = await fetchWithTimeout(`${HF_KONTEXT_SPACE_URL}/gradio_api/upload`, {
    method: "POST",
    body: uploadForm
  }, 45000);
  if (!uploadResponse.ok) {
    throw new Error("Le service FLUX Kontext n'a pas accepte la photo chargee.");
  }

  const uploadedPaths = await uploadResponse.json();
  const uploadedPath = uploadedPaths?.[0];
  if (!uploadedPath) throw new Error("Upload FLUX Kontext incomplet.");

  const prompt = createHairstyleEditPrompt(style, gender, angle, ageGroup, attempt);
  const inferResponse = await fetchWithTimeout(`${HF_KONTEXT_SPACE_URL}/gradio_api/call/infer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        {
          path: uploadedPath,
          orig_name: sourceName,
          mime_type: normalizedImage.mimeType
        },
        prompt,
        seedFrom(`${normalizeStyle(style).id}-${Date.now()}-${attempt}`),
        false,
        2.5,
        Math.max(8, Math.min(30, (HF_KONTEXT_STEPS || 20) - attempt * 3))
      ]
    })
  }, 45000);
  if (!inferResponse.ok) {
    throw new Error("Le service FLUX Kontext n'a pas demarre la retouche.");
  }

  const { event_id: eventId } = await inferResponse.json();
  if (!eventId) throw new Error("File d'attente FLUX Kontext indisponible.");

  const resultResponse = await fetchWithTimeout(`${HF_KONTEXT_SPACE_URL}/gradio_api/call/infer/${eventId}`, {}, HF_KONTEXT_TIMEOUT_MS);
  if (!resultResponse.ok) {
    throw new Error("La retouche FLUX Kontext n'a pas abouti.");
  }

  const eventStream = await resultResponse.text();
  const resultUrl = parseGradioEventData(eventStream);

  try {
    const imageResponse = await fetchWithTimeout(resultUrl, {}, 45000);
    if (!imageResponse.ok) return resultUrl;
    return await blobToDataUrl(await imageResponse.blob());
  } catch {
    return resultUrl;
  }
};

const generateHuggingFaceKontextHairstyleImage = async (
  originalBase64: string,
  style: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult'
) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < HF_KONTEXT_ATTEMPTS; attempt++) {
    try {
      return await generateHuggingFaceKontextHairstyleImageOnce(originalBase64, style, gender, angle, ageGroup, attempt);
    } catch (error) {
      lastError = error;
      console.warn(`Tentative FLUX Kontext ${attempt + 1}/${HF_KONTEXT_ATTEMPTS} echouee`, error);
      if (attempt < HF_KONTEXT_ATTEMPTS - 1) await sleep(1800 + attempt * 1400);
    }
  }

  const fallbackErrors: string[] = [];

  if (USE_FREE_IMAGE_TO_IMAGE_FALLBACKS) {
    try {
      console.warn("FLUX Kontext gratuit indisponible, tentative Puter.js gratuit.");
      return await generatePuterFluxHairstyleImage(originalBase64, style, gender, angle, ageGroup);
    } catch (puterError) {
      fallbackErrors.push(puterError instanceof Error ? `Puter: ${puterError.message}` : "Puter indisponible");
    }
  }

  if (HF_KONTEXT_FALLBACK_ENDPOINT) {
    try {
      console.warn("FLUX Kontext/Puter indisponibles, tentative fallback serveur gratuit.");
      return await requestServerHairstyleImage(HF_KONTEXT_FALLBACK_ENDPOINT, originalBase64, style, gender, angle, ageGroup);
    } catch (fallbackError) {
      const hfDetail = lastError instanceof Error ? lastError.message : "reponse vide";
      const fallbackDetail = fallbackError instanceof Error ? fallbackError.message : "fallback indisponible";
      const extra = fallbackErrors.length ? `; ${fallbackErrors.join("; ")}` : "";
      throw new Error(`Les generateurs gratuits image-to-image ont echoue (${hfDetail}${extra}; serveur: ${fallbackDetail}).`);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "reponse vide";
  const extra = fallbackErrors.length ? ` ${fallbackErrors.join("; ")}` : "";
  throw new Error(`Les generateurs gratuits image-to-image sont temporairement indisponibles (${detail}).${extra}`);
};

const hairPaletteFor = (rawStyle: any) => {
  const style = normalizeStyle(rawStyle);
  const text = `${style.id} ${style.name} ${style.color}`.toLowerCase();

  if (/blond|miel|caramel|lumineux|noisette/.test(text)) {
    return { dark: "#39200f", base: "#6f421f", light: "#b77836", line: "#e9b872" };
  }
  if (/chatain|chata/i.test(text)) {
    return { dark: "#24140c", base: "#4a2d1d", light: "#7b5434", line: "#b8834f" };
  }
  if (/gris|glace|froid|silver/.test(text)) {
    return { dark: "#111827", base: "#374151", light: "#6b7280", line: "#cbd5e1" };
  }
  return { dark: "#160f0b", base: "#2f1c13", light: "#60412b", line: "#9f6b42" };
};

const drawHairPath = (
  ctx: CanvasRenderingContext2D,
  styleKey: string,
  box: { cx: number; left: number; right: number; top: number; base: number; width: number; height: number },
  fillStyle: CanvasGradient,
  palette: ReturnType<typeof hairPaletteFor>,
  angle: 'front' | 'left' | 'right' | 'back'
) => {
  const { cx, left, right, top, base, width, height } = box;
  const sideShift = angle === "left" ? -width * 0.08 : angle === "right" ? width * 0.08 : 0;
  const partX = /side|raie|sweep|later/.test(styleKey) ? cx - width * 0.18 + sideShift : cx + sideShift;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.24)";
  ctx.shadowBlur = Math.max(10, width * 0.06);
  ctx.shadowOffsetY = Math.max(3, height * 0.04);
  ctx.fillStyle = fillStyle;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();

  if (/curtain|rideau|mid/.test(styleKey)) {
    ctx.moveTo(left, base);
    ctx.bezierCurveTo(left + width * 0.02, top + height * 0.22, cx - width * 0.38, top - height * 0.03, cx - width * 0.02, top + height * 0.16);
    ctx.bezierCurveTo(cx - width * 0.18, top + height * 0.42, cx - width * 0.08, base - height * 0.1, cx, base + height * 0.05);
    ctx.bezierCurveTo(cx + width * 0.08, base - height * 0.1, cx + width * 0.18, top + height * 0.42, cx + width * 0.02, top + height * 0.16);
    ctx.bezierCurveTo(cx + width * 0.38, top - height * 0.03, right - width * 0.02, top + height * 0.22, right, base);
    ctx.bezierCurveTo(cx + width * 0.22, base - height * 0.18, cx - width * 0.22, base - height * 0.18, left, base);
  } else if (/volume|vertical/.test(styleKey)) {
    ctx.moveTo(left, base);
    ctx.bezierCurveTo(left + width * 0.06, top + height * 0.3, cx - width * 0.18, top - height * 0.42, cx + width * 0.08, top - height * 0.16);
    ctx.bezierCurveTo(cx + width * 0.42, top - height * 0.04, right - width * 0.02, top + height * 0.25, right, base);
    ctx.bezierCurveTo(cx + width * 0.22, base - height * 0.18, cx - width * 0.18, base - height * 0.24, left, base);
  } else if (/taper|crop|net|classic/.test(styleKey)) {
    ctx.moveTo(left + width * 0.02, base - height * 0.02);
    ctx.bezierCurveTo(left + width * 0.08, top + height * 0.18, cx - width * 0.28, top - height * 0.04, cx, top);
    ctx.bezierCurveTo(cx + width * 0.32, top - height * 0.02, right - width * 0.05, top + height * 0.2, right - width * 0.02, base - height * 0.02);
    ctx.bezierCurveTo(cx + width * 0.28, base - height * 0.14, cx - width * 0.25, base - height * 0.14, left + width * 0.02, base - height * 0.02);
  } else if (/frange|fringe|long|layer|degrade|air/.test(styleKey)) {
    ctx.moveTo(left, base + height * 0.08);
    ctx.bezierCurveTo(left - width * 0.03, top + height * 0.28, cx - width * 0.3, top - height * 0.03, cx + width * 0.04, top + height * 0.04);
    ctx.bezierCurveTo(cx + width * 0.38, top + height * 0.02, right + width * 0.03, top + height * 0.34, right, base + height * 0.08);
    ctx.bezierCurveTo(cx + width * 0.28, base - height * 0.18, cx + width * 0.08, base + height * 0.08, cx - width * 0.04, base - height * 0.02);
    ctx.bezierCurveTo(cx - width * 0.18, base + height * 0.08, cx - width * 0.3, base - height * 0.18, left, base + height * 0.08);
  } else if (/side|raie|sweep|later/.test(styleKey)) {
    ctx.moveTo(left, base);
    ctx.bezierCurveTo(left + width * 0.02, top + height * 0.28, cx - width * 0.18, top - height * 0.04, cx + width * 0.2, top + height * 0.04);
    ctx.bezierCurveTo(right - width * 0.04, top + height * 0.1, right + width * 0.02, top + height * 0.38, right, base);
    ctx.bezierCurveTo(cx + width * 0.18, base - height * 0.22, cx - width * 0.12, base - height * 0.12, left, base);
  } else {
    ctx.moveTo(left, base);
    ctx.bezierCurveTo(left + width * 0.03, top + height * 0.22, cx - width * 0.26, top - height * 0.04, cx, top);
    ctx.bezierCurveTo(cx + width * 0.28, top, right - width * 0.04, top + height * 0.24, right, base);
    ctx.bezierCurveTo(cx + width * 0.25, base - height * 0.2, cx - width * 0.22, base - height * 0.2, left, base);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.56;
  ctx.lineWidth = Math.max(2, width * 0.018);
  ctx.strokeStyle = palette.line;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (/curtain|rideau|mid/.test(styleKey)) {
    ctx.moveTo(cx + sideShift, top + height * 0.12);
    ctx.bezierCurveTo(cx - width * 0.05 + sideShift, top + height * 0.38, cx - width * 0.02 + sideShift, base - height * 0.06, cx - width * 0.08 + sideShift, base + height * 0.1);
    ctx.moveTo(cx + sideShift, top + height * 0.12);
    ctx.bezierCurveTo(cx + width * 0.08 + sideShift, top + height * 0.42, cx + width * 0.04 + sideShift, base - height * 0.04, cx + width * 0.12 + sideShift, base + height * 0.08);
  } else if (/side|raie|sweep|later/.test(styleKey)) {
    ctx.moveTo(partX, top + height * 0.12);
    ctx.bezierCurveTo(partX + width * 0.2, top + height * 0.1, right - width * 0.1, top + height * 0.28, right - width * 0.04, base - height * 0.02);
    ctx.moveTo(partX - width * 0.04, top + height * 0.2);
    ctx.bezierCurveTo(left + width * 0.22, top + height * 0.35, left + width * 0.12, base - height * 0.18, left + width * 0.04, base);
  } else if (/volume|vertical/.test(styleKey)) {
    ctx.moveTo(cx - width * 0.08, top - height * 0.08);
    ctx.bezierCurveTo(cx + width * 0.08, top - height * 0.22, cx + width * 0.24, top - height * 0.02, cx + width * 0.3, top + height * 0.2);
    ctx.moveTo(cx - width * 0.2, top + height * 0.18);
    ctx.bezierCurveTo(cx + width * 0.05, top - height * 0.02, cx + width * 0.26, top + height * 0.1, right - width * 0.04, base - height * 0.02);
  } else {
    ctx.moveTo(left + width * 0.16, top + height * 0.42);
    ctx.bezierCurveTo(cx - width * 0.12, top + height * 0.2, cx + width * 0.18, top + height * 0.22, right - width * 0.12, base - height * 0.1);
  }
  ctx.stroke();
  ctx.restore();
};

const createLocalRetouchImage = async (
  originalBase64: string,
  rawStyle: any,
  angle: 'front' | 'left' | 'right' | 'back' = 'front'
) => {
  const image = await imageFromBase64(originalBase64);
  const naturalWidth = image.naturalWidth || image.width || 900;
  const naturalHeight = image.naturalHeight || image.height || 1125;
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(320, Math.round(naturalWidth * scale));
  canvas.height = Math.max(420, Math.round(naturalHeight * scale));
  const scaleX = canvas.width / naturalWidth;
  const scaleY = canvas.height / naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible pour la retouche locale.");

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const detectedBox = await detectLocalFaceBox(originalBase64);
  const mappedBox = detectedBox
    ? {
      x: detectedBox.x * scaleX,
      y: detectedBox.y * scaleY,
      width: detectedBox.width * scaleX,
      height: detectedBox.height * scaleY
    }
    : {
      x: canvas.width * 0.31,
      y: canvas.height * 0.18,
      width: canvas.width * 0.38,
      height: canvas.height * 0.38
    };

  const style = normalizeStyle(rawStyle);
  const styleKey = `${style.id} ${style.name}`.toLowerCase();
  const palette = hairPaletteFor(style);
  const faceWidth = Math.min(canvas.width * 0.58, Math.max(canvas.width * 0.22, mappedBox.width));
  const cx = mappedBox.x + mappedBox.width / 2;
  const isVolume = /volume|vertical/.test(styleKey);
  const isLong = /curtain|rideau|long|frange|fringe|layer|degrade|air/.test(styleKey);
  const width = faceWidth * (isLong ? 1.18 : 1.06);
  const top = Math.max(0, mappedBox.y - mappedBox.height * (isVolume ? 0.22 : 0.13));
  const base = Math.min(canvas.height, mappedBox.y + mappedBox.height * (isLong ? 0.28 : 0.18));
  const height = Math.max(48, base - top);
  const left = Math.max(0, cx - width / 2);
  const right = Math.min(canvas.width, cx + width / 2);
  const gradient = ctx.createLinearGradient(cx, top, cx, base + height * 0.12);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(0.48, palette.base);
  gradient.addColorStop(1, palette.dark);

  drawHairPath(ctx, styleKey, { cx, left, right, top, base, width, height }, gradient, palette, angle);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = palette.dark;
  ctx.beginPath();
  ctx.ellipse(cx, base + height * 0.12, width * 0.43, height * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.92);
};

const createDemoResultImage = (originalBase64: string, rawStyle: any, angle: 'front' | 'left' | 'right' | 'back' = 'front') => {
  const style = normalizeStyle(rawStyle);
  const angleLabel = angle === "front" ? "Face" : angle === "left" ? "Profil gauche" : angle === "right" ? "Profil droit" : "Dos";
  const { dataUrl } = normalizeImageInput(originalBase64);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1280">
      <defs>
        <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.42" stop-color="#000000" stop-opacity="0" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.76" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1280" fill="#111827" />
      <image href="${dataUrl}" width="1024" height="1280" preserveAspectRatio="xMidYMid slice" />
      <rect width="1024" height="1280" fill="url(#overlay)" />
      <rect x="64" y="1000" width="896" height="206" rx="36" fill="#111827" opacity="0.9" />
      <text x="104" y="1056" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" fill="#fb7185">MODE DEMO GRATUIT</text>
      <text x="104" y="1120" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="900" fill="#ffffff">${escapeXml(clamp(style.name, 26))}</text>
      <text x="104" y="1164" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="700" fill="#fed7aa">${escapeXml(clamp(`${style.color} - ${angleLabel}`, 42))}</text>
      <text x="104" y="1198" font-family="Inter, Arial, sans-serif" font-size="20" fill="#e5e7eb">Simulation de parcours sans appel API ni generation payante.</text>
    </svg>`;

  return svgDataUrl(svg);
};

const getStylesForFaceShape = (faceShape: string, beardStyle: string) => {
  if (faceShape.includes("rond")) {
    return [
      {
        id: "round-layered-volume",
        name: "Volume vertical texture",
        description: "Dessus aerien avec cotes propres pour allonger visuellement le visage.",
        color: "Chatain naturel",
        beardStyle,
        whyItWorks: "Ajoute de la hauteur et evite d'elargir les joues.",
        faceShape
      },
      {
        id: "round-soft-side-part",
        name: "Raie laterale souple",
        description: "Mouvement asymetrique et longueurs legeres sur le dessus.",
        color: "Brun lumineux",
        beardStyle,
        whyItWorks: "Casse la rondeur avec une ligne diagonale naturelle.",
        faceShape
      },
      {
        id: "round-long-curtain",
        name: "Rideau long affine",
        description: "Meches rideau legerement longues qui encadrent le visage.",
        color: "Reflets miel",
        beardStyle,
        whyItWorks: "Cree deux lignes verticales qui affinent la silhouette.",
        faceShape
      },
      {
        id: "round-taper-clean",
        name: "Taper net structure",
        description: "Nuque et tempes nettes avec texture controlee au sommet.",
        color: "Brun froid",
        beardStyle,
        whyItWorks: "Structure les contours sans ajouter de largeur.",
        faceShape
      }
    ];
  }

  if (faceShape.includes("allonge")) {
    return [
      {
        id: "long-balanced-fringe",
        name: "Frange equilibree",
        description: "Frange douce et volume lateral pour raccourcir visuellement le front.",
        color: "Chatain naturel",
        beardStyle,
        whyItWorks: "Reduit l'effet de longueur et ramene l'attention vers les yeux.",
        faceShape
      },
      {
        id: "long-soft-waves",
        name: "Ondulations laterales",
        description: "Mouvement ample sur les cotes avec hauteur moderee.",
        color: "Brun caramel",
        beardStyle,
        whyItWorks: "Ajoute de l'equilibre horizontal sans alourdir.",
        faceShape
      },
      {
        id: "long-mid-layer",
        name: "Mi-long degrade",
        description: "Degrade doux autour des pommettes et pointes legeres.",
        color: "Reflets noisette",
        beardStyle,
        whyItWorks: "Replace le volume au milieu du visage.",
        faceShape
      },
      {
        id: "long-classic-crop",
        name: "Crop classique doux",
        description: "Coupe compacte avec texture souple et contour naturel.",
        color: "Brun naturel",
        beardStyle,
        whyItWorks: "Controle la hauteur et donne une forme plus compacte.",
        faceShape
      }
    ];
  }

  if (faceShape.includes("carre")) {
    return [
      {
        id: "square-soft-contour",
        name: "Contour doux structure",
        description: "Longueur equilibree avec mouvement leger autour du visage.",
        color: "Chatain naturel",
        beardStyle,
        whyItWorks: "Adoucit la machoire tout en gardant une ligne nette.",
        faceShape
      },
      {
        id: "square-textured-crop",
        name: "Crop texture arrondi",
        description: "Texture douce au-dessus, angles moins marques aux tempes.",
        color: "Brun lumineux",
        beardStyle,
        whyItWorks: "Assouplit les angles forts sans perdre le caractere.",
        faceShape
      },
      {
        id: "square-side-sweep",
        name: "Balayage lateral",
        description: "Meche laterale fluide avec finition naturelle.",
        color: "Reflets miel",
        beardStyle,
        whyItWorks: "Apporte une diagonale qui allège la structure du bas du visage.",
        faceShape
      },
      {
        id: "square-layered-bob",
        name: "Degrade souple visage",
        description: "Couches progressives autour des joues et des maxillaires.",
        color: "Brun espresso",
        beardStyle,
        whyItWorks: "Cree une transition douce autour de la machoire.",
        faceShape
      }
    ];
  }

  return [
    {
      id: "oval-soft-contour",
      name: "Contour doux structure",
      description: "Longueur equilibree avec mouvement leger autour du visage.",
      color: "Chatain naturel",
      beardStyle,
      whyItWorks: "Respecte l'equilibre naturel du visage ovale.",
      faceShape
    },
    {
      id: "oval-modern-texture",
      name: "Texture moderne",
      description: "Volume controle sur le dessus, lignes propres et entretien simple.",
      color: "Brun lumineux",
      beardStyle,
      whyItWorks: "Ajoute du rythme sans casser les proportions.",
      faceShape
    },
    {
      id: "oval-bold-light",
      name: "Signature lumineuse",
      description: "Variation plus marquee avec contraste subtil et finition soignee.",
      color: "Reflets miel",
      beardStyle,
      whyItWorks: "Cree un point focal visible tout en restant portable.",
      faceShape
    },
    {
      id: "oval-airy-layer",
      name: "Degrade aerien",
      description: "Couches legeres et mouvement naturel autour des pommettes.",
      color: "Brun glace",
      beardStyle,
      whyItWorks: "Valorise les pommettes sans alourdir le contour.",
      faceShape
    }
  ];
};

type FaceKey = "rond" | "allonge" | "carre" | "ovale";

type StyleOption = {
  id: string;
  name: string;
  description: string;
  color: string;
  whyItWorks: string;
  faceShapes: FaceKey[];
  lengths: ConsultationData["targetLength"][];
  maintenance: ConsultationData["maintenance"][];
  lifestyles: ConsultationData["lifestyle"][];
  genders: ConsultationData["gender"][];
  ageGroups?: ConsultationData["ageGroup"][];
  priority?: number;
};

const allFaceShapes: FaceKey[] = ["rond", "allonge", "carre", "ovale"];
const allGenders: ConsultationData["gender"][] = ["male", "female", "non-binary"];

const styleBank: StyleOption[] = [
  {
    id: "round-taper-clean",
    name: "Taper net structure",
    description: "Cotes nets, nuque propre et texture controlee au sommet.",
    color: "Brun froid",
    whyItWorks: "Structure le contour sans ajouter de largeur aux joues.",
    faceShapes: ["rond"],
    lengths: ["short"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: ["male", "non-binary"],
    priority: 4
  },
  {
    id: "round-layered-volume",
    name: "Volume vertical texture",
    description: "Dessus aerien avec cotes propres pour allonger visuellement le visage.",
    color: "Chatain naturel",
    whyItWorks: "Ajoute de la hauteur et evite d'elargir les joues.",
    faceShapes: ["rond"],
    lengths: ["short", "medium"],
    maintenance: ["medium", "high"],
    lifestyles: ["modern", "bold"],
    genders: allGenders,
    priority: 5
  },
  {
    id: "round-soft-side-part",
    name: "Raie laterale souple",
    description: "Mouvement asymetrique et longueurs legeres sur le dessus.",
    color: "Brun lumineux",
    whyItWorks: "Casse la rondeur avec une ligne diagonale naturelle.",
    faceShapes: ["rond", "ovale"],
    lengths: ["medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    priority: 3
  },
  {
    id: "round-long-curtain",
    name: "Rideau long affine",
    description: "Meches rideau longues et effilees qui encadrent le visage.",
    color: "Reflets miel",
    whyItWorks: "Cree deux lignes verticales qui affinent la silhouette.",
    faceShapes: ["rond"],
    lengths: ["medium", "long"],
    maintenance: ["medium", "high"],
    lifestyles: ["modern", "bold"],
    genders: allGenders,
    priority: 4
  },
  {
    id: "round-long-face-frame",
    name: "Long degrade visage",
    description: "Longueurs conservees avec couches verticales autour des pommettes.",
    color: "Chatain dore",
    whyItWorks: "Garde la longueur demandee tout en etirant visuellement le visage.",
    faceShapes: ["rond"],
    lengths: ["long"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: ["female", "non-binary"],
    priority: 4
  },
  {
    id: "round-pixie-volume",
    name: "Pixie volume haut",
    description: "Court texturise avec hauteur douce sur le dessus.",
    color: "Brun naturel",
    whyItWorks: "La hauteur compense la rondeur sans durcir les traits.",
    faceShapes: ["rond", "ovale"],
    lengths: ["short"],
    maintenance: ["medium", "high"],
    lifestyles: ["modern", "bold"],
    genders: ["female", "non-binary"],
    priority: 3
  },
  {
    id: "long-balanced-fringe",
    name: "Frange equilibree",
    description: "Frange douce et volume lateral pour raccourcir visuellement le front.",
    color: "Chatain naturel",
    whyItWorks: "Reduit l'effet de longueur et ramene l'attention vers les yeux.",
    faceShapes: ["allonge"],
    lengths: ["short", "medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    priority: 5
  },
  {
    id: "long-classic-crop",
    name: "Crop classique doux",
    description: "Coupe compacte avec texture souple et hauteur controlee.",
    color: "Brun naturel",
    whyItWorks: "Controle la hauteur et donne une forme plus compacte.",
    faceShapes: ["allonge"],
    lengths: ["short"],
    maintenance: ["low"],
    lifestyles: ["classic", "modern"],
    genders: ["male", "non-binary"],
    priority: 4
  },
  {
    id: "long-soft-waves",
    name: "Ondulations laterales",
    description: "Mouvement ample sur les cotes avec hauteur moderee.",
    color: "Brun caramel",
    whyItWorks: "Ajoute de l'equilibre horizontal sans allonger davantage.",
    faceShapes: ["allonge", "carre"],
    lengths: ["medium", "long"],
    maintenance: ["medium", "high"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    priority: 4
  },
  {
    id: "long-mid-layer",
    name: "Mi-long degrade",
    description: "Degrade doux autour des pommettes et pointes legeres.",
    color: "Reflets noisette",
    whyItWorks: "Replace le volume au milieu du visage.",
    faceShapes: ["allonge", "ovale"],
    lengths: ["medium", "long"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    priority: 3
  },
  {
    id: "long-bob-volume",
    name: "Carre volume lateral",
    description: "Carre souple sous les pommettes avec volume sur les cotes.",
    color: "Chatain lumineux",
    whyItWorks: "Raccourcit visuellement un visage long sans fermer les traits.",
    faceShapes: ["allonge"],
    lengths: ["medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: ["female", "non-binary"],
    priority: 4
  },
  {
    id: "square-soft-contour",
    name: "Contour doux structure",
    description: "Longueur equilibree avec mouvement leger autour du visage.",
    color: "Chatain naturel",
    whyItWorks: "Adoucit la machoire tout en gardant une ligne nette.",
    faceShapes: ["carre", "ovale"],
    lengths: ["medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    priority: 4
  },
  {
    id: "square-textured-crop",
    name: "Crop texture arrondi",
    description: "Texture douce au-dessus, angles moins marques aux tempes.",
    color: "Brun lumineux",
    whyItWorks: "Assouplit les angles forts sans perdre le caractere.",
    faceShapes: ["carre"],
    lengths: ["short"],
    maintenance: ["medium"],
    lifestyles: ["modern", "bold"],
    genders: ["male", "non-binary"],
    priority: 4
  },
  {
    id: "square-side-sweep",
    name: "Balayage lateral",
    description: "Meche laterale fluide avec finition naturelle.",
    color: "Reflets miel",
    whyItWorks: "Apporte une diagonale qui allege la structure du bas du visage.",
    faceShapes: ["carre", "ovale"],
    lengths: ["medium", "long"],
    maintenance: ["medium", "high"],
    lifestyles: ["modern", "bold"],
    genders: allGenders,
    priority: 3
  },
  {
    id: "square-layered-bob",
    name: "Carre degrade souple",
    description: "Couches progressives autour des joues et des maxillaires.",
    color: "Brun espresso",
    whyItWorks: "Cree une transition douce autour de la machoire.",
    faceShapes: ["carre"],
    lengths: ["medium", "long"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: ["female", "non-binary"],
    priority: 4
  },
  {
    id: "square-pixie-soft",
    name: "Pixie contours doux",
    description: "Court feminin avec nuque propre et meches arrondies.",
    color: "Brun glace",
    whyItWorks: "Garde la force du visage carre en adoucissant les angles.",
    faceShapes: ["carre", "ovale"],
    lengths: ["short"],
    maintenance: ["medium", "high"],
    lifestyles: ["modern", "bold"],
    genders: ["female", "non-binary"],
    priority: 3
  },
  {
    id: "oval-modern-texture",
    name: "Texture moderne",
    description: "Volume controle sur le dessus, lignes propres et entretien simple.",
    color: "Brun lumineux",
    whyItWorks: "Ajoute du rythme sans casser les proportions.",
    faceShapes: ["ovale"],
    lengths: ["short", "medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["modern"],
    genders: ["male", "non-binary"],
    priority: 4
  },
  {
    id: "oval-soft-contour",
    name: "Contour doux structure",
    description: "Longueur equilibree avec mouvement leger autour du visage.",
    color: "Chatain naturel",
    whyItWorks: "Respecte l'equilibre naturel du visage ovale.",
    faceShapes: ["ovale"],
    lengths: ["medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    priority: 4
  },
  {
    id: "oval-bold-light",
    name: "Signature lumineuse",
    description: "Variation plus marquee avec contraste subtil et finition soignee.",
    color: "Reflets miel",
    whyItWorks: "Cree un point focal visible tout en restant portable.",
    faceShapes: ["ovale"],
    lengths: ["short", "medium"],
    maintenance: ["high"],
    lifestyles: ["bold"],
    genders: allGenders,
    priority: 4
  },
  {
    id: "oval-airy-layer",
    name: "Degrade aerien",
    description: "Couches legeres et mouvement naturel autour des pommettes.",
    color: "Brun glace",
    whyItWorks: "Valorise les pommettes sans alourdir le contour.",
    faceShapes: ["ovale"],
    lengths: ["medium", "long"],
    maintenance: ["medium"],
    lifestyles: ["classic", "modern"],
    genders: ["female", "non-binary"],
    priority: 3
  },
  {
    id: "oval-long-sleek",
    name: "Long fluide lumineux",
    description: "Longueur preservee, pointes legeres et contour propre.",
    color: "Chatain glace",
    whyItWorks: "Profite de l'equilibre ovale tout en respectant l'envie de longueur.",
    faceShapes: ["ovale"],
    lengths: ["long"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: ["female", "non-binary"],
    priority: 4
  },
  {
    id: "child-soft-crop",
    name: "Coupe courte souple",
    description: "Court pratique, contours doux et dessus facile a coiffer.",
    color: "Naturel doux",
    whyItWorks: "Reste adapte a l'age avec peu d'entretien.",
    faceShapes: allFaceShapes,
    lengths: ["short"],
    maintenance: ["low"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    ageGroups: ["baby", "child"],
    priority: 8
  },
  {
    id: "child-layered-bob",
    name: "Carre enfant leger",
    description: "Longueur moyenne, pointes souples et visage degage.",
    color: "Naturel clair",
    whyItWorks: "Simple a vivre et doux pour les traits d'enfant.",
    faceShapes: allFaceShapes,
    lengths: ["medium"],
    maintenance: ["low", "medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    ageGroups: ["child"],
    priority: 8
  },
  {
    id: "child-long-soft-layers",
    name: "Long enfant degrade",
    description: "Longueur gardee avec leger degrade pour eviter l'effet lourd.",
    color: "Naturel lumineux",
    whyItWorks: "Respecte la longueur souhaitee avec un contour plus lisible.",
    faceShapes: allFaceShapes,
    lengths: ["long"],
    maintenance: ["medium"],
    lifestyles: ["classic", "modern"],
    genders: allGenders,
    ageGroups: ["child"],
    priority: 8
  },
  {
    id: "teen-textured-crop",
    name: "Crop ado texture",
    description: "Court moderne, texture facile et finition naturelle.",
    color: "Brun naturel",
    whyItWorks: "Donne du style sans demander trop d'entretien.",
    faceShapes: allFaceShapes,
    lengths: ["short"],
    maintenance: ["low", "medium"],
    lifestyles: ["modern", "bold"],
    genders: allGenders,
    ageGroups: ["teen"],
    priority: 7
  },
  {
    id: "teen-curtain-flow",
    name: "Rideau ado fluide",
    description: "Mi-long tendance avec mouvement leger autour du visage.",
    color: "Reflets naturels",
    whyItWorks: "Apporte une direction claire tout en restant jeune et naturel.",
    faceShapes: allFaceShapes,
    lengths: ["medium", "long"],
    maintenance: ["medium", "high"],
    lifestyles: ["modern", "bold"],
    genders: allGenders,
    ageGroups: ["teen"],
    priority: 7
  }
];

const getFaceKey = (faceShape: string): FaceKey => {
  if (faceShape.includes("rond")) return "rond";
  if (faceShape.includes("allonge")) return "allonge";
  if (faceShape.includes("carre")) return "carre";
  return "ovale";
};

const labelForMaintenance = (value: ConsultationData["maintenance"]) =>
  value === "low" ? "entretien rapide" : value === "medium" ? "entretien modere" : "rituel de coiffage";

const labelForLifestyle = (value: ConsultationData["lifestyle"]) =>
  value === "classic" ? "style classique" : value === "modern" ? "style moderne" : "style audacieux";

const labelForLength = (value: ConsultationData["targetLength"]) =>
  value === "short" ? "longueur courte" : value === "medium" ? "longueur moyenne" : value === "long" ? "longueur longue" : "longueur libre";

const scoreStyle = (style: StyleOption, data: ConsultationData, faceKey: FaceKey) => {
  let score = style.priority || 0;

  score += style.faceShapes.includes(faceKey) ? 12 : 0;
  score += data.targetLength === "any" ? 2 : style.lengths.includes(data.targetLength) ? 7 : -6;
  score += style.maintenance.includes(data.maintenance) ? 4 : -2;
  score += style.lifestyles.includes(data.lifestyle) ? 4 : -2;
  score += style.genders.includes(data.gender) ? 3 : -30;

  if (style.ageGroups?.includes(data.ageGroup)) score += 10;
  else if (style.ageGroups) score -= 40;
  else if (data.ageGroup === "baby" || data.ageGroup === "child") score -= 10;
  else if (data.ageGroup === "teen") score -= 2;

  return score;
};

const isGenderCompatible = (style: StyleOption, data: ConsultationData) =>
  style.genders.includes(data.gender);

const isAgeCompatible = (style: StyleOption, data: ConsultationData) => {
  if (style.ageGroups) return style.ageGroups.includes(data.ageGroup);
  return data.ageGroup !== "baby" && data.ageGroup !== "child";
};

const isLengthCompatible = (style: StyleOption, data: ConsultationData) =>
  data.targetLength === "any" || style.lengths.includes(data.targetLength) || style.lengths.includes("any");

const inferRecipeFamily = (style: StyleOption) => {
  const text = `${style.id} ${style.name} ${style.description}`.toLowerCase();
  if (/pixie/.test(text)) return "pixie";
  if (/bob|carre/.test(text)) return "bob";
  if (/curtain|rideau/.test(text)) return "curtain";
  if (/frange|fringe/.test(text)) return "fringe";
  if (/side|raie|lateral|laterale|balayage/.test(text)) return "side_part";
  if (/wave|ondulation|wavy/.test(text)) return "waves";
  if (/volume|vertical/.test(text)) return "volume";
  if (/long|fluide|face-frame|degrade visage/.test(text)) return "long_flow";
  if (/crop/.test(text)) return "crop";
  if (/taper|texture|contour/.test(text)) return "taper";
  return "layered";
};

const resolveRecipeLength = (style: StyleOption, data: ConsultationData): ConsultationData["targetLength"] => {
  if (data.targetLength !== "any") return data.targetLength;
  return style.lengths[0] === "any" ? "medium" : style.lengths[0];
};

const buildRecipeObjective = (faceKey: FaceKey, family: string, data: ConsultationData) => {
  const faceGoal = {
    rond: "allonger visuellement le visage sans ajouter de largeur aux joues",
    allonge: "eviter d'allonger davantage et ramener l'equilibre vers les yeux",
    carre: "adoucir les angles tout en gardant une structure lisible",
    ovale: "respecter l'equilibre naturel et adapter le style demande"
  }[faceKey];
  return `${faceGoal}; famille ${family}; ${labelForLength(data.targetLength)}, ${labelForMaintenance(data.maintenance)}, ${labelForLifestyle(data.lifestyle)}`;
};

const buildHairstyleRecipe = (
  style: StyleOption,
  data: ConsultationData,
  faceShape: string,
  beardStyle: string
): HairstyleRecipe => {
  const faceKey = getFaceKey(faceShape);
  const family = inferRecipeFamily(style);
  const length = resolveRecipeLength(style, data);
  const wantsLowMaintenance = data.maintenance === "low";
  const wantsBold = data.lifestyle === "bold";

  const volume: HairstyleRecipe["volume"] =
    family === "volume" && faceKey !== "allonge"
      ? "high"
      : faceKey === "rond" && length !== "long"
        ? "medium"
        : faceKey === "allonge"
          ? "low"
          : "medium";

  const sides: HairstyleRecipe["sides"] =
    family === "taper" || family === "crop" || (faceKey === "rond" && length === "short")
      ? "tight"
      : family === "long_flow" || family === "bob"
        ? "layered"
        : "natural";

  const fringe: HairstyleRecipe["fringe"] =
    family === "curtain"
      ? "curtain"
      : family === "side_part"
        ? "side"
        : family === "fringe" || faceKey === "allonge"
          ? "short"
          : "none";

  const texture: HairstyleRecipe["texture"] =
    family === "waves"
      ? "wavy"
      : family === "long_flow" || family === "bob"
        ? "soft"
        : wantsBold
          ? "textured"
          : wantsLowMaintenance
            ? "clean"
            : "textured";

  return {
    family,
    length,
    maintenance: data.maintenance,
    lifestyle: data.lifestyle,
    faceShape,
    volume,
    sides,
    fringe,
    texture,
    color: style.color,
    beard: beardStyle,
    gender: data.gender,
    ageGroup: data.ageGroup,
    objective: buildRecipeObjective(faceKey, family, data)
  };
};

const getPersonalizedStyles = (faceShape: string, beardStyle: string, data: ConsultationData) => {
  const faceKey = getFaceKey(faceShape);
  const ranked = [...styleBank]
    .map(style => ({
      ...style,
      score: scoreStyle(style, data, faceKey)
    }))
    .sort((a, b) => b.score - a.score || (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name));
  const compatibleRanked = ranked.filter(style =>
    isGenderCompatible(style, data) &&
    isAgeCompatible(style, data) &&
    isLengthCompatible(style, data)
  );

  const selected: typeof ranked = [];
  for (const style of compatibleRanked) {
    if (selected.length >= 4) break;
    if (style.score < -4) continue;
    selected.push(style);
  }

  const broadFallback = ranked.filter(style => isGenderCompatible(style, data) && isAgeCompatible(style, data));
  const fallback = selected.length >= 4
    ? selected
    : [...selected, ...compatibleRanked.filter(style => !selected.some(item => item.id === style.id))]
        .slice(0, 4);
  const finalStyles = fallback.length >= 4 || data.targetLength !== "any"
    ? fallback
    : [...fallback, ...broadFallback.filter(style => !fallback.some(item => item.id === style.id))].slice(0, 4);
  return finalStyles.map(style => ({
    id: `${style.id}-${data.targetLength}-${data.maintenance}-${data.lifestyle}`,
    name: style.name,
    description: style.description,
    color: style.color,
    beardStyle,
    whyItWorks: `${style.whyItWorks} Choix pris en compte: ${labelForLength(data.targetLength)}, ${labelForMaintenance(data.maintenance)}, ${labelForLifestyle(data.lifestyle)}.`,
    faceShape,
    recipe: buildHairstyleRecipe(style, data, faceShape, beardStyle)
  }));
};

const createPreferenceAdvice = (data: ConsultationData, faceShape: string) =>
  `Analyse basee sur la photo originale: morphologie ${faceShape}, ${labelForLength(data.targetLength)}, ${labelForMaintenance(data.maintenance)} et ${labelForLifestyle(data.lifestyle)}. Les 4 coupes proposees sont triees pour croiser la forme du visage avec vos selections.`;

const createDemoAnalysis = (data: ConsultationData, faceShape = "visage ovale"): AnalysisResult => {
  const canSuggestBeard = data.gender === "male" && data.ageGroup !== "baby" && data.ageGroup !== "child";
  const beard = canSuggestBeard ? "Rase de pres" : "Aucune";

  return {
    faceShape: USE_POLLINATIONS || USE_LOCAL_PREVIEWS || USE_COMFY_PREVIEWS ? `${faceShape} (estimation locale)` : `${faceShape} (mode demo)`,
    hairTexture: "Texture moyenne",
    skinTone: "Naturel",
    detectedGender: data.gender,
    professionalAdvice: createPreferenceAdvice(data, faceShape),
    recommendedStyles: getPersonalizedStyles(faceShape, beard, data)
  };
};

async function callWithRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_DELAY): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0) {
      await sleep(delay);
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const analyzeMorphology = async (base64Image: string, data: ConsultationData): Promise<AnalysisResult> => {
  if (!USE_GEMINI) {
    const faceShape = await estimateLocalFaceShape(base64Image);
    return createDemoAnalysis(data, faceShape);
  }

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const normalizedImage = normalizeImageInput(base64Image);
    
    const isChild = data.ageGroup === 'baby' || data.ageGroup === 'child';
    const beardInstruction = isChild 
      ? "IMPORTANT: Le sujet est un enfant/bebe. Le style de barbe DOIT etre 'Aucune' ou 'N/A'." 
      : "Pour chaque style, specifiez aussi le style de barbe (ex: 'Rase de pres', 'Barbe de 3 jours') adapte au visage.";

    const prompt = `EXPERT VISAGISTE INTERNATIONAL :
    1. Analysez cette photo : Identifiez la forme du visage et la texture des cheveux.
    2. Le client est : Genre ${data.gender}, Tranche d'age ${data.ageGroup}.
    3. Proposez 6 styles de coiffure parfaitement adaptes. Preferences : Entretien ${data.maintenance}, Style ${data.lifestyle}, Longueur cible ${data.targetLength}.
    4. ${beardInstruction}
    5. Pour les enfants/bebes, proposez des coupes pratiques, mignonnes ou tendances adaptees a leur age scolaire ou prescolaire.
    Repondez strictement en JSON.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [{ inlineData: { data: normalizedImage.base64, mimeType: normalizedImage.mimeType } }, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            faceShape: { type: Type.STRING },
            detectedGender: { type: Type.STRING, enum: ['male', 'female', 'non-binary'] },
            professionalAdvice: { type: Type.STRING },
            recommendedStyles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  color: { type: Type.STRING },
                  beardStyle: { type: Type.STRING },
                  whyItWorks: { type: Type.STRING }
                },
                required: ["id", "name", "description", "color", "beardStyle", "whyItWorks"]
              }
            }
          },
          required: ["faceShape", "detectedGender", "professionalAdvice", "recommendedStyles"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  });
};

export const generateQuickPreview = async (style: any, gender: string, ageGroup: string, originalBase64?: string): Promise<string> => {
  if (USE_LOCAL_PREVIEWS) return createDemoPreviewImage(style);
  if (USE_COMFY_PREVIEWS) return generateAlternativePreviewImage(style, gender, ageGroup, originalBase64);

  if (USE_POLLINATIONS) {
    return createPollinationsImageUrl(style, gender, ageGroup, 'front', 'preview');
  }
  if (!USE_GEMINI) return createDemoPreviewImage(style);

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const normalizedStyle = normalizeStyle(style);
    
    let ageTerm = 'adult';
    switch (ageGroup) {
      case 'baby': ageTerm = 'toddler baby (1-3 years old)'; break;
      case 'child': ageTerm = 'young child (5-10 years old)'; break;
      case 'teen': ageTerm = 'teenager (15-18 years old)'; break;
      case 'adult': ageTerm = 'adult (25-40 years old)'; break;
      case 'mature': ageTerm = 'mature adult (55+ years old)'; break;
    }

    const genderTerm = gender === 'female' ? 'female' : 'male';
    
    const prompt = `Professional high-quality hair catalog headshot of a ${ageTerm} ${genderTerm}. 
    Hairstyle: ${normalizedStyle.name} (${normalizedStyle.description}), Color: ${normalizedStyle.color}. 
    ${(ageGroup === 'baby' || ageGroup === 'child') ? 'No facial hair.' : `Facial Hair: ${normalizedStyle.beardStyle}.`} 
    The image must strictly follow these details. Clean background, studio lighting.`;

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts: [{ text: prompt }] }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Preview failed");
  });
};

const generateServerHairstyleImage = async (
  originalBase64: string,
  style: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult'
) => {
  return requestServerHairstyleImage(IMAGE_TO_IMAGE_ENDPOINT, originalBase64, style, gender, angle, ageGroup);
};

export const generateHairstyleImage = async (
  originalBase64: string, 
  style: any,
  gender: string,
  angle: 'front' | 'left' | 'right' | 'back' = 'front',
  ageGroup: string = 'adult'
): Promise<string> => {
  if (USE_HF_KONTEXT_IMAGE_TO_IMAGE) {
    return await generateHuggingFaceKontextHairstyleImage(originalBase64, style, gender, angle, ageGroup);
  }

  if (USE_LOCAL_RETOUCH_IMAGE_TO_IMAGE) {
    try {
      return await createLocalRetouchImage(originalBase64, style, angle);
    } catch {
      return createDemoResultImage(originalBase64, style, angle);
    }
  }

  if (USE_PUTER_FLUX_IMAGE_TO_IMAGE) {
    try {
      return await generatePuterFluxHairstyleImage(originalBase64, style, gender, angle, ageGroup);
    } catch {
      return await createLocalRetouchImage(originalBase64, style, angle);
    }
  }

  if (USE_SERVER_IMAGE_TO_IMAGE) {
    return await generateServerHairstyleImage(originalBase64, style, gender, angle, ageGroup);
  }

  if (USE_POLLINATIONS) {
    const url = createPollinationsImageUrl(style, gender, ageGroup, angle, 'result');
    try {
      return await waitForImage(url, 18000);
    } catch {
      return style?.previewUrl || createDemoPreviewImage(style);
    }
  }
  if (!USE_GEMINI) return createDemoResultImage(originalBase64, style, angle);

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const normalizedStyle = normalizeStyle(style);
    const normalizedImage = normalizeImageInput(originalBase64);
    
    const angleText = angle === 'front' ? "Face view" : angle === 'left' ? "Left profile" : angle === 'right' ? "Right profile" : "Back view";

    const beardValue = normalizedStyle.beardStyle.toLowerCase();
    const isCleanShaven = beardValue.includes('rase') || beardValue.includes('aucune') || beardValue.includes('n/a');
    
    const beardPrompt = isCleanShaven 
      ? "Ensure the face is clean-shaven or has no facial hair if appropriate for the age/gender." 
      : `FACIAL HAIR: Apply "${normalizedStyle.beardStyle}".`;

    const prompt = `CRITICAL INSTRUCTION: STICK TO THE SOURCE PHOTO ENVIRONMENT.
    - KEEP the background, room, decor, and clothing EXACTLY as they are.
    - KEEP the person's identity and facial structure PERFECTLY.
    
    MODIFICATIONS:
    1. HAIR: Change to style "${normalizedStyle.name}" (${normalizedStyle.description}) in "${normalizedStyle.color}".
    2. ${beardPrompt}
    
    QUALITY:
    - Seamless integration. The new hair must look like it belongs to the person in that specific photo.
    - View Angle: ${angleText}.
    - No changes to lighting or skin tone.`;

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: normalizedImage.base64, mimeType: normalizedImage.mimeType } },
          { text: prompt }
        ]
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error(`Transformation failed`);
  });
};

export const generateStyleAngles = async (originalBase64: string, proposal: any, gender: string, ageGroup: string = 'adult'): Promise<AdditionalViews> => {
  if (USE_HF_KONTEXT_IMAGE_TO_IMAGE) {
    return {
      left: await generateHuggingFaceKontextHairstyleImage(originalBase64, proposal, gender, 'left', ageGroup),
      right: await generateHuggingFaceKontextHairstyleImage(originalBase64, proposal, gender, 'right', ageGroup),
      back: await generateHuggingFaceKontextHairstyleImage(originalBase64, proposal, gender, 'back', ageGroup)
    };
  }

  if (USE_LOCAL_RETOUCH_IMAGE_TO_IMAGE) {
    return {
      left: await createLocalRetouchImage(originalBase64, proposal, 'left'),
      right: await createLocalRetouchImage(originalBase64, proposal, 'right'),
      back: await createLocalRetouchImage(originalBase64, proposal, 'back')
    };
  }

  if (USE_POLLINATIONS) {
    return {
      left: createPollinationsImageUrl(proposal, gender, ageGroup, 'left'),
      right: createPollinationsImageUrl(proposal, gender, ageGroup, 'right'),
      back: createPollinationsImageUrl(proposal, gender, ageGroup, 'back')
    };
  }

  if (!USE_GEMINI) {
    return {
      left: createDemoResultImage(originalBase64, proposal, 'left'),
      right: createDemoResultImage(originalBase64, proposal, 'right'),
      back: createDemoResultImage(originalBase64, proposal, 'back')
    };
  }

  const left = await generateHairstyleImage(originalBase64, proposal, gender, 'left', ageGroup);
  await sleep(1000);
  const right = await generateHairstyleImage(originalBase64, proposal, gender, 'right', ageGroup);
  await sleep(1000);
  const back = await generateHairstyleImage(originalBase64, proposal, gender, 'back', ageGroup);
  
  return { left, right, back };
};
