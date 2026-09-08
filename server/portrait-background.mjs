import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const PORTRAIT_MODEL = Object.freeze({
  path: fileURLToPath(new URL("./models/modnet-fp32.onnx", import.meta.url)),
  revision: "fa2fa546052fba4c08921230a26cc69a333fca12",
  size: 25888640,
  sha256: "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9"
});

const GRAY = 212; // #D4D4D4
const MAX_PIXELS = 16000000;
let runtimePromise;
let runtimeStatus = "pending";
let inferenceQueue = Promise.resolve();
const warnings = new Set();

const keepOriginal = () => process.env.PORTRAIT_BACKGROUND_MODE?.trim().toLowerCase() === "original";
const warnOnce = (code) => {
  if (warnings.has(code)) return;
  warnings.add(code);
  // Ne pas journaliser de photo, chemin personnel, contenu ou erreur du décodeur.
  console.warn(`[portrait-background] ${code}: fond d'origine conserve, sans nouvelle generation.`);
};

const getRuntime = () => {
  runtimePromise ??= (async () => {
    const model = await readFile(PORTRAIT_MODEL.path);
    if (model.length !== PORTRAIT_MODEL.size || createHash("sha256").update(model).digest("hex") !== PORTRAIT_MODEL.sha256) {
      throw new Error("Modele local invalide");
    }
    const [{ default: sharp }, ort] = await Promise.all([import("sharp"), import("onnxruntime-node")]);
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ["cpu"],
      executionMode: "sequential",
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
      graphOptimizationLevel: "all"
    });
    if (!session.inputNames.includes("input") || !session.outputNames.includes("output")) {
      await session.release();
      throw new Error("Interface du modele invalide");
    }
    // Sonde synthetique unique : valide aussi l'execution CPU dans l'hebergement cible.
    // Aucune photo, aucun appel image; la route health ne relance pas ce calcul.
    const probe = new ort.Tensor("float32", new Float32Array(3 * 64 * 64), [1, 3, 64, 64]);
    let probeOutputs;
    try {
      probeOutputs = await session.run({ input: probe });
      if (probeOutputs.output?.data.length !== 64 * 64 || !probeOutputs.output.data.every(Number.isFinite)) {
        throw new Error("Sonde CPU invalide");
      }
    } catch (error) {
      await session.release();
      throw error;
    } finally {
      probe.dispose();
      if (probeOutputs) for (const output of Object.values(probeOutputs)) output.dispose();
    }
    runtimeStatus = "ready";
    return { sharp, ort, session };
  })().catch(() => {
    runtimeStatus = "unavailable";
    warnOnce("outil_indisponible");
    return null;
  });
  return runtimePromise;
};

/** Préflight local uniquement : aucun téléchargement et aucun appel génératif. */
export const preparePortraitBackground = async () => {
  if (keepOriginal()) return { enabled: false, ready: false };
  return { enabled: true, ready: Boolean(await getRuntime()) };
};

export const getPortraitBackgroundStatus = () => ({
  mode: keepOriginal() ? "original" : "gray",
  status: keepOriginal() ? "disabled" : runtimeStatus
});

/** Composition RGB avec un masque alpha 8 bits, sans interpolation des pixels source. */
export const compositeWithMatte = ({ rgb, matte, width, height }) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new TypeError("Dimensions invalides");
  }
  const pixels = width * height;
  if (!(rgb instanceof Uint8Array) || rgb.length !== pixels * 3 || !(matte instanceof Uint8Array) || matte.length !== pixels) {
    throw new TypeError("Pixels ou masque invalides");
  }
  const result = Buffer.allocUnsafe(rgb.length);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alpha = matte[pixel];
    const offset = pixel * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      // alpha=255 recopie exactement le canal source ; alpha=0 donne exactement 212.
      result[offset + channel] = Math.round((rgb[offset + channel] * alpha + GRAY * (255 - alpha)) / 255);
    }
  }
  return result;
};

const neutralizeOne = async (buffer, { sharp, ort, session }) => {
  const { data: rgb, info } = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (info.channels !== 3 || width < 32 || height < 32) throw new Error("Portrait invalide");

  // Préprocesseur Xenova : petit côté 512, multiples de 32, interpolation linéaire.
  // La limite 1024 borne le coût des rapports de dimensions inhabituels.
  const scale = Math.min(512 / Math.min(width, height), 1024 / Math.max(width, height));
  const inputW = Math.max(32, Math.floor(width * scale / 32) * 32);
  const inputH = Math.max(32, Math.floor(height * scale / 32) * 32);
  const resized = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .resize(inputW, inputH, { fit: "fill", kernel: "linear" })
    .raw()
    .toBuffer();
  const inputPixels = inputW * inputH;
  const values = new Float32Array(inputPixels * 3);
  for (let pixel = 0; pixel < inputPixels; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      values[channel * inputPixels + pixel] = resized[pixel * 3 + channel] / 127.5 - 1;
    }
  }

  const input = new ort.Tensor("float32", values, [1, 3, inputH, inputW]);
  let outputs;
  let mask;
  try {
    outputs = await session.run({ input });
    const output = outputs.output;
    if (output?.dims.length !== 4 || output.dims[0] !== 1 || output.dims[1] !== 1 || output.dims[2] !== inputH || output.dims[3] !== inputW || output.data.length !== inputPixels) {
      throw new Error("Masque de dimensions invalides");
    }
    mask = Buffer.allocUnsafe(inputPixels);
    let foreground = 0;
    let background = 0;
    for (let pixel = 0; pixel < inputPixels; pixel += 1) {
      const alpha = output.data[pixel];
      if (!Number.isFinite(alpha)) throw new Error("Masque non fini");
      const bounded = Math.max(0, Math.min(1, alpha));
      if (bounded >= 0.95) foreground += 1;
      if (bounded <= 0.05) background += 1;
      // Petites valeurs extrêmes fixées pour garder l'intérieur opaque et le fond net.
      mask[pixel] = bounded >= 0.995 ? 255 : bounded <= 0.005 ? 0 : Math.round(bounded * 255);
    }
    if (foreground / inputPixels < 0.01 || background / inputPixels < 0.01) {
      throw new Error("Masque degenere");
    }
  } finally {
    input.dispose();
    if (outputs) for (const output of Object.values(outputs)) output.dispose();
  }

  const matte = await sharp(mask, { raw: { width: inputW, height: inputH, channels: 1 } })
    .resize(width, height, { fit: "fill", kernel: "linear" })
    .greyscale()
    .raw()
    .toBuffer();
  const composed = compositeWithMatte({ rgb, matte, width, height });
  // PNG en mémoire : la compression JPEG finale appartient au pipeline des assets.
  return sharp(composed, { raw: { width, height, channels: 3 } }).png().toBuffer();
};

/** Lot atomique : si une vue échoue, toutes les vues gardent leur fond d'origine. */
export const neutralizePortraits = async (buffers) => {
  const original = { buffers, backgroundTreatment: "original" };
  if (keepOriginal()) return original;
  if (!Array.isArray(buffers) || buffers.length < 1 || buffers.length > 4 || buffers.some((buffer) => !Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 32 * 1024 * 1024)) {
    warnOnce("entree_invalide");
    return original;
  }
  // Le verrou couvre le lot entier et reste valide après toute erreur.
  const operation = inferenceQueue.then(async () => {
    const runtime = await getRuntime();
    if (!runtime) return original;
    try {
      const processed = [];
      for (const buffer of buffers) processed.push(await neutralizeOne(buffer, runtime));
      return { buffers: processed, backgroundTreatment: "gray" };
    } catch {
      warnOnce("detourage_non_applique");
      return original;
    }
  });
  inferenceQueue = operation.then(() => undefined, () => undefined);
  return operation;
};
