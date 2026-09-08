import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PORTRAIT_MODEL } from "../server/portrait-background.mjs";

const model = PORTRAIT_MODEL;
const url = `https://huggingface.co/Xenova/modnet/resolve/${model.revision}/onnx/model.onnx`;

const verifyExisting = async () => {
  try {
    const existing = await stat(model.path);
    if (!existing.isFile() || existing.size !== model.size) throw new Error("Taille du modele local incorrecte");
    const hash = createHash("sha256").update(await readFile(model.path)).digest("hex");
    if (hash !== model.sha256) throw new Error("Empreinte du modele local incorrecte");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    // Un fichier déjà présent mais invalide n'est jamais écrasé automatiquement.
    throw new Error("Modele local invalide : archivage manuel requis avant preparation.", { cause: error });
  }
};

const main = async () => {
  if (process.env.PORTRAIT_BACKGROUND_MODE?.trim().toLowerCase() === "original") {
    console.log("Fond portrait : mode original, modele non requis.");
    return;
  }
  if (await verifyExisting()) {
    console.log("Modele MODNet local verifie (SHA-256 et taille).");
    return;
  }
  await mkdir(path.dirname(model.path), { recursive: true });
  const temporary = `${model.path}.${randomUUID()}.download`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Telechargement modele refuse (${response.status}).`);
    const hash = createHash("sha256");
    let size = 0;
    const validator = new Transform({
      transform(chunk, encoding, callback) {
        size += chunk.length;
        if (size > model.size) return callback(new Error("Modele telecharge trop volumineux."));
        hash.update(chunk);
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), validator, createWriteStream(temporary, { flags: "wx" }), { signal: controller.signal });
    if (size !== model.size || hash.digest("hex") !== model.sha256) throw new Error("Taille ou empreinte du telechargement incorrecte.");
    // Un autre build peut avoir préparé le modèle pendant le téléchargement.
    if (!(await verifyExisting())) await rename(temporary, model.path);
    console.log("Modele MODNet prepare et verifie : 25 888 640 octets, Apache-2.0.");
  } finally {
    clearTimeout(timer);
    // Seul le temporaire unique créé par cette exécution peut être effacé.
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
};

main().catch((error) => {
  console.error(`Preparation du detourage impossible : ${error.message}`);
  process.exitCode = 1;
});
