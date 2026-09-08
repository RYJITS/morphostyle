import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const demoRoot = join(projectRoot, "public", "demo-profiles");
const activeProfiles = ["sofia", "lya", "elena", "marc"];
const lengths = ["short", "medium", "long", "any"];
const maintenances = ["low", "medium", "high"];
const lifestyles = ["classic", "modern", "bold"];
const variants = ["primary", "soft", "structured", "signature"];
const views = ["front", "left", "right", "back"];
const maxAssetBudgetMb = Number(process.env.DEMO_PROFILE_ASSET_BUDGET_MB || 650);
const maxAssetBudgetBytes = maxAssetBudgetMb * 1024 * 1024;

const disallowedRuntimePatterns = [
  {
    test: (path) => /\/recommendation-previews\/.+\.png$/i.test(path),
    label: "PNG recommendation-previews"
  },
  {
    test: (path) => /\/final-views\/.+\.png$/i.test(path),
    label: "PNG final-views"
  },
  {
    test: (path) => /\/final-selections\//i.test(path),
    label: "final-selections"
  },
  {
    test: (path) => /\/final-boards\//i.test(path),
    label: "final-boards"
  },
  {
    test: (path) => /\/recommendation-boards\//i.test(path),
    label: "recommendation-boards"
  }
];

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const walkFiles = async (dir) => {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    if (!entry.isFile()) return [];
    const info = await stat(fullPath);
    return [{ fullPath, bytes: info.size }];
  }));
  return files.flat();
};

const requiredRuntimeFiles = () => {
  const required = [];

  for (const profile of activeProfiles) {
    required.push(join(demoRoot, profile, "source.png"));

    for (const length of lengths) {
      for (const maintenance of maintenances) {
        for (const lifestyle of lifestyles) {
          for (const variant of variants) {
            const stem = `${length}-${maintenance}-${lifestyle}-${variant}`;
            required.push(join(demoRoot, profile, "recommendation-previews", `${stem}.webp`));

            for (const view of views) {
              required.push(join(demoRoot, profile, "final-views", `${stem}-${view}.webp`));
            }
          }
        }
      }
    }
  }

  return required;
};

const toProjectPath = (fullPath) =>
  relative(projectRoot, fullPath).replace(/\\/g, "/");

const files = await walkFiles(demoRoot);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const missingRuntime = requiredRuntimeFiles().filter((file) => !existsSync(file));
const blockedFiles = files
  .map((file) => ({ ...file, projectPath: toProjectPath(file.fullPath) }))
  .filter((file) => disallowedRuntimePatterns.some((pattern) => pattern.test(file.projectPath)));

const failures = [];

if (missingRuntime.length > 0) {
  failures.push(
    `${missingRuntime.length} asset(s) runtime manquant(s), dont:`,
    ...missingRuntime.slice(0, 20).map((file) => `- ${toProjectPath(file)}`)
  );
}

if (blockedFiles.length > 0) {
  const blockedBytes = blockedFiles.reduce((sum, file) => sum + file.bytes, 0);
  failures.push(
    `${blockedFiles.length} fichier(s) source/intermediaire(s) dans public/demo-profiles (${formatMb(blockedBytes)}), dont:`,
    ...blockedFiles.slice(0, 20).map((file) => `- ${file.projectPath}`)
  );
}

if (totalBytes > maxAssetBudgetBytes) {
  failures.push(
    `public/demo-profiles pese ${formatMb(totalBytes)}, au-dessus du budget ${maxAssetBudgetMb} MB.`
  );
}

if (failures.length > 0) {
  console.error("Controle assets demo echoue.");
  console.error(failures.join("\n"));
  console.error("Archivez les sources/intermediaires hors de public/ avant de publier.");
  process.exit(1);
}

console.log(
  `Controle assets demo OK: ${files.length} fichier(s), ${formatMb(totalBytes)}, profils actifs preserves.`
);
