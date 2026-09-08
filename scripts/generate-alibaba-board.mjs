import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_PATH = "D:\\00_Cerveau_IA\\API\\env.Local";

const lengths = new Set(["short", "medium", "long", "any"]);
const maintenances = new Set(["low", "medium", "high"]);
const lifestyles = new Set(["classic", "modern", "bold"]);
const modes = new Set(["board", "variant-sheets"]);
const variants = ["primary", "soft", "structured", "signature"];

const profileNotes = {
  marc: {
    name: "Mark",
    subject:
      "mature man with a long poorly trimmed beard, strong receding hairline and large bald crown, untrimmed eyebrows and subtle visible nose hair, realistic skin texture",
    morphology:
      "mature male face with marked balding: avoid juvenile styling, avoid fake full hair density, keep a believable thinning crown and masculine proportions",
  },
};

const labels = {
  length: {
    short: "short haircut",
    medium: "medium haircut",
    long: "longer haircut",
    any: "free adapted length",
  },
  maintenance: {
    low: "low maintenance, quick grooming, easy to repeat at home",
    medium: "moderate maintenance, clean salon finish but realistic daily upkeep",
    high: "higher maintenance, precise grooming ritual, polished finish",
  },
  lifestyle: {
    classic: "classic sober barber style",
    modern: "modern refined barber style",
    bold: "more distinctive signature barber style",
  },
};

const variantPlans = {
  primary:
    "primary conservative recommendation: very short classic barber cut, clean edges, shortened natural beard, credible thinning crown and receding hairline",
  soft:
    "softer natural recommendation: keep more irregular crown texture, gently shortened beard, cleaned cheeks, minimal maintenance, not over-polished",
  structured:
    "clearly structured recommendation: short fade on the sides, visible bald crown kept realistic, square beard line, neat moustache and brows",
  signature:
    "signature recommendation: controlled senior texture, stronger beard shape, slightly more distinctive silhouette while staying believable and age-appropriate",
};

function readEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    values[key] = value;
  }
  return values;
}

function parseArgs() {
  const args = {
    profile: "marc",
    length: "short",
    maintenance: "low",
    lifestyle: "classic",
    model: undefined,
    size: undefined,
    endpoint: undefined,
    mode: "board",
    variant: "all",
    force: false,
    async: false,
  };

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    if (arg === "--force") {
      args.force = true;
    } else if (arg === "--async") {
      args.async = true;
    } else if (arg === "--high-quality") {
      args.mode = "variant-sheets";
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[key] = next;
      i += 1;
    }
  }

  if (!lengths.has(args.length)) throw new Error(`Invalid --length ${args.length}`);
  if (!maintenances.has(args.maintenance)) throw new Error(`Invalid --maintenance ${args.maintenance}`);
  if (!lifestyles.has(args.lifestyle)) throw new Error(`Invalid --lifestyle ${args.lifestyle}`);
  if (!modes.has(args.mode)) throw new Error(`Invalid --mode ${args.mode}`);
  if (args.variant !== "all" && !variants.includes(args.variant)) throw new Error(`Invalid --variant ${args.variant}`);
  if (!args.size) args.size = args.mode === "variant-sheets" ? "1360*2040" : "1024*1536";
  return args;
}

function boardPrompt({ profile, length, maintenance, lifestyle }) {
  const notes = profileNotes[profile];
  if (!notes) throw new Error(`No profile prompt configured for ${profile}`);

  return [
    "Create one single photorealistic studio contact sheet image, portrait orientation, 4 columns by 4 rows.",
    `Subject reference: preserve the same person identity from the input photo. The profile is ${notes.name}: ${notes.subject}.`,
    `Exact selection to respect: ${labels.length[length]}, ${labels.maintenance[maintenance]}, ${labels.lifestyle[lifestyle]}.`,
    `Morphology rule: ${notes.morphology}. Every recommendation must be based on the face morphology and hair/beard reality.`,
    "",
    "Grid structure:",
    "Row 1 = front view portrait.",
    "Row 2 = left-side profile photo: the subject turns to camera-left at about 75 degrees, with one ear and one shoulder line visible.",
    "Row 3 = right-side profile photo: a separate new photo, the subject turns to camera-right at about 95 degrees, with different ear visibility, different shoulder angle, different beard silhouette and different hair fall.",
    "Row 4 = back view.",
    "Column 1 = primary conservative recommendation.",
    "Column 2 = softer natural recommendation.",
    "Column 3 = clearly structured recommendation, visibly different from column 2.",
    "Column 4 = signature recommendation, still age-appropriate and realistic.",
    "",
    "Mark-specific grooming requirements:",
    "Keep a believable receding hairline and bald crown in all options; do not invent dense full hair.",
    "Show realistic barber recommendations combining haircut, beard shape and eyebrow/nose-hair tidying.",
    "The beard can be shortened, cleaned, squared, rounded or faded according to the column, but keep the same man.",
    "Left and right profiles must be real different camera angles, not mirrored duplicates. After horizontal flip they must still look different: vary head tilt, ear visibility, beard contour, neckline, shoulder angle, hair fall and scalp shape.",
    "",
    "Composition constraints:",
    "Every cell is a passport-photo-like head-and-shoulders portrait, neutral gray studio background, realistic lighting.",
    "No text, no labels, no watermark, no logo, no outer white border.",
    "Use thin internal light dividers only between cells so the 16 cells can be sliced cleanly.",
    "Fill the full image with the grid, no margins around the outside.",
  ].join("\n");
}

function variantSheetPrompt({ profile, length, maintenance, lifestyle }, variant) {
  const notes = profileNotes[profile];
  if (!notes) throw new Error(`No profile prompt configured for ${profile}`);
  const plan = variantPlans[variant];
  if (!plan) throw new Error(`No variant plan configured for ${variant}`);

  return [
    "Create one single high-resolution photorealistic studio contact sheet image, portrait orientation, 2 columns by 2 rows.",
    `Subject reference: preserve the same person identity from the input photo. The profile is ${notes.name}: ${notes.subject}.`,
    `Exact selection to respect: ${labels.length[length]}, ${labels.maintenance[maintenance]}, ${labels.lifestyle[lifestyle]}.`,
    `This sheet is only for the ${variant} variant: ${plan}.`,
    `Morphology rule: ${notes.morphology}. The recommendation must be based on the mature male face, strong bald crown, receding hairline and beard reality.`,
    "",
    "Grid structure:",
    "Top-left = front view portrait.",
    "Top-right = true left-side profile photo: almost pure side profile, looking toward the left edge, one ear fully visible, eye mostly in profile, lower shoulder visible.",
    "Bottom-left = true right-side three-quarter profile photo: looking toward the right edge but turned slightly back toward the camera, one eye partly visible, different ear visibility, higher opposite shoulder, different beard contour and different scalp outline.",
    "Bottom-right = back view, believable bald crown and neckline.",
    "",
    "Quality and consistency requirements:",
    "Use the same haircut and beard recommendation in all four views.",
    "Keep realistic mature skin pores, beard hairs, sparse scalp texture and natural studio light.",
    "Do not invent dense full hair; keep the bald crown and receding hairline believable.",
    "Clean eyebrow and nose-hair grooming subtly when relevant, but keep the same man.",
    "Left and right profiles must not be mirrored duplicates. After horizontal flip they must still look different: one is a pure side profile, the other is a three-quarter opposite profile with different head tilt, crop, shoulder height and beard silhouette.",
    "",
    "Composition constraints:",
    "Every cell is a passport-photo-like head-and-shoulders portrait, neutral gray studio background.",
    "No text, no labels, no watermark, no logo, no outer white border.",
    "Use thin internal light dividers only between cells so the 4 cells can be sliced cleanly.",
    "Fill the full image with the grid, no margins around the outside.",
  ].join("\n");
}

function negativePrompt() {
  return [
    "cartoon",
    "illustration",
    "painting",
    "plastic skin",
    "beauty filter",
    "young man",
    "teenager",
    "full thick hair",
    "wig",
    "hat",
    "cap",
    "text",
    "label",
    "logo",
    "watermark",
    "white outside border",
    "mirrored left and right profiles",
    "symmetrical side profiles",
    "same side photo flipped",
    "duplicate columns",
    "landscape sheet",
  ].join(", ");
}

function candidateEndpoints(env, explicitEndpoint, asyncMode) {
  if (explicitEndpoint) return [explicitEndpoint];
  const envEndpoint =
    env.Alibaba_API_ENDPOINT ||
    env.ALIBABA_API_ENDPOINT ||
    env.DASHSCOPE_ENDPOINT ||
    env.QWEN_IMAGE_ENDPOINT;
  const suffix = asyncMode
    ? "/api/v1/services/aigc/image-generation/generation"
    : "/api/v1/services/aigc/multimodal-generation/generation";
  const bases = [
    envEndpoint,
    "https://dashscope-intl.aliyuncs.com",
    "https://dashscope.aliyuncs.com",
  ].filter(Boolean);
  return [...new Set(bases.map((base) => base.endsWith("/generation") ? base : `${base.replace(/\/$/, "")}${suffix}`))];
}

function imageFromResponse(json) {
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

  return null;
}

function taskIdFromResponse(json) {
  return json?.output?.task_id || json?.task_id || null;
}

function safeError(body) {
  if (!body) return "empty response";
  if (typeof body === "string") return body.slice(0, 800);
  return JSON.stringify({
    code: body.code,
    message: body.message,
    request_id: body.request_id,
    output: body.output,
  }).slice(0, 1200);
}

async function postJson(endpoint, apiKey, body, asyncMode) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(asyncMode ? { "X-DashScope-Async": "enable" } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = text;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${endpoint}: ${safeError(json)}`);
  }
  return json;
}

async function pollTask(endpoint, apiKey, taskId) {
  const base = endpoint.replace(/\/api\/v1\/services\/aigc\/.*$/, "");
  const taskUrl = `${base}/api/v1/tasks/${taskId}`;
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    const response = await fetch(taskUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await response.json();
    const status = json?.output?.task_status || json?.task_status;
    if (status === "SUCCEEDED") return json;
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(status)) {
      throw new Error(`Alibaba task ${status}: ${safeError(json)}`);
    }
    console.log(`Task ${taskId} status: ${status || "PENDING"} (${attempt}/90)`);
  }
  throw new Error(`Timeout while waiting for Alibaba task ${taskId}`);
}

async function callAlibaba(args, env, body) {
  const apiKey = env.Alibaba_API_KEY || env.ALIBABA_API_KEY || env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error(`Missing Alibaba_API_KEY in ${ENV_PATH}`);

  const endpoints = candidateEndpoints(env, args.endpoint, args.async);
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      console.log(`Calling Alibaba ${args.async ? "async" : "sync"} endpoint: ${endpoint}`);
      const json = await postJson(endpoint, apiKey, body, args.async);
      if (args.async) {
        const taskId = taskIdFromResponse(json);
        if (!taskId) throw new Error(`No task_id in response: ${safeError(json)}`);
        return await pollTask(endpoint, apiKey, taskId);
      }
      return json;
    } catch (error) {
      errors.push(error.message);
      console.warn(error.message);
    }
  }

  if (!args.async) {
    console.log("Synchronous call failed on all endpoints, trying asynchronous mode.");
    return callAlibaba({ ...args, async: true }, env, body);
  }

  throw new Error(`Alibaba generation failed:\n${errors.join("\n\n")}`);
}

async function saveGeneratedImage(image, outputPath) {
  if (image.startsWith("data:image/")) {
    const [, base64] = image.split(",", 2);
    writeFileSync(outputPath, Buffer.from(base64, "base64"));
    return;
  }

  const response = await fetch(image);
  if (!response.ok) {
    throw new Error(`Cannot download generated image: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
}

function buildRequestBody({ model, sourceDataUrl, prompt, size }) {
  return {
    model,
    input: {
      messages: [
        {
          role: "user",
          content: [
            { image: sourceDataUrl },
            { text: prompt },
          ],
        },
      ],
    },
    parameters: {
      prompt_extend: true,
      prompt_extend_mode: "direct",
      enable_thinking: true,
      n: 1,
      size,
      watermark: false,
      negative_prompt: negativePrompt(),
    },
  };
}

async function main() {
  const args = parseArgs();
  const env = readEnv(ENV_PATH);
  const profileDir = join(ROOT, "public", "demo-profiles", args.profile);
  const sourcePath = join(profileDir, "source.png");
  if (!existsSync(sourcePath)) throw new Error(`Missing source image: ${sourcePath}`);

  const sourceBuffer = readFileSync(sourcePath);
  const sourceDataUrl = `data:image/${extname(sourcePath).slice(1) || "png"};base64,${sourceBuffer.toString("base64")}`;
  const model = args.model || env.ALIBABA_IMAGE_MODEL || env.QWEN_IMAGE_MODEL || "qwen-image-3.0";
  const combo = `${args.length}-${args.maintenance}-${args.lifestyle}`;

  if (args.mode === "variant-sheets") {
    const sheetDir = join(profileDir, "variant-sheets");
    mkdirSync(sheetDir, { recursive: true });
    const selectedVariants = args.variant === "all" ? variants : [args.variant];
    console.log(`Generating high-quality variant sheets for ${args.profile}: ${combo}`);
    console.log(`Model: ${model}, size: ${args.size}, source: ${basename(sourcePath)}`);

    for (const variant of selectedVariants) {
      const outputPath = join(sheetDir, `${combo}-${variant}.png`);
      if (existsSync(outputPath) && !args.force) {
        throw new Error(`Variant sheet already exists: ${outputPath}. Use --force to overwrite.`);
      }

      console.log(`Generating variant sheet: ${variant}`);
      const prompt = variantSheetPrompt(args, variant);
      const body = buildRequestBody({ model, sourceDataUrl, prompt, size: args.size });
      const result = await callAlibaba(args, env, body);
      const generatedImage = imageFromResponse(result);
      if (!generatedImage) {
        throw new Error(`No image URL/base64 in Alibaba response: ${safeError(result)}`);
      }
      await saveGeneratedImage(generatedImage, outputPath);
      console.log(`Saved variant sheet: ${outputPath}`);
    }

    const sliceArgs = ["scripts/slice-variant-sheets.py", args.profile, "--combo", combo, "--strict"];
    if (args.variant !== "all") sliceArgs.splice(4, 0, "--variant", args.variant);
    execFileSync("python", sliceArgs, {
      cwd: ROOT,
      stdio: "inherit",
    });
    return;
  }

  const boardDir = join(profileDir, "combination-boards");
  mkdirSync(boardDir, { recursive: true });
  const outputPath = join(boardDir, `${combo}.png`);
  if (existsSync(outputPath) && !args.force) {
    throw new Error(`Board already exists: ${outputPath}. Use --force to overwrite.`);
  }

  console.log(`Generating board for ${args.profile}: ${combo}`);
  console.log(`Model: ${model}, size: ${args.size}, source: ${basename(sourcePath)}`);
  const prompt = boardPrompt(args);
  const body = buildRequestBody({ model, sourceDataUrl, prompt, size: args.size });
  const result = await callAlibaba(args, env, body);
  const generatedImage = imageFromResponse(result);
  if (!generatedImage) {
    throw new Error(`No image URL/base64 in Alibaba response: ${safeError(result)}`);
  }
  await saveGeneratedImage(generatedImage, outputPath);
  console.log(`Saved board: ${outputPath}`);

  execFileSync("python", ["scripts/slice-profile-boards.py", args.profile, "--strict"], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
