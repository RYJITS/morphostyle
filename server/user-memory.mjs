import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const todayKey = (timeZone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const emptyMemory = () => ({
  version: 1,
  guests: {},
  generations: []
});

const sanitizeText = (value = "", max = 160) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const toPublicHistoryItem = (entry = {}) => {
  const final = entry.final || {};
  const firstRecommendation = Array.isArray(entry.recommendations) ? entry.recommendations[0] : null;
  const fallbackImage = firstRecommendation?.previewUrl || "";

  return {
    id: entry.id,
    imageUrl: final.imageUrl || fallbackImage,
    styleName: sanitizeText(final.styleName || entry.title || "Resultat MorphoStyle", 100),
    color: sanitizeText(final.color || firstRecommendation?.color || "Naturel", 60),
    faceShape: sanitizeText(entry.faceShape || "morphologie personnalisee", 100),
    sourceLabel: sanitizeText(entry.sourceLabel || "Photo personnelle", 80),
    createdAt: entry.createdAt,
    additionalViews: final.additionalViews,
    consultation: entry.consultation,
    publicGenerationId: entry.publicGenerationId,
    originalImageUrl: entry.originalImageUrl,
    status: entry.status,
    recommendations: entry.recommendations
  };
};

export const createUserMemoryStore = ({
  dataDir,
  fileName = "user-memory.json",
  timeZone = "Europe/Zurich",
  maxGenerations = 240
}) => {
  const filePath = path.join(dataDir, fileName);

  const readMemory = async () => {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      return {
        ...emptyMemory(),
        ...parsed,
        guests: parsed?.guests && typeof parsed.guests === "object" ? parsed.guests : {},
        generations: Array.isArray(parsed?.generations) ? parsed.generations : []
      };
    } catch {
      return emptyMemory();
    }
  };

  const writeMemory = async (memory) => {
    await mkdir(dataDir, { recursive: true });
    const next = {
      ...memory,
      generations: [...(memory.generations || [])]
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
        .slice(0, maxGenerations)
    };
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  };

  const ensureGuest = async (ownerId) => {
    const memory = await readMemory();
    const now = new Date().toISOString();
    memory.guests[ownerId] = {
      id: ownerId,
      ownerType: "guest",
      createdAt: memory.guests[ownerId]?.createdAt || now,
      lastSeenAt: now,
      status: "active"
    };
    await writeMemory(memory);
    return memory.guests[ownerId];
  };

  const upsertGeneration = async (ownerId, patch = {}) => {
    const memory = await readMemory();
    const now = new Date().toISOString();
    const existing = memory.generations.find(item => item.id === patch.id && item.ownerId === ownerId);
    const base = existing || {
      id: patch.id,
      ownerType: "guest",
      ownerId,
      createdAt: now
    };
    const merged = {
      ...base,
      ...patch,
      ownerType: "guest",
      ownerId,
      updatedAt: now
    };

    memory.guests[ownerId] = {
      id: ownerId,
      ownerType: "guest",
      createdAt: memory.guests[ownerId]?.createdAt || now,
      lastSeenAt: now,
      status: "active"
    };

    memory.generations = existing
      ? memory.generations.map(item => item === existing ? merged : item)
      : [merged, ...memory.generations];

    await writeMemory(memory);
    return toPublicHistoryItem(merged);
  };

  const listGenerations = async (ownerId, { scope = "today" } = {}) => {
    const memory = await readMemory();
    const today = todayKey(timeZone);
    return memory.generations
      .filter(item => item.ownerId === ownerId)
      .filter(item => scope !== "today" || String(item.createdAt || "").startsWith(today))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, 48)
      .map(toPublicHistoryItem);
  };

  const markPublished = async (ownerId, generationId, publicGenerationId) => {
    if (!generationId || !publicGenerationId) return null;
    const memory = await readMemory();
    const now = new Date().toISOString();
    let updated = null;
    memory.generations = memory.generations.map((item) => {
      if (item.id !== generationId || item.ownerId !== ownerId) return item;
      updated = {
        ...item,
        status: "published",
        publicGenerationId,
        publishedAt: now,
        updatedAt: now
      };
      return updated;
    });
    if (updated) await writeMemory(memory);
    return updated ? toPublicHistoryItem(updated) : null;
  };

  return {
    ensureGuest,
    upsertGeneration,
    listGenerations,
    markPublished
  };
};
