import { AnalysisResult, ConsultationData, AdditionalViews, Proposal, PublicGeneration, StyleRecommendation } from "../types";

const API_FETCH_TIMEOUT_MS = 30000;

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = API_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture image impossible."));
    reader.readAsDataURL(blob);
  });

const imageInputToDataUrl = async (source: string) => {
  if (source.startsWith("data:image/")) {
    return { dataUrl: source, sourceAssetUrl: "" };
  }

  const response = await fetchWithTimeout(source, {}, 45000);
  if (!response.ok) {
    throw new Error("Photo d'origine indisponible. Actualisez l'historique puis reessayez.");
  }

  return {
    dataUrl: await blobToDataUrl(await response.blob()),
    sourceAssetUrl: source
  };
};

const ALIBABA_UPLOAD_RECOMMENDATIONS_ENDPOINT = process.env.ALIBABA_UPLOAD_RECOMMENDATIONS_ENDPOINT || "/api/alibaba-upload-recommendations";
const OPENAI_UPLOAD_RECOMMENDATIONS_ENDPOINT = process.env.OPENAI_UPLOAD_RECOMMENDATIONS_ENDPOINT || "/api/openai-upload-recommendations";
const OPENAI_SELECTED_RESULT_ENDPOINT = process.env.OPENAI_SELECTED_RESULT_ENDPOINT || "/api/openai-selected-result";
const OPENAI_ACTIVATE_TRIAL_CODE_ENDPOINT = process.env.OPENAI_ACTIVATE_TRIAL_CODE_ENDPOINT || "/api/openai-activate-trial-code";
const PUBLIC_GENERATIONS_ENDPOINT = process.env.PUBLIC_GENERATIONS_ENDPOINT || "/api/public-generations";
const GUEST_SESSION_ENDPOINT = process.env.GUEST_SESSION_ENDPOINT || "/api/session/guest";
const ME_SESSION_ENDPOINT = process.env.ME_SESSION_ENDPOINT || "/api/me";
const PERSONAL_GENERATIONS_ENDPOINT = process.env.PERSONAL_GENERATIONS_ENDPOINT || "/api/me/generations";
const PERSONAL_GENERATION_DELETE_ENDPOINT = process.env.PERSONAL_GENERATION_DELETE_ENDPOINT || "/api/me/generations/delete";
const AUTH_REGISTER_ENDPOINT = process.env.AUTH_REGISTER_ENDPOINT || "/api/auth/register";
const AUTH_LOGIN_ENDPOINT = process.env.AUTH_LOGIN_ENDPOINT || "/api/auth/login";
const AUTH_LOGOUT_ENDPOINT = process.env.AUTH_LOGOUT_ENDPOINT || "/api/auth/logout";
const ADMIN_DASHBOARD_ENDPOINT = process.env.ADMIN_DASHBOARD_ENDPOINT || "/api/admin/dashboard";
const ADMIN_USERS_ENDPOINT = process.env.ADMIN_USERS_ENDPOINT || "/api/admin/users";
const ADMIN_USER_DETAIL_ENDPOINT = process.env.ADMIN_USER_DETAIL_ENDPOINT || "/api/admin/users/detail";
const ADMIN_GENERATIONS_ENDPOINT = process.env.ADMIN_GENERATIONS_ENDPOINT || "/api/admin/generations";
const ADMIN_GENERATION_DETAIL_ENDPOINT = process.env.ADMIN_GENERATION_DETAIL_ENDPOINT || "/api/admin/generations/detail";
const ADMIN_CREDITS_ENDPOINT = process.env.ADMIN_CREDITS_ENDPOINT || "/api/admin/credits";
const ADMIN_CREDIT_ADJUST_ENDPOINT = process.env.ADMIN_CREDIT_ADJUST_ENDPOINT || "/api/admin/credits/adjust";
const ADMIN_TRIAL_CODE_ENDPOINT = process.env.ADMIN_TRIAL_CODE_ENDPOINT || "/api/admin/trial-code";
const ADMIN_AUDIT_LOG_ENDPOINT = process.env.ADMIN_AUDIT_LOG_ENDPOINT || "/api/admin/audit-log";
const ADMIN_USER_STATUS_ENDPOINT = process.env.ADMIN_USER_STATUS_ENDPOINT || "/api/admin/users/status";
const ADMIN_GENERATION_HIDE_ENDPOINT = process.env.ADMIN_GENERATION_HIDE_ENDPOINT || "/api/admin/generations/hide";
const ADMIN_GENERATION_UNPUBLISH_ENDPOINT = process.env.ADMIN_GENERATION_UNPUBLISH_ENDPOINT || "/api/admin/generations/unpublish";

export const getMorphoClientId = () => {
  const key = "morphostyle_openai_client_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return "morphostyle-browser-client";
  }
};

const getOpenAiClientId = getMorphoClientId;

const AUTH_TOKEN_KEY = "morphostyle_auth_token_v1";
const ACCOUNT_KEY = "morphostyle_account_v1";

export type MorphoOwner = {
  type: "guest" | "user";
  id: string;
  email?: string;
  status: string;
  role?: "user" | "admin";
};

export type MorphoSession = {
  owner: MorphoOwner;
  token?: string;
  expiresAt?: string;
  quota?: AnalysisResult["quota"];
  credits?: AdminCreditWallet;
  generations?: PublicGeneration[];
  storage?: "json" | "mysql";
};

export type AdminOverview = {
  usersTotal: number;
  usersActive: number;
  usersSuspended: number;
  usersDeleted?: number;
  guestsTotal: number;
  adminsTotal: number;
  generationsTotal: number;
  generationsToday: number;
  generationsPublished: number;
  generationsHidden: number;
  creditBalanceTotal?: number;
};

export type AdminUserStatus = "active" | "suspended" | "deleted";

export type AdminUser = {
  id: string;
  email: string;
  status: AdminUserStatus;
  role: "user" | "admin";
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  generationCount: number;
  publishedCount: number;
  creditBalance?: number;
  lastGenerationAt?: string;
};

export type AdminUserDetail = AdminUser & {
  hiddenCount: number;
  generations: AdminGeneration[];
};

export type AdminGeneration = {
  id: string;
  ownerType: "guest" | "user";
  ownerId: string;
  ownerEmail?: string;
  status: string;
  title: string;
  sourceLabel: string;
  styleName: string;
  publicGenerationId?: string;
  imageCount: number;
  hasOriginal: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminGenerationDetail = AdminGeneration & {
  imageUrl: string;
  originalImageUrl?: string;
  additionalViews?: AdditionalViews;
  recommendations?: Array<{
    id?: string;
    styleName?: string;
    name?: string;
    previewUrl?: string;
    imageUrl?: string;
    color?: string;
    whyItWorks?: string;
  }>;
  consultation?: Partial<ConsultationData>;
  faceShape?: string;
  color?: string;
  beardStyle?: string;
  description?: string;
  whyItWorks?: string;
};

export type AdminCreditWallet = {
  ownerType: "guest" | "user";
  ownerId: string;
  balance: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminCreditLedgerEntry = {
  id: string;
  ownerType: "guest" | "user";
  ownerId: string;
  actorUserId?: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt?: string;
};

export type AdminAuditEntry = {
  id: string;
  actorUserId: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  createdAt?: string;
};

export type AdminTrialCode = {
  id: string;
  code: string;
  codeHash?: string;
  usesAdded: number;
  status: "active" | "inactive";
  activationCount: number;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
};

export type AdminTrialCodeState = {
  trialCode: AdminTrialCode;
  history: AdminTrialCode[];
};

export type AdminDashboard = {
  admin: MorphoOwner;
  overview: AdminOverview;
  users: AdminUser[];
  generations: AdminGeneration[];
};

export const getStoredAuthToken = () => {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export const getStoredAccount = (): MorphoOwner | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || "null");
    return parsed?.type ? parsed as MorphoOwner : null;
  } catch {
    return null;
  }
};

export const isStoredAdmin = () => getStoredAccount()?.role === "admin";

const persistSession = (session: MorphoSession) => {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    if (session.owner?.type === "user") {
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(session.owner));
    } else {
      window.localStorage.removeItem(ACCOUNT_KEY);
    }
  } catch {
    // Auth still works for the current request even if local storage is unavailable.
  }
};

export const clearStoredSession = () => {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const authHeaders = (): Record<string, string> => {
  // Temporary migration path for browsers connected before HttpOnly session cookies.
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type OpenAiServicePayload = {
  error?: string;
  quota?: AnalysisResult["quota"];
  allowCodeActivation?: boolean;
};

const throwOpenAiServiceError = (payload: OpenAiServicePayload, status: number, fallback: string): never => {
  const error = new Error(payload.error || `${fallback}: HTTP ${status}`) as Error & {
    status?: number;
    quota?: AnalysisResult["quota"];
    allowCodeActivation?: boolean;
  };
  error.status = status;
  error.quota = payload.quota;
  error.allowCodeActivation = Boolean(payload.allowCodeActivation);
  throw error;
};

export const isOpenAiUploadStyle = (style?: Pick<StyleRecommendation, "sourceProvider" | "id"> | null) =>
  style?.sourceProvider === "openai-upload" || String(style?.id || "").startsWith("openai-upload-");

const persistedImageReference = (...values: Array<string | undefined>) =>
  values
    .map(value => String(value || "").trim())
    .find(value => value && !value.startsWith("data:image/")) || "";

export const generateOpenAiUploadRecommendations = async (
  originalBase64: string,
  consultation: ConsultationData
): Promise<AnalysisResult> => {
  const source = await imageInputToDataUrl(originalBase64);
  const response = await fetchWithTimeout(OPENAI_UPLOAD_RECOMMENDATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      imageBase64: source.dataUrl,
      consultation,
      clientId: getOpenAiClientId()
    })
  }, 720000);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throwOpenAiServiceError(payload, response.status, "Service image indisponible");
  }

  return {
    faceShape: payload.faceShape || "morphologie personnalisee",
    hairTexture: payload.hairTexture || "Texture detectee depuis la photo",
    skinTone: payload.skinTone || "Teint preserve",
    detectedGender: payload.detectedGender || consultation.gender,
    professionalAdvice: payload.professionalAdvice || "Votre morphologie guide les volumes, les contours et la longueur afin de proposer une coupe credible, flatteuse et facile a porter.",
    recommendedStyles: (payload.recommendedStyles || []) as StyleRecommendation[],
    generationSessionId: payload.generationSessionId,
    historyItem: payload.historyItem as PublicGeneration | undefined,
    quota: payload.quota
  };
};

export const generateOpenAiSelectedResult = async (
  originalBase64: string,
  consultation: ConsultationData,
  style: StyleRecommendation,
  generationSessionId = style.generationSessionId || ""
): Promise<Proposal> => {
  const source = await imageInputToDataUrl(originalBase64);
  const sourceAssetUrl = source.sourceAssetUrl || style.sourceAssetUrl || "";
  const selectedReferenceAssetUrl = persistedImageReference(
    style.selectedReferenceAssetUrl,
    style.assetPreviewUrl,
    style.previewUrl,
    style.resultImageUrl
  );
  const response = await fetchWithTimeout(OPENAI_SELECTED_RESULT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      imageBase64: source.dataUrl,
      consultation,
      style,
      generationSessionId,
      resumeFromHistory: Boolean(sourceAssetUrl),
      sourceAssetUrl,
      selectedReferenceAssetUrl,
      selectedRecommendationId: style.id,
      clientId: getOpenAiClientId()
    })
  }, 720000);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throwOpenAiServiceError(payload, response.status, "Service image indisponible");
  }

  return payload.proposal;
};

export const activateOpenAiTrialCode = async (code: string) => {
  const response = await fetchWithTimeout(OPENAI_ACTIVATE_TRIAL_CODE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      code,
      clientId: getOpenAiClientId()
    })
  }, 30000);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throwOpenAiServiceError(payload, response.status, "Activation du code impossible");
  }

  return payload as {
    message: string;
    usesAdded: number;
    alreadyActivated?: boolean;
    quota: AnalysisResult["quota"];
  };
};

const sessionPayloadFromResponse = async (response: Response, fallback: string): Promise<MorphoSession> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `${fallback}: HTTP ${response.status}`);
  }

  if (payload.owner) persistSession(payload as MorphoSession);
  return payload as MorphoSession;
};

export const fetchGuestSession = async () => {
  const clientId = getMorphoClientId();
  const token = getStoredAuthToken();
  if (token) {
    try {
      const params = new URLSearchParams({ clientId });
      const response = await fetchWithTimeout(`${ME_SESSION_ENDPOINT}?${params.toString()}`, {
        headers: authHeaders()
      }, 30000);
      return await sessionPayloadFromResponse(response, "Session compte indisponible");
    } catch (error) {
      clearStoredSession();
    }
  }

  const response = await fetchWithTimeout(GUEST_SESSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ clientId })
  }, 30000);

  return sessionPayloadFromResponse(response, "Session invite indisponible");
};

export const fetchPersonalGenerations = async (scope: "today" | "all" = "today", limit?: number): Promise<PublicGeneration[]> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    scope
  });
  if (limit) params.set("limit", String(limit));
  const response = await fetchWithTimeout(`${PERSONAL_GENERATIONS_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Historique personnel indisponible: HTTP ${response.status}`);
  }
  return (payload.generations || []) as PublicGeneration[];
};

export const fetchPersonalGenerationAssets = async (generationId: string): Promise<PublicGeneration> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId()
  });
  const response = await fetchWithTimeout(`${PERSONAL_GENERATIONS_ENDPOINT}/${encodeURIComponent(generationId)}/assets?${params.toString()}`, {
    headers: authHeaders()
  }, 60000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !payload.generation) {
    throw new Error(payload.error || `Images de fiche indisponibles: HTTP ${response.status}`);
  }
  return payload.generation as PublicGeneration;
};

export const savePersonalGeneration = async (generation: PublicGeneration): Promise<PublicGeneration> => {
  const response = await fetchWithTimeout(PERSONAL_GENERATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      clientId: getMorphoClientId(),
      generation
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Sauvegarde historique impossible: HTTP ${response.status}`);
  }
  return payload.generation as PublicGeneration;
};

const deleteCandidateValues = (generation?: Partial<PublicGeneration>) => {
  if (!generation) return [];
  const recommendations = generation.recommendations || [];
  const viewUrls = Object.values(generation.additionalViews || {});
  return [
    generation.id,
    generation.personalGenerationId,
    generation.publicGenerationId,
    generation.imageUrl,
    generation.originalImageUrl,
    ...viewUrls,
    ...recommendations.flatMap(recommendation => [
      recommendation.id,
      recommendation.previewUrl,
      recommendation.assetPreviewUrl,
      recommendation.imageUrl
    ])
  ]
    .map(value => String(value || "").trim())
    .filter(value => value && !value.startsWith("data:image/"))
    .slice(0, 40);
};

export const deletePersonalGeneration = (
  generationId: string,
  publicGenerationId = "",
  generation?: Partial<PublicGeneration>
): Promise<PublicGeneration> => {
  return deletePersonalGenerationWithCandidates(generationId, publicGenerationId, generation);
};

const deletePersonalGenerationWithCandidates = async (
  generationId: string,
  publicGenerationId = "",
  generation?: Partial<PublicGeneration>
): Promise<PublicGeneration> => {
  const response = await fetchWithTimeout(PERSONAL_GENERATION_DELETE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      clientId: getMorphoClientId(),
      generationId,
      publicGenerationId,
      candidateIds: deleteCandidateValues(generation),
      styleName: generation?.styleName || "",
      sourceLabel: generation?.sourceLabel || "",
      createdAt: generation?.createdAt || ""
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Suppression fiche impossible: HTTP ${response.status}`);
  }
  return payload.generation as PublicGeneration;
};

export const registerAccount = async (email: string, password: string): Promise<MorphoSession> => {
  const response = await fetchWithTimeout(AUTH_REGISTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      email,
      password,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Creation du compte impossible: HTTP ${response.status}`);
  }
  persistSession(payload as MorphoSession);
  return payload as MorphoSession;
};

export const loginAccount = async (email: string, password: string): Promise<MorphoSession> => {
  const response = await fetchWithTimeout(AUTH_LOGIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Connexion impossible: HTTP ${response.status}`);
  }
  persistSession(payload as MorphoSession);
  return payload as MorphoSession;
};

export const logoutAccount = async (): Promise<MorphoSession | null> => {
  const response = await fetchWithTimeout(AUTH_LOGOUT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ clientId: getMorphoClientId() })
  }, 30000);
  clearStoredSession();
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) return null;
  return payload as MorphoSession;
};

export const fetchAdminDashboard = async (): Promise<AdminDashboard> => {
  const params = new URLSearchParams({ clientId: getMorphoClientId() });
  const response = await fetchWithTimeout(`${ADMIN_DASHBOARD_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Administration indisponible: HTTP ${response.status}`);
  }

  return {
    admin: payload.admin as MorphoOwner,
    overview: payload.overview as AdminOverview,
    users: (payload.users || []) as AdminUser[],
    generations: (payload.generations || []) as AdminGeneration[]
  };
};

export const fetchAdminUsers = async (search = "", limit = 80): Promise<AdminUser[]> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    limit: String(limit)
  });
  if (search.trim()) params.set("search", search.trim());
  const response = await fetchWithTimeout(`${ADMIN_USERS_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Liste utilisateurs indisponible: HTTP ${response.status}`);
  }
  return (payload.users || []) as AdminUser[];
};

export const fetchAdminUserDetail = async (userId: string, limit = 80): Promise<AdminUserDetail> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    userId,
    limit: String(limit)
  });
  const response = await fetchWithTimeout(`${ADMIN_USER_DETAIL_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Fiche utilisateur indisponible: HTTP ${response.status}`);
  }
  return payload.user as AdminUserDetail;
};

export const fetchAdminGenerations = async (search = "", limit = 80): Promise<AdminGeneration[]> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    limit: String(limit)
  });
  if (search.trim()) params.set("search", search.trim());
  const response = await fetchWithTimeout(`${ADMIN_GENERATIONS_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Liste generations indisponible: HTTP ${response.status}`);
  }
  return (payload.generations || []) as AdminGeneration[];
};

export const fetchAdminGenerationDetail = async (generation: Pick<AdminGeneration, "ownerType" | "ownerId" | "id">): Promise<AdminGenerationDetail> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    ownerType: generation.ownerType,
    ownerId: generation.ownerId,
    generationId: generation.id
  });
  const response = await fetchWithTimeout(`${ADMIN_GENERATION_DETAIL_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Fiche generation indisponible: HTTP ${response.status}`);
  }
  return payload.generation as AdminGenerationDetail;
};

export const fetchAdminCredits = async (
  owner: Pick<AdminCreditWallet, "ownerType" | "ownerId">,
  limit = 40
): Promise<{ wallet: AdminCreditWallet; ledger: AdminCreditLedgerEntry[] }> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    limit: String(limit)
  });
  const response = await fetchWithTimeout(`${ADMIN_CREDITS_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Credits indisponibles: HTTP ${response.status}`);
  }
  return {
    wallet: payload.wallet as AdminCreditWallet,
    ledger: (payload.ledger || []) as AdminCreditLedgerEntry[]
  };
};

export const adjustAdminCredits = async (payload: {
  ownerType: "guest" | "user";
  ownerId: string;
  amount: number;
  reason: string;
}): Promise<{ wallet: AdminCreditWallet; entry: AdminCreditLedgerEntry }> => {
  const response = await fetchWithTimeout(ADMIN_CREDIT_ADJUST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      ...payload,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Ajustement credits impossible: HTTP ${response.status}`);
  }
  return {
    wallet: result.wallet as AdminCreditWallet,
    entry: result.entry as AdminCreditLedgerEntry
  };
};

export const fetchAdminTrialCode = async (): Promise<AdminTrialCodeState> => {
  const params = new URLSearchParams({ clientId: getMorphoClientId() });
  const response = await fetchWithTimeout(`${ADMIN_TRIAL_CODE_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Code bonus indisponible: HTTP ${response.status}`);
  }
  return {
    trialCode: payload.trialCode as AdminTrialCode,
    history: Array.isArray(payload.history) ? payload.history as AdminTrialCode[] : []
  };
};

export const saveAdminTrialCode = async (payload: {
  code?: string;
  usesAdded: number;
  regenerate?: boolean;
}): Promise<AdminTrialCodeState> => {
  const response = await fetchWithTimeout(ADMIN_TRIAL_CODE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      ...payload,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Mise a jour du code bonus impossible: HTTP ${response.status}`);
  }
  return {
    trialCode: result.trialCode as AdminTrialCode,
    history: Array.isArray(result.history) ? result.history as AdminTrialCode[] : []
  };
};

export const fetchAdminAuditLog = async (search = "", limit = 80): Promise<AdminAuditEntry[]> => {
  const params = new URLSearchParams({
    clientId: getMorphoClientId(),
    limit: String(limit)
  });
  if (search.trim()) params.set("search", search.trim());
  const response = await fetchWithTimeout(`${ADMIN_AUDIT_LOG_ENDPOINT}?${params.toString()}`, {
    headers: authHeaders()
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Journal administrateur indisponible: HTTP ${response.status}`);
  }
  return (payload.entries || []) as AdminAuditEntry[];
};

export const updateAdminUserStatus = async (userId: string, status: AdminUserStatus): Promise<AdminUser> => {
  const response = await fetchWithTimeout(ADMIN_USER_STATUS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      userId,
      status,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Mise a jour utilisateur impossible: HTTP ${response.status}`);
  }
  return payload.user as AdminUser;
};

export const hideAdminGeneration = async (generation: Pick<AdminGeneration, "ownerType" | "ownerId" | "id">): Promise<AdminGeneration> => {
  const response = await fetchWithTimeout(ADMIN_GENERATION_HIDE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      ownerType: generation.ownerType,
      ownerId: generation.ownerId,
      generationId: generation.id,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Masquage generation impossible: HTTP ${response.status}`);
  }
  return payload.generation as AdminGeneration;
};

export const unpublishAdminGeneration = async (
  generation: Pick<AdminGeneration, "ownerType" | "ownerId" | "id">
): Promise<{ generation: AdminGeneration; publicGenerationId: string }> => {
  const response = await fetchWithTimeout(ADMIN_GENERATION_UNPUBLISH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      ownerType: generation.ownerType,
      ownerId: generation.ownerId,
      generationId: generation.id,
      clientId: getMorphoClientId()
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Retrait de la vitrine impossible: HTTP ${response.status}`);
  }
  return {
    generation: payload.generation as AdminGeneration,
    publicGenerationId: String(payload.publicGenerationId || "")
  };
};

export const fetchPublicGenerations = async (): Promise<PublicGeneration[]> => {
  const params = new URLSearchParams({ limit: "240" });
  const separator = PUBLIC_GENERATIONS_ENDPOINT.includes("?") ? "&" : "?";
  const response = await fetchWithTimeout(`${PUBLIC_GENERATIONS_ENDPOINT}${separator}${params.toString()}`, {}, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Historique public indisponible: HTTP ${response.status}`);
  }
  return (payload.generations || []) as PublicGeneration[];
};

export const publishPublicGeneration = async (payload: {
  proposal: Proposal;
  analysis: Pick<AnalysisResult, "faceShape">;
  consultation: ConsultationData;
  sourceLabel: string;
}): Promise<PublicGeneration> => {
  const personalGenerationId =
    payload.proposal.historyItem?.personalGenerationId ||
    payload.proposal.historyItem?.id ||
    payload.proposal.id;

  const response = await fetchWithTimeout(PUBLIC_GENERATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      ...payload,
      clientId: getMorphoClientId(),
      personalGenerationId
    })
  }, 30000);

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Publication vitrine impossible: HTTP ${response.status}`);
  }

  return result.generation as PublicGeneration;
};

export const generateAlibabaUploadRecommendations = async (
  originalBase64: string,
  consultation: ConsultationData
): Promise<AnalysisResult> => {
  const response = await fetchWithTimeout(ALIBABA_UPLOAD_RECOMMENDATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: originalBase64,
      consultation
    })
  }, 720000);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Service image indisponible: HTTP ${response.status}`);
  }

  return {
    faceShape: payload.faceShape || "morphologie personnalisee",
    hairTexture: payload.hairTexture || "Texture detectee depuis la photo",
    skinTone: payload.skinTone || "Teint preserve",
    detectedGender: payload.detectedGender || consultation.gender,
    professionalAdvice: payload.professionalAdvice || "Votre morphologie guide les volumes, les contours et la longueur afin de proposer une coupe credible, flatteuse et facile a porter.",
    recommendedStyles: (payload.recommendedStyles || []) as StyleRecommendation[]
  };
};
