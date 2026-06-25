import { copyFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_COMFY_API = process.env.COMFY_API_URL || "http://127.0.0.1:8188";
const DEFAULT_COMFY_OUTPUT_DIR =
  process.env.COMFY_OUTPUT_DIR ||
  "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/ComfyUI/output";
const DEFAULT_MODEL = process.env.COMFY_PHOTOMAKER_SDXL_MODEL || process.env.COMFY_SDXL_MODEL || "realvisxl.safetensors";
const DEFAULT_PHOTOMAKER_MODEL = process.env.COMFY_PHOTOMAKER_MODEL || "photomaker-v1.bin";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    api: DEFAULT_COMFY_API,
    comfyOutputDir: DEFAULT_COMFY_OUTPUT_DIR,
    input: "",
    identityInput: "",
    output: "",
    model: DEFAULT_MODEL,
    photomakerModel: DEFAULT_PHOTOMAKER_MODEL,
    prompt: [
      "realistic professional salon portrait photo of photomaker man",
      "same identity as the reference face",
      "true short modern men's taper haircut",
      "short textured top about 1 to 2 cm, low volume, clean tapered sides",
      "natural hairline, realistic hair strands, head and shoulders, neutral studio background"
    ].join(", "),
    negative: [
      "different person",
      "changed identity",
      "deformed face",
      "long hair",
      "medium length hair",
      "curtain haircut",
      "large volume hair",
      "tall quiff",
      "high pompadour",
      "wig",
      "hat",
      "cap",
      "text",
      "watermark",
      "cartoon",
      "painting"
    ].join(", "),
    width: 768,
    height: 960,
    steps: 26,
    guidance: 5.5,
    denoise: 1,
    seed: 1234567,
    mode: "text",
    maskProfile: "short",
    controlnet: "",
    controlStrength: 0.75,
    prefix: `morphostyle-photomaker-${stamp}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--api") options.api = value;
    if (key === "--input") options.input = value;
    if (key === "--identity-input") options.identityInput = value;
    if (key === "--output") options.output = value;
    if (key === "--model") options.model = value;
    if (key === "--photomaker-model") options.photomakerModel = value;
    if (key === "--prompt") options.prompt = value;
    if (key === "--negative") options.negative = value;
    if (key === "--width") options.width = Number(value) || options.width;
    if (key === "--height") options.height = Number(value) || options.height;
    if (key === "--steps") options.steps = Number(value) || options.steps;
    if (key === "--guidance") options.guidance = Number(value) || options.guidance;
    if (key === "--denoise") options.denoise = Number(value) || options.denoise;
    if (key === "--seed") options.seed = Number(value) || options.seed;
    if (key === "--mode") options.mode = value || options.mode;
    if (key === "--mask-profile") options.maskProfile = value || options.maskProfile;
    if (key === "--controlnet") options.controlnet = value || options.controlnet;
    if (key === "--control-strength") options.controlStrength = Number(value) || options.controlStrength;
    if (key === "--prefix") options.prefix = value;
    index += 1;
  }

  return options;
};

const maskGeometryFor = (profile, width, height) => {
  const normalized = String(profile || "short").toLowerCase();
  const cx = Math.round(width * 0.5);
  const top = {
    x: cx,
    y: Math.round(height * 0.22),
    width: Math.round(width * 0.72),
    height: Math.round(height * 0.27)
  };
  const crown = {
    x: cx,
    y: Math.round(height * 0.18),
    width: Math.round(width * 0.54),
    height: Math.round(height * 0.18)
  };
  const leftSide = {
    x: Math.round(width * 0.23),
    y: Math.round(height * 0.31),
    width: Math.round(width * 0.12),
    height: Math.round(height * 0.22)
  };
  const rightSide = {
    x: Math.round(width * 0.77),
    y: Math.round(height * 0.31),
    width: Math.round(width * 0.12),
    height: Math.round(height * 0.22)
  };
  const faceCut = {
    x: cx,
    y: Math.round(height * 0.4),
    width: Math.round(width * 0.5),
    height: Math.round(height * 0.48)
  };

  if (normalized.includes("top")) {
    return { top, crown, leftSide: null, rightSide: null, faceCut };
  }
  return { top, crown, leftSide, rightSide, faceCut };
};

const shapeMaskNode = (shape, box, options) => ({
  class_type: "CreateShapeMask",
  inputs: {
    shape,
    frames: 1,
    location_x: box.x,
    location_y: box.y,
    grow: 0,
    frame_width: options.width,
    frame_height: options.height,
    shape_width: box.width,
    shape_height: box.height
  }
});

const buildMaskNodes = (graph, options) => {
  const geometry = maskGeometryFor(options.maskProfile, options.width, options.height);
  graph["30"] = shapeMaskNode("circle", geometry.top, options);
  graph["31"] = shapeMaskNode("circle", geometry.crown, options);
  graph["32"] = {
    class_type: "MaskComposite",
    inputs: {
      destination: ["30", 0],
      source: ["31", 0],
      x: 0,
      y: 0,
      operation: "add"
    }
  };

  let current = "32";
  if (geometry.leftSide) {
    graph["33"] = shapeMaskNode("square", geometry.leftSide, options);
    graph["34"] = {
      class_type: "MaskComposite",
      inputs: {
        destination: [current, 0],
        source: ["33", 0],
        x: 0,
        y: 0,
        operation: "add"
      }
    };
    current = "34";
  }
  if (geometry.rightSide) {
    graph["35"] = shapeMaskNode("square", geometry.rightSide, options);
    graph["36"] = {
      class_type: "MaskComposite",
      inputs: {
        destination: [current, 0],
        source: ["35", 0],
        x: 0,
        y: 0,
        operation: "add"
      }
    };
    current = "36";
  }

  graph["37"] = shapeMaskNode("circle", geometry.faceCut, options);
  graph["38"] = {
    class_type: "MaskComposite",
    inputs: {
      destination: [current, 0],
      source: ["37", 0],
      x: 0,
      y: 0,
      operation: "subtract"
    }
  };
  graph["39"] = {
    class_type: "GrowMaskWithBlur",
    inputs: {
      mask: ["38", 0],
      expand: 10,
      incremental_expandrate: 0,
      tapered_corners: true,
      flip_input: false,
      blur_radius: 18,
      lerp_alpha: 1,
      decay_factor: 1,
      fill_holes: true
    }
  };

  return ["39", 0];
};

const buildGraph = (options) => {
  const controlnet = String(options.controlnet || "").toLowerCase();
  const positiveInput = controlnet ? ["22", 0] : ["11", 0];
  const negativeInput = controlnet ? ["22", 1] : ["12", 0];
  const identityImageInput = options.identityInput ? ["18", 0] : ["17", 0];
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: options.model } },
    "2": { class_type: "PhotoMakerLoader", inputs: { photomaker_model_name: options.photomakerModel } },
    "10": { class_type: "LoadImage", inputs: { image: options.input } },
    ...(options.identityInput
      ? { "18": { class_type: "LoadImage", inputs: { image: options.identityInput } } }
      : {}),
    "17": {
      class_type: "ImageScale",
      inputs: {
        image: ["10", 0],
        upscale_method: "lanczos",
        width: options.width,
        height: options.height,
        crop: "center"
      }
    },
    "11": {
    class_type: "PhotoMakerEncode",
    inputs: {
      photomaker: ["2", 0],
      image: identityImageInput,
      clip: ["1", 1],
      text: options.prompt
    }
  },
  "12": {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 1],
      text: options.negative
    }
  },
  "13": {
    class_type: "EmptyLatentImage",
    inputs: {
      width: options.width,
      height: options.height,
      batch_size: 1
    }
  },
  "14": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      seed: options.seed,
      steps: options.steps,
      cfg: options.guidance,
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      positive: positiveInput,
      negative: negativeInput,
      latent_image: ["13", 0],
      denoise: options.denoise
    }
  },
  "15": { class_type: "VAEDecode", inputs: { samples: ["14", 0], vae: ["1", 2] } },
  "16": { class_type: "SaveImage", inputs: { images: ["15", 0], filename_prefix: options.prefix } }
  };

  if (String(options.mode).toLowerCase() === "inpaint") {
    const maskOutput = buildMaskNodes(graph, options);
    graph["13"] = {
      class_type: "VAEEncodeForInpaint",
      inputs: {
        pixels: ["17", 0],
        vae: ["1", 2],
        mask: maskOutput,
        grow_mask_by: 12
      }
    };
  }

  if (controlnet) {
    const controlModel = controlnet === "openpose"
      ? "controlnet-openpose-sdxl-1.0.safetensors"
      : "controlnet-depth-sdxl-1.0.safetensors";
    graph["20"] = {
      class_type: "ControlNetLoader",
      inputs: {
        control_net_name: controlModel
      }
    };
    graph["21"] = controlnet === "openpose"
      ? {
        class_type: "OpenposePreprocessor",
        inputs: {
          image: ["17", 0],
          detect_hand: "disable",
          detect_body: "enable",
          detect_face: "enable",
          resolution: 512,
          scale_stick_for_xinsr_cn: "disable"
        }
      }
      : {
        class_type: "MiDaS-DepthMapPreprocessor",
        inputs: {
          image: ["17", 0],
          a: 6.283185307179586,
          bg_threshold: 0.1,
          resolution: 512
        }
      };
    graph["22"] = {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["11", 0],
        negative: ["12", 0],
        control_net: ["20", 0],
        image: ["21", 0],
        strength: options.controlStrength,
        start_percent: 0,
        end_percent: 0.85,
        vae: ["1", 2]
      }
    };
  }

  return graph;
};

const uploadImage = async (apiBaseUrl, filePath) => {
  const formData = new FormData();
  const blob = new Blob([fs.readFileSync(filePath)], { type: "image/png" });
  formData.append("image", blob, path.basename(filePath));
  formData.append("overwrite", "true");

  const response = await fetch(`${apiBaseUrl}/upload/image`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
  const data = await response.json();
  return data.name;
};

const waitForCompletion = async (apiBaseUrl, promptId, timeoutMs = 15 * 60 * 1000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(1500);
    const historyResponse = await fetch(`${apiBaseUrl}/history/${promptId}`);
    if (!historyResponse.ok) continue;
    const history = await historyResponse.json();
    const item = history?.[promptId];
    if (!item) continue;
    if (item.status?.status_str === "error") {
      throw new Error(JSON.stringify(item.status?.messages || "ComfyUI error"));
    }
    if (item.outputs && Object.keys(item.outputs).length > 0) return item;
  }
  throw new Error("Timeout ComfyUI");
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
  throw new Error("No PNG found");
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input) throw new Error("--input is required");
  if (!options.prompt.split(/\s+/).includes("photomaker")) {
    throw new Error("The PhotoMaker prompt must include the token 'photomaker'.");
  }

  const remoteName = await uploadImage(options.api, options.input);
  options.input = remoteName;
  if (options.identityInput) {
    options.identityInput = await uploadImage(options.api, options.identityInput);
  }

  const prompt = buildGraph(options);
  const queueResponse = await fetch(`${options.api}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "morphostyle-photomaker", prompt })
  });

  if (!queueResponse.ok) throw new Error(`Queue failed: ${await queueResponse.text()}`);
  const { prompt_id: promptId } = await queueResponse.json();
  console.log(`Queued PhotoMaker hairstyle: ${promptId}`);

  const historyItem = await waitForCompletion(options.api, promptId);
  const relativePath = findRenderedPng(historyItem);
  const sourcePath = path.resolve(options.comfyOutputDir, relativePath);
  const destinationPath = path.resolve(options.output || `${options.prefix}.png`);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  console.log(`PhotoMaker hairstyle image saved to: ${destinationPath}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
