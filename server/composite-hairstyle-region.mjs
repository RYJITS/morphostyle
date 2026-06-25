import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("D:/00_Cerveau_IA/Conpetances/node_modules/sharp");

const parseArgs = (argv) => {
  const options = {
    source: "",
    generated: "",
    output: "",
    width: 640,
    height: 800,
    profile: "short"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--source") options.source = value;
    if (key === "--generated") options.generated = value;
    if (key === "--output") options.output = value;
    if (key === "--width") options.width = Number(value) || options.width;
    if (key === "--height") options.height = Number(value) || options.height;
    if (key === "--profile") options.profile = value || options.profile;
    index += 1;
  }

  return options;
};

const compositeMaskSvg = (options) => {
  const width = options.width;
  const height = options.height;
  const cx = Math.round(width * 0.5);
  const normalized = String(options.profile || "short").toLowerCase();
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

const buildCompositeMask = async (generated, options) => {
  const spatialMask = await sharp(Buffer.from(compositeMaskSvg(options)))
    .blur(6)
    .png()
    .toBuffer();
  if (!String(options.profile || "").toLowerCase().includes("dark")) {
    return sharp(spatialMask).blur(4).png().toBuffer();
  }

  const darkMask = await sharp(generated)
    .greyscale()
    .negate()
    .threshold(132)
    .blur(5)
    .png()
    .toBuffer();

  return sharp(spatialMask)
    .composite([{ input: darkMask, blend: "multiply" }])
    .blur(4)
    .png()
    .toBuffer();
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source || !options.generated || !options.output) {
    throw new Error("--source, --generated and --output are required");
  }

  const source = await sharp(options.source)
    .rotate()
    .resize(options.width, options.height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  const generated = await sharp(options.generated)
    .resize(options.width, options.height, { fit: "cover", position: "center" })
    .removeAlpha()
    .png()
    .toBuffer();
  const mask = await buildCompositeMask(generated, options);
  const generatedWithAlpha = await sharp(generated)
    .joinChannel(mask)
    .png()
    .toBuffer();

  await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
  await sharp(source)
    .composite([{ input: generatedWithAlpha, blend: "over" }])
    .png()
    .toFile(options.output);
  console.log(`Composite saved to: ${path.resolve(options.output)}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
