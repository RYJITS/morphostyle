import { copyFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CENTRAL_SHARP_MODULE = "D:/00_Cerveau_IA/Conpetances/node_modules/sharp";

const DEFAULT_COMFY_API = process.env.COMFY_API_URL || "http://127.0.0.1:8188";
const DEFAULT_COMFY_OUTPUT_DIR =
  process.env.COMFY_OUTPUT_DIR ||
  "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/ComfyUI/output";
const DEFAULT_MODEL = process.env.COMFY_INSTANTID_SDXL_MODEL || process.env.COMFY_SDXL_MODEL || "realvisxl.safetensors";
const DEFAULT_INSTANTID_MODEL = process.env.COMFY_INSTANTID_MODEL || "ip-adapter.bin";
const DEFAULT_CONTROLNET = process.env.COMFY_INSTANTID_CONTROLNET || "instantid-controlnet.safetensors";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    api: DEFAULT_COMFY_API,
    comfyOutputDir: DEFAULT_COMFY_OUTPUT_DIR,
    input: "",
    output: "",
    model: DEFAULT_MODEL,
    instantidModel: DEFAULT_INSTANTID_MODEL,
    controlnet: DEFAULT_CONTROLNET,
    provider: process.env.COMFY_INSTANTID_PROVIDER || "CPU",
    prompt: [
      "realistic studio portrait of the same man",
      "same identity and facial structure",
      "grey t-shirt",
      "short textured taper haircut",
      "low volume natural brown hair",
      "neutral grey background"
    ].join(", "),
    negative: [
      "different person",
      "changed identity",
      "deformed face",
      "long hair",
      "medium hair",
      "tall quiff",
      "high pompadour",
      "beard",
      "suit",
      "tie",
      "hat",
      "text",
      "watermark"
    ].join(", "),
    width: 640,
    height: 800,
    steps: 28,
    guidance: 4.8,
    denoise: 1,
    seed: 5555,
    ipWeight: 0.9,
    controlStrength: 0.75,
    noise: 0.35,
    mode: "text",
    maskProfile: "short",
    clipsegText: "hair on the head",
    clipsegThreshold: 0.38,
    clipsegExpand: 18,
    clipsegBlur: 8,
    clipsegUseCuda: process.env.COMFY_CLIPSEG_USE_CUDA !== "false",
    debugMask: false,
    preserveSource: false,
    compositeProfile: "short",
    prefix: `morphostyle-instantid-${stamp}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--api") options.api = value;
    if (key === "--input") options.input = value;
    if (key === "--output") options.output = value;
    if (key === "--model") options.model = value;
    if (key === "--instantid-model") options.instantidModel = value;
    if (key === "--controlnet") options.controlnet = value;
    if (key === "--provider") options.provider = value || options.provider;
    if (key === "--prompt") options.prompt = value;
    if (key === "--negative") options.negative = value;
    if (key === "--width") options.width = Number(value) || options.width;
    if (key === "--height") options.height = Number(value) || options.height;
    if (key === "--steps") options.steps = Number(value) || options.steps;
    if (key === "--guidance") options.guidance = Number(value) || options.guidance;
    if (key === "--denoise") options.denoise = Number(value) || options.denoise;
    if (key === "--seed") options.seed = Number(value) || options.seed;
    if (key === "--ip-weight") options.ipWeight = Number(value) || options.ipWeight;
    if (key === "--control-strength") options.controlStrength = Number(value) || options.controlStrength;
    if (key === "--noise") options.noise = Number(value) || options.noise;
    if (key === "--mode") options.mode = value || options.mode;
    if (key === "--mask-profile") options.maskProfile = value || options.maskProfile;
    if (key === "--clipseg-text") options.clipsegText = value || options.clipsegText;
    if (key === "--clipseg-threshold") options.clipsegThreshold = Number(value) || options.clipsegThreshold;
    if (key === "--clipseg-expand") options.clipsegExpand = Number(value) || options.clipsegExpand;
    if (key === "--clipseg-blur") options.clipsegBlur = Number(value) || options.clipsegBlur;
    if (key === "--clipseg-use-cuda") options.clipsegUseCuda = value !== "false";
    if (key === "--debug-mask") options.debugMask = value !== "false";
    if (key === "--preserve-source") options.preserveSource = value !== "false";
    if (key === "--composite-profile") options.compositeProfile = value || options.compositeProfile;
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
    y: Math.round(height * 0.23),
    width: Math.round(width * 0.76),
    height: Math.round(height * 0.31)
  };
  const crown = {
    x: cx,
    y: Math.round(height * 0.17),
    width: Math.round(width * 0.58),
    height: Math.round(height * 0.2)
  };
  const faceCut = {
    x: cx,
    y: Math.round(height * 0.43),
    width: Math.round(width * 0.48),
    height: Math.round(height * 0.56)
  };
  if (normalized.includes("top")) {
    return { top, crown, leftSide: null, rightSide: null, faceCut };
  }
  return {
    top,
    crown,
    leftSide: {
      x: Math.round(width * 0.23),
      y: Math.round(height * 0.32),
      width: Math.round(width * 0.13),
      height: Math.round(height * 0.22)
    },
    rightSide: {
      x: Math.round(width * 0.77),
      y: Math.round(height * 0.32),
      width: Math.round(width * 0.13),
      height: Math.round(height * 0.22)
    },
    faceCut
  };
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

const protectFaceNodes = (graph, sourceMask, options, startNode = 42) => {
  const width = options.width;
  const height = options.height;
  const cx = Math.round(width * 0.5);
  const faceCut = {
    x: cx,
    y: Math.round(height * 0.49),
    width: Math.round(width * 0.52),
    height: Math.round(height * 0.48)
  };
  const leftEarCut = {
    x: Math.round(width * 0.31),
    y: Math.round(height * 0.39),
    width: Math.round(width * 0.15),
    height: Math.round(height * 0.22)
  };
  const rightEarCut = {
    x: Math.round(width * 0.69),
    y: Math.round(height * 0.39),
    width: Math.round(width * 0.15),
    height: Math.round(height * 0.22)
  };

  const faceNode = String(startNode);
  const faceSubtractNode = String(startNode + 1);
  const leftEarNode = String(startNode + 2);
  const leftSubtractNode = String(startNode + 3);
  const rightEarNode = String(startNode + 4);
  const rightSubtractNode = String(startNode + 5);

  graph[faceNode] = shapeMaskNode("circle", faceCut, options);
  graph[faceSubtractNode] = {
    class_type: "MaskComposite",
    inputs: {
      destination: sourceMask,
      source: [faceNode, 0],
      x: 0,
      y: 0,
      operation: "subtract"
    }
  };
  graph[leftEarNode] = shapeMaskNode("circle", leftEarCut, options);
  graph[leftSubtractNode] = {
    class_type: "MaskComposite",
    inputs: {
      destination: [faceSubtractNode, 0],
      source: [leftEarNode, 0],
      x: 0,
      y: 0,
      operation: "subtract"
    }
  };
  graph[rightEarNode] = shapeMaskNode("circle", rightEarCut, options);
  graph[rightSubtractNode] = {
    class_type: "MaskComposite",
    inputs: {
      destination: [leftSubtractNode, 0],
      source: [rightEarNode, 0],
      x: 0,
      y: 0,
      operation: "subtract"
    }
  };

  return [rightSubtractNode, 0];
};

const buildClipSegHairMaskNodes = (graph, options) => {
  graph["40"] = {
    class_type: "DownloadAndLoadCLIPSeg",
    inputs: {
      model: process.env.COMFY_CLIPSEG_MODEL || "CIDAS/clipseg-rd64-refined"
    }
  };
  graph["41"] = {
    class_type: "BatchCLIPSeg",
    inputs: {
      images: ["13", 0],
      text: options.clipsegText,
      threshold: options.clipsegThreshold,
      binary_mask: true,
      combine_mask: false,
      use_cuda: options.clipsegUseCuda,
      blur_sigma: 1.5,
      opt_model: ["40", 0],
      image_bg_level: 0.5,
      invert: false
    }
  };
  graph["42"] = {
    class_type: "GrowMaskWithBlur",
    inputs: {
      mask: ["41", 0],
      expand: options.clipsegExpand,
      incremental_expandrate: 0,
      tapered_corners: true,
      flip_input: false,
      blur_radius: options.clipsegBlur,
      lerp_alpha: 1,
      decay_factor: 1,
      fill_holes: true
    }
  };

  if (String(options.maskProfile).toLowerCase().includes("safe")) {
    return protectFaceNodes(graph, ["42", 0], options, 43);
  }
  return ["42", 0];
};

const buildMaskNodes = (graph, options) => {
  if (String(options.maskProfile).toLowerCase().includes("clipseg")) {
    return buildClipSegHairMaskNodes(graph, options);
  }

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
      expand: 12,
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

const loadSharp = () => {
  try {
    return require(CENTRAL_SHARP_MODULE);
  } catch {
    return null;
  }
};

const compositeMaskSvg = (options) => {
  const width = options.width;
  const height = options.height;
  const cx = Math.round(width * 0.5);
  const normalized = String(options.compositeProfile || "short").toLowerCase();
  const lower = normalized.includes("low") ? 0.355 : normalized.includes("high") ? 0.305 : 0.335;
  const sideHeight = normalized.includes("tight") ? 0.18 : 0.25;
  const faceCutY = normalized.includes("low") ? 0.45 : 0.425;
  const faceCutH = normalized.includes("tight") ? 0.52 : 0.56;

  const backgroundBand = normalized.includes("oval")
    ? ""
    : `<rect x="0" y="0" width="${width}" height="${Math.round(height * lower)}" fill="white" />`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="black" />
      ${backgroundBand}
      <ellipse cx="${cx}" cy="${Math.round(height * 0.245)}" rx="${Math.round(width * (normalized.includes("oval") ? 0.34 : 0.39))}" ry="${Math.round(height * 0.19)}" fill="white" />
      <ellipse cx="${cx}" cy="${Math.round(height * 0.17)}" rx="${Math.round(width * (normalized.includes("oval") ? 0.29 : 0.31))}" ry="${Math.round(height * 0.12)}" fill="white" />
      <rect x="${Math.round(width * 0.17)}" y="${Math.round(height * 0.24)}" width="${Math.round(width * 0.16)}" height="${Math.round(height * sideHeight)}" rx="${Math.round(width * 0.05)}" fill="white" />
      <rect x="${Math.round(width * 0.67)}" y="${Math.round(height * 0.24)}" width="${Math.round(width * 0.16)}" height="${Math.round(height * sideHeight)}" rx="${Math.round(width * 0.05)}" fill="white" />
      <ellipse cx="${cx}" cy="${Math.round(height * faceCutY)}" rx="${Math.round(width * 0.255)}" ry="${Math.round(height * faceCutH / 2)}" fill="black" />
    </svg>`;
};

const preserveSourceFaceComposite = async ({ originalPath, generatedPath, outputPath, options }) => {
  const sharp = loadSharp();
  if (!sharp) return false;

  const source = await sharp(originalPath)
    .rotate()
    .resize(options.width, options.height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  const generated = await sharp(generatedPath)
    .resize(options.width, options.height, { fit: "cover", position: "center" })
    .removeAlpha()
    .png()
    .toBuffer();
  const mask = await sharp(Buffer.from(compositeMaskSvg(options)))
    .blur(10)
    .png()
    .toBuffer();
  const generatedWithAlpha = await sharp(generated)
    .joinChannel(mask)
    .png()
    .toBuffer();

  await sharp(source)
    .composite([{ input: generatedWithAlpha, blend: "over" }])
    .png()
    .toFile(outputPath);
  return true;
};

const buildGraph = (options) => {
  const sourceImageNode = String(options.mode).toLowerCase() === "inpaint" ? ["13", 0] : ["2", 0];
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: options.model } },
    "2": { class_type: "LoadImage", inputs: { image: options.input } },
    "13": {
      class_type: "ImageScale",
      inputs: {
        image: ["2", 0],
        upscale_method: "lanczos",
        width: options.width,
        height: options.height,
        crop: "center"
      }
    },
    "3": { class_type: "InstantIDModelLoader", inputs: { instantid_file: options.instantidModel } },
    "4": { class_type: "InstantIDFaceAnalysis", inputs: { provider: options.provider } },
    "5": { class_type: "ControlNetLoader", inputs: { control_net_name: options.controlnet } },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["1", 1],
        text: options.prompt
      }
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["1", 1],
        text: options.negative
      }
    },
    "8": {
      class_type: "ApplyInstantIDAdvanced",
      inputs: {
        instantid: ["3", 0],
        insightface: ["4", 0],
        control_net: ["5", 0],
        image: sourceImageNode,
        model: ["1", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        ip_weight: options.ipWeight,
        cn_strength: options.controlStrength,
        start_at: 0,
        end_at: 1,
        noise: options.noise,
        combine_embeds: "average"
      }
    },
    "9": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: options.width,
        height: options.height,
        batch_size: 1
      }
    },
    "10": {
      class_type: "KSampler",
      inputs: {
        model: ["8", 0],
        seed: options.seed,
        steps: options.steps,
        cfg: options.guidance,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        positive: ["8", 1],
        negative: ["8", 2],
        latent_image: ["9", 0],
        denoise: options.denoise
      }
    },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["1", 2] } },
    "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: options.prefix } }
  };

  if (String(options.mode).toLowerCase() === "inpaint") {
    const maskOutput = buildMaskNodes(graph, options);
    if (options.debugMask) {
      graph["70"] = {
        class_type: "MaskToImage",
        inputs: {
          mask: maskOutput
        }
      };
      graph["71"] = {
        class_type: "SaveImage",
        inputs: {
          images: ["70", 0],
          filename_prefix: `${options.prefix}-mask`
        }
      };
    }
    graph["9"] = {
      class_type: "VAEEncodeForInpaint",
      inputs: {
        pixels: ["13", 0],
        vae: ["1", 2],
        mask: maskOutput,
        grow_mask_by: 12
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
  const finalImages = outputs["12"]?.images;
  if (Array.isArray(finalImages)) {
    for (const image of finalImages) {
      if (String(image?.filename).toLowerCase().endsWith(".png")) {
        return path.join(image.subfolder || "", image.filename);
      }
    }
  }

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

  const originalInputPath = options.input;
  const remoteName = await uploadImage(options.api, options.input);
  options.input = remoteName;

  const prompt = buildGraph(options);
  const queueResponse = await fetch(`${options.api}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "morphostyle-instantid", prompt })
  });

  if (!queueResponse.ok) throw new Error(`Queue failed: ${await queueResponse.text()}`);
  const { prompt_id: promptId } = await queueResponse.json();
  console.log(`Queued InstantID hairstyle: ${promptId}`);

  const historyItem = await waitForCompletion(options.api, promptId);
  const relativePath = findRenderedPng(historyItem);
  const sourcePath = path.resolve(options.comfyOutputDir, relativePath);
  const destinationPath = path.resolve(options.output || `${options.prefix}.png`);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const composited = options.preserveSource
    ? await preserveSourceFaceComposite({
      originalPath: originalInputPath,
      generatedPath: sourcePath,
      outputPath: destinationPath,
      options
    }).catch(() => false)
    : false;
  if (!composited) await copyFile(sourcePath, destinationPath);
  console.log(`InstantID hairstyle image saved to: ${destinationPath}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
