
import React, { useEffect, useRef, useState } from 'react';
import AppFooter from './components/AppFooter';
import AdminStatsGrid, { type AdminStatItem } from './components/admin/AdminStatsGrid';
import AdminUsersTable from './components/admin/AdminUsersTable';
import { adminUserStatusLabels, normalizeAdminUserStatus } from './components/admin/adminUserStatus';
import GenerationDetailSheet from './components/GenerationDetailSheet';
import Header from './components/Header';
import PrivacyPage from './components/PrivacyPage';
import ShareMenuAction from './components/ShareMenuAction';
import UserSpacePage from './components/UserSpacePage';
import { AppState, AnalysisResult, Proposal, ConsultationData, PublicGeneration, StyleRecommendation, AdditionalViews } from './types';
import { analyzeMorphology, generateHairstyleImage, generateStyleAngles, generateQuickPreview, generateOpenAiUploadRecommendations, generateOpenAiSelectedResult, activateOpenAiTrialCode, fetchGuestSession, fetchPersonalGenerations, fetchPersonalGenerationAssets, fetchPublicGenerations, publishPublicGeneration, savePersonalGeneration, deletePersonalGeneration, registerAccount, loginAccount, logoutAccount, getStoredAccount, MorphoOwner, AdminDashboard, AdminUser, AdminUserDetail, AdminGeneration, AdminGenerationDetail, AdminAuditEntry, AdminTrialCode, AdminTrialCodeState, AdminUserStatus, fetchAdminDashboard, fetchAdminUsers, fetchAdminUserDetail, fetchAdminGenerations, fetchAdminGenerationDetail, fetchAdminCredits, adjustAdminCredits, fetchAdminTrialCode, saveAdminTrialCode, fetchAdminAuditLog, updateAdminUserStatus, hideAdminGeneration, unpublishAdminGeneration, isOpenAiUploadStyle, isFreeImageApiMode, isImageToImageMode, isPuterFluxImageToImageMode, isHuggingFaceKontextImageToImageMode, isLocalRetouchImageToImageMode, createLocalPreviewFallback, createLocalExampleAnalysis } from './services/geminiService';
import { DEMO_EXAMPLES, DemoExample } from './services/demoExamples';
import { getPreparedCombinationBoardUrl, getPreparedProfileStyles, hasPreparedCombination, hasPreparedLookDatabase } from './services/profileLookDatabase';
import { 
  Loader2, Sparkles, ArrowLeft, AlertTriangle, X, ChevronRight, 
  RotateCcw, CheckCircle2, Maximize2, User, Info,
  Baby, GraduationCap, Briefcase, Glasses, Users, Upload,
  Download, Globe2, Home, ImagePlus, Images, Mail, Lock, LogOut,
  Settings, RefreshCw, CalendarDays, Database, ShieldCheck, FolderOpen,
  Search, EyeOff, Activity, Coins, FileText, History,
  KeyRound, Copy
} from 'lucide-react';

const genderLabels: Record<ConsultationData["gender"], string> = {
  male: "Masculin",
  female: "Feminin",
  "non-binary": "Autre"
};

const ageLabels: Record<ConsultationData["ageGroup"], string> = {
  baby: "Bebe",
  child: "Enfant",
  teen: "Ado",
  adult: "Adulte",
  mature: "Senior"
};

const maintenanceLabels: Record<ConsultationData["maintenance"], string> = {
  low: "Rapide",
  medium: "Modere",
  high: "Rituel"
};

const lifestyleLabels: Record<ConsultationData["lifestyle"], string> = {
  classic: "Classique",
  modern: "Moderne",
  bold: "Audacieux"
};

const lengthLabels: Record<ConsultationData["targetLength"], string> = {
  short: "Court",
  medium: "Mi-long",
  long: "Long",
  any: "Libre"
};

const retiredDemoProfileLabels = new Set(["sam"]);
const hiddenGenerationStatuses = new Set(["admin_hidden", "user_deleted"]);
const privacyRoutePath = "/confidentialite";
const generationNavigationMessage = "Generation en cours. Patientez jusqu'au resultat avant de changer de page.";
const generationAlreadyRunningMessage = "Une generation est deja en cours. Patientez jusqu'au resultat avant d'en lancer une autre.";

const normalizedAppPath = (pathname = "/") => {
  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
};

const isPrivacyRoute = () =>
  typeof window !== "undefined" && normalizedAppPath(window.location.pathname) === privacyRoutePath;

const isRetiredDemoGeneration = (item?: Partial<PublicGeneration> | null) => {
  if (!item) return false;
  const sourceLabel = String(item.sourceLabel || "").trim().toLowerCase();
  const urls = [
    item.imageUrl,
    item.originalImageUrl,
    ...Object.values(item.additionalViews || {})
  ].map(value => String(value || "").toLowerCase());

  return retiredDemoProfileLabels.has(sourceLabel) || urls.some(url => url.includes("/demo-profiles/sam/"));
};

const activeGenerationResults = (items: PublicGeneration[] = []) =>
  items.filter(item =>
    !hiddenGenerationStatuses.has(String(item.status || "")) &&
    !isRetiredDemoGeneration(item)
  );

const isValidConsultationValue = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && allowed.includes(value as T);

const normalizeHistoryConsultation = (input: Partial<ConsultationData> = {}): ConsultationData => ({
  maintenance: isValidConsultationValue(input.maintenance, ["low", "medium", "high"] as const) ? input.maintenance : "medium",
  lifestyle: isValidConsultationValue(input.lifestyle, ["classic", "modern", "bold"] as const) ? input.lifestyle : "modern",
  targetLength: isValidConsultationValue(input.targetLength, ["short", "medium", "long", "any"] as const) ? input.targetLength : "any",
  gender: isValidConsultationValue(input.gender, ["male", "female", "non-binary"] as const) ? input.gender : "non-binary",
  ageGroup: isValidConsultationValue(input.ageGroup, ["baby", "child", "teen", "adult", "mature"] as const) ? input.ageGroup : "adult"
});

const consultationAdvice = (data: ConsultationData) =>
  `Votre morphologie est reprise depuis l'historique. Les propositions restent adaptees a votre choix ${lengthLabels[data.targetLength].toLowerCase()}, entretien ${maintenanceLabels[data.maintenance].toLowerCase()}, univers ${lifestyleLabels[data.lifestyle].toLowerCase()}. Selectionnez une coupe pour generer le resultat final.`;

type PendingGenerationCard = {
  id: string;
  title: string;
  sourceLabel: string;
  phaseLabel: string;
  previewUrl: string;
  detail: string;
  createdAt: string;
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [consultation, setConsultation] = useState<ConsultationData>({
    maintenance: 'medium',
    lifestyle: 'modern',
    targetLength: 'any',
    gender: 'female',
    ageGroup: 'adult'
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [pendingGeneration, setPendingGeneration] = useState<PendingGenerationCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trialCode, setTrialCode] = useState('');
  const [trialCodeMessage, setTrialCodeMessage] = useState<string | null>(null);
  const [canActivateTrialCode, setCanActivateTrialCode] = useState(false);
  const [isActivatingTrialCode, setIsActivatingTrialCode] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null);
  const [publicGenerations, setPublicGenerations] = useState<PublicGeneration[]>([]);
  const [dailyResults, setDailyResults] = useState<PublicGeneration[]>([]);
  const [recommendationAssetCache, setRecommendationAssetCache] = useState<Record<string, PublicGeneration>>({});
  const [galleryDetail, setGalleryDetail] = useState<{ item: PublicGeneration; scope: 'daily' | 'public' } | null>(null);
  const [isPublicGalleryLoading, setIsPublicGalleryLoading] = useState(false);
  const [publishingProposalId, setPublishingProposalId] = useState<string | null>(null);
  const [publishedProposalIds, setPublishedProposalIds] = useState<string[]>([]);
  const [publishingGenerationId, setPublishingGenerationId] = useState<string | null>(null);
  const [shareMenuId, setShareMenuId] = useState<string | null>(null);
  const [deletingGenerationId, setDeletingGenerationId] = useState<string | null>(null);
  const [publishedGenerationIds, setPublishedGenerationIds] = useState<string[]>([]);
  const [account, setAccount] = useState<MorphoOwner | null>(() => getStoredAccount());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [accountQuota, setAccountQuota] = useState<AnalysisResult["quota"] | null>(null);
  const [accountCreditBalance, setAccountCreditBalance] = useState<number | null>(null);
  const [accountStorage, setAccountStorage] = useState<string | null>(null);
  const [userSpaceOpen, setUserSpaceOpen] = useState(false);
  const [privacyPageOpen, setPrivacyPageOpen] = useState(() => isPrivacyRoute());
  const [userHistory, setUserHistory] = useState<PublicGeneration[]>([]);
  const [isUserHistoryLoading, setIsUserHistoryLoading] = useState(false);
  const [userHistoryMessage, setUserHistoryMessage] = useState<string | null>(null);
  const [adminSpaceOpen, setAdminSpaceOpen] = useState(false);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboard | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminGenerations, setAdminGenerations] = useState<AdminGeneration[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminAppliedSearch, setAdminAppliedSearch] = useState('');
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminUserDetail | null>(null);
  const [isAdminUserDetailLoading, setIsAdminUserDetailLoading] = useState(false);
  const [selectedAdminGeneration, setSelectedAdminGeneration] = useState<AdminGenerationDetail | null>(null);
  const [isAdminGenerationDetailLoading, setIsAdminGenerationDetailLoading] = useState(false);
  const [isAdminCreditBusy, setIsAdminCreditBusy] = useState(false);
  const [adminAuditLog, setAdminAuditLog] = useState<AdminAuditEntry[]>([]);
  const [adminTrialCode, setAdminTrialCode] = useState<AdminTrialCode | null>(null);
  const [adminTrialCodeHistory, setAdminTrialCodeHistory] = useState<AdminTrialCode[]>([]);
  const [adminTrialCodeDraft, setAdminTrialCodeDraft] = useState('');
  const [adminTrialUsesDraft, setAdminTrialUsesDraft] = useState('5');
  const [isAdminTrialCodeBusy, setIsAdminTrialCodeBusy] = useState(false);
  const [adminTrialCodeCopied, setAdminTrialCodeCopied] = useState(false);
  const activeOperationRef = useRef(0);
  const activeGenerationLockRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const freeImageApiMode = isFreeImageApiMode();
  const imageToImageMode = isImageToImageMode();
  const puterFluxMode = isPuterFluxImageToImageMode();
  const hfKontextMode = isHuggingFaceKontextImageToImageMode();
  const localRetouchMode = isLocalRetouchImageToImageMode();
  const selectedExample = DEMO_EXAMPLES.find(example => example.id === selectedExampleId) || null;
  const isAdminAccount = account?.type === "user" && account.role === "admin";
  const canUploadPersonalPhoto = account?.type === "user";
  const isWorkspacePanelOpen = userSpaceOpen || adminSpaceOpen || privacyPageOpen;
  const isGenerationInProgress = Boolean(pendingGeneration) || state === AppState.ANALYZING || state === AppState.GENERATING;
  const preparedSelectionMode = !!getPreparedCombinationBoardUrl(selectedExample, consultation);
  const preparedUploadMode = !!analysis?.recommendedStyles.some(style => style.isPreparedAsset && style.id.startsWith("alibaba-upload"));
  const openAiUploadMode = !!analysis?.recommendedStyles.some(isOpenAiUploadStyle);
  const canResumeCurrentRecommendations = state === AppState.CONSULTATION && Boolean(analysis?.recommendedStyles.length);
  const maxSelectableStyles = preparedSelectionMode || preparedUploadMode || openAiUploadMode || freeImageApiMode || imageToImageMode ? 1 : 4;
  const preparedResult = proposals.find(proposal => proposal.isPreparedAsset);
  const resultTitle = preparedResult
    ? preparedResult.styleName
    : openAiUploadMode
      ? "Resultat personnalise"
      : hfKontextMode
      ? "Coupe modifiee"
      : localRetouchMode
        ? "Photo retouchee localement"
        : imageToImageMode
          ? "Photo transformee"
          : freeImageApiMode
            ? "Image generee"
            : "Simulations Haute Fidélité";
  const resultDescription = openAiUploadMode
    ? "La coupe selectionnee est preparee en resultat complet, avec portrait de face, profils et dos."
    : hfKontextMode
    ? "La photo chargee est traitee avec une consigne stricte: garder la personne et modifier uniquement la coupe."
    : localRetouchMode
      ? "La photo chargee reste l'entree principale. La coupe choisie est simulee dans le navigateur."
      : puterFluxMode
        ? "La photo chargee sert de reference. Seule la coupe choisie doit etre modifiee."
        : imageToImageMode
          ? "La photo chargee sert de reference. Seule la coupe choisie doit etre modifiee."
          : freeImageApiMode
            ? "La coupe choisie est generee a partir du portrait original."
            : "Seuls les cheveux et la barbe ont été adaptés. Le décor original est préservé.";
  const resultDownloadsEnabled = account?.type === "user" && !selectedExample;
  const showOriginalPreview = !!userImage && !isWorkspacePanelOpen && state !== AppState.IDLE && state !== AppState.RESULTS;
  const originalPreviewStatus = state === AppState.CONSULTATION
    ? 'Photo chargee'
    : state === AppState.ANALYZING
      ? 'Analyse en cours'
      : state === AppState.GENERATING
        ? 'Image source'
        : 'Reference active';
  const demographicsLocked = !!selectedExample;
  const dailyResultsStorageKey = "morphostyle_daily_results_v1";
  const todayKey = () => new Intl.DateTimeFormat("en-CA").format(new Date());

  const loadDailyResults = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(dailyResultsStorageKey) || "{}");
      return parsed?.date === todayKey() && Array.isArray(parsed.results)
        ? activeGenerationResults(parsed.results as PublicGeneration[])
        : [];
    } catch {
      return [];
    }
  };

  const saveDailyResults = (results: PublicGeneration[]) => {
    try {
      const activeResults = activeGenerationResults(results);
      window.localStorage.setItem(dailyResultsStorageKey, JSON.stringify({
        date: todayKey(),
        results: activeResults.slice(0, 48)
      }));
    } catch {
      // Daily history is a convenience feature; generation must keep working if storage is full.
    }
  };

  const mergeHistoryResultsWithLimit = (limit: number, ...groups: PublicGeneration[][]) => {
    const byKey = new Map<string, PublicGeneration>();
    activeGenerationResults(groups.flat()).forEach((item) => {
      const key = item.personalGenerationId || item.id || item.publicGenerationId || item.imageUrl;
      if (!key) return;
      const existing = byKey.get(key);
      byKey.set(key, existing ? {
        ...item,
        ...existing,
        personalGenerationId: existing.personalGenerationId || item.personalGenerationId || item.id,
        publicGenerationId: existing.publicGenerationId || item.publicGenerationId
      } : item);
    });
    return Array.from(byKey.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  };

  const mergeHistoryResults = (...groups: PublicGeneration[][]) =>
    mergeHistoryResultsWithLimit(48, ...groups);

  const generationIdentityValues = (item?: Partial<PublicGeneration> | null) =>
    [item?.personalGenerationId, item?.id, item?.publicGenerationId, item?.imageUrl]
      .filter((value): value is string => Boolean(value));

  const isSameGeneration = (left?: Partial<PublicGeneration> | null, right?: Partial<PublicGeneration> | null) => {
    const leftValues = new Set(generationIdentityValues(left));
    return generationIdentityValues(right).some(value => leftValues.has(value));
  };

  const findMatchingGeneration = (items: PublicGeneration[], target: PublicGeneration) =>
    items.find(item => isSameGeneration(item, target));

  const recommendationCacheKeys = (item?: Partial<PublicGeneration> | null) =>
    generationIdentityValues(item);

  const dataImageUrl = (value = "") =>
    value.startsWith("data:image/");

  const cacheRecommendationAssets = (
    historyItem: PublicGeneration,
    analysisResult: AnalysisResult,
    originalSource: string | null
  ) => {
    const keys = recommendationCacheKeys(historyItem);
    if (!keys.length) return;

    const cachedAssets: PublicGeneration = {
      ...historyItem,
      originalImageUrl: originalSource || historyItem.originalImageUrl,
      recommendations: analysisResult.recommendedStyles.map(style => ({
        id: style.id,
        styleName: style.name,
        name: style.name,
        previewUrl: style.previewUrl || style.assetPreviewUrl || style.selectedReferenceAssetUrl || "",
        assetPreviewUrl: style.assetPreviewUrl || style.selectedReferenceAssetUrl || "",
        imageUrl: style.previewUrl || style.assetPreviewUrl || style.selectedReferenceAssetUrl || "",
        color: style.color,
        whyItWorks: style.whyItWorks,
        description: style.description,
        beardStyle: style.beardStyle
      }))
    };

    setRecommendationAssetCache(prev => {
      const next = { ...prev };
      keys.forEach(key => {
        next[key] = cachedAssets;
      });
      return next;
    });
  };

  const refreshPersonalHistory = async () => {
    try {
      const serverResults = await fetchPersonalGenerations("today");
      setDailyResults(prev => {
        const merged = mergeHistoryResults(serverResults, prev);
        saveDailyResults(merged);
        return merged;
      });
    } catch {
      // The local daily history remains available if the server history is not ready.
    }
  };

  useEffect(() => {
    let mounted = true;
    const localDailyResults = loadDailyResults();
    setDailyResults(localDailyResults);
    fetchGuestSession()
      .then(session => {
        if (!mounted) return;
        setAccount(session.owner || null);
        setAccountQuota(session.quota || null);
        setAccountCreditBalance(typeof session.credits?.balance === "number" ? session.credits.balance : null);
        setAccountStorage(session.storage || null);
        const serverResults = Array.isArray(session.generations) ? session.generations : [];
        const merged = mergeHistoryResults(serverResults, localDailyResults);
        setDailyResults(merged);
        saveDailyResults(merged);
      })
      .catch(() => {
        if (mounted) {
          setAccount(null);
          setAccountQuota(null);
          setAccountCreditBalance(null);
          setAccountStorage(null);
          setDailyResults(localDailyResults);
        }
      });
    setIsPublicGalleryLoading(true);
    fetchPublicGenerations()
      .then(generations => {
        if (mounted) setPublicGenerations(activeGenerationResults(generations));
      })
      .catch(() => {
        if (mounted) setPublicGenerations([]);
      })
      .finally(() => {
        if (mounted) setIsPublicGalleryLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const syncStaticRoute = () => {
      const shouldOpenPrivacy = isPrivacyRoute();
      if (isGenerationInProgress) {
        if (shouldOpenPrivacy && typeof window !== "undefined") {
          window.history.replaceState(null, "", "/");
          setNotice(generationNavigationMessage);
        }
        setPrivacyPageOpen(false);
        setGalleryDetail(null);
        setZoomImage(null);
        setUserSpaceOpen(false);
        setAdminSpaceOpen(false);
        return;
      }

      setPrivacyPageOpen(shouldOpenPrivacy);
      if (shouldOpenPrivacy) {
        clearServiceAlert();
        setGalleryDetail(null);
        setZoomImage(null);
        setUserSpaceOpen(false);
        setAdminSpaceOpen(false);
      }
    };

    window.addEventListener("popstate", syncStaticRoute);
    syncStaticRoute();
    return () => window.removeEventListener("popstate", syncStaticRoute);
  }, [isGenerationInProgress]);

  useEffect(() => {
    if (!isGenerationInProgress) return;

    const preventPageExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", preventPageExit);
    return () => window.removeEventListener("beforeunload", preventPageExit);
  }, [isGenerationInProgress]);

  const isTrialQuotaError = (err: any, message: string) =>
    Boolean(err?.allowCodeActivation) || /essai openai du jour|essai du jour|quota quotidien/i.test(message);

  const clearServiceAlert = () => {
    setError(null);
    setNotice(null);
    setTrialCode('');
    setTrialCodeMessage(null);
    setCanActivateTrialCode(false);
  };

  const showServiceError = (err: any, fallback: string) => {
    const message = err?.message || fallback;
    if (err?.quota) setAccountQuota(err.quota);
    setNotice(null);
    setError(message);
    setTrialCodeMessage(null);
    setCanActivateTrialCode(isTrialQuotaError(err, message));
  };

  const showGenerationNotice = (message: string) => {
    setError(null);
    setTrialCodeMessage(null);
    setCanActivateTrialCode(false);
    setNotice(message);
  };

  const showGenerationNavigationNotice = () => showGenerationNotice(generationNavigationMessage);
  const showGenerationAlreadyRunningNotice = () => showGenerationNotice(generationAlreadyRunningMessage);

  const handleActivateTrialCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = trialCode.trim();
    if (!code) {
      setTrialCodeMessage("Entrez le code bonus.");
      return;
    }

    setIsActivatingTrialCode(true);
    setTrialCodeMessage(null);
    try {
      const result = await activateOpenAiTrialCode(code);
      clearServiceAlert();
      setTrialCode('');
      setAccountQuota(result.quota || null);
      setNotice(result.message || "Code active. Relancez la generation.");
    } catch (err: any) {
      setTrialCodeMessage(err?.message || "Activation du code impossible.");
    } finally {
      setIsActivatingTrialCode(false);
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage(null);
    setIsAuthBusy(true);
    try {
      const session = authMode === "register"
        ? await registerAccount(authEmail, authPassword)
        : await loginAccount(authEmail, authPassword);
      setAccount(session.owner);
      setAccountQuota(session.quota || null);
      setAccountCreditBalance(typeof session.credits?.balance === "number" ? session.credits.balance : null);
      setAccountStorage(session.storage || null);
      const serverResults = Array.isArray(session.generations) ? session.generations : [];
      const merged = mergeHistoryResults(serverResults, dailyResults);
      setDailyResults(merged);
      saveDailyResults(merged);
      setAuthPassword('');
      setAuthMessage(authMode === "register" ? "Compte cree. Historique synchronise." : "Connecte. Historique synchronise.");
    } catch (err: any) {
      setAuthMessage(err?.message || "Connexion impossible.");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthBusy(true);
    setAuthMessage(null);
    try {
      const session = await logoutAccount();
      setAccount(session?.owner || null);
      setAccountQuota(session?.quota || null);
      setAccountCreditBalance(typeof session?.credits?.balance === "number" ? session.credits.balance : null);
      setAccountStorage(session?.storage || null);
      setUserSpaceOpen(false);
      setAdminSpaceOpen(false);
      setUserHistory([]);
      setAdminDashboard(null);
      setAdminUsers([]);
      setAdminGenerations([]);
      setAdminAppliedSearch('');
      setSelectedAdminUser(null);
      setSelectedAdminGeneration(null);
      setAdminAuditLog([]);
      syncAdminTrialCode(null);
      const serverResults = Array.isArray(session?.generations) ? session.generations : [];
      setDailyResults(serverResults);
      saveDailyResults(serverResults);
      setAuthMessage("Deconnecte. Mode invite actif.");
    } catch (err: any) {
      setAccount(null);
      setAccountQuota(null);
      setAccountCreditBalance(null);
      setAccountStorage(null);
      setUserSpaceOpen(false);
      setAdminSpaceOpen(false);
      setUserHistory([]);
      setAdminDashboard(null);
      setAdminUsers([]);
      setAdminGenerations([]);
      setAdminAppliedSearch('');
      setSelectedAdminUser(null);
      setSelectedAdminGeneration(null);
      setAdminAuditLog([]);
      syncAdminTrialCode(null);
      setDailyResults([]);
      saveDailyResults([]);
      setAuthMessage(err?.message || "Mode invite actif.");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const loadUserSpaceHistory = async () => {
    if (account?.type !== "user") return;
    setIsUserHistoryLoading(true);
    setUserHistoryMessage(null);
    try {
      const serverResults = await fetchPersonalGenerations("all", 120);
      const merged = mergeHistoryResultsWithLimit(120, serverResults, dailyResults);
      setUserHistory(merged);
      if (!merged.some(item => !isRecommendationSession(item))) {
        setUserHistoryMessage("Aucun resultat sauvegarde pour ce compte.");
      }
    } catch (err: any) {
      const fallback = mergeHistoryResultsWithLimit(120, dailyResults);
      setUserHistory(fallback);
      setUserHistoryMessage(err?.message || "Historique complet indisponible pour le moment.");
    } finally {
      setIsUserHistoryLoading(false);
    }
  };

  const openUserSpace = () => {
    if (account?.type !== "user") return;
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    clearServiceAlert();
    setGalleryDetail(null);
    setZoomImage(null);
    setPrivacyPageOpen(false);
    replaceBrowserPath("/");
    setAdminSpaceOpen(false);
    setSelectedAdminUser(null);
    setUserSpaceOpen(true);
    scrollToTop();
    void loadUserSpaceHistory();
  };

  const closeUserSpace = () => {
    setUserSpaceOpen(false);
    setGalleryDetail(prev => prev?.scope === "daily" ? null : prev);
    setUserHistoryMessage(null);
    scrollToTop();
  };

  const syncAdminTrialCode = (state: AdminTrialCodeState | AdminTrialCode | null) => {
    const trialCode = state && "trialCode" in state ? state.trialCode : state;
    const history = state && "history" in state ? state.history : trialCode ? [trialCode] : [];
    setAdminTrialCode(trialCode);
    setAdminTrialCodeHistory(Array.isArray(history) ? history : []);
    setAdminTrialCodeDraft(trialCode?.code || '');
    setAdminTrialUsesDraft(String(trialCode?.usesAdded || 5));
  };

  const loadAdminSpace = async (search = adminSearch) => {
    if (!isAdminAccount) return;
    setIsAdminLoading(true);
    setAdminMessage(null);
    setSelectedAdminUser(null);
    setSelectedAdminGeneration(null);
    try {
      const cleanedSearch = search.trim();
      setAdminAppliedSearch(cleanedSearch);
      const [dashboard, trialCode] = await Promise.all([
        fetchAdminDashboard(),
        fetchAdminTrialCode().catch(() => null)
      ]);
      const auditEntries = await fetchAdminAuditLog(cleanedSearch, 50).catch(() => []);
      const [users, generations] = cleanedSearch
        ? await Promise.all([
          fetchAdminUsers(cleanedSearch, 80),
          fetchAdminGenerations(cleanedSearch, 80)
        ])
        : [dashboard.users, dashboard.generations];
      setAdminDashboard(dashboard);
      setAdminUsers(users);
      setAdminGenerations(generations);
      setAdminAuditLog(auditEntries);
      if (trialCode) syncAdminTrialCode(trialCode);
      if (users.length === 0 && generations.length === 0) {
        setAdminMessage(cleanedSearch ? "Aucun resultat pour cette recherche." : "Aucune donnee admin disponible.");
      }
    } catch (err: any) {
      setAdminMessage(err?.message || "Administration indisponible.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const openAdminSpace = () => {
    if (!isAdminAccount) return;
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    clearServiceAlert();
    setGalleryDetail(null);
    setZoomImage(null);
    setPrivacyPageOpen(false);
    replaceBrowserPath("/");
    setUserSpaceOpen(false);
    setAdminSpaceOpen(true);
    scrollToTop();
    void loadAdminSpace("");
  };

  const closeAdminSpace = () => {
    setAdminSpaceOpen(false);
    setAdminMessage(null);
    setSelectedAdminUser(null);
    setSelectedAdminGeneration(null);
    setAdminAuditLog([]);
    syncAdminTrialCode(null);
    scrollToTop();
  };

  const applyAdminUserFilter = async (user: AdminUser) => {
    setSelectedAdminUser(null);
    setSelectedAdminGeneration(null);
    setIsAdminUserDetailLoading(true);
    setAdminMessage(null);
    try {
      const detail = await fetchAdminUserDetail(user.id, 80);
      const creditState = await fetchAdminCredits({ ownerType: "user", ownerId: user.id }, 1).catch(() => null);
      const auditEntries = await fetchAdminAuditLog(user.id, 50).catch(() => []);
      const detailedUser = creditState?.wallet
        ? { ...detail, creditBalance: creditState.wallet.balance }
        : detail;
      setSelectedAdminUser(detailedUser);
      setAdminSearch('');
      setAdminAppliedSearch('');
      setAdminUsers([detailedUser]);
      setAdminGenerations(detailedUser.generations);
      setAdminAuditLog(auditEntries);
    } catch (err: any) {
      setAdminMessage(err?.message || "Filtre utilisateur indisponible.");
    } finally {
      setIsAdminUserDetailLoading(false);
    }
  };

  const refreshSelectedAdminUser = async () => {
    if (!selectedAdminUser) return;
    await applyAdminUserFilter(selectedAdminUser);
  };

  const clearAdminUserFilter = () => {
    setSelectedAdminUser(null);
    setSelectedAdminGeneration(null);
    setAdminMessage(null);
    setAdminSearch('');
    setAdminAppliedSearch('');
    void loadAdminSpace('');
  };

  const handleAdminSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedAdminUser(null);
    void loadAdminSpace(adminSearch);
  };

  const setAdminUserStatusAction = async (user: AdminUser, nextStatus: AdminUserStatus) => {
    if (user.role === "admin" && nextStatus !== "active") {
      setAdminMessage("Les comptes administrateurs sont proteges.");
      return;
    }
    if (nextStatus === "deleted") {
      const confirmed = window.confirm("Supprimer ce compte de l'application ? Ses sessions seront fermees et ses fiches seront retirees de la vitrine publique.");
      if (!confirmed) return;
    }

    setAdminBusyId(`user-${user.id}-${nextStatus}`);
    setAdminMessage(null);
    try {
      const isFilteredUser = selectedAdminUser?.id === user.id;
      const updated = await updateAdminUserStatus(user.id, nextStatus);
      setAdminUsers(prev => prev.map(item => item.id === updated.id ? updated : item));
      setSelectedAdminUser(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
      if (nextStatus === "deleted") {
        setAdminGenerations(prev => prev.filter(item => item.ownerType !== "user" || item.ownerId !== updated.id));
        setSelectedAdminGeneration(prev => prev?.ownerType === "user" && prev.ownerId === updated.id ? null : prev);
      }
      if (isFilteredUser) {
        await applyAdminUserFilter({ ...user, ...updated });
      } else {
        await loadAdminSpace(adminSearch);
      }
      const statusMessage = nextStatus === "deleted"
        ? "Compte supprime de l'application. Ses fiches publiques ont ete retirees."
        : nextStatus === "suspended"
          ? "Compte suspendu."
          : "Compte reactive.";
      setAdminMessage(statusMessage);
    } catch (err: any) {
      setAdminMessage(err?.message || "Action utilisateur impossible.");
    } finally {
      setAdminBusyId(null);
    }
  };

  const hideAdminGenerationAction = async (generation: AdminGeneration) => {
    const confirmed = window.confirm("Masquer cette generation de la vitrine et des historiques visibles ?");
    if (!confirmed) return;

    setAdminBusyId(`generation-${generation.id}`);
    setAdminMessage(null);
    try {
      const filteredUserId = selectedAdminUser?.id || "";
      await hideAdminGeneration(generation);
      setAdminGenerations(prev => prev.filter(item => item.id !== generation.id));
      setSelectedAdminUser(prev => prev ? {
        ...prev,
        generations: prev.generations.filter(item => item.id !== generation.id),
        generationCount: Math.max(0, prev.generationCount - (prev.generations.some(item => item.id === generation.id) ? 1 : 0)),
        hiddenCount: prev.hiddenCount + (prev.generations.some(item => item.id === generation.id) ? 1 : 0)
      } : prev);
      setPublicGenerations(prev => prev.filter(item => item.id !== generation.publicGenerationId && item.id !== generation.id));
      setDailyResults(prev => {
        const next = prev.filter(item => item.id !== generation.id && item.id !== generation.publicGenerationId);
        saveDailyResults(next);
        return next;
      });
      setUserHistory(prev => prev.filter(item => item.id !== generation.id && item.id !== generation.publicGenerationId));
      if (filteredUserId && generation.ownerType === "user" && generation.ownerId === filteredUserId) {
        const detail = await fetchAdminUserDetail(filteredUserId, 80);
        const creditState = await fetchAdminCredits({ ownerType: "user", ownerId: filteredUserId }, 1).catch(() => null);
        const auditEntries = await fetchAdminAuditLog(filteredUserId, 50).catch(() => []);
        const detailedUser = creditState?.wallet
          ? { ...detail, creditBalance: creditState.wallet.balance }
          : detail;
        setSelectedAdminUser(detailedUser);
        setAdminUsers([detailedUser]);
        setAdminGenerations(detailedUser.generations);
        setAdminAuditLog(auditEntries);
      } else {
        await loadAdminSpace(adminSearch);
      }
      setSelectedAdminGeneration(prev => prev?.id === generation.id ? null : prev);
      setAdminMessage("Generation masquee.");
    } catch (err: any) {
      setAdminMessage(err?.message || "Masquage impossible.");
    } finally {
      setAdminBusyId(null);
    }
  };

  const isAdminGenerationPublished = (generation?: Pick<AdminGeneration, "status" | "publicGenerationId"> | null) =>
    Boolean(generation && (generation.status === "published" || generation.publicGenerationId));

  const isAdminGenerationBusy = (generation?: Pick<AdminGeneration, "id"> | null) =>
    Boolean(generation && (
      adminBusyId === `generation-${generation.id}` ||
      adminBusyId === `generation-public-${generation.id}`
    ));

  const updatePublicStateAfterAdminUnpublish = (
    originalGeneration: AdminGeneration,
    updatedGeneration: AdminGeneration,
    publicGenerationId = ""
  ) => {
    const removedPublicIds = new Set(
      [publicGenerationId, originalGeneration.publicGenerationId, originalGeneration.id]
        .map(value => String(value || ""))
        .filter(Boolean)
    );
    const matchesGeneration = (entry: Pick<AdminGeneration, "id" | "ownerType" | "ownerId">) =>
      entry.id === updatedGeneration.id &&
      entry.ownerType === updatedGeneration.ownerType &&
      entry.ownerId === updatedGeneration.ownerId;
    const matchesHistoryGeneration = (entry: Partial<PublicGeneration>) =>
      entry.id === updatedGeneration.id ||
      entry.personalGenerationId === updatedGeneration.id ||
      removedPublicIds.has(String(entry.publicGenerationId || ""));
    const unpublishHistoryEntry = (entry: PublicGeneration): PublicGeneration =>
      matchesHistoryGeneration(entry)
        ? {
          ...entry,
          status: updatedGeneration.status,
          publicGenerationId: "",
          publicImageUrl: "",
          publicAdditionalViews: undefined
        }
        : entry;

    setAdminGenerations(prev => prev.map(item => matchesGeneration(item) ? updatedGeneration : item));
    setAdminUsers(prev => prev.map(user =>
      updatedGeneration.ownerType === "user" && user.id === updatedGeneration.ownerId
        ? { ...user, publishedCount: Math.max(0, Number(user.publishedCount || 0) - 1) }
        : user
    ));
    setSelectedAdminUser(prev => prev ? {
      ...prev,
      publishedCount: updatedGeneration.ownerType === "user" && prev.id === updatedGeneration.ownerId
        ? Math.max(0, Number(prev.publishedCount || 0) - 1)
        : prev.publishedCount,
      generations: prev.generations.map(item => matchesGeneration(item) ? updatedGeneration : item)
    } : prev);
    setAdminDashboard(prev => prev ? {
      ...prev,
      overview: {
        ...prev.overview,
        generationsPublished: Math.max(0, Number(prev.overview?.generationsPublished || 0) - 1)
      }
    } : prev);
    setPublicGenerations(prev => prev.filter(item =>
      !removedPublicIds.has(String(item.id || "")) &&
      !removedPublicIds.has(String(item.publicGenerationId || ""))
    ));
    setDailyResults(prev => {
      const next = prev.map(unpublishHistoryEntry);
      saveDailyResults(next);
      return next;
    });
    setUserHistory(prev => prev.map(unpublishHistoryEntry));
    setGalleryDetail(prev => {
      if (!prev) return prev;
      if (prev.scope === "public" && removedPublicIds.has(String(prev.item.id || ""))) return null;
      if (matchesHistoryGeneration(prev.item)) return { ...prev, item: unpublishHistoryEntry(prev.item) };
      return prev;
    });
    setPublishedGenerationIds(prev => prev.filter(id => !removedPublicIds.has(id)));
    setSelectedAdminGeneration(prev =>
      prev && matchesGeneration(prev)
        ? {
          ...prev,
          ...updatedGeneration,
          publicGenerationId: "",
          status: updatedGeneration.status
        }
        : prev
    );
  };

  const unpublishAdminGenerationAction = async (generation: AdminGeneration) => {
    if (!isAdminGenerationPublished(generation)) {
      setAdminMessage("Cette fiche n'est pas publiee dans la vitrine.");
      return;
    }
    const confirmed = window.confirm("Retirer cette fiche de la vitrine publique ? Elle restera dans l'historique personnel.");
    if (!confirmed) return;

    setAdminBusyId(`generation-public-${generation.id}`);
    setAdminMessage(null);
    try {
      const result = await unpublishAdminGeneration(generation);
      updatePublicStateAfterAdminUnpublish(generation, result.generation, result.publicGenerationId);
      setAdminMessage("Fiche retiree de la vitrine publique.");
    } catch (err: any) {
      setAdminMessage(err?.message || "Retrait de la vitrine impossible.");
    } finally {
      setAdminBusyId(null);
    }
  };

  const openAdminGenerationDetail = async (generation: AdminGeneration) => {
    setIsAdminGenerationDetailLoading(true);
    setAdminBusyId(`generation-detail-${generation.id}`);
    setAdminMessage(null);
    try {
      const detail = await fetchAdminGenerationDetail(generation);
      setSelectedAdminGeneration(detail);
    } catch (err: any) {
      setAdminMessage(err?.message || "Fiche generation indisponible.");
    } finally {
      setIsAdminGenerationDetailLoading(false);
      setAdminBusyId(null);
    }
  };

  const adjustSelectedAdminUserCredits = async (amount: number) => {
    if (!selectedAdminUser) return;
    if (!Number.isInteger(amount) || amount === 0) {
      setAdminMessage("Action credit invalide.");
      return;
    }

    setIsAdminCreditBusy(true);
    setAdminMessage(null);
    try {
      const result = await adjustAdminCredits({
        ownerType: "user",
        ownerId: selectedAdminUser.id,
        amount,
        reason: "Ajustement administrateur"
      });
      setSelectedAdminUser(prev => prev ? { ...prev, creditBalance: result.wallet.balance } : prev);
      setAdminUsers(prev => prev.map(user => user.id === selectedAdminUser.id ? { ...user, creditBalance: result.wallet.balance } : user));
      const auditEntries = await fetchAdminAuditLog(selectedAdminUser.id, 50).catch(() => []);
      setAdminAuditLog(auditEntries);
    } catch (err: any) {
      setAdminMessage(err?.message || "Ajustement credits impossible.");
    } finally {
      setIsAdminCreditBusy(false);
    }
  };

  const handleAdminTrialCodeSave = async (regenerate = false) => {
    const usesAdded = Number(adminTrialUsesDraft);
    if (!Number.isInteger(usesAdded) || usesAdded < 1 || usesAdded > 50) {
      setAdminMessage("Le nombre d'essais doit etre entre 1 et 50.");
      return;
    }
    if (!regenerate && adminTrialCodeDraft.trim().length < 8) {
      setAdminMessage("Le code bonus doit contenir au moins 8 caracteres.");
      return;
    }

    setIsAdminTrialCodeBusy(true);
    setAdminTrialCodeCopied(false);
    setAdminMessage(null);
    try {
      const updated = await saveAdminTrialCode({
        code: adminTrialCodeDraft,
        usesAdded,
        regenerate
      });
      syncAdminTrialCode(updated);
      const auditEntries = await fetchAdminAuditLog("trial_code", 50).catch(() => []);
      setAdminAuditLog(auditEntries);
      setAdminMessage(regenerate ? "Nouveau code bonus genere." : "Code bonus mis a jour.");
    } catch (err: any) {
      setAdminMessage(err?.message || "Mise a jour du code bonus impossible.");
    } finally {
      setIsAdminTrialCodeBusy(false);
    }
  };

  const copyAdminTrialCode = async () => {
    const code = adminTrialCodeDraft.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setAdminTrialCodeCopied(true);
      window.setTimeout(() => setAdminTrialCodeCopied(false), 1800);
    } catch {
      setAdminMessage("Copie impossible depuis ce navigateur.");
    }
  };

  const imageFileName = (label: string, suffix = "face") =>
    `${label || "morphostyle"}-${suffix}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 70) || "morphostyle-resultat";

  const imageDownloadName = (label: string, suffix: string, url = "") => {
    const extension = String(url).match(/\.(png|webp|jpg|jpeg)(?:$|\?)/i)?.[1]?.toLowerCase() || "jpg";
    return `${imageFileName(label, suffix)}.${extension === "jpeg" ? "jpg" : extension}`;
  };

  const shareableUrlFromImage = (url = "") => {
    if (!url || url.startsWith("data:")) return window.location.href;
    try {
      return new URL(url, window.location.origin).href;
    } catch {
      return window.location.href;
    }
  };

  const shareResultExternally = async (item: Pick<Proposal | PublicGeneration, "styleName" | "imageUrl">) => {
    const url = shareableUrlFromImage(item.imageUrl);
    const title = `MorphoStyle Studio - ${item.styleName || "resultat"}`;
    const text = `Decouvrez ce style MorphoStyle: ${item.styleName || "resultat personnalise"}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        setNotice("Partage ouvert.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Lien copie. Vous pouvez le coller dans votre application preferee.");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setNotice("Partage impossible depuis ce navigateur.");
      }
    }
  };

  const createUnavailableImageFallback = () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 640">
        <rect width="512" height="640" fill="#f8fafc" />
        <rect x="32" y="32" width="448" height="576" rx="36" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" />
        <path d="M170 276c0-58 39-102 86-102s86 44 86 102v28H170v-28Z" fill="#f3f4f6" stroke="#d1d5db" stroke-width="8" />
        <circle cx="256" cy="232" r="38" fill="#e5e7eb" />
        <path d="M176 356h160c18 0 32 14 32 32v22H144v-22c0-18 14-32 32-32Z" fill="#e5e7eb" />
        <text x="256" y="470" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800" fill="#111827">Image indisponible</text>
        <text x="256" y="510" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="#6b7280">Actualisez la fiche</text>
      </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const imageFailureKey = (url = "") => String(url || "").trim();

  const isImageUnavailable = (url = "") =>
    failedImageUrls.includes(imageFailureKey(url));

  const usesPersonalPhotoAssets = (item: Partial<PublicGeneration | Proposal> & { sourceProvider?: string } = {}) =>
    String((item as Partial<PublicGeneration>).sourceLabel || "").toLowerCase().includes("photo personnelle") ||
    String(item.id || "").startsWith("openai-") ||
    item.sourceProvider === "openai-upload";

  const containsPrivateOpenAiAsset = (value: unknown): boolean => {
    if (typeof value === "string") return value.includes("/generated-openai/");
    if (Array.isArray(value)) return value.some(containsPrivateOpenAiAsset);
    if (value && typeof value === "object") return Object.values(value).some(containsPrivateOpenAiAsset);
    return false;
  };

  const publicationAssetPayload = (item: Partial<PublicGeneration | Proposal> = {}) => ({
    imageUrl: (item as Proposal).assetImageUrl || item.imageUrl,
    additionalViews: (item as Proposal).assetAdditionalViews || item.additionalViews,
    historyItem: (item as Proposal).historyItem
  });

  const hasPersonalGenerationReference = (item: Partial<PublicGeneration | Proposal> = {}) => {
    const historyItem = (item as Proposal).historyItem;
    return Boolean(
      (item as PublicGeneration).personalGenerationId ||
      historyItem?.personalGenerationId ||
      historyItem?.id
    );
  };

  const canPublishToPublicGallery = (item: Partial<PublicGeneration | Proposal> = {}) =>
    account?.type === "user" &&
    !isRecommendationSession(item as PublicGeneration) &&
    (
      containsPrivateOpenAiAsset(publicationAssetPayload(item)) ||
      hasPersonalGenerationReference(item)
    );

  const fallbackForImage = (item: any, forceUnavailable = false) =>
    forceUnavailable || usesPersonalPhotoAssets(item)
      ? createUnavailableImageFallback()
      : createLocalPreviewFallback(item);

  const handleImageError = (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
    item: any,
    url = "",
    forceUnavailable = false
  ) => {
    event.currentTarget.onerror = null;
    if (url) {
      const key = imageFailureKey(url);
      setFailedImageUrls(prev => prev.includes(key) ? prev : [...prev, key].slice(-80));
    }
    event.currentTarget.src = fallbackForImage(item, forceUnavailable);
  };

  const createOriginalHistoryPreview = async (source?: string | null) => {
    if (!source) return "";
    if (!source.startsWith("data:image/")) return source;

    return new Promise<string>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const maxWidth = 320;
        const maxHeight = 426;
        const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve("");
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => resolve(source.length < 750000 ? source : "");
      image.src = source;
    });
  };

  const viewLabel = (key: string) => {
    if (key === "front") return "Face";
    if (key === "left") return "Vue gauche";
    if (key === "right") return "Vue droite";
    if (key === "back") return "Dos";
    return key;
  };

  const recommendationEntries = (item: PublicGeneration) => {
    const cachedAssets = recommendationCacheKeys(item)
      .map(key => recommendationAssetCache[key])
      .find(Boolean);
    const recommendations = item.recommendations?.length
      ? item.recommendations
      : cachedAssets?.recommendations || [];

    return recommendations
      .map((recommendation, index) => {
        const cachedRecommendation = cachedAssets?.recommendations?.[index];
        const cachedPreview = cachedRecommendation?.previewUrl || cachedRecommendation?.imageUrl || "";
        const persistedPreview = recommendation.assetPreviewUrl || cachedRecommendation?.assetPreviewUrl || "";
        const url = dataImageUrl(cachedPreview)
          ? cachedPreview
          : recommendation.previewUrl || recommendation.imageUrl || persistedPreview || cachedPreview || "";

        return {
          ...recommendation,
          key: recommendation.id || cachedRecommendation?.id || `recommendation-${index + 1}`,
          label: recommendation.styleName || recommendation.name || cachedRecommendation?.styleName || cachedRecommendation?.name || `Proposition ${index + 1}`,
          url,
          previewUrl: recommendation.previewUrl || cachedRecommendation?.previewUrl || "",
          assetPreviewUrl: recommendation.assetPreviewUrl || cachedRecommendation?.assetPreviewUrl || "",
          imageUrl: recommendation.imageUrl || cachedRecommendation?.imageUrl || ""
        };
      })
      .filter(entry => Boolean(entry.url));
  };

  const isRecommendationSession = (item: PublicGeneration) =>
    item.status === "recommendations_ready";

  const primaryGenerationUrl = (item: PublicGeneration) =>
    item.publicImageUrl && (!item.imageUrl || isImageUnavailable(item.imageUrl))
      ? item.publicImageUrl
      : item.imageUrl;

  const mergedGenerationViews = (item: PublicGeneration) => {
    const privateViews = (item.additionalViews || {}) as Partial<AdditionalViews>;
    const publicViews = (item.publicAdditionalViews || {}) as Partial<AdditionalViews>;
    const keys = Array.from(new Set([...Object.keys(privateViews), ...Object.keys(publicViews)]));

    return keys.reduce<Partial<AdditionalViews>>((views, key) => {
      const privateUrl = privateViews[key as keyof AdditionalViews];
      const publicUrl = publicViews[key as keyof AdditionalViews];
      const displayUrl = publicUrl && (!privateUrl || isImageUnavailable(privateUrl))
        ? publicUrl
        : privateUrl;
      if (displayUrl) views[key as keyof AdditionalViews] = displayUrl;
      return views;
    }, {});
  };

  const generationCoverUrl = (item: PublicGeneration) =>
    isRecommendationSession(item)
      ? recommendationEntries(item)[0]?.url || item.imageUrl
      : primaryGenerationUrl(item);

  const generationImageCount = (item: PublicGeneration) =>
    isRecommendationSession(item) ? recommendationEntries(item).length : generationImages(item).length;

  const generationImages = (item: PublicGeneration) => [
    ...(isRecommendationSession(item)
      ? recommendationEntries(item).map((entry, index) => ({
        key: entry.key,
        label: `Proposition ${index + 1}`,
        url: entry.url
      }))
      : [{ key: "front", label: viewLabel("front"), url: primaryGenerationUrl(item) }]),
    ...Object.entries(mergedGenerationViews(item)).map(([key, url]) => ({
      key,
      label: viewLabel(key),
      url
    }))
  ].filter(entry => Boolean(entry.url));

  const adminGenerationImages = (item: AdminGenerationDetail) => [
    { key: "front", label: viewLabel("front"), url: item.imageUrl },
    ...Object.entries(item.additionalViews || {}).map(([key, url]) => ({
      key,
      label: viewLabel(key),
      url
    }))
  ].filter(entry => Boolean(entry.url));

  const historyRecommendationToStyle = (
    item: PublicGeneration,
    recommendation: NonNullable<PublicGeneration["recommendations"]>[number],
    index: number,
    sourceAssetUrl = ""
  ): StyleRecommendation => ({
    id: recommendation.id || `openai-upload-${item.personalGenerationId || item.id}-${index + 1}`,
    name: recommendation.styleName || recommendation.name || `Proposition ${index + 1}`,
    description: recommendation.description || "Proposition reprise depuis votre historique personnel.",
    color: recommendation.color || item.color || "Naturel",
    beardStyle: recommendation.beardStyle || "Aucune",
    whyItWorks: recommendation.whyItWorks || "Cette coupe reste adaptee a la morphologie detectee et aux reglages choisis.",
    previewUrl: recommendation.previewUrl || recommendation.imageUrl || recommendation.assetPreviewUrl || "",
    assetPreviewUrl: recommendation.assetPreviewUrl || recommendation.previewUrl || recommendation.imageUrl || "",
    sourceProvider: "openai-upload",
    generationSessionId: item.personalGenerationId || item.id,
    sourceAssetUrl,
    selectedReferenceAssetUrl: recommendation.assetPreviewUrl || ""
  });

  const refreshGenerationForResume = async (item: PublicGeneration) => {
    if (account?.type !== "user") return item;

    try {
      const serverResults = await fetchPersonalGenerations("all", 120);
      const freshItem = findMatchingGeneration(serverResults, item) || item;
      setDailyResults(prev => {
        const merged = mergeHistoryResults(serverResults, prev);
        saveDailyResults(merged);
        return merged;
      });
      setUserHistory(prev => prev.length > 0 ? mergeHistoryResultsWithLimit(120, serverResults, prev) : prev);
      return freshItem;
    } catch {
      return item;
    }
  };

  const hydratePersonalGenerationAssets = async (item: PublicGeneration) => {
    if (account?.type !== "user") return item;
    const generationId = item.personalGenerationId || item.id;
    if (!generationId) return item;

    try {
      const hydrated = await fetchPersonalGenerationAssets(generationId);
      const mergedItem: PublicGeneration = {
        ...item,
        ...hydrated,
        recommendations: hydrated.recommendations?.length ? hydrated.recommendations : item.recommendations
      };
      const keys = recommendationCacheKeys(mergedItem);

      setRecommendationAssetCache(prev => {
        const next = { ...prev };
        keys.forEach(key => {
          next[key] = mergedItem;
        });
        return next;
      });
      setDailyResults(prev => {
        const next = prev.map(entry => isSameGeneration(entry, mergedItem) ? { ...entry, ...mergedItem } : entry);
        saveDailyResults(next);
        return next;
      });
      setUserHistory(prev => prev.map(entry => isSameGeneration(entry, mergedItem) ? { ...entry, ...mergedItem } : entry));
      setGalleryDetail(prev => prev?.scope === "daily" && isSameGeneration(prev.item, mergedItem)
        ? { ...prev, item: { ...prev.item, ...mergedItem } }
        : prev);

      return mergedItem;
    } catch {
      return item;
    }
  };

  const resumeRecommendationSession = async (item: PublicGeneration) => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }

    const freshBeforeHydration = await refreshGenerationForResume(item);
    const resumeSourceAssetUrl = !dataImageUrl(freshBeforeHydration.originalImageUrl || "")
      ? freshBeforeHydration.originalImageUrl || ""
      : !dataImageUrl(item.originalImageUrl || "")
        ? item.originalImageUrl || ""
        : "";
    const freshItem = await hydratePersonalGenerationAssets(freshBeforeHydration);
    const cachedAssets = [
      ...recommendationCacheKeys(freshItem),
      ...recommendationCacheKeys(item)
    ]
      .map(key => recommendationAssetCache[key])
      .find(Boolean);
    const sourceImage = cachedAssets?.originalImageUrl && dataImageUrl(cachedAssets.originalImageUrl)
      ? cachedAssets.originalImageUrl
      : freshItem.originalImageUrl || item.originalImageUrl || "";
    const itemForResume: PublicGeneration = {
      ...freshItem,
      originalImageUrl: sourceImage || freshItem.originalImageUrl,
      recommendations: freshItem.recommendations?.length
        ? freshItem.recommendations
        : cachedAssets?.recommendations || item.recommendations || []
    };
    const entries = recommendationEntries(itemForResume);
    if (!entries.length) {
      setGalleryDetail({ item: itemForResume, scope: "daily" });
      setZoomImage(null);
      return;
    }

    if (!sourceImage) {
      setUserHistoryMessage("Photo d'origine indisponible pour reprendre cette recommandation.");
      setGalleryDetail({ item: itemForResume, scope: "daily" });
      setZoomImage(null);
      return;
    }

    const restoredConsultation = normalizeHistoryConsultation(itemForResume.consultation || {});
    const restoredAnalysis: AnalysisResult = {
      faceShape: itemForResume.faceShape || "morphologie personnalisee",
      hairTexture: "Analyse reprise depuis l'historique",
      skinTone: itemForResume.color || "Naturel",
      detectedGender: restoredConsultation.gender,
      professionalAdvice: consultationAdvice(restoredConsultation),
      recommendedStyles: entries.map((entry, index) =>
        historyRecommendationToStyle(itemForResume, entry, index, resumeSourceAssetUrl)
      ),
      generationSessionId: itemForResume.personalGenerationId || itemForResume.id,
      historyItem: itemForResume
    };

    cancelActiveOperation();
    clearServiceAlert();
    setGalleryDetail(null);
    setZoomImage(null);
    setUserSpaceOpen(false);
    setAdminSpaceOpen(false);
    setSelectedExampleId(null);
    setConsultation(restoredConsultation);
    setUserImage(sourceImage);
    setAnalysis(restoredAnalysis);
    setSelectedStyles([]);
    setProposals([]);
    setPublishedProposalIds([]);
    setState(AppState.SELECTION);
    setNotice("Recommandations reprises depuis votre historique.");
    scrollToTop();
  };

  const recommendationParentId = (item: PublicGeneration) =>
    item.recommendationSessionId || item.parentGenerationId || (
      item.status !== "recommendations_ready" && recommendationEntries(item).length > 0
        ? item.personalGenerationId || item.id
        : ""
    );

  const asRecommendationSessionForResume = (item: PublicGeneration, parentId = recommendationParentId(item)): PublicGeneration => ({
    ...item,
    id: parentId || item.personalGenerationId || item.id,
    personalGenerationId: parentId || item.personalGenerationId || item.id,
    status: "recommendations_ready",
    imageUrl: recommendationEntries(item)[0]?.url || item.imageUrl
  });

  const canResumeSavedRecommendations = (item: PublicGeneration) =>
    account?.type === "user" && (
      isRecommendationSession(item) ||
      Boolean(recommendationParentId(item)) ||
      recommendationEntries(item).length > 0
    );

  const resumeSavedRecommendations = async (item: PublicGeneration) => {
    if (isRecommendationSession(item)) {
      await resumeRecommendationSession(item);
      return;
    }

    const parentId = recommendationParentId(item);
    let candidate: PublicGeneration | null = null;

    try {
      const serverResults = await fetchPersonalGenerations("all", 120);
      setDailyResults(prev => {
        const merged = mergeHistoryResults(serverResults, prev);
        saveDailyResults(merged);
        return merged;
      });
      setUserHistory(prev => mergeHistoryResultsWithLimit(120, serverResults, prev));
      candidate = serverResults.find(entry => {
        const entryId = entry.personalGenerationId || entry.id;
        return Boolean(parentId && entryId === parentId && recommendationEntries(entry).length > 0);
      }) || null;
    } catch {
      candidate = null;
    }

    const itemWithAssets = await hydratePersonalGenerationAssets(candidate || item);
    const resumable = candidate
      ? asRecommendationSessionForResume(itemWithAssets, parentId)
      : recommendationEntries(itemWithAssets).length > 0
        ? asRecommendationSessionForResume(itemWithAssets, parentId)
        : null;

    if (!resumable) {
      setUserHistoryMessage("Recommandations d'origine indisponibles pour cette fiche.");
      return;
    }

    await resumeRecommendationSession(resumable);
  };

  const openGenerationSheet = (item: PublicGeneration, scope: 'daily' | 'public') => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    if (scope === "daily" && !userSpaceOpen) {
      setGalleryDetail(null);
      return;
    }
    if (scope === "daily" && isRecommendationSession(item)) {
      void resumeRecommendationSession(item);
      return;
    }

    setGalleryDetail({ item, scope });
    setZoomImage(null);
    if (scope === "daily" && account?.type === "user") {
      void hydratePersonalGenerationAssets(item);
    }
  };

  const closeGenerationSheet = () => setGalleryDetail(null);

  const formattedGenerationDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const isGenerationPublished = (item: PublicGeneration) =>
    Boolean(item.publicGenerationId || publishedGenerationIds.includes(item.id));

  const publicPublicationUnavailableReason = (item: Partial<PublicGeneration | Proposal> = {}) => {
    if (account?.type !== "user") return "Connectez-vous pour publier une fiche personnelle.";
    if (isRecommendationSession(item as PublicGeneration)) return "Choisissez une proposition finale avant de publier.";
    if (!containsPrivateOpenAiAsset(publicationAssetPayload(item)) && !hasPersonalGenerationReference(item)) {
      return "Rouvrez une finale personnelle depuis votre historique pour verifier sa publication.";
    }
    return "Publication indisponible.";
  };

  const shouldShowPublicationAction = (item: Partial<PublicGeneration | Proposal> = {}) =>
    canPublishToPublicGallery(item) ||
    usesPersonalPhotoAssets(item as Partial<PublicGeneration | Proposal> & { sourceProvider?: string }) ||
    isGenerationPublished(item as PublicGeneration);

  const dailyGenerationFromProposal = (
    proposal: Proposal,
    analysisInput = analysis,
    consultationInput = consultation,
    sourceLabel = selectedExample ? selectedExample.name : "Photo personnelle",
    originalImageUrl = ""
  ): PublicGeneration | null => {
    if (!analysisInput) return null;

    return {
      id: `${Date.now().toString(36)}-${proposal.id}-${Math.random().toString(36).slice(2, 7)}`,
      imageUrl: proposal.assetImageUrl || proposal.imageUrl,
      styleName: proposal.styleName,
      color: proposal.color,
      faceShape: analysisInput.faceShape,
      sourceLabel,
      createdAt: new Date().toISOString(),
      additionalViews: proposal.assetAdditionalViews || proposal.additionalViews,
      backgroundTreatment: proposal.backgroundTreatment,
      consultation: consultationInput,
      originalImageUrl
    };
  };

  const rememberDailyProposals = async (
    items: Proposal[],
    analysisInput = analysis,
    consultationInput = consultation,
    sourceLabel = selectedExample ? selectedExample.name : "Photo personnelle",
    originalSource = userImage
  ) => {
    const originalImageUrl = await createOriginalHistoryPreview(originalSource);
    const preparedEntries = items
      .map(item => {
        if (item.historyItem) {
          const persistent = item.historyItem;
          return {
            display: {
              ...persistent,
              imageUrl: item.imageUrl || persistent.imageUrl,
              additionalViews: item.additionalViews || persistent.additionalViews,
              backgroundTreatment: item.backgroundTreatment || persistent.backgroundTreatment
            },
            persistent,
            needsServerSave: false
          };
        }

        const entry = dailyGenerationFromProposal(item, analysisInput, consultationInput, sourceLabel, originalImageUrl);
        return entry ? {
          display: entry,
          persistent: entry,
          needsServerSave: true
        } : null;
      })
      .filter((item): item is { display: PublicGeneration; persistent: PublicGeneration; needsServerSave: boolean } => Boolean(item));
    if (!preparedEntries.length) return;

    const displayEntries = preparedEntries.map(entry => entry.display);
    const persistentEntriesById = new Map(preparedEntries.map(entry => [entry.display.id, entry.persistent]));

    setDailyResults(prev => {
      const merged = [
        ...displayEntries,
        ...prev.filter(item => !displayEntries.some(entry => entry.imageUrl === item.imageUrl || entry.id === item.id))
      ].slice(0, 48);
      saveDailyResults(merged.map(item => persistentEntriesById.get(item.id) || item));
      return merged;
    });

    const entriesToSave = preparedEntries.filter(entry => entry.needsServerSave).map(entry => entry.persistent);
    if (!entriesToSave.length) return;

    void Promise.all(entriesToSave.map(entry => savePersonalGeneration(entry).catch(() => null)))
      .then(savedEntries => {
        const saved = savedEntries.filter((entry): entry is PublicGeneration => Boolean(entry));
        if (!saved.length) return;
        setDailyResults(prev => {
          const merged = mergeHistoryResults(saved, prev);
          saveDailyResults(merged);
          return merged;
        });
      });
  };

  const publishProposal = async (proposal: Proposal) => {
    if (!analysis) return;
    if (!canPublishToPublicGallery(proposal)) {
      setNotice("Connectez-vous et finalisez une photo personnelle avant de publier dans la vitrine.");
      return;
    }
    setPublishingProposalId(proposal.id);
    try {
      const publishableProposal = {
        ...proposal,
        imageUrl: proposal.assetImageUrl || proposal.historyItem?.imageUrl || proposal.imageUrl,
        additionalViews: proposal.assetAdditionalViews || proposal.historyItem?.additionalViews || proposal.additionalViews
      };
      const generation = await publishPublicGeneration({
        proposal: publishableProposal,
        analysis,
        consultation,
        sourceLabel: selectedExample ? selectedExample.name : "Photo personnelle"
      });
      setPublicGenerations(prev => [generation, ...prev.filter(item => item.id !== generation.id && item.imageUrl !== generation.imageUrl)]);
      setPublishedProposalIds(prev => prev.includes(proposal.id) ? prev : [...prev, proposal.id]);
      setNotice("Resultat ajoute a la vitrine publique.");
    } catch (err: any) {
      showServiceError(err, "Publication vitrine impossible.");
    } finally {
      setPublishingProposalId(null);
    }
  };

  const publishDailyGeneration = async (item: PublicGeneration) => {
    if (isRecommendationSession(item)) {
      void resumeRecommendationSession(item);
      return;
    }
    if (!canPublishToPublicGallery(item)) {
      setNotice("Connectez-vous et finalisez une photo personnelle avant de publier dans la vitrine.");
      return;
    }

    setPublishingGenerationId(item.id);
    try {
      const generation = await publishPublicGeneration({
        proposal: {
          id: item.id,
          imageUrl: item.imageUrl,
          styleName: item.styleName,
          description: item.styleName,
          whyItWorks: item.faceShape,
          color: item.color,
          beardStyle: "Aucune",
          additionalViews: item.additionalViews,
          backgroundTreatment: item.backgroundTreatment
        },
        analysis: { faceShape: item.faceShape },
        consultation: {
          maintenance: item.consultation?.maintenance || "medium",
          lifestyle: item.consultation?.lifestyle || "modern",
          targetLength: item.consultation?.targetLength || "any",
          gender: item.consultation?.gender || "non-binary",
          ageGroup: item.consultation?.ageGroup || "adult"
        },
        sourceLabel: item.sourceLabel
      });

      setPublicGenerations(prev => [generation, ...prev.filter(entry => entry.id !== generation.id && entry.imageUrl !== generation.imageUrl)]);
      setPublishedGenerationIds(prev => prev.includes(item.id) ? prev : [...prev, item.id]);
      setDailyResults(prev => {
        const next = prev.map(entry => entry.id === item.id ? { ...entry, publicGenerationId: generation.id } : entry);
        saveDailyResults(next);
        return next;
      });
      setUserHistory(prev => prev.map(entry => entry.id === item.id ? { ...entry, publicGenerationId: generation.id } : entry));
      setGalleryDetail(prev => prev?.item.id === item.id ? {
        ...prev,
        item: { ...prev.item, publicGenerationId: generation.id }
      } : prev);
      setNotice("Resultat ajoute a la vitrine publique.");
    } catch (err: any) {
      showServiceError(err, "Publication vitrine impossible.");
    } finally {
      setPublishingGenerationId(null);
    }
  };

  const generationIdMatches = (entry: PublicGeneration, ids: Set<string>, imageUrl = "") =>
    ids.has(entry.id) ||
    ids.has(entry.personalGenerationId || "") ||
    ids.has(entry.publicGenerationId || "") ||
    (!!imageUrl && entry.imageUrl === imageUrl);

  const removePersonalGenerationFromUi = (item: PublicGeneration, publicGenerationId = item.publicGenerationId || "") => {
    const ids = new Set([
      item.id,
      item.personalGenerationId || "",
      item.publicGenerationId || "",
      publicGenerationId
    ].filter(Boolean));

    setDailyResults(prev => {
      const next = prev.filter(entry => !generationIdMatches(entry, ids, item.imageUrl));
      saveDailyResults(next);
      return next;
    });
    setUserHistory(prev => prev.filter(entry => !generationIdMatches(entry, ids, item.imageUrl)));
    setPublishedGenerationIds(prev => prev.filter(id => !ids.has(id)));
    setPublicGenerations(prev => prev.filter(entry => !generationIdMatches(entry, ids, item.imageUrl)));
    setGalleryDetail(prev => prev && generationIdMatches(prev.item, ids, item.imageUrl) ? null : prev);
    setRecommendationAssetCache(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        delete next[id];
      });
      return next;
    });
  };

  const deleteUserGeneration = async (item: PublicGeneration) => {
    if (account?.type !== "user") {
      setUserHistoryMessage("Connectez-vous pour supprimer une fiche sauvegardee.");
      return;
    }

    const confirmed = window.confirm(
      isGenerationPublished(item)
        ? "Supprimer cette fiche de votre historique et la retirer du public ?"
        : "Supprimer cette fiche de votre historique ?"
    );
    if (!confirmed) return;

    const personalId = item.personalGenerationId || item.id;
    setDeletingGenerationId(item.id);
    setUserHistoryMessage(null);
    try {
      const deleted = await deletePersonalGeneration(personalId, item.publicGenerationId || "", item);
      removePersonalGenerationFromUi(item, deleted.publicGenerationId || item.publicGenerationId || "");
    } catch (err: any) {
      setUserHistoryMessage(err?.message || "Suppression fiche impossible.");
    } finally {
      setDeletingGenerationId(null);
    }
  };

  const getExampleSourceNote = (example: DemoExample) =>
    example.assetId === "marc"
      ? "Planche statique preparee: la morphologie de depart est gardee, puis les recommandations viennent de la selection validee."
      : "Profil charge depuis la base locale: la morphologie de depart est gardee, puis les recommandations se recalculent selon vos reglages.";

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const pushBrowserPath = (pathname: string) => {
    if (typeof window === "undefined" || normalizedAppPath(window.location.pathname) === pathname) return;
    window.history.pushState(null, "", pathname);
  };
  const replaceBrowserPath = (pathname: string) => {
    if (typeof window === "undefined" || normalizedAppPath(window.location.pathname) === pathname) return;
    window.history.replaceState(null, "", pathname);
  };
  const beginOperation = () => {
    activeOperationRef.current += 1;
    return activeOperationRef.current;
  };
  const cancelActiveOperation = () => {
    activeOperationRef.current += 1;
    activeGenerationLockRef.current = null;
    setPendingGeneration(null);
  };
  const isCurrentOperation = (operationId: number) => activeOperationRef.current === operationId;
  const beginGenerationOperation = (pending: Omit<PendingGenerationCard, "id" | "createdAt">) => {
    if (activeGenerationLockRef.current !== null || isGenerationInProgress) {
      showGenerationAlreadyRunningNotice();
      return null;
    }

    const operationId = beginOperation();
    activeGenerationLockRef.current = operationId;
    setPendingGeneration({
      ...pending,
      id: `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString()
    });
    return operationId;
  };
  const completeGenerationOperation = (operationId: number) => {
    if (activeGenerationLockRef.current !== operationId) return;
    activeGenerationLockRef.current = null;
    setPendingGeneration(null);
  };

  const BackButton = ({ onClick, label = "Retour" }: { onClick: () => void; label?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="relative z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  );

  const HomeButton = () => (
    <button
      type="button"
      onClick={resetExperience}
      title="Accueil"
      aria-label="Accueil"
      className="relative z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
    >
      <Home className="h-4 w-4" />
    </button>
  );

  const UserSpaceButton = () => (
    <button
      type="button"
      onClick={openUserSpace}
      title="Espace utilisateur"
      aria-label="Espace utilisateur"
      className={`relative z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-rose-100 ${userSpaceOpen ? "border-rose-200 bg-rose-50 text-rose-600" : "border-gray-100 bg-white text-gray-600 hover:border-rose-200 hover:text-rose-600"}`}
    >
      <User className="h-4 w-4" />
    </button>
  );

  const AdminSpaceButton = () => (
    <button
      type="button"
      onClick={openAdminSpace}
      title="Administration"
      aria-label="Administration"
      className={`relative z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-rose-100 ${adminSpaceOpen ? "border-rose-200 bg-rose-50 text-rose-600" : "border-gray-100 bg-white text-gray-600 hover:border-rose-200 hover:text-rose-600"}`}
    >
      <ShieldCheck className="h-4 w-4" />
    </button>
  );

  const StepHeader = ({
    title,
    children,
    titleClassName = "serif text-4xl md:text-5xl font-bold text-gray-950"
  }: {
    title: string;
    children?: React.ReactNode;
    titleClassName?: string;
  }) => (
    <div className="mb-10 text-center">
      <h2 className={`${titleClassName} leading-tight`}>{title}</h2>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );

  const returnToConsultation = () => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    cancelActiveOperation();
    setSelectedStyles([]);
    setProposals([]);
    setZoomImage(null);
    clearServiceAlert();
    setState(AppState.CONSULTATION);
    scrollToTop();
  };

  const returnToSelection = () => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    cancelActiveOperation();
    setZoomImage(null);
    clearServiceAlert();
    setState(analysis ? AppState.SELECTION : AppState.CONSULTATION);
    scrollToTop();
  };

  const returnFromLoading = () => {
    const nextState = state === AppState.GENERATING && analysis ? AppState.SELECTION : AppState.CONSULTATION;
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    cancelActiveOperation();
    setLoadingStep('');
    clearServiceAlert();
    setState(nextState);
    scrollToTop();
  };

  const openPrivacyPage = () => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    cancelActiveOperation();
    clearServiceAlert();
    setGalleryDetail(null);
    setZoomImage(null);
    setUserSpaceOpen(false);
    setAdminSpaceOpen(false);
    setPrivacyPageOpen(true);
    pushBrowserPath(privacyRoutePath);
    scrollToTop();
  };

  const closePrivacyPage = () => {
    setPrivacyPageOpen(false);
    replaceBrowserPath("/");
    scrollToTop();
  };

  const updateConsultation = (changes: Partial<ConsultationData>) => {
    setConsultation(prev => ({ ...prev, ...changes }));
    setAnalysis(null);
    setSelectedStyles([]);
    setProposals([]);
    setPublishedProposalIds([]);
    clearServiceAlert();
  };

  const performInitialExpertise = async () => {
    if (!userImage) return;
    clearServiceAlert();
    if (analysis?.recommendedStyles.length) {
      setSelectedStyles([]);
      setProposals([]);
      setPublishedProposalIds([]);
      setState(AppState.SELECTION);
      scrollToTop();
      return;
    }

    const operationId = beginGenerationOperation({
      title: selectedExample ? `Diagnostic ${selectedExample.name}` : "Recommandations en cours",
      sourceLabel: selectedExample ? `Profil exemple ${selectedExample.name}` : "Photo personnelle",
      phaseLabel: selectedExample ? "Diagnostic local" : "Creation des recommandations",
      previewUrl: userImage,
      detail: selectedExample
        ? "La fiche de diagnostic est preparee depuis le profil exemple."
        : "La fiche de recommandations est creee. Les 4 propositions sont en preparation."
    });
    if (!operationId) return;

    try {
      setAnalysis(null);
      setSelectedStyles([]);
      setProposals([]);
      setPublishedProposalIds([]);
      setState(AppState.ANALYZING);
      setLoadingStep(selectedExample ? `Expertise locale du profil ${selectedExample.name}...` : "Preparation des 4 propositions du jour...");
      const result = selectedExample
        ? (() => {
          const localAnalysis = createLocalExampleAnalysis(consultation, selectedExample.faceShape, selectedExample.hairTexture, selectedExample.skinTone, getExampleSourceNote(selectedExample));
          const preparedStyles = getPreparedProfileStyles(selectedExample, consultation);
          return {
            ...localAnalysis,
            recommendedStyles: preparedStyles.length > 0 ? preparedStyles : localAnalysis.recommendedStyles
          };
        })()
        : await generateOpenAiUploadRecommendations(userImage, consultation);
      if (!isCurrentOperation(operationId)) return;
      setAnalysis(result);
      setSelectedStyles([]);
      setState(AppState.SELECTION);
      if (!selectedExample && result.historyItem) {
        cacheRecommendationAssets(result.historyItem as PublicGeneration, result, userImage);
        setDailyResults(prev => {
          const merged = mergeHistoryResults([result.historyItem as PublicGeneration], prev);
          saveDailyResults(merged);
          return merged;
        });
        setUserHistory(prev => prev.length > 0 ? mergeHistoryResultsWithLimit(120, [result.historyItem as PublicGeneration], prev) : prev);
      }

      const alreadyPrepared = result.recommendedStyles.some(style => style.previewUrl || style.isPreparedAsset);
      if (!alreadyPrepared && (!selectedExample || !hasPreparedCombination(selectedExample, consultation))) {
        loadThumbnails(result);
      }
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      showServiceError(err, "Le service image est indisponible. Veuillez patienter.");
      setState(AppState.CONSULTATION);
    } finally {
      completeGenerationOperation(operationId);
    }
  };

  const loadThumbnails = async (
    res: AnalysisResult,
    imageInput = userImage,
    data = consultation
  ) => {
    let hydratedResult = res;

    for (const style of res.recommendedStyles) {
      if (style.previewUrl) {
        hydratedResult = {
          ...hydratedResult,
          recommendedStyles: hydratedResult.recommendedStyles.map(s => s.id === style.id ? { ...s, isPreviewLoading: false } : s)
        };
        continue;
      }

      setAnalysis(prev => prev ? {
        ...prev,
        recommendedStyles: prev.recommendedStyles.map(s => s.id === style.id ? { ...s, isPreviewLoading: true } : s)
      } : prev);

      try {
        const url = await generateQuickPreview(style, data.gender, data.ageGroup, imageInput || undefined);
        hydratedResult = {
          ...hydratedResult,
          recommendedStyles: hydratedResult.recommendedStyles.map(s => s.id === style.id ? { ...s, previewUrl: url, isPreviewLoading: false } : s)
        };
        setAnalysis(prev => prev ? {
          ...prev,
          recommendedStyles: prev.recommendedStyles.map(s => s.id === style.id ? { ...s, previewUrl: url, isPreviewLoading: false } : s)
        } : prev);
      } catch (e) {
        hydratedResult = {
          ...hydratedResult,
          recommendedStyles: hydratedResult.recommendedStyles.map(s => s.id === style.id ? { ...s, isPreviewLoading: false } : s)
        };
        setAnalysis(prev => prev ? {
          ...prev,
          recommendedStyles: prev.recommendedStyles.map(s => s.id === style.id ? { ...s, isPreviewLoading: false } : s)
        } : prev);
      }
      await new Promise(r => setTimeout(r, 150));
    }

    return hydratedResult;
  };

  const resetExperience = () => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    cancelActiveOperation();
    setGalleryDetail(null);
    setUserSpaceOpen(false);
    setAdminSpaceOpen(false);
    setPrivacyPageOpen(false);
    replaceBrowserPath("/");
    setState(AppState.IDLE);
    setUserImage(null);
    setSelectedExampleId(null);
    setAnalysis(null);
    setSelectedStyles([]);
    setProposals([]);
    setPublishedProposalIds([]);
    clearServiceAlert();
    setZoomImage(null);
    if (account?.type === "user") {
      void refreshPersonalHistory();
    }
  };

  const topRightBack =
    privacyPageOpen
      ? { label: 'Accueil', action: closePrivacyPage }
      : adminSpaceOpen
      ? { label: 'Retour', action: closeAdminSpace }
      : userSpaceOpen
      ? { label: 'Retour', action: closeUserSpace }
      : state === AppState.CONSULTATION
      ? { label: 'Retour', action: resetExperience }
      : state === AppState.SELECTION
        ? { label: 'Retour', action: returnToConsultation }
        : state === AppState.RESULTS
          ? { label: 'Retour', action: returnToSelection }
          : null;

  const showUserNavigationButton = account?.type === "user";
  const showAdminNavigationButton = isAdminAccount;
  const hasNavigationActions = Boolean(topRightBack || showUserNavigationButton || showAdminNavigationButton);

  const renderNavigationButtons = () => (
    <>
      {topRightBack && <BackButton onClick={topRightBack.action} label={topRightBack.label} />}
      {topRightBack && !privacyPageOpen && <HomeButton />}
      {showUserNavigationButton && <UserSpaceButton />}
      {showAdminNavigationButton && <AdminSpaceButton />}
    </>
  );

  const NavigationActions = () => {
    if (isGenerationInProgress || !hasNavigationActions) return null;

    return (
      <>
        <div className="fixed right-4 top-4 z-[70] hidden items-center gap-2 sm:right-8 sm:flex">
          {renderNavigationButtons()}
        </div>
        <nav
          aria-label="Navigation mobile"
          className="fixed inset-x-3 z-[70] sm:hidden"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex min-h-14 max-w-sm items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white/95 px-2 py-2 shadow-2xl shadow-rose-950/10 backdrop-blur-xl">
            {renderNavigationButtons()}
          </div>
        </nav>
      </>
    );
  };

  const startExampleConsultation = (example: DemoExample) => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    cancelActiveOperation();
    clearServiceAlert();
    setZoomImage(null);
    setAnalysis(null);
    setProposals([]);
    setSelectedStyles([]);
    setPublishedProposalIds([]);
    setSelectedExampleId(example.id);
    setConsultation(example.consultation);
    setUserImage(example.sourceImage);
    setState(AppState.CONSULTATION);
    scrollToTop();
  };

  const handleUploadClick = () => {
    if (isGenerationInProgress) {
      showGenerationNavigationNotice();
      return;
    }
    if (!canUploadPersonalPhoto) return;
    uploadInputRef.current?.click();
  };

  const handleUserImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!canUploadPersonalPhoto) return;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showServiceError(new Error("Veuillez charger une image valide."), "Veuillez charger une image valide.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (isGenerationInProgress) {
        showGenerationNavigationNotice();
        return;
      }
      cancelActiveOperation();
      clearServiceAlert();
      setZoomImage(null);
      setAnalysis(null);
      setProposals([]);
      setSelectedStyles([]);
      setPublishedProposalIds([]);
      setSelectedExampleId(null);
      setUserImage(reader.result as string);
      setConsultation(prev => ({
        ...prev,
        targetLength: prev.targetLength || "any",
        maintenance: prev.maintenance || "medium",
        lifestyle: prev.lifestyle || "modern"
      }));
      setState(AppState.CONSULTATION);
      scrollToTop();
    };
    reader.onerror = () => showServiceError(new Error("Lecture de la photo impossible."), "Lecture de la photo impossible.");
    reader.readAsDataURL(file);
  };

  const runCompleteExample = async (example: DemoExample) => {
    const operationId = beginGenerationOperation({
      title: `Generation exemple ${example.name}`,
      sourceLabel: `Profil exemple ${example.name}`,
      phaseLabel: "Exemple complet",
      previewUrl: example.sourceImage,
      detail: "La fiche exemple est preparee, puis le resultat final est affiche."
    });
    if (!operationId) return;

    clearServiceAlert();
    setZoomImage(null);
    setSelectedExampleId(example.id);
    setConsultation(example.consultation);
    setUserImage(example.sourceImage);
    setSelectedStyles([]);
    setProposals([]);
    setPublishedProposalIds([]);

    try {
      setState(AppState.ANALYZING);
      setLoadingStep(`Chargement du diagnostic local pour ${example.name}...`);
      const preparedStyles = getPreparedProfileStyles(example, example.consultation);
      const localExampleAnalysis = createLocalExampleAnalysis(example.consultation, example.faceShape, example.hairTexture, example.skinTone, getExampleSourceNote(example));
      const result = {
        ...localExampleAnalysis,
        recommendedStyles: preparedStyles.length > 0
          ? preparedStyles
          : localExampleAnalysis.recommendedStyles
      };
      if (!isCurrentOperation(operationId)) return;
      setAnalysis(result);
      const analysisWithPreviews = await loadThumbnails(result, example.sourceImage, example.consultation);
      if (!isCurrentOperation(operationId)) return;
      const finalStyle = analysisWithPreviews.recommendedStyles[0];

      if (!finalStyle) {
        throw new Error("Aucun style disponible pour cet exemple.");
      }

      setSelectedStyles([finalStyle.id]);
      setState(AppState.GENERATING);
      setLoadingStep(`Creation du resultat final local : ${finalStyle.name}...`);
      const imageUrl = finalStyle.resultImageUrl || await generateHairstyleImage(example.sourceImage, finalStyle, example.consultation.gender, 'front', example.consultation.ageGroup);
      if (!isCurrentOperation(operationId)) return;
      const exampleProposal = {
        id: finalStyle.id,
        imageUrl,
        styleName: finalStyle.name,
        description: finalStyle.description,
        whyItWorks: finalStyle.whyItWorks,
        color: finalStyle.color,
        beardStyle: finalStyle.beardStyle,
        additionalViews: finalStyle.additionalViews,
        isPreparedAsset: finalStyle.isPreparedAsset
      };
      setProposals([exampleProposal]);
      void rememberDailyProposals([exampleProposal], result, example.consultation, example.name, example.sourceImage);
      setState(AppState.RESULTS);
      scrollToTop();
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      showServiceError(err, "Impossible de charger cet exemple complet.");
      setState(AppState.IDLE);
    } finally {
      completeGenerationOperation(operationId);
    }
  };

  const toggleStyleSelection = (styleId: string) => {
    setSelectedStyles(prev => {
      if (prev.includes(styleId)) return prev.filter(id => id !== styleId);
      if (maxSelectableStyles === 1) return [styleId];
      if (prev.length >= maxSelectableStyles) return prev;
      return [...prev, styleId];
    });
  };

  const generateSelectedLooks = async () => {
    if (!analysis || !userImage) return;
    const chosenStyles = analysis.recommendedStyles.filter(s => selectedStyles.includes(s.id));
    if (chosenStyles.length === 0) return;

    const operationId = beginGenerationOperation({
      title: "Resultat final en cours",
      sourceLabel: selectedExample ? `Profil exemple ${selectedExample.name}` : "Photo personnelle",
      phaseLabel: chosenStyles[0]?.name || "Coupe selectionnee",
      previewUrl: chosenStyles[0]?.previewUrl || userImage,
      detail: chosenStyles.some(isOpenAiUploadStyle)
        ? "Le fond est préparé sans crédit supplémentaire."
        : "La fiche finale est creee. Le resultat est en cours de preparation."
    });
    if (!operationId) return;

    setState(AppState.GENERATING);
    const newProposals: Proposal[] = [];
    setProposals([]);
    setPublishedProposalIds([]);

    try {
      for (let i = 0; i < chosenStyles.length; i++) {
        const style = chosenStyles[i];
        setLoadingStep(isOpenAiUploadStyle(style) ? "Création de votre coupe et préparation du fond…" : hfKontextMode ? `Modification de la coupe : ${style.name}...` : localRetouchMode ? `Retouche locale sur votre photo : ${style.name}...` : imageToImageMode ? `Retouche de la photo : ${style.name}...` : freeImageApiMode ? `Generation de la coupe : ${style.name}...` : `Transformation en cours : ${style.name}...`);
        try {
          const openAiProposal = isOpenAiUploadStyle(style)
            ? await generateOpenAiSelectedResult(userImage, consultation, style, analysis.generationSessionId)
            : null;
          const imageUrl = openAiProposal?.imageUrl || style.resultImageUrl || await generateHairstyleImage(userImage, style, consultation.gender, 'front', consultation.ageGroup);
          if (!isCurrentOperation(operationId)) return;
          newProposals.push({
            id: openAiProposal?.id || style.id,
            imageUrl,
            styleName: openAiProposal?.styleName || style.name,
            description: openAiProposal?.description || style.description,
            whyItWorks: openAiProposal?.whyItWorks || style.whyItWorks,
            color: openAiProposal?.color || style.color,
            beardStyle: openAiProposal?.beardStyle || style.beardStyle,
            additionalViews: openAiProposal?.additionalViews || style.additionalViews,
            assetImageUrl: openAiProposal?.assetImageUrl,
            assetAdditionalViews: openAiProposal?.assetAdditionalViews,
            historyItem: openAiProposal?.historyItem,
            backgroundTreatment: openAiProposal?.backgroundTreatment,
            isPreparedAsset: openAiProposal?.isPreparedAsset || style.isPreparedAsset
          });
          if (i < chosenStyles.length - 1) await new Promise(r => setTimeout(r, 800));
        } catch (innerErr) {
          console.error(`Echec pour ${style.name}`, innerErr);
          if (imageToImageMode || isOpenAiUploadStyle(style)) {
            throw new Error(innerErr instanceof Error ? innerErr.message : "La retouche photo n'a pas abouti.");
          }
        }
      }
      
      if (!isCurrentOperation(operationId)) return;
      if (newProposals.length === 0) throw new Error("Génération impossible sur cette photo.");
      
      setProposals(newProposals);
      void rememberDailyProposals(newProposals, analysis, consultation, selectedExample ? selectedExample.name : "Photo personnelle", userImage);
      if (!selectedExample) void refreshPersonalHistory();
      setState(AppState.RESULTS);
      scrollToTop();
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      showServiceError(err, "Erreur de génération.");
      setState(AppState.SELECTION);
    } finally {
      completeGenerationOperation(operationId);
    }
  };

  const exploreAngles = async (proposalId: string) => {
    const p = proposals.find(x => x.id === proposalId);
    if (!p || !userImage || !analysis) return;
    setProposals(prev => prev.map(x => x.id === proposalId ? { ...x, isGeneratingAngles: true } : x));
    try {
      const angles = await generateStyleAngles(userImage, p, consultation.gender, consultation.ageGroup);
      setProposals(prev => prev.map(x => x.id === proposalId ? { ...x, additionalViews: angles, isGeneratingAngles: false } : x));
    } catch (err) {
      setProposals(prev => prev.map(x => x.id === proposalId ? { ...x, isGeneratingAngles: false } : x));
    }
  };

  // Tranches d'âge ajustées selon vos souhaits
  const ageGroups = [
    { id: 'baby', label: 'Bébé', sub: '0-3 ans', icon: Baby },
    { id: 'child', label: 'Enfant', sub: '4-14 ans', icon: Sparkles },
    { id: 'teen', label: 'Ado', sub: '15-19 ans', icon: GraduationCap },
    { id: 'adult', label: 'Adulte', sub: '20-55 ans', icon: Briefcase },
    { id: 'mature', label: 'Sénior', sub: '55+ ans', icon: Glasses },
  ];

  const targetLengths = [
    { id: 'short', label: 'Court' },
    { id: 'medium', label: 'Mi-long' },
    { id: 'long', label: 'Long' },
    { id: 'any', label: 'Libre' },
  ];

  const renderPendingGenerationCard = () => {
    const card = pendingGeneration || {
      id: "pending-fallback",
      title: state === AppState.ANALYZING ? "Recommandations en cours" : "Resultat final en cours",
      sourceLabel: selectedExample ? `Profil exemple ${selectedExample.name}` : "Photo personnelle",
      phaseLabel: state === AppState.ANALYZING ? "Analyse" : "Generation",
      previewUrl: userImage || selectedExample?.sourceImage || "",
      detail: "La creation est en cours.",
      createdAt: new Date().toISOString()
    };
    const startedAt = new Date(card.createdAt);
    const startedAtLabel = Number.isNaN(startedAt.getTime())
      ? ""
      : startedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    return (
      <div className="w-full rounded-[2rem] border border-rose-100 bg-white p-4 text-left shadow-xl shadow-rose-100/40 sm:p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="relative h-40 w-full overflow-hidden rounded-3xl border border-gray-100 bg-gray-50 sm:h-44 sm:w-36 sm:shrink-0">
            {card.previewUrl ? (
              <img src={card.previewUrl} alt="Apercu de la generation en cours" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-rose-300">
                <ImagePlus className="h-8 w-8" />
              </div>
            )}
            <div className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-md">
              En cours
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600 ring-1 ring-rose-100">
                Fiche creee
              </span>
              {startedAtLabel && (
                <span className="rounded-full bg-gray-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {startedAtLabel}
                </span>
              )}
            </div>
            <h3 className="mt-3 serif text-2xl font-bold leading-tight text-gray-950">{card.title}</h3>
            <p className="mt-1 text-xs font-black uppercase tracking-widest text-gray-400">{card.sourceLabel}</p>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-gray-600">{card.detail}</p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-widest">
                <span className="text-rose-600">{card.phaseLabel}</span>
                <span className="text-gray-400">Une seule generation a la fois</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-rose-50">
                <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-rose-500 via-black to-rose-400 animate-pulse" />
              </div>
            </div>

            {loadingStep && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-rose-500" />
                <p className="text-sm font-bold leading-snug text-gray-700">{loadingStep}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOriginalPhotoPreview = (compact = false) => (
    <div className={`bg-white/95 backdrop-blur-xl border border-gray-100 shadow-xl ${compact ? 'rounded-2xl p-3 flex items-center gap-3' : 'rounded-[1.75rem] p-3'}`}>
      <div className={`${compact ? 'h-20 w-16' : 'aspect-[3/4] w-full'} overflow-hidden rounded-2xl bg-gray-100 border border-gray-100 shrink-0`}>
        <img src={userImage || ''} className="w-full h-full object-cover" alt="Photo originale chargee" />
      </div>
      <div className={compact ? 'min-w-0 flex-1' : 'pt-3 px-1'}>
        <div className="text-[9px] font-black uppercase tracking-widest text-rose-500">{originalPreviewStatus}</div>
        <div className="text-sm font-black text-gray-950 leading-tight mt-1">{selectedExample ? `Portrait ${selectedExample.name}` : 'Portrait original'}</div>
        <div className="text-[11px] text-gray-500 leading-snug mt-1">Reference gardee pendant tout le processus.</div>
      </div>
    </div>
  );

  const getHomeCarouselImages = (example: DemoExample) => {
    if (!hasPreparedLookDatabase(example)) return [example.sourceImage];

    const preparedStyles = getPreparedProfileStyles(example, example.consultation);
    const preparedImages = preparedStyles
      .map(style => style.previewUrl)
      .filter((url): url is string => !!url);

    return preparedImages.length > 0 ? [example.sourceImage, ...preparedImages] : [example.sourceImage];
  };

  const markHomeCarouselImageState = (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
    loaded: boolean
  ) => {
    const image = event.currentTarget;
    image.dataset.carouselSettled = "true";
    if (loaded) {
      image.dataset.carouselLoaded = "true";
    } else {
      delete image.dataset.carouselLoaded;
    }

    const card = image.closest<HTMLElement>(".profile-card");
    if (!card) return;

    const images = Array.from(card.querySelectorAll<HTMLImageElement>(".profile-carousel-image"));
    const allSettled = images.every(candidate => candidate.dataset.carouselSettled === "true" || candidate.complete);
    if (allSettled) {
      card.dataset.carouselReady = "true";
    }
  };

  const renderDemoExampleGallery = () => (
    <>
    <input
      ref={uploadInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      disabled={!canUploadPersonalPhoto}
      onChange={handleUserImageUpload}
    />
    <section aria-label="Selection du profil" className="isolate flex flex-wrap items-center justify-center -space-x-2.5 gap-y-4 px-6 py-3 sm:-space-x-3 sm:gap-y-5">
      <button
        type="button"
        onClick={handleUploadClick}
        aria-label="Charger une photo"
        title={canUploadPersonalPhoto ? "Charger une photo" : "Connectez-vous pour charger une photo"}
        disabled={!canUploadPersonalPhoto}
        className={`relative z-0 h-[8.4rem] w-24 overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-rose-100 sm:h-[9.6rem] sm:w-[7.2rem] ${canUploadPersonalPhoto ? 'cursor-pointer border-rose-100 bg-white hover:z-30 hover:-translate-y-2 hover:scale-105 hover:border-rose-300 hover:shadow-xl' : 'cursor-not-allowed border-rose-200 bg-rose-50/80 ring-1 ring-rose-100'}`}
      >
        {!canUploadPersonalPhoto && (
          <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-rose-500 shadow-sm ring-1 ring-rose-100">
            <Lock className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-rose-500">
          <div className={`rounded-full p-2 ${canUploadPersonalPhoto ? 'bg-rose-50' : 'bg-white shadow-sm ring-1 ring-rose-100'}`}>
            <Upload className="h-5 w-5" />
          </div>
          <span className={`text-center text-[8px] font-black uppercase leading-tight tracking-widest ${canUploadPersonalPhoto ? 'text-gray-700' : 'text-gray-800'}`}>Charger une photo</span>
        </div>
      </button>

        {DEMO_EXAMPLES.map(example => {
          const isComplete = hasPreparedLookDatabase(example);
          const carouselImages = getHomeCarouselImages(example);

          return (
            <button
              key={example.id}
              type="button"
              title={example.name}
              aria-label={`Choisir le profil ${example.name}`}
              disabled={!isComplete}
              onClick={() => startExampleConsultation(example)}
              className={`profile-card group relative z-0 h-[8.4rem] w-24 overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-rose-100 focus-visible:z-30 sm:h-[9.6rem] sm:w-[7.2rem] ${isComplete ? 'cursor-pointer border-rose-100 hover:z-30 hover:-translate-y-2 hover:scale-105 hover:border-rose-300 hover:shadow-xl' : 'cursor-not-allowed border-gray-100 opacity-55 grayscale hover:z-20 hover:scale-[1.03]'}`}
            >
              <div className="absolute inset-0 bg-gray-100">
                {carouselImages.map((src, index) => (
                  <img
                    key={`${example.id}-${src}`}
                    src={src}
                    alt={`Portrait ${example.name}`}
                    className={`profile-carousel-image absolute inset-0 h-full w-full object-cover ${carouselImages.length > 1 ? '' : 'opacity-100'}`}
                    style={{ animationDelay: `${index * 0.9}s` }}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "low"}
                    onLoad={(event) => markHomeCarouselImageState(event, true)}
                    onError={(event) => markHomeCarouselImageState(event, false)}
                  />
                ))}
              </div>

              <div className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/55 px-1.5 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-md transition-opacity duration-200 group-hover:bg-rose-600/80">
                {example.name}
              </div>
            </button>
          );
        })}
    </section>
    </>
  );

  const renderAccountPanel = () => (
    <section className="mx-auto mt-8 max-w-3xl rounded-2xl border border-gray-100 bg-white/85 p-3 text-left shadow-sm backdrop-blur-sm">
      {account?.type === "user" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-rose-500">Compte synchronise</div>
              <div className="truncate text-sm font-black text-gray-950">{account.email}</div>
              <div className="text-[11px] font-medium text-gray-500">Compte actif sur cet appareil.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isAuthBusy}
            className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isAuthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Deconnexion
          </button>
        </div>
      ) : (
        <form onSubmit={handleAuthSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="lg:col-span-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-rose-500">Compte optionnel</div>
              <div className="text-sm font-black text-gray-950">Retrouver vos resultats sur un autre appareil</div>
            </div>
            <div className="flex rounded-xl bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${authMode === "login" ? "bg-white text-gray-950 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${authMode === "register" ? "bg-white text-gray-950 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
              >
                Creer
              </button>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Email</span>
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 transition-colors focus-within:border-rose-200 focus-within:bg-white">
              <Mail className="h-4 w-4 text-rose-400" />
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                autoComplete="email"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-950 outline-none placeholder:text-gray-300"
                placeholder="vous@email.com"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Mot de passe</span>
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 transition-colors focus-within:border-rose-200 focus-within:bg-white">
              <Lock className="h-4 w-4 text-rose-400" />
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                minLength={8}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-950 outline-none placeholder:text-gray-300"
                placeholder="8 caracteres minimum"
              />
            </span>
          </label>
          <button
            type="submit"
            disabled={isAuthBusy}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
          >
            {isAuthBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {authMode === "register" ? "Creer" : "Entrer"}
          </button>
          {authMessage && (
            <p className={`lg:col-span-3 text-xs font-bold ${/impossible|incorrect|invalide|existe/i.test(authMessage) ? "text-red-600" : "text-emerald-700"}`}>
              {authMessage}
            </p>
          )}
        </form>
      )}
    </section>
  );

  const renderPublicGenerationGallery = () => {
    if (!isPublicGalleryLoading && publicGenerations.length === 0) return null;

    return (
      <section className="mx-auto mt-14 max-w-6xl text-left animate-in fade-in slide-in-from-bottom-4 duration-500" aria-label="Vitrine publique">
        <div className="mb-5 flex flex-col gap-3 px-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600 shadow-sm ring-1 ring-rose-100">
              <Globe2 className="h-3.5 w-3.5" />
              Vitrine publique
            </div>
            <h2 className="serif text-3xl font-bold text-gray-950">Generations publiees</h2>
          </div>
          {publicGenerations.length > 0 && (
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              {publicGenerations.length} resultat{publicGenerations.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {isPublicGalleryLoading && publicGenerations.length === 0
            ? Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-gray-100" />
            ))
            : publicGenerations.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => openGenerationSheet(item, 'public')}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-rose-100"
              >
                <div className="aspect-[3/4] overflow-hidden bg-gray-100">
                  <img
                    src={item.imageUrl}
                    alt={item.styleName}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(event) => {
                      handleImageError(event, item, item.imageUrl);
                    }}
                  />
                </div>
                <div className="p-3">
                  <div className="truncate text-xs font-black text-gray-950">{item.styleName}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                    <Images className="h-3 w-3" />
                    {item.sourceLabel}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-rose-600">
                    <Images className="h-3 w-3" />
                    Fiche {generationImages(item).length} image{generationImages(item).length > 1 ? "s" : ""}
                  </div>
                </div>
              </button>
            ))}
        </div>
      </section>
    );
  };

  const renderUserSpacePage = () => {
    // Les sessions de recommandations restent disponibles pour la reprise depuis les finales.
    const savedResults = userHistory.filter(item => !isRecommendationSession(item));
    const imageCount = savedResults.reduce((total, item) => total + generationImages(item).length + (item.originalImageUrl ? 1 : 0), 0);
    const publishedCount = savedResults.filter(isGenerationPublished).length;
    const latestDate = savedResults[0]?.createdAt ? formattedGenerationDate(savedResults[0].createdAt) : "";
    const storageLabel = accountStorage === "mysql" ? "Persistant" : "Serveur actif";

    return (
      <UserSpacePage
        account={account}
        accountCreditBalance={accountCreditBalance}
        accountQuota={accountQuota}
        storageLabel={storageLabel}
        userHistory={savedResults}
        userHistoryMessage={userHistoryMessage}
        isUserHistoryLoading={isUserHistoryLoading}
        isAuthBusy={isAuthBusy}
        deletingGenerationId={deletingGenerationId}
        imageCount={imageCount}
        publishedCount={publishedCount}
        latestDate={latestDate}
        generationCoverUrl={generationCoverUrl}
        generationImageCount={generationImageCount}
        isGenerationPublished={isGenerationPublished}
        onRefresh={loadUserSpaceHistory}
        onLogout={handleLogout}
        onOpenGeneration={(item) => openGenerationSheet(item, 'daily')}
        onDeleteGeneration={deleteUserGeneration}
        onHistoryImageError={(event, item, coverUrl) => {
          handleImageError(event, item, coverUrl);
          if (account?.type === "user") {
            void hydratePersonalGenerationAssets(item);
          }
        }}
      />
    );
  };

  const renderAdminSpacePage = () => {
    const overview = adminDashboard?.overview || {
      usersTotal: 0,
      usersActive: 0,
      usersSuspended: 0,
      usersDeleted: 0,
      guestsTotal: 0,
      adminsTotal: 0,
      generationsTotal: 0,
      generationsToday: 0,
      generationsPublished: 0,
      generationsHidden: 0,
      creditBalanceTotal: 0
    };
    const activeSearch = adminAppliedSearch;
    const filteredTodayCount = adminGenerations.filter(generation =>
      generation.createdAt && new Intl.DateTimeFormat("en-CA").format(new Date(generation.createdAt)) === todayKey()
    ).length;
    const filteredPublishedCount = adminGenerations.filter(generation =>
      generation.status === "published" || !!generation.publicGenerationId
    ).length;
    const filteredActiveUsers = adminUsers.filter(user => user.status === "active").length;
    const filteredSuspendedUsers = adminUsers.filter(user => user.status === "suspended").length;
    const filteredDeletedUsers = adminUsers.filter(user => user.status === "deleted").length;
    const filteredCreditBalance = adminUsers.reduce((total, user) => total + Number(user.creditBalance || 0), 0);

    const stats: AdminStatItem[] = selectedAdminUser
      ? [
        { label: "Utilisateur", value: 1, detail: adminUserStatusLabels[normalizeAdminUserStatus(selectedAdminUser.status)].toLowerCase(), icon: User },
        { label: "Fiches", value: selectedAdminUser.generationCount, detail: `${filteredTodayCount} aujourd'hui`, icon: Activity },
        { label: "Credits", value: Number(selectedAdminUser.creditBalance || 0), detail: "solde actuel", icon: Coins },
        { label: "Public", value: selectedAdminUser.publishedCount, detail: "publiees", icon: Globe2 },
        { label: "Masque", value: selectedAdminUser.hiddenCount, detail: "retirees", icon: EyeOff }
      ]
      : activeSearch
        ? [
          { label: "Utilisateurs", value: adminUsers.length, detail: `${filteredActiveUsers} actifs`, icon: Users },
          { label: "Fiches", value: adminGenerations.length, detail: "filtrees", icon: Activity },
          { label: "Aujourd'hui", value: filteredTodayCount, detail: "dans la recherche", icon: CalendarDays },
          { label: "Public", value: filteredPublishedCount, detail: `${filteredSuspendedUsers} suspendus, ${filteredDeletedUsers} supprimes`, icon: Globe2 },
          { label: "Credits", value: filteredCreditBalance, detail: "dans la recherche", icon: Coins }
        ]
        : [
          { label: "Utilisateurs", value: overview.usersTotal, detail: `${overview.usersActive} actifs, ${Number(overview.usersDeleted || 0)} supprimes`, icon: Users },
          { label: "Invites", value: overview.guestsTotal, detail: "sessions anonymes", icon: User },
          { label: "Aujourd'hui", value: overview.generationsToday, detail: "generations", icon: Activity },
          { label: "Public", value: overview.generationsPublished, detail: `${overview.generationsHidden} masquees`, icon: Globe2 },
          { label: "Credits", value: Number(overview.creditBalanceTotal || 0), detail: "solde global", icon: Coins }
        ];
    const adminDetailImages = selectedAdminGeneration ? adminGenerationImages(selectedAdminGeneration) : [];
    const adminDetailRecommendations = (selectedAdminGeneration?.recommendations || [])
      .filter(item => item.previewUrl || item.imageUrl)
      .slice(0, 4);
    const adminDetailConsultation = selectedAdminGeneration?.consultation || {};
    const promoHistory = adminTrialCodeHistory
      .filter(entry => entry.code || entry.codeHash)
      .slice(0, 8);

    return (
      <div className="mx-auto max-w-6xl py-10 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-rose-300" />
              Administration
            </div>
            <h1 className="serif text-4xl font-bold leading-tight text-gray-950 sm:text-5xl">Tableau admin</h1>
          </div>
          <button
            type="button"
            onClick={() => selectedAdminUser ? refreshSelectedAdminUser() : loadAdminSpace(adminSearch)}
            disabled={isAdminLoading || isAdminUserDetailLoading}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-100 bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-rose-100"
          >
            {isAdminLoading || isAdminUserDetailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualiser
          </button>
        </div>

        <AdminStatsGrid stats={stats} />

        <form onSubmit={handleAdminSearchSubmit} className="mb-6 flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 transition-colors focus-within:border-rose-200 focus-within:bg-white">
            <Search className="h-4 w-4 text-rose-400" />
            <input
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
              placeholder="email, profil, coupe..."
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-950 outline-none placeholder:text-gray-300"
            />
          </label>
          <button
            type="submit"
            disabled={isAdminLoading || isAdminUserDetailLoading}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
          >
            Rechercher
          </button>
          <button
            type="button"
            onClick={() => {
              clearAdminUserFilter();
            }}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-4 text-[10px] font-black uppercase tracking-widest text-gray-500 transition-colors hover:border-rose-200 hover:text-rose-600"
          >
            Effacer
          </button>
        </form>

        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-rose-600 ring-1 ring-rose-100">
                <KeyRound className="h-3.5 w-3.5" />
                Code bonus
              </div>
              <h2 className="mt-2 serif text-2xl font-bold text-gray-950">Essais supplementaires</h2>
              <p className="mt-1 max-w-2xl text-xs font-bold leading-relaxed text-gray-400">
                Chaque compte ou appareil peut utiliser le code actif une seule fois. Quand un nouveau code est active, les precedents passent en historique desactive.
              </p>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_9rem_auto] lg:flex-1">
              <label className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Code actif</span>
                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 transition-colors focus-within:border-rose-200 focus-within:bg-white">
                  <input
                    value={adminTrialCodeDraft}
                    onChange={(event) => setAdminTrialCodeDraft(event.target.value.toUpperCase())}
                    placeholder="Generer un code"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm font-black uppercase tracking-widest text-gray-950 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-300"
                    aria-label="Code bonus actif"
                  />
                  <button
                    type="button"
                    onClick={copyAdminTrialCode}
                    disabled={!adminTrialCodeDraft.trim()}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Copier le code"
                    aria-label="Copier le code"
                  >
                    {adminTrialCodeCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Essais</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={adminTrialUsesDraft}
                  onChange={(event) => setAdminTrialUsesDraft(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none transition-colors focus:border-rose-200 focus:bg-white"
                  aria-label="Nombre d'essais ajoutes"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleAdminTrialCodeSave(true)}
                  disabled={isAdminTrialCodeBusy}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-4 text-[10px] font-black uppercase tracking-widest text-gray-600 transition-colors hover:border-rose-200 hover:text-rose-600 disabled:cursor-wait disabled:opacity-60"
                >
                  {isAdminTrialCodeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Generer
                </button>
                <button
                  type="button"
                  onClick={() => void handleAdminTrialCodeSave(false)}
                  disabled={isAdminTrialCodeBusy}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
                >
                  {isAdminTrialCodeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-rose-300" />}
                  Sauver
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
            <span className="rounded-full bg-gray-50 px-3 py-1">{adminTrialCode?.status === "active" ? "Actif" : "Aucun code actif"}</span>
            <span className="rounded-full bg-gray-50 px-3 py-1">{Number(adminTrialCode?.activationCount || 0)} activations</span>
            {adminTrialCode?.updatedAt && <span className="rounded-full bg-gray-50 px-3 py-1">MAJ {formattedGenerationDate(adminTrialCode.updatedAt)}</span>}
          </div>
          {promoHistory.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-2 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
                <History className="h-3.5 w-3.5" />
                Historique des codes
              </div>
              <div className="divide-y divide-gray-100 overflow-hidden">
                {promoHistory.map((entry) => (
                  <div key={entry.id || entry.codeHash} className="grid gap-2 py-2 text-xs font-bold text-gray-500 md:grid-cols-[minmax(10rem,1fr)_7rem_7rem_8rem] md:items-center">
                    <span className="min-w-0 truncate font-mono text-gray-900">{entry.code || `sha256:${String(entry.codeHash || "").slice(0, 10)}`}</span>
                    <span className={entry.status === "active" ? "text-emerald-600" : "text-gray-400"}>
                      {entry.status === "active" ? "Actif" : "Desactive"}
                    </span>
                    <span>{Number(entry.usesAdded || 0)} essais</span>
                    <span>{Number(entry.activationCount || 0)} utilisation(s)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {adminMessage && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
            {adminMessage}
          </div>
        )}

        {(selectedAdminGeneration || isAdminGenerationDetailLoading) && (
          <section className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                  <FileText className="h-3.5 w-3.5 text-rose-300" />
                  Fiche generation
                </div>
                <h2 className="mt-2 truncate font-sans text-xl font-black text-gray-950">
                  {selectedAdminGeneration?.title || "Chargement de la fiche..."}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAdminGeneration && isAdminGenerationPublished(selectedAdminGeneration) && (
                  <button
                    type="button"
                    onClick={() => void unpublishAdminGenerationAction(selectedAdminGeneration)}
                    disabled={isAdminGenerationBusy(selectedAdminGeneration)}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 text-[9px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50"
                  >
                    {adminBusyId === `generation-public-${selectedAdminGeneration.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
                    Retirer public
                  </button>
                )}
                {selectedAdminGeneration && (
                  <button
                    type="button"
                    onClick={() => void hideAdminGenerationAction(selectedAdminGeneration)}
                    disabled={isAdminGenerationBusy(selectedAdminGeneration)}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-[9px] font-black uppercase tracking-widest text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                  >
                    {adminBusyId === `generation-${selectedAdminGeneration.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Masquer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedAdminGeneration(null)}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-3 text-[9px] font-black uppercase tracking-widest text-gray-500 transition-colors hover:border-rose-200 hover:text-rose-600"
                >
                  <X className="h-3.5 w-3.5" />
                  Fermer
                </button>
              </div>
            </div>

            {isAdminGenerationDetailLoading && !selectedAdminGeneration ? (
              <div className="grid gap-4 p-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-gray-100" />
                ))}
              </div>
            ) : selectedAdminGeneration && (
              <div className="grid gap-5 p-4 lg:grid-cols-[1.3fr_20rem]">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {selectedAdminGeneration.originalImageUrl && (
                    <div className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setZoomImage(selectedAdminGeneration.originalImageUrl || "")}
                        className="group relative block aspect-[3/4] w-full cursor-pointer overflow-hidden bg-gray-100"
                        aria-label="Agrandir la photo d'origine"
                      >
                        <img
                          src={selectedAdminGeneration.originalImageUrl}
                          alt="Photo d'origine"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/60 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white">
                          Origine
                        </div>
                      </button>
                      <div className="p-2">
                        <a
                          href={selectedAdminGeneration.originalImageUrl}
                          download={imageDownloadName(selectedAdminGeneration.styleName, "origine", selectedAdminGeneration.originalImageUrl)}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Telecharger
                        </a>
                      </div>
                    </div>
                  )}

                  {adminDetailImages.map(entry => (
                    <div key={`${selectedAdminGeneration.id}-${entry.key}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setZoomImage(entry.url)}
                        className="group relative block aspect-[3/4] w-full cursor-pointer overflow-hidden bg-gray-100"
                        aria-label={`Agrandir ${entry.label}`}
                      >
                        <img
                          src={entry.url}
                          alt={`${selectedAdminGeneration.styleName} ${entry.label}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/60 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white">
                          {entry.label}
                        </div>
                      </button>
                      <div className="p-2">
                        <a
                          href={entry.url}
                          download={imageDownloadName(selectedAdminGeneration.styleName, entry.key, entry.url)}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Telecharger
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <aside className="space-y-3">
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Proprietaire</div>
                    <div className="mt-1 truncate text-sm font-black text-gray-950">{selectedAdminGeneration.ownerEmail || selectedAdminGeneration.ownerType}</div>
                    <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">{selectedAdminGeneration.ownerType}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-gray-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Statut</div>
                      <div className="mt-1 text-xs font-black text-gray-950">{selectedAdminGeneration.status}</div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Images</div>
                      <div className="mt-1 text-xs font-black text-gray-950">{selectedAdminGeneration.imageCount}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Selection</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-500">
                      {adminDetailConsultation.targetLength && <span className="rounded-full bg-white px-2 py-1">{lengthLabels[adminDetailConsultation.targetLength as ConsultationData["targetLength"]] || adminDetailConsultation.targetLength}</span>}
                      {adminDetailConsultation.maintenance && <span className="rounded-full bg-white px-2 py-1">{maintenanceLabels[adminDetailConsultation.maintenance as ConsultationData["maintenance"]] || adminDetailConsultation.maintenance}</span>}
                      {adminDetailConsultation.lifestyle && <span className="rounded-full bg-white px-2 py-1">{lifestyleLabels[adminDetailConsultation.lifestyle as ConsultationData["lifestyle"]] || adminDetailConsultation.lifestyle}</span>}
                    </div>
                  </div>
                  {adminDetailRecommendations.length > 0 && (
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="mb-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Propositions</div>
                      <div className="grid grid-cols-4 gap-2">
                        {adminDetailRecommendations.map((item, index) => {
                          const url = item.previewUrl || item.imageUrl || "";
                          return (
                            <button
                              key={item.id || `${selectedAdminGeneration.id}-rec-${index}`}
                              type="button"
                              onClick={() => setZoomImage(url)}
                              className="aspect-[3/4] cursor-pointer overflow-hidden rounded-xl bg-white ring-1 ring-gray-100 transition-all hover:ring-rose-200"
                              aria-label={`Voir proposition ${index + 1}`}
                            >
                              <img src={url} alt={item.styleName || item.name || `Proposition ${index + 1}`} className="h-full w-full object-cover" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <AdminUsersTable
            users={adminUsers}
            selectedUser={selectedAdminUser}
            isLoading={isAdminLoading}
            busyId={adminBusyId}
            isCreditBusy={isAdminCreditBusy}
            formattedDate={formattedGenerationDate}
            onApplyUserFilter={applyAdminUserFilter}
            onAdjustSelectedUserCredits={adjustSelectedAdminUserCredits}
            onSetUserStatus={setAdminUserStatusAction}
            onClearUserFilter={clearAdminUserFilter}
          />

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-rose-500">Contenu</div>
                <h2 className="serif text-2xl font-bold text-gray-950">Generations</h2>
              </div>
              <div className="shrink-0 text-[10px] font-black uppercase tracking-widest text-gray-400">{adminGenerations.length} lignes</div>
            </div>

            <div className="divide-y divide-gray-100">
              {isAdminLoading && adminGenerations.length === 0 ? (
                <div className="px-4 py-8 text-sm font-bold text-gray-400">Chargement...</div>
              ) : adminGenerations.length > 0 ? adminGenerations.map(generation => (
                <article
                  key={`${generation.ownerType}-${generation.ownerId}-${generation.id}`}
                  className={`px-4 py-4 transition-colors ${selectedAdminGeneration?.id === generation.id ? "bg-rose-50/70" : "hover:bg-gray-50"}`}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] xl:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                        <span className="rounded-full bg-gray-50 px-2 py-1">{generation.sourceLabel}</span>
                        <span className="rounded-full bg-gray-50 px-2 py-1">{generation.ownerType}</span>
                        {isAdminGenerationPublished(generation) && (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Public</span>
                        )}
                        {generation.createdAt && <span className="rounded-full bg-gray-50 px-2 py-1">{formattedGenerationDate(generation.createdAt)}</span>}
                      </div>
                      <div className="mt-2 break-words text-sm font-black leading-snug text-gray-950">{generation.title}</div>
                      <div className="mt-1 break-all text-xs font-bold leading-relaxed text-gray-500">{generation.ownerEmail || generation.ownerType}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-xl bg-gray-50 px-2 py-2">
                          <div className="text-sm font-black text-gray-950">{generation.imageCount}</div>
                          <div className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">Images</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2 py-2">
                          <div className="text-xs font-black text-gray-950">{generation.hasOriginal ? "Oui" : "Non"}</div>
                          <div className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">Origine</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      <button
                        type="button"
                        onClick={() => void openAdminGenerationDetail(generation)}
                        className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-3 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-colors hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                        title="Ouvrir la fiche generation"
                        aria-label={`Ouvrir la fiche ${generation.title}`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Details
                      </button>

                      {isAdminGenerationPublished(generation) && (
                        <button
                          type="button"
                          onClick={() => void unpublishAdminGenerationAction(generation)}
                          disabled={isAdminGenerationBusy(generation)}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 text-[9px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50"
                          title="Retirer cette fiche de la vitrine publique"
                          aria-label={`Retirer ${generation.title} de la vitrine publique`}
                        >
                          {adminBusyId === `generation-public-${generation.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
                          Retirer public
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void hideAdminGenerationAction(generation)}
                        disabled={isAdminGenerationBusy(generation)}
                        className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-[9px] font-black uppercase tracking-widest text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                      >
                        {adminBusyId === `generation-${generation.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                        Masquer
                      </button>
                    </div>
                  </div>
                </article>
              )) : (
                <div className="px-4 py-8 text-sm font-bold text-gray-400">Aucune generation.</div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                <History className="h-3.5 w-3.5 text-rose-500" />
                Journal
              </div>
              <h2 className="mt-2 serif text-2xl font-bold text-gray-950">Actions administrateur</h2>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{adminAuditLog.length} lignes</div>
          </div>
          <div className="divide-y divide-gray-100">
            {adminAuditLog.length > 0 ? adminAuditLog.slice(0, 12).map(entry => (
              <div key={entry.id} className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr_9rem] sm:items-center">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">{formattedGenerationDate(entry.createdAt || "")}</div>
                  <div className="mt-1 truncate text-xs font-black text-gray-950">{entry.actorEmail || entry.actorUserId || "admin"}</div>
                </div>
                <div className="min-w-0">
                  <div className="font-black text-gray-950">{entry.action}</div>
                  <div className="mt-1 truncate text-xs font-bold text-gray-400">{entry.targetType} / {entry.targetId}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">
                  {entry.details && typeof entry.details.amount === "number"
                    ? `${entry.details.amount > 0 ? "+" : ""}${entry.details.amount} credits`
                    : entry.details && typeof entry.details.status === "string"
                      ? entry.details.status
                      : "trace"}
                </div>
              </div>
            )) : (
              <div className="px-4 py-8 text-sm font-bold text-gray-400">Aucune action admin journalisee.</div>
            )}
          </div>
        </section>
      </div>
    );
  };

  const galleryDetailForDisplay = galleryDetail?.scope === "daily" && !userSpaceOpen ? null : galleryDetail;
  const galleryOriginalUrl = galleryDetailForDisplay?.scope === 'daily' ? galleryDetailForDisplay.item.originalImageUrl || "" : "";
  const galleryIsRecommendationSession = galleryDetailForDisplay ? isRecommendationSession(galleryDetailForDisplay.item) : false;
  const galleryCanPublish = galleryDetailForDisplay ? canPublishToPublicGallery(galleryDetailForDisplay.item) : false;
  const galleryPublished = galleryDetailForDisplay ? isGenerationPublished(galleryDetailForDisplay.item) : false;
  const galleryShowPublicationAction = Boolean(
    galleryDetailForDisplay &&
    galleryDetailForDisplay.scope === "daily" &&
    !galleryIsRecommendationSession &&
    shouldShowPublicationAction(galleryDetailForDisplay.item)
  );
  const galleryDownloadsEnabled = galleryDetailForDisplay?.scope === "daily" && account?.type === "user";
  const showNavigationActions = hasNavigationActions && !isGenerationInProgress && !zoomImage && !galleryDetailForDisplay;

  return (
    <div className={`min-h-screen flex flex-col bg-[#FDFCFB] ${showNavigationActions ? "pb-24 sm:pb-0" : ""}`}>
      <Header
        onHomeClick={resetExperience}
        homeDisabled={isGenerationInProgress}
        homeDisabledReason={generationNavigationMessage}
      />
      {showNavigationActions && <NavigationActions />}
      {showOriginalPreview && (
        <div className="pointer-events-none hidden lg:block fixed left-6 top-24 z-30 w-64 animate-in fade-in slide-in-from-left-3 duration-300">
          {renderOriginalPhotoPreview(true)}
        </div>
      )}
      
      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 w-full">
        {error && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 max-w-xl w-[calc(100%-2rem)] z-[60] bg-red-50 p-6 rounded-2xl flex items-start gap-4 text-red-700 border border-red-100 shadow-xl animate-in slide-in-from-top-4">
            <AlertTriangle className="w-6 h-6 shrink-0 mt-1" />
            <div className="flex-grow">
               <p className="text-sm font-bold">Erreur de service</p>
               <p className="text-sm font-medium">{error}</p>
               {canActivateTrialCode && (
                <div className="mt-4">
                  <form onSubmit={handleActivateTrialCode} className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={trialCode}
                      onChange={(event) => setTrialCode(event.target.value)}
                      placeholder="Utiliser un code"
                      aria-label="Code bonus"
                      className="min-h-11 flex-1 rounded-xl border border-red-100 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                    />
                    <button
                      type="submit"
                      disabled={isActivatingTrialCode}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isActivatingTrialCode && <Loader2 className="h-4 w-4 animate-spin" />}
                      Activer
                    </button>
                  </form>
                  {trialCodeMessage && <p className="mt-2 text-xs font-bold text-red-600">{trialCodeMessage}</p>}
                </div>
               )}
            </div>
            <button onClick={clearServiceAlert} className="p-2 hover:bg-red-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
        )}

        {notice && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 max-w-xl w-[calc(100%-2rem)] z-[60] bg-emerald-50 p-5 rounded-2xl flex items-start gap-4 text-emerald-800 border border-emerald-100 shadow-xl animate-in slide-in-from-top-4">
            <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5" />
            <p className="flex-grow text-sm font-bold">{notice}</p>
            <button onClick={() => setNotice(null)} className="p-2 hover:bg-emerald-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
        )}

        {showOriginalPreview && (
          <div className="lg:hidden max-w-4xl mx-auto mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
            {renderOriginalPhotoPreview(true)}
          </div>
        )}

        {userSpaceOpen && account?.type === "user" && renderUserSpacePage()}
        {adminSpaceOpen && isAdminAccount && renderAdminSpacePage()}
        {privacyPageOpen && <PrivacyPage />}

        {!isWorkspacePanelOpen && state === AppState.IDLE && (
          <div className="mx-auto max-w-6xl py-12 text-center animate-in fade-in duration-1000">
            <div className="mx-auto max-w-3xl">
              <h1 className="serif text-5xl md:text-6xl font-bold text-gray-900 mb-5">Expertise <span className="text-rose-600 italic">Visage</span></h1>
              <p className="text-sm text-gray-500 mb-10 max-w-xl mx-auto">Chargez une photo ou selectionnez un profil exemple.</p>
              {renderDemoExampleGallery()}
              {renderAccountPanel()}
            </div>
            {renderPublicGenerationGallery()}
          </div>
        )}

        {!isWorkspacePanelOpen && state === AppState.CONSULTATION && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <StepHeader
              title="Votre Profil de Consultation"
              titleClassName="serif text-4xl font-bold text-gray-950"
            />

            {selectedExample && (
              <div className="mb-8 rounded-[1.75rem] border border-rose-100 bg-rose-50/60 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-36 w-full rounded-2xl overflow-hidden border border-white bg-white shrink-0 sm:h-24 sm:w-20">
                  <img src={selectedExample.sourceImage} alt={`Photo de depart ${selectedExample.name}`} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase tracking-widest text-rose-500 sm:text-[10px]">Exemple selectionne</div>
                  <div className="mt-1 text-2xl font-black leading-tight text-gray-950 sm:text-xl">{selectedExample.name} - {selectedExample.faceShape}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-gray-600 sm:px-2.5 sm:py-1 sm:text-[9px]">{ageLabels[consultation.ageGroup]}</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-gray-600 sm:px-2.5 sm:py-1 sm:text-[9px]">{maintenanceLabels[consultation.maintenance]}</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-gray-600 sm:px-2.5 sm:py-1 sm:text-[9px]">{lifestyleLabels[consultation.lifestyle]}</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-gray-600 sm:px-2.5 sm:py-1 sm:text-[9px]">{lengthLabels[consultation.targetLength]}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetExperience}
                  className="min-h-12 cursor-pointer rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-700 transition-all hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100 sm:text-[10px]"
                >
                  Changer
                </button>
              </div>
            )}

            {!selectedExample && userImage && (
              <div className="mb-8 rounded-[1.75rem] border border-rose-100 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-36 w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 shrink-0 sm:h-24 sm:w-20">
                  <img src={userImage} alt="Photo chargee" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase tracking-widest text-rose-500 sm:text-[10px]">Photo chargee</div>
                  <div className="mt-1 text-2xl font-black leading-tight text-gray-950 sm:text-xl">Essai photo du jour</div>
                  <div className="mt-2 text-sm font-medium leading-snug text-gray-500">L'analyse guide les 4 propositions puis le resultat final.</div>
                </div>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={!canUploadPersonalPhoto}
                  title={canUploadPersonalPhoto ? "Remplacer la photo" : "Connectez-vous pour remplacer la photo"}
                  className="min-h-12 cursor-pointer rounded-xl bg-rose-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-rose-600 transition-all hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-gray-50 sm:text-[10px]"
                >
                  Remplacer
                </button>
              </div>
            )}
            
            <div className="bg-white p-5 sm:p-8 md:p-12 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-gray-100 space-y-8 sm:space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                <section>
                  <h3 className="text-xs sm:text-[10px] font-black uppercase tracking-widest text-gray-500 sm:text-gray-400 mb-4 sm:mb-6 flex items-center gap-2">
                    <User className="w-4 h-4 sm:w-3 sm:h-3 text-rose-500" /> Genre
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:'male', label:'Masculin'}, {id:'female', label:'Féminin'}, {id:'non-binary', label:'Autre'}].map(g => (
                      <button
                        key={g.id}
                        disabled={demographicsLocked && consultation.gender !== g.id}
                        onClick={() => !demographicsLocked && updateConsultation({ gender: g.id as any })}
                        className={`min-h-14 rounded-xl border-2 px-2 py-4 text-sm font-bold transition-all sm:min-h-0 sm:py-3 sm:text-[11px] disabled:opacity-25 disabled:cursor-not-allowed ${consultation.gender === g.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-100 text-gray-500 hover:border-gray-200 sm:border-gray-50 sm:text-gray-400'}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {demographicsLocked && <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 sm:text-[10px] sm:text-gray-400">Verrouille par la photo choisie</p>}
                </section>

                <section>
                  <h3 className="text-xs sm:text-[10px] font-black uppercase tracking-widest text-gray-500 sm:text-gray-400 mb-4 sm:mb-6 flex items-center gap-2">
                    <Users className="w-4 h-4 sm:w-3 sm:h-3 text-rose-500" /> Tranche d'âge
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ageGroups.map(a => (
                      <button
                        key={a.id}
                        disabled={demographicsLocked && consultation.ageGroup !== a.id}
                        onClick={() => !demographicsLocked && updateConsultation({ ageGroup: a.id as any })}
                        className={`py-3 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1.5 min-h-[96px] sm:min-h-[80px] sm:gap-1 sm:px-1 sm:py-2 disabled:opacity-25 disabled:cursor-not-allowed ${consultation.ageGroup === a.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-100 text-gray-500 hover:border-gray-200 sm:border-gray-50 sm:text-gray-400'}`}
                      >
                        <a.icon className={`w-5 h-5 sm:w-4 sm:h-4 ${consultation.ageGroup === a.id ? 'text-rose-500' : 'text-gray-300'}`} />
                        <span className="text-sm font-bold leading-none sm:text-[10px]">{a.label}</span>
                        <span className="text-[11px] font-medium opacity-70 leading-none sm:text-[8px] sm:opacity-60">{a.sub}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 pt-6 sm:pt-8 border-t border-gray-100 sm:border-gray-50">
                <section>
                  <h3 className="text-xs sm:text-[10px] font-black uppercase tracking-widest text-gray-500 sm:text-gray-400 mb-4 sm:mb-6 flex items-center gap-2">
                    <div className="w-1 h-1 bg-rose-500 rounded-full"></div> Niveau d'Entretien
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {['low', 'medium', 'high'].map(m => (
                      <button key={m} onClick={() => updateConsultation({ maintenance: m as any })} className={`min-h-14 rounded-xl border-2 px-2 py-4 text-sm font-bold transition-all sm:min-h-0 sm:py-3 sm:text-[11px] ${consultation.maintenance === m ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-gray-100 text-gray-500 hover:border-gray-200 sm:border-gray-50 sm:text-gray-400'}`}>
                        {m === 'low' ? 'Rapide' : m === 'medium' ? 'Modéré' : 'Rituel'}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs sm:text-[10px] font-black uppercase tracking-widest text-gray-500 sm:text-gray-400 mb-4 sm:mb-6 flex items-center gap-2">
                     <div className="w-1 h-1 bg-rose-500 rounded-full"></div> Univers de Style
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:'classic', label:'Classique'}, {id:'modern', label:'Moderne'}, {id:'bold', label:'Audacieux'}].map(s => (
                      <button key={s.id} onClick={() => updateConsultation({ lifestyle: s.id as any })} className={`min-h-14 rounded-xl border-2 px-2 py-4 text-sm font-bold transition-all sm:min-h-0 sm:py-3 sm:text-[11px] ${consultation.lifestyle === s.id ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-gray-100 text-gray-500 hover:border-gray-200 sm:border-gray-50 sm:text-gray-400'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs sm:text-[10px] font-black uppercase tracking-widest text-gray-500 sm:text-gray-400 mb-4 sm:mb-6 flex items-center gap-2">
                    <div className="w-1 h-1 bg-rose-500 rounded-full"></div> Longueur souhaitee
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {targetLengths.map(length => (
                      <button key={length.id} onClick={() => updateConsultation({ targetLength: length.id as any })} className={`min-h-14 rounded-xl border-2 px-2 py-4 text-sm font-bold transition-all sm:min-h-0 sm:py-3 sm:text-[11px] ${consultation.targetLength === length.id ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-gray-100 text-gray-500 hover:border-gray-200 sm:border-gray-50 sm:text-gray-400'}`}>
                        {length.label}
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <button onClick={performInitialExpertise} className="w-full bg-black text-white py-6 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl active:scale-95">
                {canResumeCurrentRecommendations ? "Reprendre les recommandations" : selectedExample ? "Afficher les recommandations" : "Utiliser mon essai du jour"} <Sparkles className="w-5 h-5 text-rose-400" />
              </button>
            </div>
          </div>
        )}

        {!isWorkspacePanelOpen && state === AppState.SELECTION && analysis && (
          <div className="animate-in fade-in duration-700 pb-16 sm:pb-36">
            <div className="mx-auto max-w-6xl">
              <StepHeader title="Recommandations Visage">
                <div className="sm:hidden">
                  <details>
                    <summary className="mx-auto inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-5 text-xs font-black uppercase tracking-widest text-rose-600 shadow-sm transition-colors hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 [&::-webkit-details-marker]:hidden">
                      <Info className="h-4 w-4" />
                      Analyse
                    </summary>
                    <div className="mt-3 rounded-3xl border border-rose-100 bg-rose-50/70 p-5 text-left text-sm font-medium leading-relaxed text-rose-900 shadow-sm">
                      {analysis.professionalAdvice}
                    </div>
                  </details>
                </div>
                <div className="hidden rounded-3xl border border-rose-100 bg-rose-50/50 p-6 italic leading-relaxed text-rose-900 shadow-sm sm:inline-block sm:max-w-2xl">
                  {analysis.professionalAdvice}
                </div>
              </StepHeader>
              {proposals.length > 0 && (
                <div className="mx-auto -mt-4 mb-8 flex max-w-lg justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setState(AppState.RESULTS);
                      scrollToTop();
                    }}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-black px-5 py-2 text-xs font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-rose-100"
                  >
                    <Images className="h-4 w-4 text-rose-300" />
                    Revoir le resultat genere
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {analysis.recommendedStyles.map((style) => (
                <div 
                  key={style.id} 
                  onClick={() => toggleStyleSelection(style.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleStyleSelection(style.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-[2rem] border-2 bg-white transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-rose-100 sm:flex-row sm:rounded-[2.5rem] ${selectedStyles.includes(style.id) ? 'border-rose-500 ring-4 ring-rose-50' : 'border-gray-100 shadow-sm hover:border-rose-200'}`}
                >
                  <div
                    className="relative aspect-[4/5] w-full shrink-0 overflow-hidden border-b border-gray-100 bg-gray-50 bg-cover bg-center sm:aspect-[3/4] sm:w-1/3 sm:border-b-0 sm:border-r"
                    style={isOpenAiUploadStyle(style) ? undefined : { backgroundImage: `url(${createLocalPreviewFallback(style)})` }}
                  >
                    {style.previewUrl ? (
                      <img
                        src={style.previewUrl}
                        className="w-full h-full object-cover"
                        alt={style.name}
                        loading="eager"
                        onError={(event) => {
                          handleImageError(event, style, style.previewUrl || "", isOpenAiUploadStyle(style));
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 p-4 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                        <span className="text-[8px] font-black uppercase tracking-tighter">Calcul...</span>
                      </div>
                    )}
                    {selectedStyles.includes(style.id) && <div className="absolute top-2 right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg z-10 animate-in zoom-in"><CheckCircle2 className="w-4 h-4" /></div>}
                  </div>
                  <div className="flex min-h-[9rem] flex-col justify-center p-5 sm:p-6">
                    <h3 className="text-2xl font-bold leading-tight text-gray-950 transition-colors group-hover:text-rose-600 sm:text-lg">{style.name}</h3>
                    <div className="mt-3 space-y-2 text-sm font-medium leading-relaxed text-gray-600 sm:text-xs">
                      <p>{style.whyItWorks}</p>
                      {style.description && <p>{style.description}</p>}
                      {style.beardStyle && style.beardStyle !== 'N/A' && style.beardStyle !== 'Aucune' && (
                        <p>Complement: {style.beardStyle}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 mx-auto w-full max-w-lg px-0 sm:px-4 z-30">
              <div className="bg-black/95 backdrop-blur-2xl text-white p-6 rounded-3xl shadow-2xl flex items-center justify-between border border-white/10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Styles Choisis</span>
                  <div className="text-xl font-bold">{selectedStyles.length} / {maxSelectableStyles}</div>
                </div>
                <button 
                  disabled={selectedStyles.length === 0} 
                  onClick={generateSelectedLooks} 
                  className="bg-white text-black px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all disabled:opacity-20 active:scale-95 shadow-lg flex items-center gap-2"
                >
                  {openAiUploadMode ? 'Generer le resultat final' : preparedSelectionMode || preparedUploadMode ? 'Afficher le résultat' : hfKontextMode ? 'Modifier la coupe' : localRetouchMode ? 'Retoucher localement' : imageToImageMode ? 'Retoucher ma photo' : freeImageApiMode ? 'Generer la coupe' : 'Générer sur le profil'} <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {!isWorkspacePanelOpen && (state === AppState.ANALYZING || state === AppState.GENERATING) && (
          <div className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-center justify-center text-center">
            <div className="mb-8 flex items-center gap-3 rounded-full border border-rose-100 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generation en cours
            </div>
            <h2 className="serif text-3xl font-bold mb-2">{state === AppState.ANALYZING ? "Vision Studio..." : "Traitement Réaliste..."}</h2>
            <p className="mb-8 text-gray-400 font-light text-lg tracking-wide max-w-sm mx-auto leading-relaxed">
              Cette fiche reste active jusqu'au resultat.
            </p>
            {renderPendingGenerationCard()}
            <p className="mt-6 rounded-full border border-rose-100 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 shadow-sm">
              Navigation protegee pendant le traitement
            </p>
          </div>
        )}

        {!isWorkspacePanelOpen && state === AppState.RESULTS && analysis && (
          <div className="animate-in fade-in duration-1000">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
              <aside className="lg:col-span-1">
                <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 sticky top-24">
                  <div className="aspect-[3/4] mb-8 rounded-3xl overflow-hidden border border-gray-100 shadow-xl group/orig relative">
                    <img src={userImage || ''} className="w-full h-full object-cover" alt="Original" />
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-widest">Portrait Original</div>
                  </div>
                  <div className="mb-6 space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Morphologie détectée</div>
                    <div className="font-bold text-gray-900">{analysis.faceShape}</div>
                  </div>
                  {selectedExample && (
                    <div className="mb-6 rounded-2xl bg-rose-50 border border-rose-100 p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Exemple actif</div>
                      <div className="mt-1 font-black text-gray-950">{selectedExample.name}</div>
                      <div className="mt-1 text-[11px] leading-snug text-gray-500">{selectedExample.profile}</div>
                    </div>
                  )}
                  <button onClick={resetExperience} className="w-full bg-black text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-md">
                    <RotateCcw className="w-4 h-4 text-rose-400" /> Nouvel Essai
                  </button>
                </div>
              </aside>

              <div className="lg:col-span-3">
                <div className="mb-12">
                  <h2 className="serif text-5xl font-bold mb-2">{resultTitle}</h2>
                  {!preparedResult && (
                    <p className="text-gray-400 font-light italic text-lg">{resultDescription}</p>
                  )}
                </div>

                <div className={`grid grid-cols-1 gap-16 mb-24 ${proposals.length === 1 ? "max-w-3xl mx-auto" : "md:grid-cols-2"}`}>
                    {proposals.map((p) => {
                      const publishable = canPublishToPublicGallery(p);
                      const published = publishedProposalIds.includes(p.id);
                      const showPublicationAction = shouldShowPublicationAction(p);
                      return (
                      <div key={p.id} className="group animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div 
                          onClick={() => setZoomImage(p.imageUrl)}
                          className={`relative overflow-hidden shadow-2xl mb-5 border border-gray-50 cursor-pointer ${p.isPreparedAsset ? "mx-auto aspect-[3/4] max-w-xl rounded-[2rem] bg-gray-100" : "aspect-[4/5] rounded-[2.5rem] bg-gray-100"}`}
                        >
                          <img
                            src={p.imageUrl}
                            className={`w-full h-full object-cover ${p.isPreparedAsset ? "" : "transition-transform duration-[4s] group-hover:scale-105"}`}
                            alt={p.styleName}
                            onError={(event) => {
                              handleImageError(event, p, p.imageUrl);
                            }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <div className="bg-white/90 backdrop-blur-xl px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                               <Maximize2 className="w-5 h-5 text-rose-600" />
                               <span className="text-xs font-black uppercase tracking-widest text-gray-900">Agrandir</span>
                            </div>
                          </div>
                        </div>

                        {p.additionalViews && (
                          <div className="mx-auto grid max-w-xl grid-cols-3 gap-3 mb-8 animate-in slide-in-from-top-4 duration-500 sm:gap-4">
                            {Object.entries(p.additionalViews).map(([k, url]) => (
                              <button
                                key={k}
                                type="button"
                                className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-lg transition-all duration-200 group/angle cursor-pointer hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-rose-100"
                                onClick={(e) => { e.stopPropagation(); setZoomImage(url); }}
                                aria-label={`Agrandir la vue ${k === 'back' ? 'dos' : k === 'left' ? 'gauche' : 'droite'}`}
                              >
                                <img
                                  src={url}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover/angle:scale-105"
                                  alt={k}
                                  onError={(event) => {
                                    handleImageError(event, p, url);
                                  }}
                                />
                                <div className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/55 px-1.5 py-1 text-[8px] font-black uppercase tracking-wider text-white backdrop-blur-md">
                                  {k === 'back' ? 'Dos' : k === 'left' ? 'Gauche' : 'Droite'}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {resultDownloadsEnabled && p.additionalViews && (
                          <div className="mb-6 flex flex-wrap justify-center gap-2">
                            {Object.entries(p.additionalViews).map(([k, url]) => (
                              <a
                                key={`${p.id}-${k}-download`}
                                href={url}
                                download={imageDownloadName(p.styleName, k, url)}
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-gray-500 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                              >
                                <Download className="h-3.5 w-3.5" />
                                {k === 'back' ? 'Dos' : k === 'left' ? 'Gauche' : 'Droite'}
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="mb-6">
                          <h3 className="serif text-3xl font-bold mb-3">{p.styleName}</h3>
                          <div className="flex flex-wrap gap-2 mb-4">
                            <span className="text-[10px] font-black bg-rose-50 text-rose-600 px-3 py-1.5 rounded-full uppercase tracking-widest border border-rose-100">{p.color}</span>
                            {p.backgroundTreatment === 'gray' && (
                              <span className="text-[10px] font-black bg-gray-50 text-gray-500 px-3 py-1.5 rounded-full uppercase tracking-widest border border-gray-100">Fond gris</span>
                            )}
                            {p.beardStyle && p.beardStyle !== 'N/A' && p.beardStyle !== 'Aucune' && (
                              <span className="text-[10px] font-black bg-gray-50 text-gray-500 px-3 py-1.5 rounded-full uppercase tracking-widest border border-gray-100">Barbe : {p.beardStyle}</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm italic leading-relaxed font-light">"{p.whyItWorks}"</p>
                          {p.backgroundTreatment === 'original' && (
                            <p className="mt-3 text-sm leading-relaxed text-gray-600">Le fond de la photo a été conservé. Votre résultat est disponible sans nouvelle génération.</p>
                          )}
                        </div>

                        {(resultDownloadsEnabled || showPublicationAction) && (
                        <div className={`mb-5 grid grid-cols-1 gap-3 ${resultDownloadsEnabled && showPublicationAction ? "sm:grid-cols-2" : ""}`}>
                          {resultDownloadsEnabled && (
                            <a
                              href={p.imageUrl}
                              download={imageDownloadName(p.styleName, "face", p.imageUrl)}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-700 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                            >
                              <Download className="h-4 w-4" />
                              Telecharger
                            </a>
                          )}
                          {showPublicationAction && (
                            <ShareMenuAction
                              menuId={`proposal-${p.id}`}
                              openMenuId={shareMenuId}
                              buttonClassName="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-rose-100"
                              menuClassName="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-64 overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 text-left shadow-2xl"
                              isPublishing={publishingProposalId === p.id}
                              isPublished={published}
                              canPublish={publishable}
                              unavailableReason={publicPublicationUnavailableReason(p)}
                              onOpenMenuChange={setShareMenuId}
                              onPublish={() => void publishProposal(p)}
                              onShareExternally={() => void shareResultExternally(p)}
                            />
                          )}
                        </div>
                        )}
                        
                        {!freeImageApiMode && !hfKontextMode && !p.additionalViews && !p.isPreparedAsset && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); exploreAngles(p.id); }} 
                            className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                          >
                            {p.isGeneratingAngles ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                            {p.isGeneratingAngles ? "Génération 360°..." : "Voir Profils & Dos"}
                          </button>
                        )}
                      </div>
                      );
                    })}
                  </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <AppFooter
        privacyRoutePath={privacyRoutePath}
        privacyPageOpen={privacyPageOpen}
        onPrivacyClick={openPrivacyPage}
        navigationDisabled={isGenerationInProgress}
        disabledReason={generationNavigationMessage}
      />

      {galleryDetailForDisplay && (
        <GenerationDetailSheet
          item={galleryDetailForDisplay.item}
          scope={galleryDetailForDisplay.scope}
          originalUrl={galleryOriginalUrl}
          imageEntries={generationImages(galleryDetailForDisplay.item)}
          downloadsEnabled={galleryDownloadsEnabled}
          showPublicationAction={galleryShowPublicationAction}
          canPublish={galleryCanPublish}
          isPublished={galleryPublished}
          isPublishing={publishingGenerationId === galleryDetailForDisplay.item.id}
          shareMenuId={shareMenuId}
          publicationUnavailableReason={publicPublicationUnavailableReason(galleryDetailForDisplay.item)}
          formattedDate={formattedGenerationDate(galleryDetailForDisplay.item.createdAt)}
          canResumeRecommendations={galleryDetailForDisplay.scope === 'daily' && canResumeSavedRecommendations(galleryDetailForDisplay.item)}
          isImageUnavailable={isImageUnavailable}
          imageDownloadName={imageDownloadName}
          onClose={closeGenerationSheet}
          onZoomImage={setZoomImage}
          onResumeRecommendations={() => void resumeSavedRecommendations(galleryDetailForDisplay.item)}
          onOpenShareMenuChange={setShareMenuId}
          onPublish={() => void publishDailyGeneration(galleryDetailForDisplay.item)}
          onShareExternally={() => void shareResultExternally(galleryDetailForDisplay.item)}
          onImageError={(event, url, forceUnavailable) => {
            handleImageError(event, galleryDetailForDisplay.item, url, forceUnavailable);
            if (galleryDetailForDisplay.scope === "daily" && account?.type === "user") {
              void hydratePersonalGenerationAssets(galleryDetailForDisplay.item);
            }
          }}
        />
      )}

      {zoomImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <button
            type="button"
            onClick={() => setZoomImage(null)}
            className="absolute left-4 top-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition-all hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/20 sm:left-8 sm:top-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
          <button onClick={() => setZoomImage(null)} className="absolute top-8 right-8 text-white/50 hover:text-white p-4 transition-colors"><X className="w-10 h-10" /></button>
          <img src={zoomImage} className="max-w-full max-h-[90vh] rounded-3xl object-contain shadow-2xl animate-in zoom-in-95 duration-300" alt="Zoom" />
        </div>
      )}
    </div>
  );
};

export default App;
