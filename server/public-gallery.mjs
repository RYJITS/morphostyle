import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const PUBLIC_GALLERY_PREFIX = "/public-gallery/";
const GENERATED_ALIBABA_PREFIX = "/generated-alibaba/";
const DEMO_PROFILES_PREFIX = "/demo-profiles/";
const PUBLIC_VIEW_KEYS = ["left", "right", "back"];

const clampText = (value = "", max = 120) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const publicationGenerationIdCandidates = (payload = {}) => {
  const proposal = payload.proposal || {};
  const historyItem = proposal.historyItem || {};
  return [
    payload.personalGenerationId,
    payload.generationId,
    proposal.personalGenerationId,
    historyItem.personalGenerationId,
    historyItem.id
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean);
};

export const createPublicGalleryService = ({
  openAiUsageDir,
  publicGenerationsFile,
  publicGalleryDir,
  generatedOpenAiRoutePrefix = "/generated-openai/",
  generatedAlibabaDir,
  demoProfilesDir,
  publicGenerationStoreLimit = 1000,
  publicGenerationResponseLimit = 240,
  resolveInsideDir,
  resolveGeneratedOpenAiAssetPath,
  normalizeGeneratedOpenAiAssetPath,
  stripGeneratedOpenAiAssetAccess,
  stripPrivateGeneratedAssetAccess,
  getUserMemory,
  assertGeneratedOpenAiAssetPathOwnedBy,
  contentTypeFromImagePath,
  readPersistedImageAsset,
  persistImageAsset,
  deletePersistedImageAsset = async () => false
}) => {
  const storeLimit = Math.max(80, Number(publicGenerationStoreLimit || 1000));
  const responseLimit = Math.max(12, Number(publicGenerationResponseLimit || 240));

  const collectGeneratedOpenAiAssetPaths = (value, paths = new Set()) => {
    if (typeof value === "string") {
      const assetPath = normalizeGeneratedOpenAiAssetPath(value);
      if (assetPath) paths.add(assetPath);
      return paths;
    }
    if (Array.isArray(value)) {
      value.forEach(item => collectGeneratedOpenAiAssetPaths(item, paths));
      return paths;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(item => collectGeneratedOpenAiAssetPaths(item, paths));
    }
    return paths;
  };

  const isPublishableAssetUrl = (value = "") => {
    const url = String(value || "").trim();
    if (!url || url.includes("\\") || url.includes("..")) return false;
    return [
      PUBLIC_GALLERY_PREFIX,
      generatedOpenAiRoutePrefix,
      GENERATED_ALIBABA_PREFIX,
      DEMO_PROFILES_PREFIX
    ].some(prefix => url.startsWith(prefix));
  };

  const resolvePublishableAssetPath = (assetUrl = "") => {
    const parsedUrl = new URL(String(assetUrl || ""), "http://local");
    const requestedPath = decodeURIComponent(parsedUrl.pathname);
    if (requestedPath.startsWith(generatedOpenAiRoutePrefix)) {
      return resolveGeneratedOpenAiAssetPath(requestedPath);
    }

    const pathMap = [
      [PUBLIC_GALLERY_PREFIX, publicGalleryDir],
      [GENERATED_ALIBABA_PREFIX, generatedAlibabaDir],
      [DEMO_PROFILES_PREFIX, demoProfilesDir]
    ];

    for (const [prefix, baseDir] of pathMap) {
      if (!requestedPath.startsWith(prefix)) continue;
      const relativePath = requestedPath.replace(prefix, "");
      const filePath = resolveInsideDir(baseDir, relativePath);
      if (filePath) return filePath;
    }

    return "";
  };

  const sanitizePublicViews = (views = {}) => {
    const result = {};
    for (const key of PUBLIC_VIEW_KEYS) {
      const url = String(views?.[key] || "").trim();
      if (isPublishableAssetUrl(url)) result[key] = url;
    }
    return result;
  };

  const retiredPublicGenerationSources = new Set(["sam"]);

  const isRetiredPublicGeneration = (generation = {}) => {
    const sourceLabel = String(generation.sourceLabel || "").trim().toLowerCase();
    const urls = [
      generation.imageUrl,
      generation.originalImageUrl,
      ...Object.values(generation.additionalViews || {})
    ].map(value => String(value || "").toLowerCase());

    return retiredPublicGenerationSources.has(sourceLabel) || urls.some(url => url.includes("/demo-profiles/sam/"));
  };

  const activePublicGenerations = (generations = []) =>
    generations.filter(generation => !isRetiredPublicGeneration(generation));

  const normalizePublicGenerationLimit = (value, fallback = responseLimit) => {
    const parsed = Number(value);
    const limit = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    return Math.max(1, Math.min(storeLimit, limit));
  };

  const sortPublicGenerations = (generations = []) =>
    [...generations].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const mergePublicGenerations = (...groups) => {
    const byKey = new Map();
    for (const generation of activePublicGenerations(groups.flat())) {
      if (!generation?.id && !generation?.imageUrl) continue;
      const key = generation.id || generation.imageUrl;
      byKey.set(key, {
        ...byKey.get(key),
        ...generation
      });
    }

    return sortPublicGenerations(Array.from(byKey.values()))
      .slice(0, storeLimit);
  };

  const readPublicGenerationsFile = async () => {
    try {
      const parsed = JSON.parse(await readFile(publicGenerationsFile, "utf8"));
      if (Array.isArray(parsed)) return activePublicGenerations(parsed);
      if (Array.isArray(parsed?.generations)) return activePublicGenerations(parsed.generations);
    } catch {
      // Missing or invalid public gallery: start empty.
    }
    return [];
  };

  const writePublicGenerations = async (generations) => {
    await mkdir(openAiUsageDir, { recursive: true });
    await writeFile(publicGenerationsFile, `${JSON.stringify(mergePublicGenerations(generations), null, 2)}\n`, "utf8");
  };

  const normalizePublicGalleryAssetPath = (value = "") => {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("\\") || raw.includes("..")) return "";
    try {
      const pathname = decodeURIComponent(new URL(raw, "http://local").pathname || raw);
      return pathname.startsWith(PUBLIC_GALLERY_PREFIX) ? pathname : "";
    } catch {
      const pathname = raw.split("?")[0];
      return pathname.startsWith(PUBLIC_GALLERY_PREFIX) ? pathname : "";
    }
  };

  const collectPublicGalleryAssetPaths = (value, paths = new Set()) => {
    if (typeof value === "string") {
      const assetPath = normalizePublicGalleryAssetPath(value);
      if (assetPath) paths.add(assetPath);
      return paths;
    }
    if (Array.isArray(value)) {
      value.forEach(item => collectPublicGalleryAssetPaths(item, paths));
      return paths;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(item => collectPublicGalleryAssetPaths(item, paths));
    }
    return paths;
  };

  const deletePublicGalleryAsset = async (assetPath = "") => {
    const publicAssetPath = normalizePublicGalleryAssetPath(assetPath);
    if (!publicAssetPath) return false;
    const relativePath = publicAssetPath.replace(/^\/public-gallery\//, "");
    const filePath = resolveInsideDir(publicGalleryDir, relativePath);
    if (filePath) await unlink(filePath).catch(() => null);
    await deletePersistedImageAsset(publicAssetPath).catch(() => false);
    return true;
  };

  const normalizePublicGenerationPayload = (payload = {}) => {
    const proposal = payload.proposal || {};
    const imageUrl = String(proposal.imageUrl || "").trim();
    if (!isPublishableAssetUrl(imageUrl)) {
      throw Object.assign(new Error("Cette image ne peut pas etre publiee dans la vitrine. Telechargez-la localement si besoin."), { status: 400 });
    }

    const consultation = payload.consultation || {};
    const additionalViews = sanitizePublicViews(proposal.additionalViews);

    return {
      id: `${Date.now().toString(36)}-${createHash("sha1").update(`${imageUrl}-${proposal.styleName || ""}`).digest("hex").slice(0, 10)}`,
      imageUrl,
      styleName: clampText(proposal.styleName || "Resultat visagiste", 80),
      color: clampText(proposal.color || "Naturel", 40),
      faceShape: clampText(payload.analysis?.faceShape || proposal.faceShape || "Morphologie personnalisee", 70),
      sourceLabel: clampText(payload.sourceLabel || "Photo personnelle", 50),
      createdAt: new Date().toISOString(),
      additionalViews: Object.keys(additionalViews).length ? additionalViews : undefined,
      consultation: {
        targetLength: clampText(consultation.targetLength || "", 16),
        maintenance: clampText(consultation.maintenance || "", 16),
        lifestyle: clampText(consultation.lifestyle || "", 16),
        ageGroup: clampText(consultation.ageGroup || "", 16),
        gender: clampText(consultation.gender || "", 16)
      }
    };
  };

  const copyPublicGalleryAsset = async (assetUrl, generationId, label) => {
    if (String(assetUrl || "").startsWith(PUBLIC_GALLERY_PREFIX)) return assetUrl;

    const requestedPath = decodeURIComponent(new URL(String(assetUrl || ""), "http://local").pathname);
    const sourcePath = resolvePublishableAssetPath(assetUrl);
    if (!sourcePath) return assetUrl;

    const extension = path.extname(sourcePath).toLowerCase() || ".jpg";
    let data;
    let contentType = contentTypeFromImagePath(sourcePath);
    try {
      data = await readFile(sourcePath);
    } catch {
      const persisted = await readPersistedImageAsset(requestedPath);
      if (!persisted?.buffer) throw new Error(`Image source introuvable: ${requestedPath}`);
      data = persisted.buffer;
      contentType = persisted.contentType || contentType;
    }

    const safeLabel = String(label || "image").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 30) || "image";
    const filename = `${generationId}-${safeLabel}${extension}`;
    await mkdir(publicGalleryDir, { recursive: true });
    await writeFile(path.join(publicGalleryDir, filename), data);
    const publicAssetUrl = `${PUBLIC_GALLERY_PREFIX}${filename}`;
    await persistImageAsset({ assetPath: publicAssetUrl, buffer: data, contentType });
    return publicAssetUrl;
  };

  const materializePublicGenerationAssets = async (generation) => {
    const imageUrl = await copyPublicGalleryAsset(generation.imageUrl, generation.id, "front");
    const additionalViews = {};
    for (const [view, url] of Object.entries(generation.additionalViews || {})) {
      additionalViews[view] = await copyPublicGalleryAsset(url, generation.id, view);
    }

    return {
      ...generation,
      imageUrl,
      additionalViews: Object.keys(additionalViews).length ? additionalViews : undefined
    };
  };

  const publicGalleryAssetExists = (assetUrl = "") => {
    if (!String(assetUrl || "").startsWith(PUBLIC_GALLERY_PREFIX)) return true;
    const filePath = resolvePublishableAssetPath(assetUrl);
    return Boolean(filePath && existsSync(filePath));
  };

  const restorablePublicAssetUrl = (assetUrl = "", fallbackUrl = "") => {
    const publicUrl = String(assetUrl || "").trim();
    const fallback = String(fallbackUrl || "").trim();
    if (
      publicUrl.startsWith(PUBLIC_GALLERY_PREFIX) &&
      !publicGalleryAssetExists(publicUrl) &&
      isPublishableAssetUrl(fallback)
    ) {
      return fallback;
    }
    return publicUrl || fallback;
  };

  const normalizeStoredPublicGeneration = (item = {}) => {
    const imageUrl = restorablePublicAssetUrl(item.imageUrl, item._privateSourceImageUrl);
    if (!isPublishableAssetUrl(imageUrl)) return null;
    const additionalViews = {};
    const sourceViews = item._privateSourceAdditionalViews || {};
    for (const [view, url] of Object.entries(sanitizePublicViews(item.additionalViews))) {
      const restoredUrl = restorablePublicAssetUrl(url, sourceViews[view]);
      if (isPublishableAssetUrl(restoredUrl)) additionalViews[view] = restoredUrl;
    }
    return {
      id: clampText(item.publicGenerationId || item.id || "", 120),
      imageUrl,
      styleName: clampText(item.styleName || "Resultat visagiste", 80),
      color: clampText(item.color || "Naturel", 40),
      faceShape: clampText(item.faceShape || "Morphologie personnalisee", 70),
      sourceLabel: clampText(item.sourceLabel || "Photo personnelle", 50),
      createdAt: item.createdAt || new Date().toISOString(),
      additionalViews: Object.keys(additionalViews).length ? additionalViews : undefined,
      consultation: {
        targetLength: clampText(item.consultation?.targetLength || "", 16),
        maintenance: clampText(item.consultation?.maintenance || "", 16),
        lifestyle: clampText(item.consultation?.lifestyle || "", 16),
        ageGroup: clampText(item.consultation?.ageGroup || "", 16),
        gender: clampText(item.consultation?.gender || "", 16)
      }
    };
  };

  const readPublicGenerationsFromMemory = async () => {
    const store = getUserMemory();
    if (typeof store.listPublishedGenerations !== "function") return [];

    let stored = [];
    try {
      stored = await store.listPublishedGenerations({ limit: storeLimit });
    } catch (error) {
      console.error("Lecture vitrine publique depuis MySQL impossible:", error?.message || error);
      return [];
    }

    const materialized = [];
    for (const item of stored) {
      const normalized = normalizeStoredPublicGeneration(item);
      if (!normalized || !normalized.id || isRetiredPublicGeneration(normalized)) continue;
      try {
        materialized.push(await materializePublicGenerationAssets(normalized));
      } catch (error) {
        console.error(`Publication ${normalized.id} ignoree, image publique indisponible:`, error?.message || error);
      }
    }
    return materialized;
  };

  const readPublicGenerations = async () => {
    const fromFile = await readPublicGenerationsFile();
    const fromMemory = await readPublicGenerationsFromMemory();
    const merged = mergePublicGenerations(fromMemory, fromFile);

    if (fromMemory.length > 0 && merged.length > 0) {
      try {
        await writePublicGenerations(merged);
      } catch (error) {
        console.error("Rafraichissement du cache vitrine publique impossible:", error?.message || error);
      }
    }

    return merged;
  };

  const addPublicGeneration = async (payload) => {
    const publicPayload = stripPrivateGeneratedAssetAccess(payload);
    const generation = await materializePublicGenerationAssets(normalizePublicGenerationPayload(publicPayload));
    if (isRetiredPublicGeneration(generation)) {
      throw Object.assign(new Error("Ce profil exemple a ete retire de la vitrine."), { status: 410 });
    }
    const generations = await readPublicGenerations();
    const withoutDuplicate = generations.filter(item => item.imageUrl !== generation.imageUrl);
    const next = mergePublicGenerations(generation, withoutDuplicate);
    await writePublicGenerations(next);
    return generation;
  };

  const removePublicGeneration = async (generationId = "", sourceGeneration = null) => {
    const id = String(generationId || "").trim();
    if (!id) return false;
    const generations = await readPublicGenerations();
    const removed = [
      ...generations.filter(item => item.id === id),
      ...(sourceGeneration && sourceGeneration.id === id ? [sourceGeneration] : [])
    ];
    const next = generations.filter(item => item.id !== id);
    if (next.length !== generations.length) {
      await writePublicGenerations(next);
    }
    if (!removed.length) return false;
    const remainingAssets = collectPublicGalleryAssetPaths(next);
    const removedAssets = collectPublicGalleryAssetPaths(removed);
    await Promise.all(
      [...removedAssets]
        .filter(assetPath => !remainingAssets.has(assetPath))
        .map(assetPath => deletePublicGalleryAsset(assetPath))
    );
    return true;
  };

  const assertGeneratedOpenAiAssetPathsOwnedBy = async (assetPaths, owner) => {
    for (const assetPath of assetPaths) {
      await assertGeneratedOpenAiAssetPathOwnedBy(assetPath, owner);
    }
  };

  const findOwnedGenerationForPublication = async (owner, payload = {}) => {
    const candidates = new Set(publicationGenerationIdCandidates(payload));
    if (!candidates.size) {
      throw Object.assign(new Error("Fiche personnelle requise pour publier dans la vitrine."), { status: 400 });
    }

    const generations = await getUserMemory().listGenerations(owner, { scope: "all", limit: 240 });
    const generation = generations.find(item =>
      candidates.has(String(item.id || "")) ||
      candidates.has(String(item.personalGenerationId || "")) ||
      candidates.has(String(item.publicGenerationId || ""))
    );

    if (!generation) {
      throw Object.assign(new Error("Cette fiche ne peut etre publiee que depuis son compte createur."), { status: 403 });
    }
    if (generation.status === "recommendations_ready") {
      throw Object.assign(new Error("Choisissez une proposition finale avant de publier dans la vitrine."), { status: 400 });
    }

    const assetPaths = collectGeneratedOpenAiAssetPaths({
      imageUrl: generation.imageUrl,
      additionalViews: generation.additionalViews
    });
    if (!assetPaths.size) {
      throw Object.assign(new Error("Seules les generations personnelles OpenAI peuvent etre publiees depuis un compte utilisateur."), { status: 403 });
    }

    await assertGeneratedOpenAiAssetPathsOwnedBy(assetPaths, owner);
    return generation;
  };

  const publicGenerationPayloadFromOwnedGeneration = (payload = {}, generation = {}) => ({
    ...payload,
    sourceLabel: generation.sourceLabel || payload.sourceLabel || "Photo personnelle",
    analysis: {
      ...(payload.analysis || {}),
      faceShape: generation.faceShape || payload.analysis?.faceShape
    },
    consultation: generation.consultation || payload.consultation || {},
    proposal: {
      ...(payload.proposal || {}),
      id: generation.id || payload.proposal?.id,
      imageUrl: stripGeneratedOpenAiAssetAccess(generation.imageUrl || ""),
      styleName: generation.styleName || payload.proposal?.styleName,
      color: generation.color || payload.proposal?.color,
      faceShape: generation.faceShape || payload.proposal?.faceShape,
      additionalViews: stripPrivateGeneratedAssetAccess(generation.additionalViews || {})
    }
  });

  return {
    normalizePublicGenerationLimit,
    readPublicGenerations,
    addPublicGeneration,
    removePublicGeneration,
    findOwnedGenerationForPublication,
    publicGenerationPayloadFromOwnedGeneration
  };
};
