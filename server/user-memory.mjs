import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import path from "node:path";

const todayKey = (timeZone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const emptyMemory = () => ({
  version: 2,
  guests: {},
  users: {},
  sessions: {},
  creditWallets: {},
  creditLedger: [],
  adminAuditLog: [],
  trialPromoCode: null,
  trialPromoCodeHistory: [],
  trialPromoCodeRedemptions: [],
  generations: []
});

const sanitizeText = (value = "", max = 160) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const sanitizeAssetPath = (value = "") => sanitizeText(value, 260);

const sanitizeAssetContentType = (value = "") => {
  const contentType = String(value || "").trim().toLowerCase();
  return /^image\/[a-z0-9.+-]+$/.test(contentType) ? contentType : "image/jpeg";
};

const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const configuredAdminEmails = () =>
  new Set(
    String(process.env.MORPHOSTYLE_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
      .split(/[\s,;]+/)
      .map(normalizeEmail)
      .filter(Boolean)
  );

const isConfiguredAdminEmail = (email = "") => configuredAdminEmails().has(normalizeEmail(email));

const normalizeUserRole = (value = "") =>
  String(value || "").trim().toLowerCase() === "admin" ? "admin" : "user";

const adminUserStatuses = new Set(["active", "suspended", "deleted"]);

const normalizeAdminUserStatus = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  return adminUserStatuses.has(normalized) ? normalized : "active";
};

const roleForUser = (user = {}) =>
  isConfiguredAdminEmail(user.email) ? "admin" : normalizeUserRole(user.role);

const assertUserCanLogin = (user = {}) => {
  const status = normalizeAdminUserStatus(user.status);
  if (status !== "active") {
    const message = status === "deleted" ? "Ce compte a ete supprime." : "Ce compte est suspendu.";
    throw Object.assign(new Error(message), { status: 403 });
  }
};

const envFlag = (value = "") => /^(1|true|yes|on)$/i.test(String(value || "").trim());

const isProductionRuntime = () =>
  process.env.NODE_ENV === "production" ||
  envFlag(process.env.HOSTINGER) ||
  process.env.HOSTINGER_ENV === "production";

const isMysqlRequiredByEnv = () =>
  envFlag(process.env.REQUIRE_MYSQL) ||
  envFlag(process.env.MORPHOSTYLE_REQUIRE_MYSQL) ||
  (isProductionRuntime() && !envFlag(process.env.ALLOW_JSON_USER_STORE));

const createId = (prefix = "id") => `${prefix}_${randomBytes(16).toString("hex")}`;

const hashToken = (token = "") => createHash("sha256").update(String(token)).digest("hex");

const hashPassword = (password = "") => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
};

const verifyPasswordHash = (password = "", stored = "") => {
  const [scheme, salt, expected] = String(stored || "").split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
};

const publicUser = (user = {}) => ({
  type: "user",
  id: user.id,
  email: user.email,
  status: user.status || "active",
  role: roleForUser(user)
});

const normalizeOwner = (owner) => {
  if (typeof owner === "string") return { type: "guest", id: owner };
  return {
    type: owner?.type === "user" ? "user" : "guest",
    id: String(owner?.id || "")
  };
};

const sanitizeGenerationPatch = (patch = {}) => ({
  ...patch,
  id: sanitizeText(patch.id || createId("gen"), 120),
  status: sanitizeText(patch.status || "final_ready", 40),
  title: sanitizeText(patch.title || patch.final?.styleName || "Resultat MorphoStyle", 120),
  sourceLabel: sanitizeText(patch.sourceLabel || "Photo personnelle", 80),
  faceShape: sanitizeText(patch.faceShape || "morphologie personnalisee", 120)
});

const normalizeBackgroundTreatment = (value) =>
  value === "gray" || value === "original" ? value : undefined;

const toPublicHistoryItem = (entry = {}) => {
  const final = entry.final || {};
  const storedPublic = entry.publicGeneration && typeof entry.publicGeneration === "object"
    ? entry.publicGeneration
    : {};
  const firstRecommendation = Array.isArray(entry.recommendations) ? entry.recommendations[0] : null;
  const fallbackImage = firstRecommendation?.previewUrl || "";

  return {
    id: entry.id,
    personalGenerationId: entry.personalGenerationId || entry.id,
    imageUrl: final.imageUrl || entry.imageUrl || storedPublic.imageUrl || fallbackImage,
    styleName: sanitizeText(final.styleName || entry.styleName || entry.title || "Resultat MorphoStyle", 100),
    color: sanitizeText(final.color || entry.color || firstRecommendation?.color || "Naturel", 60),
    faceShape: sanitizeText(entry.faceShape || "morphologie personnalisee", 100),
    sourceLabel: sanitizeText(entry.sourceLabel || "Photo personnelle", 80),
    createdAt: entry.createdAt,
    additionalViews: final.additionalViews || entry.additionalViews || storedPublic.additionalViews,
    backgroundTreatment: normalizeBackgroundTreatment(final.backgroundTreatment || entry.backgroundTreatment || storedPublic.backgroundTreatment),
    publicImageUrl: storedPublic.imageUrl || "",
    publicAdditionalViews: storedPublic.additionalViews || undefined,
    consultation: entry.consultation,
    publicGenerationId: entry.publicGenerationId,
    originalImageUrl: entry.originalImageUrl,
    selectedProposalKey: entry.selectedProposalKey,
    selectedProposalAssetUrl: entry.selectedProposalAssetUrl,
    recommendationSessionId: entry.recommendationSessionId || entry.parentGenerationId || "",
    parentGenerationId: entry.parentGenerationId || entry.recommendationSessionId || "",
    generatedFinalIds: Array.isArray(entry.generatedFinalIds) ? entry.generatedFinalIds : [],
    status: entry.status,
    recommendations: entry.recommendations
  };
};

const toStoredPublicGenerationItem = (entry = {}) => {
  const storedPublic = entry.publicGeneration && typeof entry.publicGeneration === "object"
    ? entry.publicGeneration
    : {};
  const historyItem = toPublicHistoryItem(entry);
  const publicGenerationId = sanitizeText(
    storedPublic.id || storedPublic.publicGenerationId || entry.publicGenerationId || entry.public_generation_id || historyItem.publicGenerationId || historyItem.id,
    120
  );
  const additionalViews = storedPublic.additionalViews || historyItem.additionalViews;

  return {
    id: publicGenerationId,
    imageUrl: storedPublic.imageUrl || historyItem.imageUrl || "",
    styleName: sanitizeText(storedPublic.styleName || historyItem.styleName || "Resultat MorphoStyle", 100),
    color: sanitizeText(storedPublic.color || historyItem.color || "Naturel", 60),
    faceShape: sanitizeText(storedPublic.faceShape || historyItem.faceShape || "morphologie personnalisee", 100),
    sourceLabel: sanitizeText(storedPublic.sourceLabel || historyItem.sourceLabel || "Photo personnelle", 80),
    createdAt: storedPublic.createdAt || entry.publishedAt || entry.updatedAt || historyItem.createdAt || entry.createdAt || "",
    additionalViews: additionalViews && Object.keys(additionalViews).length ? additionalViews : undefined,
    backgroundTreatment: normalizeBackgroundTreatment(storedPublic.backgroundTreatment || historyItem.backgroundTreatment),
    consultation: storedPublic.consultation || historyItem.consultation,
    publicGenerationId,
    _privateSourceImageUrl: historyItem.imageUrl || "",
    _privateSourceAdditionalViews: historyItem.additionalViews || {}
  };
};

const countGenerationImages = (entry = {}) => {
  const final = entry.final || {};
  return [
    final.imageUrl || entry.imageUrl,
    entry.originalImageUrl,
    ...Object.values(final.additionalViews || entry.additionalViews || {}),
    ...(Array.isArray(entry.recommendations) ? entry.recommendations.map(item => item.previewUrl || item.imageUrl) : [])
  ].filter(Boolean).length;
};

const stripUrlQuery = (value = "") => {
  const raw = sanitizeText(value, 320);
  if (!raw || raw.startsWith("data:image/")) return "";
  try {
    return decodeURIComponent(new URL(raw, "http://local").pathname || raw);
  } catch {
    return raw.split("?")[0];
  }
};

const addGenerationDeleteCandidate = (candidates, value) => {
  const raw = sanitizeText(value, 320);
  if (!raw || raw.startsWith("data:image/")) return;
  candidates.add(raw);
  const withoutQuery = stripUrlQuery(raw);
  if (withoutQuery) candidates.add(withoutQuery);
};

const normalizeGenerationDeleteCriteria = (criteria = "") => {
  const source = criteria && typeof criteria === "object" ? criteria : { generationId: criteria };
  const candidates = new Set();
  [
    source.id,
    source.generationId,
    source.personalGenerationId,
    source.publicGenerationId,
    source.imageUrl,
    source.originalImageUrl,
    ...(Array.isArray(source.candidateIds) ? source.candidateIds : [])
  ].forEach(value => addGenerationDeleteCandidate(candidates, value));

  return {
    candidates,
    styleName: sanitizeText(source.styleName || "", 160),
    sourceLabel: sanitizeText(source.sourceLabel || "", 100),
    createdAt: sanitizeText(source.createdAt || "", 80)
  };
};

const normalizedComparableText = (value = "") =>
  sanitizeText(value, 180).trim().toLowerCase();

const deleteDateMatches = (value = "", expected = "") => {
  const left = sanitizeText(value || "", 80);
  const right = sanitizeText(expected || "", 80);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftMinute = left.slice(0, 16);
  const rightMinute = right.slice(0, 16);
  return leftMinute.length >= 16 && leftMinute === rightMinute;
};

const generationMatchesDeleteCriteria = (entry = {}, row = {}, criteria = {}) => {
  if (!criteria.candidates?.size) return false;
  const final = entry.final || {};
  const publicGeneration = entry.publicGeneration || {};
  const values = [
    row.id,
    row.public_generation_id,
    entry.id,
    entry.personalGenerationId,
    entry.publicGenerationId,
    entry.imageUrl,
    entry.originalImageUrl,
    final.imageUrl,
    publicGeneration.id,
    publicGeneration.imageUrl,
    ...Object.values(entry.additionalViews || {}),
    ...Object.values(final.additionalViews || {}),
    ...Object.values(publicGeneration.additionalViews || {})
  ];

  if (Array.isArray(entry.recommendations)) {
    entry.recommendations.forEach(recommendation => {
      values.push(
        recommendation.id,
        recommendation.previewUrl,
        recommendation.assetPreviewUrl,
        recommendation.imageUrl
      );
    });
  }

  const matchesValue = values.some(value => {
    const raw = sanitizeText(value, 320);
    return raw && (
      criteria.candidates.has(raw) ||
      criteria.candidates.has(stripUrlQuery(raw))
    );
  });
  if (matchesValue) return true;

  if (!criteria.styleName || !criteria.createdAt) return false;

  const expectedTitle = normalizedComparableText(criteria.styleName);
  const expectedSource = normalizedComparableText(criteria.sourceLabel);
  const entryTitle = normalizedComparableText(entry.styleName || entry.title || final.styleName || "");
  const entrySource = normalizedComparableText(entry.sourceLabel || "");

  return Boolean(
    entryTitle &&
    entryTitle === expectedTitle &&
    (!expectedSource || entrySource === expectedSource) &&
    deleteDateMatches(entry.createdAt || row.created_at || "", criteria.createdAt)
  );
};

const normalizeOwnerType = (value = "") =>
  String(value || "").trim().toLowerCase() === "user" ? "user" : "guest";

const creditWalletKey = (ownerType = "guest", ownerId = "") =>
  `${normalizeOwnerType(ownerType)}:${sanitizeText(ownerId, 120)}`;

const normalizeCreditAmount = (value) => {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000) {
    throw Object.assign(new Error("Ajustement credits invalide."), { status: 400 });
  }
  return amount;
};

const normalizeTrialPromoCode = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 60);

const hashTrialPromoCode = (value = "") =>
  createHash("sha256").update(normalizeTrialPromoCode(value)).digest("hex");

const createTrialPromoCodeValue = () => {
  const compact = randomBytes(6).toString("hex").toUpperCase();
  return `MORPHO-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
};

const normalizeTrialPromoUses = (value = 5) => {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 1 || amount > 50) {
    throw Object.assign(new Error("Nombre d'essais bonus invalide."), { status: 400 });
  }
  return amount;
};

const toAdminTrialPromoCode = (entry = {}) => ({
  id: sanitizeText(entry.id || "trial-extra", 48),
  code: normalizeTrialPromoCode(entry.code || ""),
  codeHash: sanitizeText(entry.codeHash || entry.code_hash || "", 80),
  usesAdded: Math.max(1, Number(entry.usesAdded || entry.uses_added || 5)),
  status: String(entry.status || "active") === "inactive" ? "inactive" : "active",
  activationCount: Math.max(0, Number(entry.activationCount || entry.activation_count || 0)),
  createdAt: entry.createdAt || fromMysqlDate(entry.created_at),
  updatedAt: entry.updatedAt || fromMysqlDate(entry.updated_at),
  lastUsedAt: entry.lastUsedAt || fromMysqlDate(entry.last_used_at)
});

const sortTrialPromoCodes = (items = []) =>
  [...items].sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
  );

const trialPromoCodeHistoryFromMemory = (memory = {}) => {
  const rawItems = [
    ...(Array.isArray(memory.trialPromoCodeHistory) ? memory.trialPromoCodeHistory : []),
    ...(memory.trialPromoCode && typeof memory.trialPromoCode === "object" ? [memory.trialPromoCode] : [])
  ];
  const seen = new Set();
  const items = [];
  for (const rawItem of sortTrialPromoCodes(rawItems.map(toAdminTrialPromoCode))) {
    if (!rawItem.code && !rawItem.codeHash) continue;
    const key = rawItem.id || rawItem.codeHash || rawItem.code;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(rawItem);
  }
  return items;
};

const activeTrialPromoCodeFromMemory = (memory = {}) =>
  trialPromoCodeHistoryFromMemory(memory).find(entry => entry.status === "active") || null;

const hiddenGenerationStatuses = new Set(["admin_hidden", "user_deleted"]);

const isVisibleGenerationStatus = (status = "") =>
  !hiddenGenerationStatuses.has(String(status || "").trim().toLowerCase());

const toAdminGenerationItem = (entry = {}) => {
  const final = entry.final || {};
  return {
    id: entry.id,
    ownerType: entry.ownerType || "guest",
    ownerId: entry.ownerId || "",
    ownerEmail: entry.ownerEmail || "",
    status: entry.status || "final_ready",
    title: sanitizeText(entry.title || final.styleName || entry.styleName || "Resultat MorphoStyle", 120),
    sourceLabel: sanitizeText(entry.sourceLabel || "Photo personnelle", 80),
    styleName: sanitizeText(final.styleName || entry.styleName || entry.title || "Resultat MorphoStyle", 120),
    publicGenerationId: entry.publicGenerationId || "",
    imageCount: countGenerationImages(entry),
    hasOriginal: Boolean(entry.originalImageUrl),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
};

const toAdminGenerationDetail = (entry = {}, ownerEmail = "") => {
  const final = entry.final || {};
  const publicItem = toPublicHistoryItem(entry);
  return {
    ...toAdminGenerationItem({ ...entry, ownerEmail }),
    imageUrl: final.imageUrl || entry.imageUrl || publicItem.imageUrl || "",
    originalImageUrl: entry.originalImageUrl || "",
    additionalViews: final.additionalViews || entry.additionalViews || {},
    recommendations: Array.isArray(entry.recommendations) ? entry.recommendations : [],
    consultation: entry.consultation || {},
    faceShape: sanitizeText(entry.faceShape || publicItem.faceShape || "morphologie personnalisee", 120),
    color: sanitizeText(final.color || entry.color || publicItem.color || "Naturel", 80),
    beardStyle: sanitizeText(final.beardStyle || entry.beardStyle || "Aucune", 80),
    description: sanitizeText(final.description || entry.description || entry.title || "", 240),
    whyItWorks: sanitizeText(final.whyItWorks || entry.whyItWorks || "", 260),
    final: final && Object.keys(final).length > 0 ? final : undefined
  };
};

const toAdminAuditEntry = (entry = {}, actorEmail = "") => ({
  id: entry.id,
  actorUserId: entry.actorUserId || entry.actor_user_id || "",
  actorEmail: actorEmail || entry.actorEmail || entry.actor_email || "",
  action: sanitizeText(entry.action || "", 80),
  targetType: sanitizeText(entry.targetType || entry.target_type || "", 60),
  targetId: sanitizeText(entry.targetId || entry.target_id || "", 160),
  details: entry.details || {},
  createdAt: entry.createdAt || fromMysqlDate(entry.created_at)
});

const toCreditWallet = (ownerType = "guest", ownerId = "", wallet = {}) => ({
  ownerType: normalizeOwnerType(ownerType),
  ownerId: sanitizeText(ownerId, 120),
  balance: Number(wallet?.balance || 0),
  createdAt: wallet?.createdAt || wallet?.created_at ? fromMysqlDate(wallet.createdAt || wallet.created_at) : "",
  updatedAt: wallet?.updatedAt || wallet?.updated_at ? fromMysqlDate(wallet.updatedAt || wallet.updated_at) : ""
});

const toCreditLedgerEntry = (entry = {}) => ({
  id: entry.id,
  ownerType: normalizeOwnerType(entry.ownerType || entry.owner_type),
  ownerId: sanitizeText(entry.ownerId || entry.owner_id || "", 120),
  actorUserId: sanitizeText(entry.actorUserId || entry.actor_user_id || "", 120),
  amount: Number(entry.amount || 0),
  balanceAfter: Number(entry.balanceAfter || entry.balance_after || 0),
  reason: sanitizeText(entry.reason || "", 240),
  createdAt: entry.createdAt || fromMysqlDate(entry.created_at)
});

const toAdminUserItem = (user = {}, generations = [], wallet = null) => {
  const visibleGenerations = generations.filter(item => isVisibleGenerationStatus(item.status));
  const lastGeneration = visibleGenerations
    .map(item => item.updatedAt || item.createdAt || "")
    .filter(Boolean)
    .sort()
    .pop() || "";

  return {
    id: user.id,
    email: user.email,
    status: user.status || "active",
    role: roleForUser(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    generationCount: visibleGenerations.length,
    publishedCount: visibleGenerations.filter(item => item.status === "published" || item.publicGenerationId).length,
    creditBalance: Number(wallet?.balance || user.creditBalance || 0),
    lastGenerationAt: lastGeneration
  };
};

const toAdminUserDetail = (user = {}, generations = [], limit = 80, wallet = null) => {
  const visibleGenerations = generations
    .filter(item => isVisibleGenerationStatus(item.status))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));

  return {
    ...toAdminUserItem(user, generations, wallet),
    hiddenCount: generations.filter(item => !isVisibleGenerationStatus(item.status)).length,
    generations: visibleGenerations.slice(0, limit).map(item => toAdminGenerationItem({
      ...item,
      ownerEmail: user.email || ""
    }))
  };
};

const retiredHistorySources = new Set(["sam"]);

const isRetiredHistoryEntry = (entry = {}) => {
  const final = entry.final || {};
  const publicGeneration = entry.publicGeneration || {};
  const sourceLabel = sanitizeText(entry.sourceLabel || publicGeneration.sourceLabel || "", 80).toLowerCase();
  const urls = [
    entry.imageUrl,
    entry.originalImageUrl,
    final.imageUrl,
    publicGeneration.imageUrl,
    ...Object.values(entry.additionalViews || {}),
    ...Object.values(final.additionalViews || {}),
    ...Object.values(publicGeneration.additionalViews || {})
  ].map(value => String(value || "").toLowerCase());

  return retiredHistorySources.has(sourceLabel) || urls.some(url => url.includes("/demo-profiles/sam/"));
};

const normalizeHistoryLimit = (limit, maxGenerations) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return 48;
  return Math.max(1, Math.min(maxGenerations, Math.round(parsed)));
};

const mysqlConfigFromEnv = () => {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MORPHOSTYLE_DATABASE_URL || "";
  if (databaseUrl) return { databaseUrl };

  const host = process.env.MYSQL_HOST || process.env.DB_HOST || process.env.MORPHOSTYLE_DB_HOST || "";
  const database = process.env.MYSQL_DATABASE || process.env.DB_DATABASE || process.env.DB_NAME || process.env.MORPHOSTYLE_DB_NAME || "";
  const user = process.env.MYSQL_USER || process.env.DB_USER || process.env.MORPHOSTYLE_DB_USER || "";
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || process.env.MORPHOSTYLE_DB_PASSWORD || "";
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || process.env.MORPHOSTYLE_DB_PORT || 3306);

  if (!host || !database || !user || !password) return null;
  return { host, database, user, password, port };
};

const toMysqlDate = (value = new Date().toISOString()) =>
  String(value || new Date().toISOString()).slice(0, 19).replace("T", " ");

const fromMysqlDate = (value) => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value).replace(" ", "T")).toISOString();
};

const ensureMysqlColumn = async (pool, tableName, columnName, definition) => {
  try {
    await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch (error) {
    if (error?.code === "ER_DUP_FIELDNAME" || /duplicate column/i.test(String(error?.message || ""))) return;
    throw error;
  }
};

const createJsonStore = ({ dataDir, fileName, timeZone, maxGenerations }) => {
  const filePath = path.join(dataDir, fileName);
  let jsonOperationQueue = Promise.resolve();

  const serializeJsonOperation = (operation) => (...args) => {
    const run = jsonOperationQueue.then(() => operation(...args), () => operation(...args));
    jsonOperationQueue = run.catch(() => null);
    return run;
  };

  const readMemory = async () => {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      return {
        ...emptyMemory(),
        ...parsed,
        guests: parsed?.guests && typeof parsed.guests === "object" ? parsed.guests : {},
        users: parsed?.users && typeof parsed.users === "object" ? parsed.users : {},
        sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
        creditWallets: parsed?.creditWallets && typeof parsed.creditWallets === "object" ? parsed.creditWallets : {},
        creditLedger: Array.isArray(parsed?.creditLedger) ? parsed.creditLedger : [],
        adminAuditLog: Array.isArray(parsed?.adminAuditLog) ? parsed.adminAuditLog : [],
        trialPromoCode: parsed?.trialPromoCode && typeof parsed.trialPromoCode === "object" ? parsed.trialPromoCode : null,
        trialPromoCodeHistory: Array.isArray(parsed?.trialPromoCodeHistory) ? parsed.trialPromoCodeHistory : [],
        trialPromoCodeRedemptions: Array.isArray(parsed?.trialPromoCodeRedemptions) ? parsed.trialPromoCodeRedemptions : [],
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
      version: 2,
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

  const createUser = async ({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) throw Object.assign(new Error("Email invalide."), { status: 400 });
    if (String(password || "").length < 8) throw Object.assign(new Error("Le mot de passe doit contenir au moins 8 caracteres."), { status: 400 });

    const memory = await readMemory();
    if (Object.values(memory.users).some(user => user.email === normalizedEmail)) {
      throw Object.assign(new Error("Un compte existe deja avec cet email."), { status: 409 });
    }

    const now = new Date().toISOString();
    const user = {
      id: createId("usr"),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      status: "active",
      role: roleForUser({ email: normalizedEmail }),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    memory.users[user.id] = user;
    await writeMemory(memory);
    return publicUser(user);
  };

  const verifyUserPassword = async ({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    const memory = await readMemory();
    const user = Object.values(memory.users).find(item => item.email === normalizedEmail);
    if (!user || !verifyPasswordHash(password, user.passwordHash)) {
      throw Object.assign(new Error("Email ou mot de passe incorrect."), { status: 401 });
    }
    assertUserCanLogin(user);
    user.role = roleForUser(user);
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    memory.users[user.id] = user;
    await writeMemory(memory);
    return publicUser(user);
  };

  const createSession = async (userId) => {
    const memory = await readMemory();
    const user = memory.users[userId];
    if (!user) throw Object.assign(new Error("Compte introuvable."), { status: 404 });
    assertUserCanLogin(user);

    const token = `ms_${randomBytes(32).toString("hex")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
    memory.sessions[hashToken(token)] = {
      userId,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt
    };
    await writeMemory(memory);
    return { token, owner: publicUser(user), expiresAt };
  };

  const getSessionByToken = async (token = "") => {
    if (!token) return null;
    const memory = await readMemory();
    const tokenHash = hashToken(token);
    const session = memory.sessions[tokenHash];
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      delete memory.sessions[tokenHash];
      await writeMemory(memory);
      return null;
    }

    const user = memory.users[session.userId];
    if (!user) return null;
    if (String(user.status || "active") !== "active") {
      delete memory.sessions[tokenHash];
      await writeMemory(memory);
      return null;
    }
    user.role = roleForUser(user);
    session.lastSeenAt = new Date().toISOString();
    memory.sessions[tokenHash] = session;
    await writeMemory(memory);
    return { owner: publicUser(user), tokenHash };
  };

  const deleteSession = async (token = "") => {
    if (!token) return false;
    const memory = await readMemory();
    delete memory.sessions[hashToken(token)];
    await writeMemory(memory);
    return true;
  };

  const upsertGeneration = async (ownerInput, patch = {}) => {
    const owner = normalizeOwner(ownerInput);
    const memory = await readMemory();
    const now = new Date().toISOString();
    const sanitizedPatch = sanitizeGenerationPatch(patch);
    const existing = memory.generations.find(item => item.id === sanitizedPatch.id && item.ownerId === owner.id && (item.ownerType || "guest") === owner.type);
    const base = existing || {
      id: sanitizedPatch.id,
      ownerType: owner.type,
      ownerId: owner.id,
      createdAt: sanitizedPatch.createdAt || now
    };
    const merged = {
      ...base,
      ...sanitizedPatch,
      ownerType: owner.type,
      ownerId: owner.id,
      updatedAt: now
    };

    if (owner.type === "guest") {
      memory.guests[owner.id] = {
        id: owner.id,
        ownerType: "guest",
        createdAt: memory.guests[owner.id]?.createdAt || now,
        lastSeenAt: now,
        status: "active"
      };
    }

    memory.generations = existing
      ? memory.generations.map(item => item === existing ? merged : item)
      : [merged, ...memory.generations];

    await writeMemory(memory);
    return toPublicHistoryItem(merged);
  };

  const listGenerations = async (ownerInput, { scope = "today", limit = 48 } = {}) => {
    const owner = normalizeOwner(ownerInput);
    const memory = await readMemory();
    const today = todayKey(timeZone);
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    return memory.generations
      .filter(item => item.ownerId === owner.id && (item.ownerType || "guest") === owner.type)
      .filter(item => isVisibleGenerationStatus(item.status))
      .filter(item => !isRetiredHistoryEntry(item))
      .filter(item => scope !== "today" || String(item.createdAt || "").startsWith(today))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, safeLimit)
      .map(toPublicHistoryItem);
  };

  const listPublishedGenerations = async ({ limit = maxGenerations } = {}) => {
    const memory = await readMemory();
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    return memory.generations
      .filter(item => isVisibleGenerationStatus(item.status))
      .filter(item => item.status === "published" || item.publicGenerationId || item.publicGeneration)
      .filter(item => !isRetiredHistoryEntry(item))
      .map(toStoredPublicGenerationItem)
      .filter(item => item.id && item.imageUrl)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, safeLimit);
  };

  const markPublished = async (ownerInput, generationId, publicGenerationId, publicGeneration = null) => {
    if (!generationId || !publicGenerationId) return null;
    const owner = normalizeOwner(ownerInput);
    const memory = await readMemory();
    const now = new Date().toISOString();
    let updated = null;
    memory.generations = memory.generations.map((item) => {
      if (item.id !== generationId || item.ownerId !== owner.id || (item.ownerType || "guest") !== owner.type) return item;
      updated = {
        ...item,
        status: "published",
        publicGenerationId,
        publicGeneration: publicGeneration && typeof publicGeneration === "object"
          ? { ...publicGeneration, id: publicGeneration.id || publicGenerationId }
          : item.publicGeneration,
        publishedAt: now,
        updatedAt: now
      };
      return updated;
    });
    if (updated) await writeMemory(memory);
    return updated ? toPublicHistoryItem(updated) : null;
  };

  const deleteGenerationForOwner = async (ownerInput, generationId = "") => {
    const owner = normalizeOwner(ownerInput);
    const criteria = normalizeGenerationDeleteCriteria(generationId);
    if (!criteria.candidates.size) {
      throw Object.assign(new Error("Fiche manquante."), { status: 400 });
    }

    const memory = await readMemory();
    const now = new Date().toISOString();
    let deleted = null;
    memory.generations = (memory.generations || []).map((item) => {
      const isGenerationMatch = generationMatchesDeleteCriteria(item, {}, criteria);
      const isOwner = isGenerationMatch &&
        item.ownerId === owner.id &&
        (item.ownerType || "guest") === owner.type;
      if (!isOwner) return item;
      if (!isVisibleGenerationStatus(item.status)) return item;
      deleted = {
        ...item,
        status: "user_deleted",
        previousStatus: item.status || "",
        deletedAt: now,
        updatedAt: now
      };
      return deleted;
    });

    if (!deleted) {
      throw Object.assign(new Error("Fiche introuvable."), { status: 404 });
    }

    await writeMemory(memory);
    return toPublicHistoryItem(deleted);
  };

  const mergeGuestIntoUser = async (guestId, userId) => {
    if (!guestId || !userId) return 0;
    const memory = await readMemory();
    let moved = 0;
    memory.generations = memory.generations.map((item) => {
      if (item.ownerType !== "guest" || item.ownerId !== guestId) return item;
      moved += 1;
      return {
        ...item,
        ownerType: "user",
        ownerId: userId,
        updatedAt: new Date().toISOString()
      };
    });
    await writeMemory(memory);
    return moved;
  };

  const recordAdminAudit = async ({ actorUserId = "", action = "", targetType = "", targetId = "", details = {} } = {}) => {
    const memory = await readMemory();
    const entry = {
      id: createId("audit"),
      actorUserId,
      action: sanitizeText(action, 80),
      targetType: sanitizeText(targetType, 60),
      targetId: sanitizeText(targetId, 160),
      details,
      createdAt: new Date().toISOString()
    };
    memory.adminAuditLog = [entry, ...(memory.adminAuditLog || [])].slice(0, 1000);
    await writeMemory(memory);
    return entry;
  };

  const getCreditWallet = async ({ ownerType = "guest", ownerId = "" } = {}) => {
    const memory = await readMemory();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    if (!safeOwnerId) throw Object.assign(new Error("Proprietaire credits manquant."), { status: 400 });
    if (ownerKind === "user" && !memory.users?.[safeOwnerId]) {
      throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });
    }
    if (ownerKind === "guest" && !memory.guests?.[safeOwnerId]) {
      throw Object.assign(new Error("Invite introuvable."), { status: 404 });
    }
    const key = creditWalletKey(ownerKind, safeOwnerId);
    const now = new Date().toISOString();
    const wallet = memory.creditWallets?.[key] || {
      ownerType: ownerKind,
      ownerId: safeOwnerId,
      balance: 0,
      createdAt: now,
      updatedAt: now
    };
    memory.creditWallets = { ...(memory.creditWallets || {}), [key]: wallet };
    await writeMemory(memory);
    return toCreditWallet(ownerKind, safeOwnerId, wallet);
  };

  const adjustCreditsForAdmin = async ({ actorUserId = "", ownerType = "user", ownerId = "", amount = 0, reason = "" } = {}) => {
    const memory = await readMemory();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    const delta = normalizeCreditAmount(amount);
    const safeReason = sanitizeText(reason || "Ajustement administrateur", 240);
    if (ownerKind === "user" && !memory.users?.[safeOwnerId]) {
      throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });
    }
    if (ownerKind === "guest" && !memory.guests?.[safeOwnerId]) {
      throw Object.assign(new Error("Invite introuvable."), { status: 404 });
    }

    const key = creditWalletKey(ownerKind, safeOwnerId);
    const now = new Date().toISOString();
    const wallet = memory.creditWallets?.[key] || {
      ownerType: ownerKind,
      ownerId: safeOwnerId,
      balance: 0,
      createdAt: now,
      updatedAt: now
    };
    const balanceAfter = Number(wallet.balance || 0) + delta;
    if (balanceAfter < 0) {
      throw Object.assign(new Error("Le solde credits ne peut pas devenir negatif."), { status: 400 });
    }

    const nextWallet = {
      ...wallet,
      balance: balanceAfter,
      updatedAt: now
    };
    const ledgerEntry = {
      id: createId("credit"),
      ownerType: ownerKind,
      ownerId: safeOwnerId,
      actorUserId,
      amount: delta,
      balanceAfter,
      reason: safeReason,
      createdAt: now
    };
    memory.creditWallets = { ...(memory.creditWallets || {}), [key]: nextWallet };
    memory.creditLedger = [ledgerEntry, ...(memory.creditLedger || [])].slice(0, 2000);
    await writeMemory(memory);
    await recordAdminAudit({
      actorUserId,
      action: "credit_adjust",
      targetType: ownerKind,
      targetId: safeOwnerId,
      details: { amount: delta, balanceAfter, reason: safeReason }
    });
    return { wallet: toCreditWallet(ownerKind, safeOwnerId, nextWallet), entry: toCreditLedgerEntry(ledgerEntry) };
  };

  const listCreditLedgerForAdmin = async ({ ownerType = "", ownerId = "", limit = 80 } = {}) => {
    const memory = await readMemory();
    const safeLimit = normalizeHistoryLimit(limit, 240);
    const ownerKind = ownerType ? normalizeOwnerType(ownerType) : "";
    const safeOwnerId = sanitizeText(ownerId, 120);
    return (memory.creditLedger || [])
      .filter(entry => !ownerKind || normalizeOwnerType(entry.ownerType) === ownerKind)
      .filter(entry => !safeOwnerId || entry.ownerId === safeOwnerId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, safeLimit)
      .map(toCreditLedgerEntry);
  };

  const getAdminTrialPromoCode = async ({ defaultUses = 5 } = {}) => {
    const memory = await readMemory();
    const existing = activeTrialPromoCodeFromMemory(memory);
    if (!existing) {
      return toAdminTrialPromoCode({
        id: "trial-extra",
        code: "",
        codeHash: "",
        usesAdded: normalizeTrialPromoUses(defaultUses),
        status: "inactive",
        activationCount: 0,
        createdAt: "",
        updatedAt: ""
      });
    }
    return toAdminTrialPromoCode(existing);
  };

  const listAdminTrialPromoCodes = async ({ limit = 20 } = {}) => {
    const memory = await readMemory();
    return trialPromoCodeHistoryFromMemory(memory).slice(0, normalizeHistoryLimit(limit, 80));
  };

  const saveAdminTrialPromoCode = async ({ actorUserId = "", code = "", usesAdded = 5, regenerate = false } = {}) => {
    const memory = await readMemory();
    const normalizedCode = normalizeTrialPromoCode(regenerate ? createTrialPromoCodeValue() : code);
    if (normalizedCode.length < 8) {
      throw Object.assign(new Error("Code bonus trop court."), { status: 400 });
    }
    const safeUses = normalizeTrialPromoUses(usesAdded);
    const codeHash = hashTrialPromoCode(normalizedCode);
    const now = new Date().toISOString();
    const previousItems = trialPromoCodeHistoryFromMemory(memory);
    const previous = previousItems.find(item => String(item.codeHash || "").toLowerCase() === codeHash) || {};
    const entry = {
      id: previous.id || createId("trial_code"),
      code: normalizedCode,
      codeHash,
      usesAdded: safeUses,
      status: "active",
      activationCount: Math.max(0, Number(previous.activationCount || 0)),
      createdAt: previous.createdAt || now,
      updatedAt: now,
      updatedByUserId: actorUserId || ""
    };
    const nextHistory = [
      entry,
      ...previousItems
        .filter(item => item.id !== entry.id)
        .map(item => item.status === "active" ? { ...item, status: "inactive", updatedAt: now } : item)
    ];
    memory.trialPromoCode = entry;
    memory.trialPromoCodeHistory = nextHistory;
    await writeMemory(memory);
    await recordAdminAudit({
      actorUserId,
      action: regenerate ? "trial_code_regenerate" : "trial_code_update",
      targetType: "trial_code",
      targetId: entry.id,
      details: { usesAdded: safeUses, codeSuffix: normalizedCode.slice(-4) }
    });
    return toAdminTrialPromoCode(entry);
  };

  const findActiveTrialPromoCodeByHash = async (codeHash = "") => {
    const safeHash = sanitizeText(codeHash, 80).toLowerCase();
    if (!safeHash) return null;
    const memory = await readMemory();
    const entry = trialPromoCodeHistoryFromMemory(memory)
      .find(item => item.status === "active" && String(item.codeHash || "").toLowerCase() === safeHash);
    if (!entry || entry.status !== "active") return null;
    return String(entry.codeHash || "").toLowerCase() === safeHash
      ? toAdminTrialPromoCode(entry)
      : null;
  };

  const redeemTrialPromoCodeForOwner = async ({ codeHash = "", ownerType = "guest", ownerId = "" } = {}) => {
    const safeHash = sanitizeText(codeHash, 80).toLowerCase();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    if (!safeHash || !safeOwnerId) return null;

    const memory = await readMemory();
    const history = trialPromoCodeHistoryFromMemory(memory);
    const entry = history.find(item => item.status === "active" && String(item.codeHash || "").toLowerCase() === safeHash);
    if (!entry) return null;

    const redemptions = Array.isArray(memory.trialPromoCodeRedemptions) ? memory.trialPromoCodeRedemptions : [];
    const existing = redemptions.find(item =>
      item?.promoCodeId === entry.id &&
      normalizeOwnerType(item?.ownerType) === ownerKind &&
      sanitizeText(item?.ownerId, 120) === safeOwnerId
    );
    if (existing) {
      return {
        trialCode: toAdminTrialPromoCode(entry),
        alreadyRedeemed: true,
        redemption: existing
      };
    }

    const now = new Date().toISOString();
    const redemption = {
      id: createId("trial_promo_use"),
      promoCodeId: entry.id,
      codeHash: safeHash,
      ownerType: ownerKind,
      ownerId: safeOwnerId,
      usesAdded: Math.max(1, Number(entry.usesAdded || 1)),
      createdAt: now
    };
    const updatedEntry = {
      ...entry,
      activationCount: Math.max(0, Number(entry.activationCount || 0)) + 1,
      lastUsedAt: now,
      updatedAt: now
    };
    memory.trialPromoCode = updatedEntry;
    memory.trialPromoCodeHistory = history.map(item => item.id === entry.id ? updatedEntry : item);
    memory.trialPromoCodeRedemptions = [redemption, ...redemptions].slice(0, 5000);
    await writeMemory(memory);
    return {
      trialCode: toAdminTrialPromoCode(updatedEntry),
      alreadyRedeemed: false,
      redemption
    };
  };

  const markTrialPromoCodeUsed = async (codeHash = "") => {
    const safeHash = sanitizeText(codeHash, 80).toLowerCase();
    if (!safeHash) return null;
    const memory = await readMemory();
    const history = trialPromoCodeHistoryFromMemory(memory);
    const entry = history.find(item => String(item.codeHash || "").toLowerCase() === safeHash);
    if (!entry || String(entry.codeHash || "").toLowerCase() !== safeHash) return null;
    const now = new Date().toISOString();
    const updatedEntry = {
      ...entry,
      activationCount: Math.max(0, Number(entry.activationCount || 0)) + 1,
      lastUsedAt: now,
      updatedAt: now
    };
    memory.trialPromoCode = updatedEntry;
    memory.trialPromoCodeHistory = history.map(item => item.id === entry.id ? updatedEntry : item);
    await writeMemory(memory);
    return toAdminTrialPromoCode(updatedEntry);
  };

  const getAdminOverview = async () => {
    const memory = await readMemory();
    const users = Object.values(memory.users || {});
    const generations = memory.generations || [];
    const visibleGenerations = generations.filter(item => isVisibleGenerationStatus(item.status));
    const today = todayKey(timeZone);
    const creditBalanceTotal = Object.values(memory.creditWallets || {})
      .reduce((total, wallet) => total + Number(wallet?.balance || 0), 0);
    return {
      usersTotal: users.length,
      usersActive: users.filter(user => String(user.status || "active") === "active").length,
      usersSuspended: users.filter(user => String(user.status || "active") === "suspended").length,
      usersDeleted: users.filter(user => String(user.status || "active") === "deleted").length,
      adminsTotal: users.filter(user => roleForUser(user) === "admin").length,
      guestsTotal: Object.keys(memory.guests || {}).length,
      generationsTotal: visibleGenerations.length,
      generationsToday: visibleGenerations.filter(item => String(item.createdAt || "").startsWith(today)).length,
      generationsPublished: visibleGenerations.filter(item => item.status === "published" || item.publicGenerationId).length,
      generationsHidden: generations.filter(item => !isVisibleGenerationStatus(item.status)).length,
      creditBalanceTotal
    };
  };

  const listAdminUsers = async ({ search = "", limit = 80 } = {}) => {
    const memory = await readMemory();
    const safeLimit = normalizeHistoryLimit(limit, 240);
    const query = sanitizeText(search, 120).toLowerCase();
    return Object.values(memory.users || {})
      .filter(user => !query || [user.id, user.email, user.status, roleForUser(user)].some(value => String(value || "").toLowerCase().includes(query)))
      .map(user => toAdminUserItem(
        user,
        (memory.generations || []).filter(item => item.ownerType === "user" && item.ownerId === user.id),
        memory.creditWallets?.[creditWalletKey("user", user.id)]
      ))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, safeLimit);
  };

  const getAdminUserDetail = async ({ userId = "", limit = 80 } = {}) => {
    const memory = await readMemory();
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    const safeUserId = sanitizeText(userId, 120);
    const user = memory.users?.[safeUserId];
    if (!user) throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });

    const generations = (memory.generations || []).filter(item =>
      item.ownerType === "user" &&
      item.ownerId === safeUserId
    );
    return toAdminUserDetail(user, generations, safeLimit, memory.creditWallets?.[creditWalletKey("user", safeUserId)]);
  };

  const listAdminGenerations = async ({ search = "", limit = 80 } = {}) => {
    const memory = await readMemory();
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    const query = sanitizeText(search, 120).toLowerCase();
    return (memory.generations || [])
      .filter(item => isVisibleGenerationStatus(item.status))
      .map(item => ({
        ...item,
        ownerEmail: item.ownerType === "user" ? memory.users?.[item.ownerId]?.email || "" : ""
      }))
      .filter(item => !query || [
        item.id,
        item.ownerId,
        item.ownerEmail,
        item.status,
        item.sourceLabel,
        item.title,
        item.final?.styleName
      ].some(value => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, safeLimit)
      .map(toAdminGenerationItem);
  };

  const getAdminGenerationDetail = async ({ ownerType = "", ownerId = "", generationId = "" } = {}) => {
    const memory = await readMemory();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    const safeGenerationId = sanitizeText(generationId, 120);
    const generation = (memory.generations || []).find(item =>
      item.id === safeGenerationId &&
      item.ownerId === safeOwnerId &&
      (item.ownerType || "guest") === ownerKind
    );
    if (!generation) throw Object.assign(new Error("Generation introuvable."), { status: 404 });
    const ownerEmail = ownerKind === "user" ? memory.users?.[safeOwnerId]?.email || "" : "";
    return toAdminGenerationDetail({
      ...generation,
      ownerType: ownerKind,
      ownerId: safeOwnerId
    }, ownerEmail);
  };

  const listAdminAuditLog = async ({ search = "", limit = 80 } = {}) => {
    const memory = await readMemory();
    const safeLimit = normalizeHistoryLimit(limit, 240);
    const query = sanitizeText(search, 120).toLowerCase();
    return (memory.adminAuditLog || [])
      .map(entry => toAdminAuditEntry(entry, memory.users?.[entry.actorUserId]?.email || ""))
      .filter(entry => !query || [
        entry.id,
        entry.actorUserId,
        entry.actorEmail,
        entry.action,
        entry.targetType,
        entry.targetId,
        JSON.stringify(entry.details || {})
      ].some(value => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, safeLimit);
  };

  const setUserStatusForAdmin = async ({ actorUserId = "", userId = "", status = "active" } = {}) => {
    const safeStatus = normalizeAdminUserStatus(status);
    if (actorUserId && actorUserId === userId && safeStatus !== "active") {
      throw Object.assign(new Error("Un administrateur ne peut pas desactiver son propre compte."), { status: 400 });
    }

    const memory = await readMemory();
    const user = memory.users?.[userId];
    if (!user) throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });
    const role = roleForUser(user);
    if (role === "admin" && safeStatus !== "active") {
      throw Object.assign(new Error("Un compte administrateur ne peut pas etre desactive depuis cette interface."), { status: 400 });
    }

    const now = new Date().toISOString();
    const removedPublicGenerations = [];
    user.status = safeStatus;
    user.role = role;
    user.updatedAt = now;
    if (safeStatus !== "active") {
      memory.sessions = Object.fromEntries(
        Object.entries(memory.sessions || {}).filter(([, session]) => session.userId !== userId)
      );
    }
    if (safeStatus === "deleted") {
      memory.generations = (memory.generations || []).map((item) => {
        if (item.ownerType !== "user" || item.ownerId !== userId) return item;
        const publicGenerationId = item.publicGenerationId || item.publicGeneration?.id || "";
        if (publicGenerationId) {
          removedPublicGenerations.push({
            generationId: item.id,
            publicGenerationId,
            publicGeneration: item.publicGeneration || null
          });
        }
        if (!isVisibleGenerationStatus(item.status)) return item;
        return {
          ...item,
          status: "user_deleted",
          previousStatus: item.status || "",
          publicGenerationId,
          deletedByAdminId: actorUserId,
          deletedAt: now,
          updatedAt: now
        };
      });
    }
    await writeMemory(memory);
    await recordAdminAudit({
      actorUserId,
      action: "user_status_update",
      targetType: "user",
      targetId: userId,
      details: {
        status: safeStatus,
        removedPublicGenerationCount: removedPublicGenerations.length
      }
    });
    return {
      user: toAdminUserItem(
        user,
        (memory.generations || []).filter(item => item.ownerType === "user" && item.ownerId === user.id),
        memory.creditWallets?.[creditWalletKey("user", user.id)]
      ),
      removedPublicGenerations
    };
  };

  const hideGenerationForAdmin = async ({ actorUserId = "", ownerType = "", ownerId = "", generationId = "" } = {}) => {
    const ownerKind = ownerType === "user" ? "user" : "guest";
    const memory = await readMemory();
    const generation = (memory.generations || []).find(item =>
      item.id === generationId &&
      item.ownerId === ownerId &&
      (item.ownerType || "guest") === ownerKind
    );
    if (!generation) throw Object.assign(new Error("Generation introuvable."), { status: 404 });

    generation.previousStatus = generation.status;
    generation.status = "admin_hidden";
    generation.hiddenByAdminId = actorUserId;
    generation.hiddenAt = new Date().toISOString();
    generation.updatedAt = generation.hiddenAt;
    await writeMemory(memory);
    await recordAdminAudit({
      actorUserId,
      action: "generation_hide",
      targetType: "generation",
      targetId: generationId,
      details: { ownerType: ownerKind, ownerId, publicGenerationId: generation.publicGenerationId || "" }
    });
    return toAdminGenerationItem({
      ...generation,
      ownerEmail: ownerKind === "user" ? memory.users?.[ownerId]?.email || "" : ""
    });
  };

  const unpublishGenerationForAdmin = async ({ actorUserId = "", ownerType = "", ownerId = "", generationId = "" } = {}) => {
    const ownerKind = ownerType === "user" ? "user" : "guest";
    const memory = await readMemory();
    const generation = (memory.generations || []).find(item =>
      item.id === generationId &&
      item.ownerId === ownerId &&
      (item.ownerType || "guest") === ownerKind
    );
    if (!generation || !isVisibleGenerationStatus(generation.status)) {
      throw Object.assign(new Error("Generation introuvable."), { status: 404 });
    }

    const storedPublic = generation.publicGeneration && typeof generation.publicGeneration === "object"
      ? generation.publicGeneration
      : {};
    const publicGenerationId = sanitizeText(
      generation.publicGenerationId || storedPublic.id || storedPublic.publicGenerationId || "",
      120
    );
    if (!publicGenerationId && generation.status !== "published") {
      throw Object.assign(new Error("Cette fiche n'est pas publiee dans la vitrine."), { status: 400 });
    }

    const now = new Date().toISOString();
    const previousStatus = generation.status || "";
    const nextStatus = previousStatus === "published" ? "final_ready" : previousStatus || "final_ready";
    const publicGeneration = publicGenerationId
      ? toStoredPublicGenerationItem({ ...generation, publicGenerationId, publicGeneration: storedPublic })
      : null;
    generation.previousPublicStatus = previousStatus;
    generation.previousPublicGenerationId = publicGenerationId;
    generation.status = nextStatus;
    generation.publicGenerationId = "";
    delete generation.publicGeneration;
    generation.publicUnpublishedByAdminId = actorUserId;
    generation.publicUnpublishedAt = now;
    generation.updatedAt = now;

    await writeMemory(memory);
    await recordAdminAudit({
      actorUserId,
      action: "generation_unpublish_public",
      targetType: "generation",
      targetId: generationId,
      details: { ownerType: ownerKind, ownerId, publicGenerationId }
    });
    return {
      generation: toAdminGenerationItem({
        ...generation,
        ownerEmail: ownerKind === "user" ? memory.users?.[ownerId]?.email || "" : ""
      }),
      publicGenerationId,
      publicGeneration
    };
  };

  const storeImageAsset = async () => null;

  const getImageAsset = async () => null;

  const deleteImageAsset = async () => false;

  return {
    backend: "json",
    ensureGuest: serializeJsonOperation(ensureGuest),
    createUser: serializeJsonOperation(createUser),
    verifyUserPassword: serializeJsonOperation(verifyUserPassword),
    createSession: serializeJsonOperation(createSession),
    getSessionByToken: serializeJsonOperation(getSessionByToken),
    deleteSession: serializeJsonOperation(deleteSession),
    upsertGeneration: serializeJsonOperation(upsertGeneration),
    listGenerations: serializeJsonOperation(listGenerations),
    markPublished: serializeJsonOperation(markPublished),
    deleteGenerationForOwner: serializeJsonOperation(deleteGenerationForOwner),
    listPublishedGenerations: serializeJsonOperation(listPublishedGenerations),
    mergeGuestIntoUser: serializeJsonOperation(mergeGuestIntoUser),
    getAdminOverview: serializeJsonOperation(getAdminOverview),
    listAdminUsers: serializeJsonOperation(listAdminUsers),
    getAdminUserDetail: serializeJsonOperation(getAdminUserDetail),
    getAdminGenerationDetail: serializeJsonOperation(getAdminGenerationDetail),
    listAdminGenerations: serializeJsonOperation(listAdminGenerations),
    getCreditWallet: serializeJsonOperation(getCreditWallet),
    adjustCreditsForAdmin: serializeJsonOperation(adjustCreditsForAdmin),
    listCreditLedgerForAdmin: serializeJsonOperation(listCreditLedgerForAdmin),
    getAdminTrialPromoCode: serializeJsonOperation(getAdminTrialPromoCode),
    listAdminTrialPromoCodes: serializeJsonOperation(listAdminTrialPromoCodes),
    saveAdminTrialPromoCode: serializeJsonOperation(saveAdminTrialPromoCode),
    findActiveTrialPromoCodeByHash: serializeJsonOperation(findActiveTrialPromoCodeByHash),
    redeemTrialPromoCodeForOwner: serializeJsonOperation(redeemTrialPromoCodeForOwner),
    markTrialPromoCodeUsed: serializeJsonOperation(markTrialPromoCodeUsed),
    listAdminAuditLog: serializeJsonOperation(listAdminAuditLog),
    setUserStatusForAdmin: serializeJsonOperation(setUserStatusForAdmin),
    hideGenerationForAdmin: serializeJsonOperation(hideGenerationForAdmin),
    unpublishGenerationForAdmin: serializeJsonOperation(unpublishGenerationForAdmin),
    storeImageAsset: serializeJsonOperation(storeImageAsset),
    getImageAsset: serializeJsonOperation(getImageAsset),
    deleteImageAsset: serializeJsonOperation(deleteImageAsset),
    recordAdminAudit: serializeJsonOperation(recordAdminAudit)
  };
};

const createMysqlStore = ({ timeZone, maxGenerations }) => {
  const config = mysqlConfigFromEnv();
  let poolPromise = null;

  const getPool = async () => {
    if (!config) return null;
    if (!poolPromise) {
      poolPromise = import("mysql2/promise").then(({ default: mysql }) => {
        if (config.databaseUrl) {
          return mysql.createPool({
            uri: config.databaseUrl,
            waitForConnections: true,
            connectionLimit: 6,
            enableKeepAlive: true
          });
        }
        return mysql.createPool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          waitForConnections: true,
          connectionLimit: 6,
          enableKeepAlive: true,
          charset: "utf8mb4"
        });
      });
      const pool = await poolPromise;
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_guests (
          id VARCHAR(80) PRIMARY KEY,
          status VARCHAR(24) NOT NULL DEFAULT 'active',
          created_at DATETIME NOT NULL,
          last_seen_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_users (
          id VARCHAR(48) PRIMARY KEY,
          email VARCHAR(190) NOT NULL UNIQUE,
          password_hash VARCHAR(220) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'active',
          role VARCHAR(24) NOT NULL DEFAULT 'user',
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          last_login_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await ensureMysqlColumn(pool, "morphostyle_users", "role", "VARCHAR(24) NOT NULL DEFAULT 'user'");
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_sessions (
          token_hash CHAR(64) PRIMARY KEY,
          user_id VARCHAR(48) NOT NULL,
          created_at DATETIME NOT NULL,
          last_seen_at DATETIME NOT NULL,
          expires_at DATETIME NOT NULL,
          INDEX idx_morphostyle_sessions_user (user_id),
          CONSTRAINT fk_morphostyle_sessions_user FOREIGN KEY (user_id)
            REFERENCES morphostyle_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_generations (
          owner_type VARCHAR(16) NOT NULL,
          owner_id VARCHAR(80) NOT NULL,
          id VARCHAR(120) NOT NULL,
          status VARCHAR(40) NOT NULL,
          public_generation_id VARCHAR(120) NULL,
          data_json LONGTEXT NOT NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          PRIMARY KEY (owner_type, owner_id, id),
          INDEX idx_morphostyle_generations_owner_date (owner_type, owner_id, created_at),
          INDEX idx_morphostyle_generations_public (public_generation_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_admin_audit_log (
          id VARCHAR(48) PRIMARY KEY,
          actor_user_id VARCHAR(48) NOT NULL,
          action VARCHAR(80) NOT NULL,
          target_type VARCHAR(60) NOT NULL,
          target_id VARCHAR(160) NOT NULL,
          details_json LONGTEXT NULL,
          created_at DATETIME NOT NULL,
          INDEX idx_morphostyle_admin_audit_actor (actor_user_id, created_at),
          INDEX idx_morphostyle_admin_audit_target (target_type, target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_credit_wallets (
          owner_type VARCHAR(16) NOT NULL,
          owner_id VARCHAR(80) NOT NULL,
          balance INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          PRIMARY KEY (owner_type, owner_id),
          INDEX idx_morphostyle_credit_wallets_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_credit_ledger (
          id VARCHAR(48) PRIMARY KEY,
          owner_type VARCHAR(16) NOT NULL,
          owner_id VARCHAR(80) NOT NULL,
          actor_user_id VARCHAR(48) NULL,
          amount INT NOT NULL,
          balance_after INT NOT NULL,
          reason VARCHAR(240) NOT NULL,
          created_at DATETIME NOT NULL,
          INDEX idx_morphostyle_credit_ledger_owner (owner_type, owner_id, created_at),
          INDEX idx_morphostyle_credit_ledger_actor (actor_user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_trial_promo_codes (
          id VARCHAR(48) PRIMARY KEY,
          code VARCHAR(80) NOT NULL,
          code_hash CHAR(64) NOT NULL UNIQUE,
          uses_added INT NOT NULL DEFAULT 5,
          status VARCHAR(24) NOT NULL DEFAULT 'active',
          activation_count INT NOT NULL DEFAULT 0,
          created_by_user_id VARCHAR(48) NULL,
          updated_by_user_id VARCHAR(48) NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          last_used_at DATETIME NULL,
          INDEX idx_morphostyle_trial_promo_codes_status (status, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_trial_promo_redemptions (
          id VARCHAR(48) PRIMARY KEY,
          promo_code_id VARCHAR(48) NOT NULL,
          code_hash CHAR(64) NOT NULL,
          owner_type VARCHAR(16) NOT NULL,
          owner_id VARCHAR(80) NOT NULL,
          uses_added INT NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL,
          UNIQUE KEY uniq_morphostyle_trial_promo_redemption_owner (promo_code_id, owner_type, owner_id),
          INDEX idx_morphostyle_trial_promo_redemptions_code (code_hash, created_at),
          INDEX idx_morphostyle_trial_promo_redemptions_owner (owner_type, owner_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS morphostyle_image_assets (
          asset_path VARCHAR(260) PRIMARY KEY,
          owner_type VARCHAR(16) NULL,
          owner_id VARCHAR(80) NULL,
          content_type VARCHAR(80) NOT NULL,
          data_blob LONGBLOB NOT NULL,
          byte_size INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          INDEX idx_morphostyle_image_assets_owner (owner_type, owner_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
    return poolPromise;
  };

  const ensureGuest = async (ownerId) => {
    const pool = await getPool();
    const now = new Date().toISOString();
    await pool.execute(`
      INSERT INTO morphostyle_guests (id, status, created_at, last_seen_at)
      VALUES (?, 'active', ?, ?)
      ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), status = 'active'
    `, [ownerId, toMysqlDate(now), toMysqlDate(now)]);
    return { id: ownerId, ownerType: "guest", status: "active", lastSeenAt: now };
  };

  const createUser = async ({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) throw Object.assign(new Error("Email invalide."), { status: 400 });
    if (String(password || "").length < 8) throw Object.assign(new Error("Le mot de passe doit contenir au moins 8 caracteres."), { status: 400 });

    const pool = await getPool();
    const now = new Date().toISOString();
    const user = {
      id: createId("usr"),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      status: "active",
      role: roleForUser({ email: normalizedEmail }),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };

    try {
      await pool.execute(`
        INSERT INTO morphostyle_users (id, email, password_hash, status, role, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
      `, [user.id, user.email, user.passwordHash, user.role, toMysqlDate(now), toMysqlDate(now), toMysqlDate(now)]);
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        throw Object.assign(new Error("Un compte existe deja avec cet email."), { status: 409 });
      }
      throw error;
    }

    return publicUser(user);
  };

  const verifyUserPassword = async ({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT id, email, password_hash, status, role FROM morphostyle_users WHERE email = ? LIMIT 1
    `, [normalizedEmail]);
    const row = rows?.[0];
    if (!row || !verifyPasswordHash(password, row.password_hash)) {
      throw Object.assign(new Error("Email ou mot de passe incorrect."), { status: 401 });
    }
    assertUserCanLogin(row);
    const now = new Date().toISOString();
    const role = roleForUser(row);
    await pool.execute("UPDATE morphostyle_users SET role = ?, last_login_at = ?, updated_at = ? WHERE id = ?", [role, toMysqlDate(now), toMysqlDate(now), row.id]);
    return publicUser({ id: row.id, email: row.email, status: row.status, role });
  };

  const createSession = async (userId) => {
    const pool = await getPool();
    const [rows] = await pool.execute("SELECT id, email, status, role FROM morphostyle_users WHERE id = ? LIMIT 1", [userId]);
    const user = rows?.[0];
    if (!user) throw Object.assign(new Error("Compte introuvable."), { status: 404 });
    assertUserCanLogin(user);

    const token = `ms_${randomBytes(32).toString("hex")}`;
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
    await pool.execute(`
      INSERT INTO morphostyle_sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `, [tokenHash, userId, toMysqlDate(now.toISOString()), toMysqlDate(now.toISOString()), toMysqlDate(expiresAt.toISOString())]);

    return { token, owner: publicUser(user), expiresAt: expiresAt.toISOString() };
  };

  const getSessionByToken = async (token = "") => {
    if (!token) return null;
    const pool = await getPool();
    const tokenHash = hashToken(token);
    const [rows] = await pool.execute(`
      SELECT s.token_hash, s.expires_at, u.id, u.email, u.status
        , u.role
      FROM morphostyle_sessions s
      JOIN morphostyle_users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `, [tokenHash]);
    const row = rows?.[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.execute("DELETE FROM morphostyle_sessions WHERE token_hash = ?", [tokenHash]);
      return null;
    }
    if (String(row.status || "active") !== "active") {
      await pool.execute("DELETE FROM morphostyle_sessions WHERE token_hash = ?", [tokenHash]);
      return null;
    }
    await pool.execute("UPDATE morphostyle_sessions SET last_seen_at = ? WHERE token_hash = ?", [toMysqlDate(new Date().toISOString()), tokenHash]);
    return {
      owner: publicUser({ id: row.id, email: row.email, status: row.status, role: row.role }),
      tokenHash
    };
  };

  const deleteSession = async (token = "") => {
    if (!token) return false;
    const pool = await getPool();
    await pool.execute("DELETE FROM morphostyle_sessions WHERE token_hash = ?", [hashToken(token)]);
    return true;
  };

  const upsertGeneration = async (ownerInput, patch = {}) => {
    const owner = normalizeOwner(ownerInput);
    const pool = await getPool();
    const now = new Date().toISOString();
    const sanitizedPatch = sanitizeGenerationPatch(patch);
    const [rows] = await pool.execute(`
      SELECT data_json FROM morphostyle_generations
      WHERE owner_type = ? AND owner_id = ? AND id = ?
      LIMIT 1
    `, [owner.type, owner.id, sanitizedPatch.id]);
    const existing = rows?.[0]?.data_json ? JSON.parse(rows[0].data_json) : null;
    const merged = {
      ...(existing || {
        id: sanitizedPatch.id,
        ownerType: owner.type,
        ownerId: owner.id,
        createdAt: sanitizedPatch.createdAt || now
      }),
      ...sanitizedPatch,
      ownerType: owner.type,
      ownerId: owner.id,
      updatedAt: now
    };

    await pool.execute(`
      INSERT INTO morphostyle_generations
        (owner_type, owner_id, id, status, public_generation_id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        public_generation_id = VALUES(public_generation_id),
        data_json = VALUES(data_json),
        updated_at = VALUES(updated_at)
    `, [
      owner.type,
      owner.id,
      merged.id,
      merged.status,
      merged.publicGenerationId || null,
      JSON.stringify(merged),
      toMysqlDate(merged.createdAt),
      toMysqlDate(merged.updatedAt)
    ]);

    if (owner.type === "guest") await ensureGuest(owner.id);
    return toPublicHistoryItem(merged);
  };

  const listGenerations = async (ownerInput, { scope = "today", limit = 48 } = {}) => {
    const owner = normalizeOwner(ownerInput);
    const pool = await getPool();
    const params = [owner.type, owner.id];
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    let whereDate = "";
    if (scope === "today") {
      whereDate = "AND created_at >= ? AND created_at < ?";
      const start = todayKey(timeZone);
      const endDate = new Date(`${start}T00:00:00.000Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      params.push(`${start} 00:00:00`, toMysqlDate(endDate.toISOString()));
    }
    const [rows] = await pool.execute(`
      SELECT data_json FROM morphostyle_generations
      WHERE owner_type = ? AND owner_id = ? AND status NOT IN ('admin_hidden', 'user_deleted') ${whereDate}
      ORDER BY updated_at DESC
      LIMIT ${safeLimit}
    `, params);
    return rows
      .map(row => JSON.parse(row.data_json))
      .map(item => ({ ...item, createdAt: item.createdAt || fromMysqlDate(item.created_at) }))
      .filter(item => !isRetiredHistoryEntry(item))
      .map(toPublicHistoryItem);
  };

  const listPublishedGenerations = async ({ limit = maxGenerations } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    const [rows] = await pool.execute(`
      SELECT data_json, status, public_generation_id, created_at, updated_at
      FROM morphostyle_generations
      WHERE status NOT IN ('admin_hidden', 'user_deleted')
        AND (status = 'published' OR public_generation_id IS NOT NULL)
      ORDER BY updated_at DESC
      LIMIT ${safeLimit}
    `);

    return rows
      .map((row) => {
        const data = row.data_json ? JSON.parse(row.data_json) : {};
        return {
          ...data,
          status: row.status || data.status,
          publicGenerationId: row.public_generation_id || data.publicGenerationId || "",
          createdAt: data.createdAt || fromMysqlDate(row.created_at),
          updatedAt: data.updatedAt || fromMysqlDate(row.updated_at)
        };
      })
      .filter(item => !isRetiredHistoryEntry(item))
      .map(toStoredPublicGenerationItem)
      .filter(item => item.id && item.imageUrl)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, safeLimit);
  };

  const markPublished = async (ownerInput, generationId, publicGenerationId, publicGeneration = null) => {
    if (!generationId || !publicGenerationId) return null;
    const owner = normalizeOwner(ownerInput);
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT data_json FROM morphostyle_generations
      WHERE owner_type = ? AND owner_id = ? AND id = ?
      LIMIT 1
    `, [owner.type, owner.id, generationId]);
    const existing = rows?.[0]?.data_json ? JSON.parse(rows[0].data_json) : null;
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      status: "published",
      publicGenerationId,
      publicGeneration: publicGeneration && typeof publicGeneration === "object"
        ? { ...publicGeneration, id: publicGeneration.id || publicGenerationId }
        : existing.publicGeneration,
      publishedAt: now,
      updatedAt: now
    };
    await pool.execute(`
      UPDATE morphostyle_generations
      SET status = ?, public_generation_id = ?, data_json = ?, updated_at = ?
      WHERE owner_type = ? AND owner_id = ? AND id = ?
    `, ["published", publicGenerationId, JSON.stringify(updated), toMysqlDate(now), owner.type, owner.id, generationId]);
    return toPublicHistoryItem(updated);
  };

  const deleteGenerationForOwner = async (ownerInput, generationId = "") => {
    const owner = normalizeOwner(ownerInput);
    const criteria = normalizeGenerationDeleteCriteria(generationId);
    if (!criteria.candidates.size) {
      throw Object.assign(new Error("Fiche manquante."), { status: 400 });
    }

    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT id, data_json, status, public_generation_id
      FROM morphostyle_generations
      WHERE owner_type = ? AND owner_id = ?
      ORDER BY updated_at DESC
      LIMIT ${normalizeHistoryLimit(maxGenerations, maxGenerations)}
    `, [owner.type, owner.id]);
    const row = rows?.find(candidate => {
      const existing = candidate.data_json ? JSON.parse(candidate.data_json) : {};
      return isVisibleGenerationStatus(candidate.status) &&
        generationMatchesDeleteCriteria(existing, candidate, criteria);
    });
    if (!row || !isVisibleGenerationStatus(row.status)) {
      throw Object.assign(new Error("Fiche introuvable."), { status: 404 });
    }

    const now = new Date().toISOString();
    const existing = row.data_json ? JSON.parse(row.data_json) : {};
    const storedGenerationId = row.id || existing.id || Array.from(criteria.candidates)[0];
    const updated = {
      ...existing,
      id: existing.id || storedGenerationId,
      personalGenerationId: existing.personalGenerationId || storedGenerationId,
      ownerType: owner.type,
      ownerId: owner.id,
      status: "user_deleted",
      previousStatus: row.status || existing.status || "",
      publicGenerationId: row.public_generation_id || existing.publicGenerationId || "",
      deletedAt: now,
      updatedAt: now
    };

    await pool.execute(`
      UPDATE morphostyle_generations
      SET status = 'user_deleted', public_generation_id = NULL, data_json = ?, updated_at = ?
      WHERE owner_type = ? AND owner_id = ? AND id = ?
    `, [JSON.stringify(updated), toMysqlDate(now), owner.type, owner.id, storedGenerationId]);

    return toPublicHistoryItem(updated);
  };

  const mergeGuestIntoUser = async (guestId, userId) => {
    if (!guestId || !userId) return 0;
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT id, data_json FROM morphostyle_generations
      WHERE owner_type = 'guest' AND owner_id = ?
      ORDER BY updated_at ASC
    `, [guestId]);
    let moved = 0;
    for (const row of rows) {
      const data = JSON.parse(row.data_json);
      await upsertGeneration({ type: "user", id: userId }, {
        ...data,
        ownerType: "user",
        ownerId: userId
      });
      moved += 1;
    }
    return moved;
  };

  const recordAdminAudit = async ({ actorUserId = "", action = "", targetType = "", targetId = "", details = {} } = {}) => {
    const pool = await getPool();
    const entry = {
      id: createId("audit"),
      actorUserId,
      action: sanitizeText(action, 80),
      targetType: sanitizeText(targetType, 60),
      targetId: sanitizeText(targetId, 160),
      details,
      createdAt: new Date().toISOString()
    };
    await pool.execute(`
      INSERT INTO morphostyle_admin_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      entry.id,
      entry.actorUserId,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.details || {}),
      toMysqlDate(entry.createdAt)
    ]);
    return entry;
  };

  const getCreditWallet = async ({ ownerType = "guest", ownerId = "" } = {}) => {
    const pool = await getPool();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    if (!safeOwnerId) throw Object.assign(new Error("Proprietaire credits manquant."), { status: 400 });
    if (ownerKind === "user") {
      const [userRows] = await pool.execute("SELECT id FROM morphostyle_users WHERE id = ? LIMIT 1", [safeOwnerId]);
      if (!userRows?.[0]) throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });
    } else {
      const [guestRows] = await pool.execute("SELECT id FROM morphostyle_guests WHERE id = ? LIMIT 1", [safeOwnerId]);
      if (!guestRows?.[0]) throw Object.assign(new Error("Invite introuvable."), { status: 404 });
    }
    const now = new Date().toISOString();
    await pool.execute(`
      INSERT INTO morphostyle_credit_wallets (owner_type, owner_id, balance, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
      ON DUPLICATE KEY UPDATE updated_at = updated_at
    `, [ownerKind, safeOwnerId, toMysqlDate(now), toMysqlDate(now)]);
    const [rows] = await pool.execute(`
      SELECT owner_type, owner_id, balance, created_at, updated_at
      FROM morphostyle_credit_wallets
      WHERE owner_type = ? AND owner_id = ?
      LIMIT 1
    `, [ownerKind, safeOwnerId]);
    return toCreditWallet(ownerKind, safeOwnerId, rows?.[0] || {});
  };

  const adjustCreditsForAdmin = async ({ actorUserId = "", ownerType = "user", ownerId = "", amount = 0, reason = "" } = {}) => {
    const pool = await getPool();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    const delta = normalizeCreditAmount(amount);
    const safeReason = sanitizeText(reason || "Ajustement administrateur", 240);

    if (ownerKind === "user") {
      const [userRows] = await pool.execute("SELECT id FROM morphostyle_users WHERE id = ? LIMIT 1", [safeOwnerId]);
      if (!userRows?.[0]) throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });
    } else {
      const [guestRows] = await pool.execute("SELECT id FROM morphostyle_guests WHERE id = ? LIMIT 1", [safeOwnerId]);
      if (!guestRows?.[0]) throw Object.assign(new Error("Invite introuvable."), { status: 404 });
    }

    const now = new Date().toISOString();
    const connection = await pool.getConnection();
    let wallet;
    let entry;
    try {
      await connection.beginTransaction();
      await connection.execute(`
        INSERT INTO morphostyle_credit_wallets (owner_type, owner_id, balance, created_at, updated_at)
        VALUES (?, ?, 0, ?, ?)
        ON DUPLICATE KEY UPDATE updated_at = updated_at
      `, [ownerKind, safeOwnerId, toMysqlDate(now), toMysqlDate(now)]);

      const [walletRows] = await connection.execute(`
        SELECT owner_type, owner_id, balance, created_at, updated_at
        FROM morphostyle_credit_wallets
        WHERE owner_type = ? AND owner_id = ?
        LIMIT 1
        FOR UPDATE
      `, [ownerKind, safeOwnerId]);
      const currentWallet = walletRows?.[0] || { balance: 0, created_at: now, updated_at: now };
      const balanceAfter = Number(currentWallet.balance || 0) + delta;
      if (balanceAfter < 0) {
        throw Object.assign(new Error("Le solde credits ne peut pas devenir negatif."), { status: 400 });
      }

      await connection.execute(`
        UPDATE morphostyle_credit_wallets
        SET balance = ?, updated_at = ?
        WHERE owner_type = ? AND owner_id = ?
      `, [balanceAfter, toMysqlDate(now), ownerKind, safeOwnerId]);

      entry = {
        id: createId("credit"),
        ownerType: ownerKind,
        ownerId: safeOwnerId,
        actorUserId,
        amount: delta,
        balanceAfter,
        reason: safeReason,
        createdAt: now
      };
      await connection.execute(`
        INSERT INTO morphostyle_credit_ledger
          (id, owner_type, owner_id, actor_user_id, amount, balance_after, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [entry.id, ownerKind, safeOwnerId, actorUserId || null, delta, balanceAfter, safeReason, toMysqlDate(now)]);

      await connection.commit();
      wallet = toCreditWallet(ownerKind, safeOwnerId, {
        ...currentWallet,
        owner_type: ownerKind,
        owner_id: safeOwnerId,
        balance: balanceAfter,
        updated_at: toMysqlDate(now)
      });
    } catch (error) {
      await connection.rollback().catch(() => null);
      throw error;
    } finally {
      connection.release();
    }

    await recordAdminAudit({
      actorUserId,
      action: "credit_adjust",
      targetType: ownerKind,
      targetId: safeOwnerId,
      details: { amount: delta, balanceAfter: wallet.balance, reason: safeReason }
    });
    return { wallet, entry: toCreditLedgerEntry(entry) };
  };

  const listCreditLedgerForAdmin = async ({ ownerType = "", ownerId = "", limit = 80 } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, 240);
    const ownerKind = ownerType ? normalizeOwnerType(ownerType) : "";
    const safeOwnerId = sanitizeText(ownerId, 120);
    const params = [];
    let where = "";
    if (ownerKind && safeOwnerId) {
      where = "WHERE owner_type = ? AND owner_id = ?";
      params.push(ownerKind, safeOwnerId);
    } else if (ownerKind) {
      where = "WHERE owner_type = ?";
      params.push(ownerKind);
    }
    const [rows] = await pool.execute(`
      SELECT id, owner_type, owner_id, actor_user_id, amount, balance_after, reason, created_at
      FROM morphostyle_credit_ledger
      ${where}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `, params);
    return rows.map(toCreditLedgerEntry);
  };

  const getAdminTrialPromoCode = async ({ defaultUses = 5 } = {}) => {
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT id, code, code_hash, uses_added, status, activation_count, created_at, updated_at, last_used_at
      FROM morphostyle_trial_promo_codes
      WHERE status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const row = rows?.[0];
    if (!row) {
      return toAdminTrialPromoCode({
        id: "trial-extra",
        code: "",
        codeHash: "",
        usesAdded: normalizeTrialPromoUses(defaultUses),
        status: "inactive",
        activationCount: 0,
        createdAt: "",
        updatedAt: ""
      });
    }
    return toAdminTrialPromoCode(row);
  };

  const listAdminTrialPromoCodes = async ({ limit = 20 } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, 80);
    const [rows] = await pool.execute(`
      SELECT id, code, code_hash, uses_added, status, activation_count, created_at, updated_at, last_used_at
      FROM morphostyle_trial_promo_codes
      ORDER BY updated_at DESC
      LIMIT ${safeLimit}
    `);
    return rows.map(toAdminTrialPromoCode);
  };

  const saveAdminTrialPromoCode = async ({ actorUserId = "", code = "", usesAdded = 5, regenerate = false } = {}) => {
    const normalizedCode = normalizeTrialPromoCode(regenerate ? createTrialPromoCodeValue() : code);
    if (normalizedCode.length < 8) {
      throw Object.assign(new Error("Code bonus trop court."), { status: 400 });
    }
    const safeUses = normalizeTrialPromoUses(usesAdded);
    const codeHash = hashTrialPromoCode(normalizedCode);
    const now = new Date().toISOString();
    const pool = await getPool();
    const connection = await pool.getConnection();
    let codeId = "";
    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.execute(`
        SELECT id, created_at
        FROM morphostyle_trial_promo_codes
        WHERE code_hash = ?
        LIMIT 1
        FOR UPDATE
      `, [codeHash]);
      const existing = existingRows?.[0] || null;
      codeId = existing?.id || createId("trial_code");

      await connection.execute(`
        UPDATE morphostyle_trial_promo_codes
        SET status = 'inactive',
          updated_by_user_id = ?,
          updated_at = ?
        WHERE status = 'active' AND id <> ?
      `, [actorUserId || null, toMysqlDate(now), codeId]);

      if (existing) {
        await connection.execute(`
          UPDATE morphostyle_trial_promo_codes
          SET code = ?,
            uses_added = ?,
            status = 'active',
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `, [normalizedCode, safeUses, actorUserId || null, toMysqlDate(now), codeId]);
      } else {
        await connection.execute(`
          INSERT INTO morphostyle_trial_promo_codes
            (id, code, code_hash, uses_added, status, activation_count, created_by_user_id, updated_by_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, ?)
        `, [
          codeId,
          normalizedCode,
          codeHash,
          safeUses,
          actorUserId || null,
          actorUserId || null,
          toMysqlDate(now),
          toMysqlDate(now)
        ]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => null);
      throw error;
    } finally {
      connection.release();
    }

    await recordAdminAudit({
      actorUserId,
      action: regenerate ? "trial_code_regenerate" : "trial_code_update",
      targetType: "trial_code",
      targetId: codeId,
      details: { usesAdded: safeUses, codeSuffix: normalizedCode.slice(-4) }
    });

    return getAdminTrialPromoCode({ defaultUses: safeUses });
  };

  const findActiveTrialPromoCodeByHash = async (codeHash = "") => {
    const safeHash = sanitizeText(codeHash, 80).toLowerCase();
    if (!safeHash) return null;
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT id, code, code_hash, uses_added, status, activation_count, created_at, updated_at, last_used_at
      FROM morphostyle_trial_promo_codes
      WHERE code_hash = ? AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [safeHash]);
    return rows?.[0] ? toAdminTrialPromoCode(rows[0]) : null;
  };

  const redeemTrialPromoCodeForOwner = async ({ codeHash = "", ownerType = "guest", ownerId = "" } = {}) => {
    const safeHash = sanitizeText(codeHash, 80).toLowerCase();
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    if (!safeHash || !safeOwnerId) return null;

    const pool = await getPool();
    const connection = await pool.getConnection();
    const now = new Date().toISOString();
    try {
      await connection.beginTransaction();
      const [codeRows] = await connection.execute(`
        SELECT id, code, code_hash, uses_added, status, activation_count, created_at, updated_at, last_used_at
        FROM morphostyle_trial_promo_codes
        WHERE code_hash = ? AND status = 'active'
        LIMIT 1
        FOR UPDATE
      `, [safeHash]);
      const row = codeRows?.[0] || null;
      if (!row) {
        await connection.commit();
        return null;
      }

      const trialCode = toAdminTrialPromoCode(row);
      const [insertResult] = await connection.execute(`
        INSERT IGNORE INTO morphostyle_trial_promo_redemptions
          (id, promo_code_id, code_hash, owner_type, owner_id, uses_added, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        createId("trial_promo_use"),
        trialCode.id,
        safeHash,
        ownerKind,
        safeOwnerId,
        trialCode.usesAdded,
        toMysqlDate(now)
      ]);
      const alreadyRedeemed = Number(insertResult?.affectedRows || 0) === 0;

      if (!alreadyRedeemed) {
        await connection.execute(`
          UPDATE morphostyle_trial_promo_codes
          SET activation_count = activation_count + 1,
            last_used_at = ?,
            updated_at = ?
          WHERE id = ?
        `, [toMysqlDate(now), toMysqlDate(now), trialCode.id]);
      }

      const [updatedRows] = await connection.execute(`
        SELECT id, code, code_hash, uses_added, status, activation_count, created_at, updated_at, last_used_at
        FROM morphostyle_trial_promo_codes
        WHERE id = ?
        LIMIT 1
      `, [trialCode.id]);
      await connection.commit();
      return {
        trialCode: updatedRows?.[0] ? toAdminTrialPromoCode(updatedRows[0]) : trialCode,
        alreadyRedeemed
      };
    } catch (error) {
      await connection.rollback().catch(() => null);
      throw error;
    } finally {
      connection.release();
    }
  };

  const markTrialPromoCodeUsed = async (codeHash = "") => {
    const safeHash = sanitizeText(codeHash, 80).toLowerCase();
    if (!safeHash) return null;
    const pool = await getPool();
    const now = new Date().toISOString();
    await pool.execute(`
      UPDATE morphostyle_trial_promo_codes
      SET activation_count = activation_count + 1,
        last_used_at = ?,
        updated_at = ?
      WHERE code_hash = ? AND status = 'active'
    `, [toMysqlDate(now), toMysqlDate(now), safeHash]);
    const [rows] = await pool.execute(`
      SELECT id, code, code_hash, uses_added, status, activation_count, created_at, updated_at, last_used_at
      FROM morphostyle_trial_promo_codes
      WHERE code_hash = ?
      LIMIT 1
    `, [safeHash]);
    return rows?.[0] ? toAdminTrialPromoCode(rows[0]) : null;
  };

  const getAdminOverview = async () => {
    const pool = await getPool();
    const today = todayKey(timeZone);
    const tomorrow = new Date(`${today}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const [userRows] = await pool.execute(`
      SELECT
        COUNT(*) AS users_total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS users_active,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS users_suspended,
        SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS users_deleted,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins_total
      FROM morphostyle_users
    `);
    const [guestRows] = await pool.execute("SELECT COUNT(*) AS guests_total FROM morphostyle_guests");
    const [generationRows] = await pool.execute(`
      SELECT
        COUNT(CASE WHEN status NOT IN ('admin_hidden', 'user_deleted') THEN 1 END) AS generations_total,
        SUM(CASE WHEN status NOT IN ('admin_hidden', 'user_deleted') AND created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS generations_today,
        SUM(CASE WHEN status NOT IN ('admin_hidden', 'user_deleted') AND (status = 'published' OR public_generation_id IS NOT NULL) THEN 1 ELSE 0 END) AS generations_published,
        SUM(CASE WHEN status IN ('admin_hidden', 'user_deleted') THEN 1 ELSE 0 END) AS generations_hidden
      FROM morphostyle_generations
    `, [`${today} 00:00:00`, toMysqlDate(tomorrow.toISOString())]);
    const [creditRows] = await pool.execute("SELECT COALESCE(SUM(balance), 0) AS credit_balance_total FROM morphostyle_credit_wallets");

    const users = userRows?.[0] || {};
    const guests = guestRows?.[0] || {};
    const generations = generationRows?.[0] || {};
    const credits = creditRows?.[0] || {};
    return {
      usersTotal: Number(users.users_total || 0),
      usersActive: Number(users.users_active || 0),
      usersSuspended: Number(users.users_suspended || 0),
      usersDeleted: Number(users.users_deleted || 0),
      adminsTotal: Number(users.admins_total || 0),
      guestsTotal: Number(guests.guests_total || 0),
      generationsTotal: Number(generations.generations_total || 0),
      generationsToday: Number(generations.generations_today || 0),
      generationsPublished: Number(generations.generations_published || 0),
      generationsHidden: Number(generations.generations_hidden || 0),
      creditBalanceTotal: Number(credits.credit_balance_total || 0)
    };
  };

  const listAdminUsers = async ({ search = "", limit = 80 } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, 240);
    const query = sanitizeText(search, 120);
    const params = [];
    let where = "";
    if (query) {
      where = "WHERE u.id LIKE ? OR u.email LIKE ? OR u.status LIKE ? OR u.role LIKE ?";
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const [rows] = await pool.execute(`
      SELECT
        u.id,
        u.email,
        u.status,
        u.role,
        u.created_at,
        u.updated_at,
        u.last_login_at,
        COUNT(g.id) AS generation_count,
        SUM(CASE WHEN g.status = 'published' OR g.public_generation_id IS NOT NULL THEN 1 ELSE 0 END) AS published_count,
        MAX(g.updated_at) AS last_generation_at,
        COALESCE(w.balance, 0) AS credit_balance
      FROM morphostyle_users u
      LEFT JOIN morphostyle_generations g
        ON g.owner_type = 'user'
        AND g.owner_id = u.id
        AND g.status NOT IN ('admin_hidden', 'user_deleted')
      LEFT JOIN morphostyle_credit_wallets w
        ON w.owner_type = 'user'
        AND w.owner_id = u.id
      ${where}
      GROUP BY u.id, u.email, u.status, u.role, u.created_at, u.updated_at, u.last_login_at, w.balance
      ORDER BY u.updated_at DESC
      LIMIT ${safeLimit}
    `, params);

    return rows.map(row => ({
      id: row.id,
      email: row.email,
      status: row.status || "active",
      role: roleForUser(row),
      createdAt: fromMysqlDate(row.created_at),
      updatedAt: fromMysqlDate(row.updated_at),
      lastLoginAt: row.last_login_at ? fromMysqlDate(row.last_login_at) : "",
      generationCount: Number(row.generation_count || 0),
      publishedCount: Number(row.published_count || 0),
      creditBalance: Number(row.credit_balance || 0),
      lastGenerationAt: row.last_generation_at ? fromMysqlDate(row.last_generation_at) : ""
    }));
  };

  const getAdminUserDetail = async ({ userId = "", limit = 80 } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    const safeUserId = sanitizeText(userId, 120);
    const [userRows] = await pool.execute(`
      SELECT id, email, status, role, created_at, updated_at, last_login_at
      FROM morphostyle_users
      WHERE id = ?
      LIMIT 1
    `, [safeUserId]);
    const row = userRows?.[0];
    if (!row) throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });

    const [countRows] = await pool.execute(`
      SELECT
        COUNT(CASE WHEN status NOT IN ('admin_hidden', 'user_deleted') THEN 1 END) AS generation_count,
        SUM(CASE WHEN status NOT IN ('admin_hidden', 'user_deleted') AND (status = 'published' OR public_generation_id IS NOT NULL) THEN 1 ELSE 0 END) AS published_count,
        SUM(CASE WHEN status IN ('admin_hidden', 'user_deleted') THEN 1 ELSE 0 END) AS hidden_count,
        MAX(CASE WHEN status NOT IN ('admin_hidden', 'user_deleted') THEN updated_at ELSE NULL END) AS last_generation_at
      FROM morphostyle_generations
      WHERE owner_type = 'user' AND owner_id = ?
    `, [safeUserId]);
    const wallet = await getCreditWallet({ ownerType: "user", ownerId: safeUserId });

    const [generationRows] = await pool.execute(`
      SELECT
        owner_type,
        owner_id,
        id,
        status,
        public_generation_id,
        data_json,
        created_at,
        updated_at
      FROM morphostyle_generations
      WHERE owner_type = 'user'
        AND owner_id = ?
        AND status NOT IN ('admin_hidden', 'user_deleted')
      ORDER BY updated_at DESC
      LIMIT ${safeLimit}
    `, [safeUserId]);

    const counts = countRows?.[0] || {};
    return {
      id: row.id,
      email: row.email,
      status: row.status || "active",
      role: roleForUser(row),
      createdAt: fromMysqlDate(row.created_at),
      updatedAt: fromMysqlDate(row.updated_at),
      lastLoginAt: row.last_login_at ? fromMysqlDate(row.last_login_at) : "",
      generationCount: Number(counts.generation_count || 0),
      publishedCount: Number(counts.published_count || 0),
      creditBalance: wallet.balance,
      hiddenCount: Number(counts.hidden_count || 0),
      lastGenerationAt: counts.last_generation_at ? fromMysqlDate(counts.last_generation_at) : "",
      generations: generationRows.map((generationRow) => {
        const data = generationRow.data_json ? JSON.parse(generationRow.data_json) : {};
        return toAdminGenerationItem({
          ...data,
          id: data.id || generationRow.id,
          ownerType: generationRow.owner_type,
          ownerId: generationRow.owner_id,
          ownerEmail: row.email || "",
          status: generationRow.status || data.status,
          publicGenerationId: generationRow.public_generation_id || data.publicGenerationId || "",
          createdAt: data.createdAt || fromMysqlDate(generationRow.created_at),
          updatedAt: data.updatedAt || fromMysqlDate(generationRow.updated_at)
        });
      })
    };
  };

  const listAdminGenerations = async ({ search = "", limit = 80 } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, maxGenerations);
    const query = sanitizeText(search, 120);
    const params = [];
    let where = "WHERE g.status NOT IN ('admin_hidden', 'user_deleted')";
    if (query) {
      where += `
        AND (
          g.id LIKE ?
          OR g.owner_id LIKE ?
          OR g.status LIKE ?
          OR u.email LIKE ?
        )
      `;
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const [rows] = await pool.execute(`
      SELECT
        g.owner_type,
        g.owner_id,
        g.id,
        g.status,
        g.public_generation_id,
        g.data_json,
        g.created_at,
        g.updated_at,
        u.email AS owner_email
      FROM morphostyle_generations g
      LEFT JOIN morphostyle_users u
        ON g.owner_type = 'user'
        AND g.owner_id = u.id
      ${where}
      ORDER BY g.updated_at DESC
      LIMIT ${safeLimit}
    `, params);

    return rows.map((row) => {
      const data = row.data_json ? JSON.parse(row.data_json) : {};
      return toAdminGenerationItem({
        ...data,
        id: data.id || row.id,
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        ownerEmail: row.owner_email || "",
        status: row.status || data.status,
        publicGenerationId: row.public_generation_id || data.publicGenerationId || "",
        createdAt: data.createdAt || fromMysqlDate(row.created_at),
        updatedAt: data.updatedAt || fromMysqlDate(row.updated_at)
      });
    });
  };

  const getAdminGenerationDetail = async ({ ownerType = "", ownerId = "", generationId = "" } = {}) => {
    const ownerKind = normalizeOwnerType(ownerType);
    const safeOwnerId = sanitizeText(ownerId, 120);
    const safeGenerationId = sanitizeText(generationId, 120);
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT
        g.owner_type,
        g.owner_id,
        g.id,
        g.status,
        g.public_generation_id,
        g.data_json,
        g.created_at,
        g.updated_at,
        u.email AS owner_email
      FROM morphostyle_generations g
      LEFT JOIN morphostyle_users u
        ON g.owner_type = 'user'
        AND g.owner_id = u.id
      WHERE g.owner_type = ? AND g.owner_id = ? AND g.id = ?
      LIMIT 1
    `, [ownerKind, safeOwnerId, safeGenerationId]);
    const row = rows?.[0];
    if (!row) throw Object.assign(new Error("Generation introuvable."), { status: 404 });
    const data = row.data_json ? JSON.parse(row.data_json) : {};
    return toAdminGenerationDetail({
      ...data,
      id: data.id || row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      status: row.status || data.status,
      publicGenerationId: row.public_generation_id || data.publicGenerationId || "",
      createdAt: data.createdAt || fromMysqlDate(row.created_at),
      updatedAt: data.updatedAt || fromMysqlDate(row.updated_at)
    }, row.owner_email || "");
  };

  const listAdminAuditLog = async ({ search = "", limit = 80 } = {}) => {
    const pool = await getPool();
    const safeLimit = normalizeHistoryLimit(limit, 240);
    const query = sanitizeText(search, 120);
    const params = [];
    let where = "";
    if (query) {
      where = `
        WHERE a.action LIKE ?
          OR a.target_type LIKE ?
          OR a.target_id LIKE ?
          OR a.details_json LIKE ?
          OR u.email LIKE ?
      `;
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    const [rows] = await pool.execute(`
      SELECT
        a.id,
        a.actor_user_id,
        a.action,
        a.target_type,
        a.target_id,
        a.details_json,
        a.created_at,
        u.email AS actor_email
      FROM morphostyle_admin_audit_log a
      LEFT JOIN morphostyle_users u ON u.id = a.actor_user_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ${safeLimit}
    `, params);

    return rows.map(row => toAdminAuditEntry({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email || "",
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details_json ? JSON.parse(row.details_json) : {},
      createdAt: fromMysqlDate(row.created_at)
    }));
  };

  const setUserStatusForAdmin = async ({ actorUserId = "", userId = "", status = "active" } = {}) => {
    const safeStatus = normalizeAdminUserStatus(status);
    if (actorUserId && actorUserId === userId && safeStatus !== "active") {
      throw Object.assign(new Error("Un administrateur ne peut pas desactiver son propre compte."), { status: 400 });
    }

    const pool = await getPool();
    const [rows] = await pool.execute("SELECT id, email, status, role, created_at, updated_at, last_login_at FROM morphostyle_users WHERE id = ? LIMIT 1", [userId]);
    const row = rows?.[0];
    if (!row) throw Object.assign(new Error("Utilisateur introuvable."), { status: 404 });
    const role = roleForUser(row);
    if (role === "admin" && safeStatus !== "active") {
      throw Object.assign(new Error("Un compte administrateur ne peut pas etre desactive depuis cette interface."), { status: 400 });
    }

    const now = new Date().toISOString();
    await pool.execute("UPDATE morphostyle_users SET status = ?, role = ?, updated_at = ? WHERE id = ?", [safeStatus, role, toMysqlDate(now), userId]);
    if (safeStatus !== "active") {
      await pool.execute("DELETE FROM morphostyle_sessions WHERE user_id = ?", [userId]);
    }

    const removedPublicGenerations = [];
    if (safeStatus === "deleted") {
      const [generationRows] = await pool.execute(`
        SELECT id, status, public_generation_id, data_json
        FROM morphostyle_generations
        WHERE owner_type = 'user' AND owner_id = ?
      `, [userId]);
      for (const generationRow of generationRows || []) {
        const existing = generationRow.data_json ? JSON.parse(generationRow.data_json) : {};
        const publicGenerationId = generationRow.public_generation_id || existing.publicGenerationId || existing.publicGeneration?.id || "";
        if (publicGenerationId) {
          removedPublicGenerations.push({
            generationId: generationRow.id,
            publicGenerationId,
            publicGeneration: existing.publicGeneration || null
          });
        }
        if (!isVisibleGenerationStatus(generationRow.status)) continue;
        const updated = {
          ...existing,
          id: existing.id || generationRow.id,
          personalGenerationId: existing.personalGenerationId || generationRow.id,
          ownerType: "user",
          ownerId: userId,
          status: "user_deleted",
          previousStatus: generationRow.status || existing.status || "",
          publicGenerationId,
          deletedByAdminId: actorUserId,
          deletedAt: now,
          updatedAt: now
        };
        await pool.execute(`
          UPDATE morphostyle_generations
          SET status = 'user_deleted', public_generation_id = NULL, data_json = ?, updated_at = ?
          WHERE owner_type = 'user' AND owner_id = ? AND id = ?
        `, [JSON.stringify(updated), toMysqlDate(now), userId, generationRow.id]);
      }
    }

    await recordAdminAudit({
      actorUserId,
      action: "user_status_update",
      targetType: "user",
      targetId: userId,
      details: {
        status: safeStatus,
        removedPublicGenerationCount: removedPublicGenerations.length
      }
    });

    let user;
    try {
      user = await getAdminUserDetail({ userId, limit: 80 });
    } catch {
      user = {
        id: row.id,
        email: row.email,
        status: safeStatus,
        role,
        createdAt: fromMysqlDate(row.created_at),
        updatedAt: now,
        lastLoginAt: row.last_login_at ? fromMysqlDate(row.last_login_at) : "",
        generationCount: 0,
        publishedCount: 0,
        creditBalance: 0,
        lastGenerationAt: ""
      };
    }

    return {
      user,
      removedPublicGenerations
    };
  };

  const hideGenerationForAdmin = async ({ actorUserId = "", ownerType = "", ownerId = "", generationId = "" } = {}) => {
    const ownerKind = ownerType === "user" ? "user" : "guest";
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT g.data_json, g.status, g.public_generation_id, u.email AS owner_email
      FROM morphostyle_generations g
      LEFT JOIN morphostyle_users u
        ON g.owner_type = 'user'
        AND g.owner_id = u.id
      WHERE g.owner_type = ? AND g.owner_id = ? AND g.id = ?
      LIMIT 1
    `, [ownerKind, ownerId, generationId]);
    const row = rows?.[0];
    if (!row) throw Object.assign(new Error("Generation introuvable."), { status: 404 });

    const now = new Date().toISOString();
    const existing = row.data_json ? JSON.parse(row.data_json) : {};
    const updated = {
      ...existing,
      id: existing.id || generationId,
      ownerType: ownerKind,
      ownerId,
      status: "admin_hidden",
      previousStatus: row.status || existing.status || "",
      publicGenerationId: row.public_generation_id || existing.publicGenerationId || "",
      hiddenByAdminId: actorUserId,
      hiddenAt: now,
      updatedAt: now
    };
    await pool.execute(`
      UPDATE morphostyle_generations
      SET status = 'admin_hidden', data_json = ?, updated_at = ?
      WHERE owner_type = ? AND owner_id = ? AND id = ?
    `, [JSON.stringify(updated), toMysqlDate(now), ownerKind, ownerId, generationId]);
    await recordAdminAudit({
      actorUserId,
      action: "generation_hide",
      targetType: "generation",
      targetId: generationId,
      details: { ownerType: ownerKind, ownerId, publicGenerationId: updated.publicGenerationId }
    });
    return toAdminGenerationItem({
      ...updated,
      ownerEmail: row.owner_email || ""
    });
  };

  const unpublishGenerationForAdmin = async ({ actorUserId = "", ownerType = "", ownerId = "", generationId = "" } = {}) => {
    const ownerKind = ownerType === "user" ? "user" : "guest";
    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT g.data_json, g.status, g.public_generation_id, u.email AS owner_email
      FROM morphostyle_generations g
      LEFT JOIN morphostyle_users u
        ON g.owner_type = 'user'
        AND g.owner_id = u.id
      WHERE g.owner_type = ? AND g.owner_id = ? AND g.id = ?
      LIMIT 1
    `, [ownerKind, ownerId, generationId]);
    const row = rows?.[0];
    if (!row || !isVisibleGenerationStatus(row.status)) {
      throw Object.assign(new Error("Generation introuvable."), { status: 404 });
    }

    const existing = row.data_json ? JSON.parse(row.data_json) : {};
    const storedPublic = existing.publicGeneration && typeof existing.publicGeneration === "object"
      ? existing.publicGeneration
      : {};
    const publicGenerationId = sanitizeText(
      row.public_generation_id || existing.publicGenerationId || storedPublic.id || storedPublic.publicGenerationId || "",
      120
    );
    if (!publicGenerationId && row.status !== "published") {
      throw Object.assign(new Error("Cette fiche n'est pas publiee dans la vitrine."), { status: 400 });
    }

    const now = new Date().toISOString();
    const previousStatus = row.status || existing.status || "";
    const nextStatus = previousStatus === "published" ? "final_ready" : previousStatus || "final_ready";
    const publicGeneration = publicGenerationId
      ? toStoredPublicGenerationItem({ ...existing, publicGenerationId, publicGeneration: storedPublic })
      : null;
    const updated = {
      ...existing,
      id: existing.id || generationId,
      ownerType: ownerKind,
      ownerId,
      status: nextStatus,
      previousPublicStatus: previousStatus,
      previousPublicGenerationId: publicGenerationId,
      publicGenerationId: "",
      publicUnpublishedByAdminId: actorUserId,
      publicUnpublishedAt: now,
      updatedAt: now
    };
    delete updated.publicGeneration;

    await pool.execute(`
      UPDATE morphostyle_generations
      SET status = ?, public_generation_id = NULL, data_json = ?, updated_at = ?
      WHERE owner_type = ? AND owner_id = ? AND id = ?
    `, [nextStatus, JSON.stringify(updated), toMysqlDate(now), ownerKind, ownerId, generationId]);
    await recordAdminAudit({
      actorUserId,
      action: "generation_unpublish_public",
      targetType: "generation",
      targetId: generationId,
      details: { ownerType: ownerKind, ownerId, publicGenerationId }
    });
    return {
      generation: toAdminGenerationItem({
        ...updated,
        ownerEmail: row.owner_email || ""
      }),
      publicGenerationId,
      publicGeneration
    };
  };

  const storeImageAsset = async ({ assetPath = "", ownerType = "", ownerId = "", contentType = "image/jpeg", buffer } = {}) => {
    const safeAssetPath = sanitizeAssetPath(assetPath);
    if (!safeAssetPath || !buffer) return null;

    const dataBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (!dataBuffer.length) return null;

    const ownerKind = ownerType === "user" ? "user" : ownerType === "guest" ? "guest" : null;
    const safeOwnerId = ownerKind ? sanitizeText(ownerId, 80) : null;
    const safeContentType = sanitizeAssetContentType(contentType);
    const now = new Date().toISOString();
    const pool = await getPool();

    await pool.execute(`
      INSERT INTO morphostyle_image_assets
        (asset_path, owner_type, owner_id, content_type, data_blob, byte_size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        owner_type = VALUES(owner_type),
        owner_id = VALUES(owner_id),
        content_type = VALUES(content_type),
        data_blob = VALUES(data_blob),
        byte_size = VALUES(byte_size),
        updated_at = VALUES(updated_at)
    `, [
      safeAssetPath,
      ownerKind,
      safeOwnerId,
      safeContentType,
      dataBuffer,
      dataBuffer.length,
      toMysqlDate(now),
      toMysqlDate(now)
    ]);

    return {
      assetPath: safeAssetPath,
      ownerType: ownerKind,
      ownerId: safeOwnerId,
      contentType: safeContentType,
      byteSize: dataBuffer.length,
      updatedAt: now
    };
  };

  const getImageAsset = async (assetPath = "") => {
    const safeAssetPath = sanitizeAssetPath(assetPath);
    if (!safeAssetPath) return null;

    const pool = await getPool();
    const [rows] = await pool.execute(`
      SELECT asset_path, owner_type, owner_id, content_type, data_blob, byte_size, updated_at
      FROM morphostyle_image_assets
      WHERE asset_path = ?
      LIMIT 1
    `, [safeAssetPath]);
    const row = rows?.[0];
    if (!row?.data_blob) return null;

    const buffer = Buffer.isBuffer(row.data_blob)
      ? row.data_blob
      : Buffer.from(row.data_blob);

    return {
      assetPath: row.asset_path,
      ownerType: row.owner_type || "",
      ownerId: row.owner_id || "",
      contentType: sanitizeAssetContentType(row.content_type),
      buffer,
      byteSize: Number(row.byte_size || buffer.length || 0),
      updatedAt: fromMysqlDate(row.updated_at)
    };
  };

  const deleteImageAsset = async (assetPath = "") => {
    const safeAssetPath = sanitizeAssetPath(assetPath);
    if (!safeAssetPath) return false;

    const pool = await getPool();
    const [result] = await pool.execute("DELETE FROM morphostyle_image_assets WHERE asset_path = ?", [safeAssetPath]);
    return Number(result?.affectedRows || 0) > 0;
  };

  return {
    backend: "mysql",
    ensureGuest,
    createUser,
    verifyUserPassword,
    createSession,
    getSessionByToken,
    deleteSession,
    upsertGeneration,
    listGenerations,
    markPublished,
    deleteGenerationForOwner,
    listPublishedGenerations,
    mergeGuestIntoUser,
    getAdminOverview,
    listAdminUsers,
    getAdminUserDetail,
    getAdminGenerationDetail,
    listAdminGenerations,
    getCreditWallet,
    adjustCreditsForAdmin,
    listCreditLedgerForAdmin,
    getAdminTrialPromoCode,
    listAdminTrialPromoCodes,
    saveAdminTrialPromoCode,
    findActiveTrialPromoCodeByHash,
    redeemTrialPromoCodeForOwner,
    markTrialPromoCodeUsed,
    listAdminAuditLog,
    setUserStatusForAdmin,
    hideGenerationForAdmin,
    unpublishGenerationForAdmin,
    storeImageAsset,
    getImageAsset,
    deleteImageAsset,
    recordAdminAudit
  };
};

export const createUserMemoryStore = ({
  dataDir,
  fileName = "user-memory.json",
  timeZone = "Europe/Zurich",
  maxGenerations = 240,
  requireMysql = isMysqlRequiredByEnv()
}) => {
  const jsonStore = createJsonStore({ dataDir, fileName, timeZone, maxGenerations });
  const mysqlConfig = mysqlConfigFromEnv();
  const mysqlStore = mysqlConfig ? createMysqlStore({ timeZone, maxGenerations }) : null;
  let mysqlFailed = false;
  let mysqlFailureMessage = mysqlConfig ? "" : "Configuration MySQL manquante.";
  const mysqlRequired = Boolean(requireMysql);
  const softAssetMethods = new Set(["storeImageAsset", "getImageAsset", "deleteImageAsset"]);

  const mysqlUnavailableError = (method, error) => {
    const detail = error?.message || mysqlFailureMessage || "MySQL indisponible.";
    return Object.assign(
      new Error(`Stockage MySQL obligatoire indisponible pour ${method}: ${detail}`),
      { status: 503, code: "MYSQL_REQUIRED" }
    );
  };

  const withStore = async (method, args = []) => {
    if (mysqlStore && !mysqlFailed) {
      try {
        return await mysqlStore[method](...args);
      } catch (error) {
        if (error?.status && error.status < 500) throw error;
        if (softAssetMethods.has(method)) {
          mysqlFailureMessage = error?.message || String(error || "");
          if (mysqlRequired) throw mysqlUnavailableError(method, error);
          console.error(`MorphoStyle MySQL indisponible, fallback fichier pour ${method}:`, error?.message || error);
          return jsonStore[method](...args);
        }
        mysqlFailed = true;
        mysqlFailureMessage = error?.message || String(error || "");
        if (mysqlRequired) throw mysqlUnavailableError(method, error);
        console.error(`MorphoStyle MySQL indisponible, fallback fichier pour ${method}:`, error?.message || error);
      }
    }
    if (mysqlRequired) throw mysqlUnavailableError(method);
    return jsonStore[method](...args);
  };

  return {
    get backend() {
      if (mysqlStore && !mysqlFailed) return "mysql";
      return mysqlRequired ? "mysql_unavailable" : "json";
    },
    get mysqlRequired() {
      return mysqlRequired;
    },
    get mysqlConfigured() {
      return Boolean(mysqlConfig);
    },
    get mysqlAvailable() {
      return Boolean(mysqlStore && !mysqlFailed);
    },
    get mysqlError() {
      return mysqlFailureMessage;
    },
    get jsonFallbackEnabled() {
      return !mysqlRequired;
    },
    ensureGuest: (...args) => withStore("ensureGuest", args),
    createUser: (...args) => withStore("createUser", args),
    verifyUserPassword: (...args) => withStore("verifyUserPassword", args),
    createSession: (...args) => withStore("createSession", args),
    getSessionByToken: (...args) => withStore("getSessionByToken", args),
    deleteSession: (...args) => withStore("deleteSession", args),
    upsertGeneration: (...args) => withStore("upsertGeneration", args),
    listGenerations: (...args) => withStore("listGenerations", args),
    markPublished: (...args) => withStore("markPublished", args),
    deleteGenerationForOwner: (...args) => withStore("deleteGenerationForOwner", args),
    listPublishedGenerations: (...args) => withStore("listPublishedGenerations", args),
    mergeGuestIntoUser: (...args) => withStore("mergeGuestIntoUser", args),
    getAdminOverview: (...args) => withStore("getAdminOverview", args),
    listAdminUsers: (...args) => withStore("listAdminUsers", args),
    getAdminUserDetail: (...args) => withStore("getAdminUserDetail", args),
    getAdminGenerationDetail: (...args) => withStore("getAdminGenerationDetail", args),
    listAdminGenerations: (...args) => withStore("listAdminGenerations", args),
    getCreditWallet: (...args) => withStore("getCreditWallet", args),
    adjustCreditsForAdmin: (...args) => withStore("adjustCreditsForAdmin", args),
    listCreditLedgerForAdmin: (...args) => withStore("listCreditLedgerForAdmin", args),
    getAdminTrialPromoCode: (...args) => withStore("getAdminTrialPromoCode", args),
    listAdminTrialPromoCodes: (...args) => withStore("listAdminTrialPromoCodes", args),
    saveAdminTrialPromoCode: (...args) => withStore("saveAdminTrialPromoCode", args),
    findActiveTrialPromoCodeByHash: (...args) => withStore("findActiveTrialPromoCodeByHash", args),
    redeemTrialPromoCodeForOwner: (...args) => withStore("redeemTrialPromoCodeForOwner", args),
    markTrialPromoCodeUsed: (...args) => withStore("markTrialPromoCodeUsed", args),
    listAdminAuditLog: (...args) => withStore("listAdminAuditLog", args),
    setUserStatusForAdmin: (...args) => withStore("setUserStatusForAdmin", args),
    hideGenerationForAdmin: (...args) => withStore("hideGenerationForAdmin", args),
    unpublishGenerationForAdmin: (...args) => withStore("unpublishGenerationForAdmin", args),
    storeImageAsset: (...args) => withStore("storeImageAsset", args),
    getImageAsset: (...args) => withStore("getImageAsset", args),
    deleteImageAsset: (...args) => withStore("deleteImageAsset", args),
    recordAdminAudit: (...args) => withStore("recordAdminAudit", args)
  };
};
