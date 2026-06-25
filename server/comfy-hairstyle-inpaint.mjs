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
const DEFAULT_MODEL = process.env.COMFY_SDXL_MODEL || "realvisxl.safetensors";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    api: DEFAULT_COMFY_API,
    comfyOutputDir: DEFAULT_COMFY_OUTPUT_DIR,
    input: "",
    maskInput: "",
    output: "",
    model: DEFAULT_MODEL,
    lora: "",
    prompt: "realistic salon hairstyle edit, same person, replace only the haircut",
    negative: "changed identity, different face, deformed face, hat, cap, wig, sticker, overlay, text, watermark",
    width: 640,
    height: 800,
    steps: 20,
    guidance: 7,
    denoise: 0.9,
    seed: Math.floor(Math.random() * 2 ** 31),
    maskProfile: "balanced",
    clipsegText: "hair on the head",
    clipsegThreshold: 0.38,
    clipsegExpand: 18,
    clipsegBlur: 8,
    clipsegUseCuda: process.env.COMFY_CLIPSEG_USE_CUDA !== "false",
    prefix: `morphostyle-inpaint-${stamp}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--api") options.api = value;
    if (key === "--input") options.input = value;
    if (key === "--mask-input") options.maskInput = value;
    if (key === "--output") options.output = value;
    if (key === "--model") options.model = value;
    if (key === "--lora") options.lora = value;
    if (key === "--prompt") options.prompt = value;
    if (key === "--negative") options.negative = value;
    if (key === "--width") options.width = Number(value) || options.width;
    if (key === "--height") options.height = Number(value) || options.height;
    if (key === "--steps") options.steps = Number(value) || options.steps;
    if (key === "--guidance") options.guidance = Number(value) || options.guidance;
    if (key === "--denoise") options.denoise = Number(value) || options.denoise;
    if (key === "--seed") options.seed = Number(value) || options.seed;
    if (key === "--mask-profile") options.maskProfile = value || options.maskProfile;
    if (key === "--clipseg-text") options.clipsegText = value || options.clipsegText;
    if (key === "--clipseg-threshold") options.clipsegThreshold = Number(value) || options.clipsegThreshold;
    if (key === "--clipseg-expand") options.clipsegExpand = Number(value) || options.clipsegExpand;
    if (key === "--clipseg-blur") options.clipsegBlur = Number(value) || options.clipsegBlur;
    if (key === "--clipseg-use-cuda") options.clipsegUseCuda = value !== "false";
    if (key === "--prefix") options.prefix = value;
    index += 1;
  }

  return options;
};

const maskGeometryFor = (profile, width, height) => {
  const cx = Math.round(width * 0.5);
  const top = {
    x: cx,
    y: Math.round(height * 0.245),
    width: Math.round(width * 0.78),
    height: Math.round(height * 0.33)
  };
  const crown = {
    x: cx,
    y: Math.round(height * 0.18),
    width: Math.round(width * 0.58),
    height: Math.round(height * 0.2)
  };
  const leftSide = {
    x: Math.round(width * 0.2),
    y: Math.round(height * 0.35),
    width: Math.round(width * 0.15),
    height: Math.round(height * 0.3)
  };
  const rightSide = {
    x: Math.round(width * 0.8),
    y: Math.round(height * 0.35),
    width: Math.round(width * 0.15),
    height: Math.round(height * 0.3)
  };
  const faceCut = {
    x: cx,
    y: Math.round(height * 0.43),
    width: Math.round(width * 0.5),
    height: Math.round(height * 0.58)
  };

  const normalized = String(profile || "balanced").toLowerCase();
  if (normalized.includes("preview-short")) {
    return {
      top: { ...top, y: Math.round(height * 0.22), height: Math.round(height * 0.27) },
      crown,
      leftSide: null,
      rightSide: null,
      faceCut: { ...faceCut, y: Math.round(height * 0.4), height: Math.round(height * 0.48) }
    };
  }
  if (normalized.includes("preview-top")) {
    return {
      top: { ...top, y: Math.round(height * 0.24), height: Math.round(height * 0.32) },
      crown,
      leftSide: null,
      rightSide: null,
      faceCut: { ...faceCut, y: Math.round(height * 0.45), height: Math.round(height * 0.46) }
    };
  }
  if (normalized.includes("preview-medium")) {
    return {
      top: { ...top, y: Math.round(height * 0.25), height: Math.round(height * 0.34) },
      crown,
      leftSide: {
        ...leftSide,
        x: Math.round(width * 0.25),
        y: Math.round(height * 0.3),
        width: Math.round(width * 0.1),
        height: Math.round(height * 0.2)
      },
      rightSide: {
        ...rightSide,
        x: Math.round(width * 0.75),
        y: Math.round(height * 0.3),
        width: Math.round(width * 0.1),
        height: Math.round(height * 0.2)
      },
      faceCut: { ...faceCut, y: Math.round(height * 0.47), height: Math.round(height * 0.46) }
    };
  }
  if (normalized.includes("preview-side")) {
    return {
      top: { ...top, y: Math.round(height * 0.25), height: Math.round(height * 0.34) },
      crown,
      leftSide: {
        ...leftSide,
        x: Math.round(width * 0.24),
        y: Math.round(height * 0.3),
        width: Math.round(width * 0.09),
        height: Math.round(height * 0.14)
      },
      rightSide: {
        ...rightSide,
        x: Math.round(width * 0.76),
        y: Math.round(height * 0.3),
        width: Math.round(width * 0.09),
        height: Math.round(height * 0.14)
      },
      faceCut: { ...faceCut, y: Math.round(height * 0.47), height: Math.round(height * 0.46) }
    };
  }
  if (normalized.includes("long") || normalized.includes("curtain") || normalized.includes("wave")) {
    return { top, crown, leftSide, rightSide, faceCut };
  }
  if (normalized.includes("side")) {
    return {
      top,
      crown,
      leftSide: { ...leftSide, width: Math.round(width * 0.18), height: Math.round(height * 0.3) },
    rightSide,
      faceCut
    };
  }
  if (normalized.includes("short") || normalized.includes("taper") || normalized.includes("crop")) {
    return {
      top: { ...top, y: Math.round(height * 0.22), height: Math.round(height * 0.27) },
      crown,
      leftSide: {
        ...leftSide,
        x: Math.round(width * 0.23),
        y: Math.round(height * 0.31),
        width: Math.round(width * 0.12),
        height: Math.round(height * 0.22)
      },
      rightSide: {
        ...rightSide,
        x: Math.round(width * 0.77),
        y: Math.round(height * 0.31),
        width: Math.round(width * 0.12),
        height: Math.round(height * 0.22)
      },
      faceCut: { ...faceCut, y: Math.round(height * 0.4), height: Math.round(height * 0.48) }
    };
  }
  return {
    top,
    crown,
    leftSide: { ...leftSide, height: Math.round(height * 0.28) },
    rightSide: { ...rightSide, height: Math.round(height * 0.28) },
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
    inputs: { destination: sourceMask, source: [faceNode, 0], x: 0, y: 0, operation: "subtract" }
  };
  graph[leftEarNode] = shapeMaskNode("circle", leftEarCut, options);
  graph[leftSubtractNode] = {
    class_type: "MaskComposite",
    inputs: { destination: [faceSubtractNode, 0], source: [leftEarNode, 0], x: 0, y: 0, operation: "subtract" }
  };
  graph[rightEarNode] = shapeMaskNode("circle", rightEarCut, options);
  graph[rightSubtractNode] = {
    class_type: "MaskComposite",
    inputs: { destination: [leftSubtractNode, 0], source: [rightEarNode, 0], x: 0, y: 0, operation: "subtract" }
  };

  return [rightSubtractNode, 0];
};

const buildClipSegHairMaskNodes = (graph, options) => {
  graph["40"] = {
    class_type: "DownloadAndLoadCLIPSeg",
    inputs: { model: process.env.COMFY_CLIPSEG_MODEL || "CIDAS/clipseg-rd64-refined" }
  };
  graph["41"] = {
    class_type: "BatchCLIPSeg",
    inputs: {
      images: ["11", 0],
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
  if (options.maskInput) {
    graph["29"] = {
      class_type: "LoadImage",
      inputs: { image: options.maskInput }
    };
    graph["30"] = {
      class_type: "ImageToMask",
      inputs: {
        image: ["29", 0],
        channel: "red"
      }
    };
    graph["31"] = {
      class_type: "GrowMaskWithBlur",
      inputs: {
        mask: ["30", 0],
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
    return ["31", 0];
  }

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

const loadSharp = () => {
  try {
    return require(CENTRAL_SHARP_MODULE);
  } catch {
    return null;
  }
};

const hairCompositeMaskSvg = (options) => {
  const geometry = maskGeometryFor(options.maskProfile, options.width, options.height);
  const whiteShapes = [
    `<ellipse cx="${geometry.top.x}" cy="${geometry.top.y}" rx="${Math.round(geometry.top.width / 2)}" ry="${Math.round(geometry.top.height / 2)}" fill="white" />`,
    `<ellipse cx="${geometry.crown.x}" cy="${geometry.crown.y}" rx="${Math.round(geometry.crown.width / 2)}" ry="${Math.round(geometry.crown.height / 2)}" fill="white" />`,
    geometry.leftSide ? `<rect x="${Math.round(geometry.leftSide.x - geometry.leftSide.width / 2)}" y="${Math.round(geometry.leftSide.y - geometry.leftSide.height / 2)}" width="${geometry.leftSide.width}" height="${geometry.leftSide.height}" rx="${Math.round(geometry.leftSide.width * 0.35)}" fill="white" />` : "",
    geometry.rightSide ? `<rect x="${Math.round(geometry.rightSide.x - geometry.rightSide.width / 2)}" y="${Math.round(geometry.rightSide.y - geometry.rightSide.height / 2)}" width="${geometry.rightSide.width}" height="${geometry.rightSide.height}" rx="${Math.round(geometry.rightSide.width * 0.35)}" fill="white" />` : ""
  ].filter(Boolean).join("");
  const faceCut = `<ellipse cx="${geometry.faceCut.x}" cy="${geometry.faceCut.y}" rx="${Math.round(geometry.faceCut.width / 2)}" ry="${Math.round(geometry.faceCut.height / 2)}" fill="black" />`;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">
      <rect width="100%" height="100%" fill="black" />
      ${whiteShapes}
      ${faceCut}
    </svg>`;
};

const preserveOriginalOutsideHair = async ({ originalPath, generatedPath, outputPath, options }) => {
  const sharp = loadSharp();
  if (!sharp || !originalPath) return false;

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
  const mask = await sharp(Buffer.from(hairCompositeMaskSvg(options)))
    .blur(7)
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
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: options.model } },
    "10": { class_type: "LoadImage", inputs: { image: options.input } },
    "11": {
      class_type: "ImageScale",
      inputs: {
        image: ["10", 0],
        upscale_method: "lanczos",
        width: options.width,
        height: options.height,
        crop: "center"
      }
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["1", 1],
        text: options.prompt
      }
    },
    "13": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["1", 1],
        text: options.negative
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
        negative: ["13", 0],
        latent_image: ["12", 0],
        denoise: options.denoise
      }
    },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: options.prefix } }
  };

  const maskOutput = buildMaskNodes(graph, options);
  graph["12"] = {
    class_type: "VAEEncodeForInpaint",
    inputs: {
      pixels: ["11", 0],
      vae: ["1", 2],
      mask: maskOutput,
      grow_mask_by: 12
    }
  };

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

  const originalInputPath = options.input;
  const remoteName = await uploadImage(options.api, options.input);
  options.input = remoteName;
  if (options.maskInput) {
    options.maskInput = await uploadImage(options.api, options.maskInput);
  }

  const prompt = buildGraph(options);
  const queueResponse = await fetch(`${options.api}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "morphostyle-hairstyle-inpaint", prompt })
  });

  if (!queueResponse.ok) throw new Error(`Queue failed: ${await queueResponse.text()}`);
  const { prompt_id: promptId } = await queueResponse.json();
  console.log(`Queued hairstyle inpaint: ${promptId}`);

  const historyItem = await waitForCompletion(options.api, promptId);
  const relativePath = findRenderedPng(historyItem);
  const sourcePath = path.resolve(options.comfyOutputDir, relativePath);
  const destinationPath = path.resolve(options.output || `${options.prefix}.png`);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const preserved = await preserveOriginalOutsideHair({
    originalPath: originalInputPath,
    generatedPath: sourcePath,
    outputPath: destinationPath,
    options
  });
  if (!preserved) await copyFile(sourcePath, destinationPath);
  console.log(`Hairstyle image saved to: ${destinationPath}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
