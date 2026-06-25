import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_COMFY_API = process.env.COMFY_API_URL || "http://127.0.0.1:8188";
const DEFAULT_COMFY_OUTPUT_DIR =
  process.env.COMFY_OUTPUT_DIR ||
  "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/ComfyUI/output";
const DEFAULT_MODEL = process.env.COMFY_SDXL_MODEL || "realvisxl.safetensors";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    api: DEFAULT_COMFY_API,
    comfyOutputDir: DEFAULT_COMFY_OUTPUT_DIR,
    output: "",
    model: DEFAULT_MODEL,
    prompt: "realistic professional hair salon catalog portrait, head and shoulders, clean studio background",
    negative: "text, logo, watermark, blurry, low quality, deformed face, extra person, hat, cap, cartoon",
    width: 512,
    height: 640,
    steps: 14,
    guidance: 6.5,
    seed: Math.floor(Math.random() * 2 ** 31),
    prefix: `morphostyle-preview-${stamp}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--api") options.api = value;
    if (key === "--output") options.output = value;
    if (key === "--model") options.model = value;
    if (key === "--prompt") options.prompt = value;
    if (key === "--negative") options.negative = value;
    if (key === "--width") options.width = Number(value) || options.width;
    if (key === "--height") options.height = Number(value) || options.height;
    if (key === "--steps") options.steps = Number(value) || options.steps;
    if (key === "--guidance") options.guidance = Number(value) || options.guidance;
    if (key === "--seed") options.seed = Number(value) || options.seed;
    if (key === "--prefix") options.prefix = value;
    index += 1;
  }

  if (!options.output) {
    options.output = path.resolve("output", "tmp", "comfy", `${options.prefix}.png`);
  }

  return options;
};

const buildGraph = (options) => ({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: options.model } },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 1],
      text: options.prompt
    }
  },
  "3": {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 1],
      text: options.negative
    }
  },
  "4": {
    class_type: "EmptyLatentImage",
    inputs: {
      width: options.width,
      height: options.height,
      batch_size: 1
    }
  },
  "6": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      seed: options.seed,
      steps: options.steps,
      cfg: options.guidance,
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
      denoise: 1
    }
  },
  "7": {
    class_type: "VAEDecode",
    inputs: {
      samples: ["6", 0],
      vae: ["1", 2]
    }
  },
  "8": {
    class_type: "SaveImage",
    inputs: {
      images: ["7", 0],
      filename_prefix: options.prefix
    }
  }
});

const waitForCompletion = async (apiBaseUrl, promptId, timeoutMs = 10 * 60 * 1000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(1200);
    const historyResponse = await fetch(`${apiBaseUrl}/history/${promptId}`);
    if (!historyResponse.ok) continue;
    const history = await historyResponse.json();
    const item = history?.[promptId];
    if (!item) continue;
    if (item.status?.status_str === "error") {
      throw new Error(`ComfyUI preview failed: ${JSON.stringify(item.status)}`);
    }
    if (item.outputs && Object.keys(item.outputs).length > 0) return item;
  }
  throw new Error("Timeout ComfyUI preview");
};

const findRenderedPng = (promptHistory) => {
  const outputs = promptHistory?.outputs ?? {};
  for (const nodeOutput of Object.values(outputs)) {
    const images = nodeOutput?.images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      if (String(image?.filename).toLowerCase().endsWith(".png")) {
        return path.join(image.subfolder || "", image.filename);
      }
    }
  }
  throw new Error("No preview PNG found");
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const graph = buildGraph(options);
  const queueResponse = await fetch(`${options.api}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "morphostyle-hairstyle-preview", prompt: graph })
  });

  if (!queueResponse.ok) throw new Error(`Queue failed: ${await queueResponse.text()}`);
  const { prompt_id: promptId } = await queueResponse.json();
  const historyItem = await waitForCompletion(options.api, promptId);
  const relativePath = findRenderedPng(historyItem);
  const sourcePath = path.resolve(options.comfyOutputDir, relativePath);
  const destinationPath = path.resolve(options.output);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  console.log(`Preview saved to: ${destinationPath}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
