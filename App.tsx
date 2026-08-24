
import React, { useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import { AppState, AnalysisResult, Proposal, ConsultationData, PublicGeneration } from './types';
import { analyzeMorphology, generateHairstyleImage, generateStyleAngles, generateQuickPreview, generateOpenAiUploadRecommendations, generateOpenAiSelectedResult, activateOpenAiTrialCode, fetchPublicGenerations, publishPublicGeneration, isOpenAiUploadStyle, isFreeImageApiMode, isImageToImageMode, isPuterFluxImageToImageMode, isHuggingFaceKontextImageToImageMode, isLocalRetouchImageToImageMode, createLocalPreviewFallback, createLocalExampleAnalysis } from './services/geminiService';
import { DEMO_EXAMPLES, DemoExample } from './services/demoExamples';
import { getPreparedCombinationBoardUrl, getPreparedProfileStyles, hasPreparedCombination, hasPreparedLookDatabase } from './services/profileLookDatabase';
import { 
  Loader2, Sparkles, ArrowLeft, AlertTriangle, X, ChevronRight, 
  RotateCcw, CheckCircle2, Maximize2, User, Info,
  Baby, GraduationCap, Briefcase, Glasses, Users, Upload,
  Download, Globe2, ImagePlus, Images
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trialCode, setTrialCode] = useState('');
  const [trialCodeMessage, setTrialCodeMessage] = useState<string | null>(null);
  const [canActivateTrialCode, setCanActivateTrialCode] = useState(false);
  const [isActivatingTrialCode, setIsActivatingTrialCode] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null);
  const [publicGenerations, setPublicGenerations] = useState<PublicGeneration[]>([]);
  const [dailyResults, setDailyResults] = useState<PublicGeneration[]>([]);
  const [galleryDetail, setGalleryDetail] = useState<{ item: PublicGeneration; scope: 'daily' | 'public' } | null>(null);
  const [isPublicGalleryLoading, setIsPublicGalleryLoading] = useState(false);
  const [publishingProposalId, setPublishingProposalId] = useState<string | null>(null);
  const [publishedProposalIds, setPublishedProposalIds] = useState<string[]>([]);
  const [publishingGenerationId, setPublishingGenerationId] = useState<string | null>(null);
  const [publishedGenerationIds, setPublishedGenerationIds] = useState<string[]>([]);
  const activeOperationRef = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const freeImageApiMode = isFreeImageApiMode();
  const imageToImageMode = isImageToImageMode();
  const puterFluxMode = isPuterFluxImageToImageMode();
  const hfKontextMode = isHuggingFaceKontextImageToImageMode();
  const localRetouchMode = isLocalRetouchImageToImageMode();
  const selectedExample = DEMO_EXAMPLES.find(example => example.id === selectedExampleId) || null;
  const preparedSelectionMode = !!getPreparedCombinationBoardUrl(selectedExample, consultation);
  const preparedUploadMode = !!analysis?.recommendedStyles.some(style => style.isPreparedAsset && style.id.startsWith("alibaba-upload"));
  const openAiUploadMode = !!analysis?.recommendedStyles.some(isOpenAiUploadStyle);
  const maxSelectableStyles = preparedSelectionMode || preparedUploadMode || openAiUploadMode || freeImageApiMode || imageToImageMode ? 1 : 4;
  const preparedResult = proposals.find(proposal => proposal.isPreparedAsset);
  const resultTitle = preparedResult
    ? preparedResult.styleName
    : openAiUploadMode
      ? "Resultat OpenAI"
      : hfKontextMode
      ? "Coupe modifiee par image-to-image"
      : localRetouchMode
        ? "Photo retouchee localement"
        : imageToImageMode
          ? "Photo transformee par image-to-image"
          : freeImageApiMode
            ? "Image Generee par API Gratuite"
            : "Simulations Haute Fidélité";
  const resultDescription = openAiUploadMode
    ? "La coupe selectionnee a ete generee avec une seconde planche OpenAI, puis decoupee en portrait de face, profils et dos."
    : hfKontextMode
    ? "La photo chargee est envoyee en image-to-image avec une consigne stricte: garder la personne et modifier uniquement la coupe."
    : localRetouchMode
      ? "La photo chargee reste l'entree principale. La coupe choisie est simulee dans le navigateur, sans Google, sans Puter et sans appel payant."
      : puterFluxMode
        ? "La photo chargee sert d'entree a FLUX Kontext via Puter. Aucune API Google n'est utilisee."
        : imageToImageMode
          ? "La photo chargee sert d'entree au modele. Seule la coupe choisie doit etre modifiee."
          : freeImageApiMode
            ? "La coupe choisie est generee par API gratuite. Le portrait original reste votre reference."
            : "Seuls les cheveux et la barbe ont été adaptés. Le décor original est préservé.";
  const showOriginalPreview = !!userImage && state !== AppState.IDLE && state !== AppState.RESULTS;
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
        ? parsed.results as PublicGeneration[]
        : [];
    } catch {
      return [];
    }
  };

  const saveDailyResults = (results: PublicGeneration[]) => {
    try {
      window.localStorage.setItem(dailyResultsStorageKey, JSON.stringify({
        date: todayKey(),
        results: results.slice(0, 48)
      }));
    } catch {
      // Daily history is a convenience feature; generation must keep working if storage is full.
    }
  };

  useEffect(() => {
    let mounted = true;
    setDailyResults(loadDailyResults());
    setIsPublicGalleryLoading(true);
    fetchPublicGenerations()
      .then(generations => {
        if (mounted) setPublicGenerations(generations);
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
    setNotice(null);
    setError(message);
    setTrialCodeMessage(null);
    setCanActivateTrialCode(isTrialQuotaError(err, message));
  };

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
      setNotice(result.message || "Code active. Relancez la generation OpenAI.");
    } catch (err: any) {
      setTrialCodeMessage(err?.message || "Activation du code impossible.");
    } finally {
      setIsActivatingTrialCode(false);
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
    if (key === "left") return "Profil gauche";
    if (key === "right") return "Profil droit";
    if (key === "back") return "Dos";
    return key;
  };

  const generationImages = (item: PublicGeneration) => [
    { key: "front", label: viewLabel("front"), url: item.imageUrl },
    ...Object.entries(item.additionalViews || {}).map(([key, url]) => ({
      key,
      label: viewLabel(key),
      url
    }))
  ].filter(entry => Boolean(entry.url));

  const openGenerationSheet = (item: PublicGeneration, scope: 'daily' | 'public') => {
    setGalleryDetail({ item, scope });
    setZoomImage(null);
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
      imageUrl: proposal.imageUrl,
      styleName: proposal.styleName,
      color: proposal.color,
      faceShape: analysisInput.faceShape,
      sourceLabel,
      createdAt: new Date().toISOString(),
      additionalViews: proposal.additionalViews,
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
    const entries = items
      .map(item => dailyGenerationFromProposal(item, analysisInput, consultationInput, sourceLabel, originalImageUrl))
      .filter((item): item is PublicGeneration => Boolean(item));
    if (!entries.length) return;

    setDailyResults(prev => {
      const merged = [
        ...entries,
        ...prev.filter(item => !entries.some(entry => entry.imageUrl === item.imageUrl))
      ].slice(0, 48);
      saveDailyResults(merged);
      return merged;
    });
  };

  const publishProposal = async (proposal: Proposal) => {
    if (!analysis) return;
    setPublishingProposalId(proposal.id);
    try {
      const generation = await publishPublicGeneration({
        proposal,
        analysis,
        consultation,
        sourceLabel: selectedExample ? selectedExample.name : "Photo personnelle"
      });
      setPublicGenerations(prev => [generation, ...prev.filter(item => item.id !== generation.id && item.imageUrl !== generation.imageUrl)].slice(0, 48));
      setPublishedProposalIds(prev => prev.includes(proposal.id) ? prev : [...prev, proposal.id]);
      setNotice("Resultat ajoute a la vitrine publique.");
    } catch (err: any) {
      showServiceError(err, "Publication vitrine impossible.");
    } finally {
      setPublishingProposalId(null);
    }
  };

  const publishDailyGeneration = async (item: PublicGeneration) => {
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
          additionalViews: item.additionalViews
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

      setPublicGenerations(prev => [generation, ...prev.filter(entry => entry.id !== generation.id && entry.imageUrl !== generation.imageUrl)].slice(0, 48));
      setPublishedGenerationIds(prev => prev.includes(item.id) ? prev : [...prev, item.id]);
      setDailyResults(prev => {
        const next = prev.map(entry => entry.id === item.id ? { ...entry, publicGenerationId: generation.id } : entry);
        saveDailyResults(next);
        return next;
      });
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

  const getExampleSourceNote = (example: DemoExample) =>
    example.assetId === "marc"
      ? "Planche statique preparee: la morphologie de depart est gardee, puis les recommandations viennent de la selection validee."
      : "Profil charge depuis la base locale: la morphologie de depart est gardee, puis les recommandations se recalculent selon vos reglages.";

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const beginOperation = () => {
    activeOperationRef.current += 1;
    return activeOperationRef.current;
  };
  const cancelActiveOperation = () => {
    activeOperationRef.current += 1;
  };
  const isCurrentOperation = (operationId: number) => activeOperationRef.current === operationId;

  const BackButton = ({ onClick, label = "Retour" }: { onClick: () => void; label?: string }) => (
    <button
      type="button"
      onClick={onClick}
      className="relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-gray-100 bg-white px-4 py-2 text-sm font-black text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
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
    cancelActiveOperation();
    setAnalysis(null);
    setSelectedStyles([]);
    setProposals([]);
    setZoomImage(null);
    clearServiceAlert();
    setState(AppState.CONSULTATION);
    scrollToTop();
  };

  const returnToSelection = () => {
    cancelActiveOperation();
    setZoomImage(null);
    clearServiceAlert();
    setState(analysis ? AppState.SELECTION : AppState.CONSULTATION);
    scrollToTop();
  };

  const returnFromLoading = () => {
    cancelActiveOperation();
    setLoadingStep('');
    clearServiceAlert();
    setState(state === AppState.GENERATING && analysis ? AppState.SELECTION : AppState.CONSULTATION);
    scrollToTop();
  };

  const performInitialExpertise = async () => {
    if (!userImage) return;
    clearServiceAlert();
    const operationId = beginOperation();
    try {
      setState(AppState.ANALYZING);
      setLoadingStep(selectedExample ? `Expertise locale du profil ${selectedExample.name}...` : "Generation OpenAI des 4 propositions du jour...");
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

      const alreadyPrepared = result.recommendedStyles.some(style => style.previewUrl || style.isPreparedAsset);
      if (!alreadyPrepared && (!selectedExample || !hasPreparedCombination(selectedExample, consultation))) {
        loadThumbnails(result);
      }
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      showServiceError(err, "Le service OpenAI est indisponible. Veuillez patienter.");
      setState(AppState.CONSULTATION);
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
    cancelActiveOperation();
    setState(AppState.IDLE);
    setUserImage(null);
    setSelectedExampleId(null);
    setAnalysis(null);
    setSelectedStyles([]);
    setProposals([]);
    setPublishedProposalIds([]);
    clearServiceAlert();
    setZoomImage(null);
  };

  const topRightBack =
    state === AppState.CONSULTATION
      ? { label: 'Accueil', action: resetExperience }
      : state === AppState.SELECTION
        ? { label: 'Consultation', action: returnToConsultation }
        : state === AppState.ANALYZING
          ? { label: 'Consultation', action: returnFromLoading }
          : state === AppState.GENERATING
            ? { label: 'Recommandations', action: returnFromLoading }
            : state === AppState.RESULTS
              ? { label: 'Recommandations', action: returnToSelection }
              : null;

  const startExampleConsultation = (example: DemoExample) => {
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
    uploadInputRef.current?.click();
  };

  const handleUserImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showServiceError(new Error("Veuillez charger une image valide."), "Veuillez charger une image valide.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
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
    const operationId = beginOperation();
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
    const operationId = beginOperation();
    setState(AppState.GENERATING);
    const chosenStyles = analysis.recommendedStyles.filter(s => selectedStyles.includes(s.id));
    const newProposals: Proposal[] = [];
    setPublishedProposalIds([]);

    try {
      for (let i = 0; i < chosenStyles.length; i++) {
        const style = chosenStyles[i];
        setLoadingStep(isOpenAiUploadStyle(style) ? `Planche finale OpenAI : ${style.name}...` : hfKontextMode ? `Image-to-image modifie vraiment la coupe : ${style.name}...` : localRetouchMode ? `Retouche locale sur votre photo : ${style.name}...` : imageToImageMode ? `Retouche image-to-image : ${style.name}...` : freeImageApiMode ? `Generation API gratuite : ${style.name}...` : `Transformation en cours : ${style.name}...`);
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
            isPreparedAsset: openAiProposal?.isPreparedAsset || style.isPreparedAsset
          });
          if (i < chosenStyles.length - 1) await new Promise(r => setTimeout(r, 800));
        } catch (innerErr) {
          console.error(`Echec pour ${style.name}`, innerErr);
          if (imageToImageMode) {
            throw new Error(innerErr instanceof Error ? innerErr.message : "La retouche image-to-image n'a pas abouti.");
          }
        }
      }
      
      if (!isCurrentOperation(operationId)) return;
      if (newProposals.length === 0) throw new Error("Génération impossible sur cette photo.");
      
      setProposals(newProposals);
      void rememberDailyProposals(newProposals, analysis, consultation, selectedExample ? selectedExample.name : "Photo personnelle", userImage);
      setState(AppState.RESULTS);
      scrollToTop();
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      showServiceError(err, "Erreur de génération.");
      setState(AppState.SELECTION);
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

  const OriginalPhotoPreview = ({ compact = false }: { compact?: boolean }) => (
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

  const DemoExampleGallery = () => (
    <>
    <input
      ref={uploadInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleUserImageUpload}
    />
    <section aria-label="Selection du profil" className="isolate flex flex-wrap items-center justify-center -space-x-2.5 gap-y-4 px-6 py-3 sm:-space-x-3 sm:gap-y-5">
      <button
        type="button"
        onClick={handleUploadClick}
        aria-label="Charger une photo"
        title="Charger une photo"
        className="relative z-0 h-[8.4rem] w-24 cursor-pointer overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm transition-all duration-300 hover:z-30 hover:-translate-y-2 hover:scale-105 hover:border-rose-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-rose-100 sm:h-[9.6rem] sm:w-[7.2rem]"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-rose-500">
          <div className="rounded-full bg-rose-50 p-2">
            <Upload className="h-5 w-5" />
          </div>
          <span className="text-center text-[8px] font-black uppercase leading-tight tracking-widest text-gray-700">Charger une photo</span>
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
                    loading="lazy"
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

  const DailyGenerationGallery = () => {
    if (dailyResults.length === 0) return null;

    return (
      <section className="mx-auto mt-14 max-w-6xl text-left animate-in fade-in slide-in-from-bottom-4 duration-500" aria-label="Mes resultats du jour">
        <div className="mb-5 flex flex-col gap-3 px-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
              <Images className="h-3.5 w-3.5 text-rose-300" />
              Mes resultats du jour
            </div>
            <h2 className="serif text-3xl font-bold text-gray-950">Historique personnel</h2>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {dailyResults.length} resultat{dailyResults.length > 1 ? "s" : ""}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {dailyResults.slice(0, 12).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => openGenerationSheet(item, 'daily')}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-rose-100"
            >
              <div className="aspect-[3/4] overflow-hidden bg-gray-100">
                <img
                  src={item.imageUrl}
                  alt={item.styleName}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = createLocalPreviewFallback(item);
                  }}
                />
              </div>
              <div className="p-3">
                <div className="truncate text-xs font-black text-gray-950">{item.styleName}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{item.sourceLabel}</div>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-gray-500">
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

  const PublicGenerationGallery = () => {
    if (!isPublicGalleryLoading && publicGenerations.length === 0) return null;

    return (
      <section className="mx-auto mt-14 max-w-6xl text-left animate-in fade-in slide-in-from-bottom-4 duration-500" aria-label="Vitrine publique">
        <div className="mb-5 flex flex-col gap-3 px-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600 shadow-sm ring-1 ring-rose-100">
              <Globe2 className="h-3.5 w-3.5" />
              Vitrine publique
            </div>
            <h2 className="serif text-3xl font-bold text-gray-950">Dernieres generations</h2>
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
            : publicGenerations.slice(0, 12).map(item => (
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
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = createLocalPreviewFallback(item);
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

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFCFB]">
      <Header />
      {topRightBack && !zoomImage && !galleryDetail && (
        <div className="fixed right-4 top-4 z-[70] sm:right-8">
          <BackButton onClick={topRightBack.action} label={topRightBack.label} />
        </div>
      )}
      {showOriginalPreview && (
        <div className="pointer-events-none hidden lg:block fixed left-6 top-24 z-30 w-64 animate-in fade-in slide-in-from-left-3 duration-300">
          <OriginalPhotoPreview compact />
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
                      aria-label="Code bonus OpenAI"
                      className="min-h-11 flex-1 rounded-xl border border-red-100 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                    />
                    <button
                      type="submit"
                      disabled={isActivatingTrialCode}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isActivatingTrialCode && <Loader2 className="h-4 w-4 animate-spin" />}
                      Activer +5
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
            <OriginalPhotoPreview compact />
          </div>
        )}

        {state === AppState.IDLE && (
          <div className="mx-auto max-w-6xl py-12 text-center animate-in fade-in duration-1000">
            <div className="mx-auto max-w-3xl">
              <h1 className="serif text-5xl md:text-6xl font-bold text-gray-900 mb-5">Expertise <span className="text-rose-600 italic">Visagiste</span></h1>
              <p className="text-sm text-gray-500 mb-10 max-w-xl mx-auto">Chargez une photo ou selectionnez un profil exemple.</p>
              <DemoExampleGallery />
            </div>
            <DailyGenerationGallery />
            <PublicGenerationGallery />
          </div>
        )}

        {state === AppState.CONSULTATION && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <StepHeader
              title="Votre Profil de Consultation"
              titleClassName="serif text-4xl font-bold text-gray-950"
            />

            {selectedExample && (
              <div className="mb-8 rounded-[1.75rem] border border-rose-100 bg-rose-50/60 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-24 w-20 rounded-2xl overflow-hidden border border-white bg-white shrink-0">
                  <img src={selectedExample.sourceImage} alt={`Photo de depart ${selectedExample.name}`} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Exemple selectionne</div>
                  <div className="mt-1 text-xl font-black text-gray-950">{selectedExample.name} - {selectedExample.faceShape}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gray-600">{ageLabels[consultation.ageGroup]}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gray-600">{maintenanceLabels[consultation.maintenance]}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gray-600">{lifestyleLabels[consultation.lifestyle]}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gray-600">{lengthLabels[consultation.targetLength]}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetExperience}
                  className="cursor-pointer rounded-xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                >
                  Changer
                </button>
              </div>
            )}

            {!selectedExample && userImage && (
              <div className="mb-8 rounded-[1.75rem] border border-rose-100 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-24 w-20 rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 shrink-0">
                  <img src={userImage} alt="Photo chargee" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Photo chargee</div>
                  <div className="mt-1 text-xl font-black text-gray-950">Essai OpenAI du jour</div>
                  <div className="mt-1 text-sm font-medium leading-snug text-gray-500">Une planche 4x4 genere les 4 propositions, puis une seconde planche finalise la coupe choisie. Limite: 1 essai complet par jour.</div>
                </div>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="cursor-pointer rounded-xl bg-rose-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                >
                  Remplacer
                </button>
              </div>
            )}
            
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                    <User className="w-3 h-3 text-rose-500" /> Genre
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:'male', label:'Masculin'}, {id:'female', label:'Féminin'}, {id:'non-binary', label:'Autre'}].map(g => (
                      <button
                        key={g.id}
                        disabled={demographicsLocked && consultation.gender !== g.id}
                        onClick={() => !demographicsLocked && setConsultation({...consultation, gender: g.id as any})}
                        className={`py-3 rounded-xl border-2 text-[11px] font-bold transition-all disabled:opacity-25 disabled:cursor-not-allowed ${consultation.gender === g.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {demographicsLocked && <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Verrouille par la photo choisie</p>}
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                    <Users className="w-3 h-3 text-rose-500" /> Tranche d'âge
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ageGroups.map(a => (
                      <button
                        key={a.id}
                        disabled={demographicsLocked && consultation.ageGroup !== a.id}
                        onClick={() => !demographicsLocked && setConsultation({...consultation, ageGroup: a.id as any})}
                        className={`py-2 px-1 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 min-h-[80px] disabled:opacity-25 disabled:cursor-not-allowed ${consultation.ageGroup === a.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}
                      >
                        <a.icon className={`w-4 h-4 ${consultation.ageGroup === a.id ? 'text-rose-500' : 'text-gray-300'}`} />
                        <span className="text-[10px] font-bold leading-none">{a.label}</span>
                        <span className="text-[8px] font-medium opacity-60 leading-none">{a.sub}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-8 border-t border-gray-50">
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                    <div className="w-1 h-1 bg-rose-500 rounded-full"></div> Niveau d'Entretien
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {['low', 'medium', 'high'].map(m => (
                      <button key={m} onClick={() => setConsultation({...consultation, maintenance: m as any})} className={`py-3 rounded-xl border-2 text-[11px] font-bold transition-all ${consultation.maintenance === m ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}>
                        {m === 'low' ? 'Rapide' : m === 'medium' ? 'Modéré' : 'Rituel'}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                     <div className="w-1 h-1 bg-rose-500 rounded-full"></div> Univers de Style
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:'classic', label:'Classique'}, {id:'modern', label:'Moderne'}, {id:'bold', label:'Audacieux'}].map(s => (
                      <button key={s.id} onClick={() => setConsultation({...consultation, lifestyle: s.id as any})} className={`py-3 rounded-xl border-2 text-[11px] font-bold transition-all ${consultation.lifestyle === s.id ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                    <div className="w-1 h-1 bg-rose-500 rounded-full"></div> Longueur souhaitee
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {targetLengths.map(length => (
                      <button key={length.id} onClick={() => setConsultation({...consultation, targetLength: length.id as any})} className={`py-3 rounded-xl border-2 text-[11px] font-bold transition-all ${consultation.targetLength === length.id ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}>
                        {length.label}
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <button onClick={performInitialExpertise} className="w-full bg-black text-white py-6 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl active:scale-95">
                {selectedExample ? "Afficher les recommandations" : "Utiliser mon essai du jour"} <Sparkles className="w-5 h-5 text-rose-400" />
              </button>
            </div>
          </div>
        )}

        {state === AppState.SELECTION && analysis && (
          <div className="animate-in fade-in duration-700 pb-16 sm:pb-36">
            <div className="mx-auto max-w-6xl">
              <StepHeader title="Recommandations Visagiste">
              <div className="bg-rose-50/50 p-6 rounded-3xl border border-rose-100 inline-block max-w-2xl italic text-rose-900 shadow-sm leading-relaxed">
                "{analysis.professionalAdvice}"
              </div>
              {openAiUploadMode && analysis.quota && (
                <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 shadow-sm">
                  Essai photo personnelle: {analysis.quota.used}/{analysis.quota.limit} aujourd'hui. La generation finale de cette selection reste incluse.
                </div>
              )}
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
                  className={`group relative rounded-[2.5rem] border-2 cursor-pointer transition-all duration-300 flex overflow-hidden bg-white ${selectedStyles.includes(style.id) ? 'border-rose-500 ring-4 ring-rose-50' : 'border-gray-100 hover:border-rose-200 shadow-sm'}`}
                >
                  <div
                    className="w-1/3 aspect-[3/4] bg-gray-50 bg-cover bg-center relative overflow-hidden border-r border-gray-100 shrink-0"
                    style={{ backgroundImage: `url(${createLocalPreviewFallback(style)})` }}
                  >
                    {style.previewUrl ? (
                      <img
                        src={style.previewUrl}
                        className="w-full h-full object-cover"
                        alt={style.name}
                        loading="eager"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = createLocalPreviewFallback(style);
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
                  <div className="p-6 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-2">
                       <h3 className="font-bold text-lg leading-tight group-hover:text-rose-600 transition-colors">{style.name}</h3>
                       <span className="text-[8px] bg-black text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{style.color}</span>
                    </div>
                    <p className="text-xs text-rose-800 font-medium mb-3 flex items-start gap-2">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" /> {style.whyItWorks}
                    </p>
                    {style.beardStyle && style.beardStyle !== 'N/A' && style.beardStyle !== 'Aucune' && (
                      <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-auto flex items-center gap-2">
                        <div className="w-1 h-1 bg-gray-300 rounded-full"></div> Complément : {style.beardStyle}
                      </div>
                    )}
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

        {(state === AppState.ANALYZING || state === AppState.GENERATING) && (
          <div className="mx-auto flex min-h-[50vh] max-w-3xl flex-col items-center justify-center text-center">
            <div className="relative w-20 h-20 mb-10">
              <div className="absolute inset-0 border-t-2 border-rose-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-rose-500 animate-pulse" />
              </div>
            </div>
            <h2 className="serif text-3xl font-bold mb-2">{state === AppState.ANALYZING ? "Vision Studio..." : "Traitement Réaliste..."}</h2>
            <p className="text-gray-400 font-light text-lg tracking-wide max-w-sm mx-auto leading-relaxed">{loadingStep}</p>
          </div>
        )}

        {state === AppState.RESULTS && analysis && (
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
                    {proposals.map((p) => (
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
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = createLocalPreviewFallback(p);
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
                                aria-label={`Agrandir la vue ${k === 'back' ? 'dos' : k === 'left' ? 'profil gauche' : 'profil droit'}`}
                              >
                                <img
                                  src={url}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover/angle:scale-105"
                                  alt={k}
                                  onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = createLocalPreviewFallback(p);
                                  }}
                                />
                                <div className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/55 px-1.5 py-1 text-[8px] font-black uppercase tracking-wider text-white backdrop-blur-md">
                                  {k === 'back' ? 'Dos' : k === 'left' ? 'Gauche' : 'Droite'}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {p.additionalViews && (
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
                            {p.beardStyle && p.beardStyle !== 'N/A' && p.beardStyle !== 'Aucune' && (
                              <span className="text-[10px] font-black bg-gray-50 text-gray-500 px-3 py-1.5 rounded-full uppercase tracking-widest border border-gray-100">Barbe : {p.beardStyle}</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm italic leading-relaxed font-light">"{p.whyItWorks}"</p>
                        </div>

                        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <a
                            href={p.imageUrl}
                            download={imageDownloadName(p.styleName, "face", p.imageUrl)}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-700 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                          >
                            <Download className="h-4 w-4" />
                            Telecharger
                          </a>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              publishProposal(p);
                            }}
                            disabled={publishingProposalId === p.id || publishedProposalIds.includes(p.id)}
                            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-gray-800 disabled:cursor-default disabled:bg-emerald-600 disabled:opacity-90 focus:outline-none focus:ring-4 focus:ring-rose-100"
                          >
                            {publishingProposalId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : publishedProposalIds.includes(p.id) ? <CheckCircle2 className="h-4 w-4" /> : <ImagePlus className="h-4 w-4 text-rose-300" />}
                            {publishedProposalIds.includes(p.id) ? "Publie" : "Publier vitrine"}
                          </button>
                        </div>
                        
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
                    ))}
                  </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {galleryDetail && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-xl animate-in fade-in duration-200 sm:py-10">
          <div className="mx-auto max-w-6xl rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-white/40 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${galleryDetail.scope === 'daily' ? 'bg-black text-white' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'}`}>
                  {galleryDetail.scope === 'daily' ? <Images className="h-3.5 w-3.5 text-rose-300" /> : <Globe2 className="h-3.5 w-3.5" />}
                  {galleryDetail.scope === 'daily' ? 'Historique personnel' : 'Vitrine publique'}
                </div>
                <h2 className="serif text-3xl font-bold leading-tight text-gray-950 sm:text-4xl">{galleryDetail.item.styleName}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <span className="rounded-full bg-gray-50 px-3 py-1">{galleryDetail.item.sourceLabel}</span>
                  <span className="rounded-full bg-gray-50 px-3 py-1">{galleryDetail.item.color}</span>
                  {formattedGenerationDate(galleryDetail.item.createdAt) && (
                    <span className="rounded-full bg-gray-50 px-3 py-1">{formattedGenerationDate(galleryDetail.item.createdAt)}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {galleryDetail.scope === 'daily' && (
                  <button
                    type="button"
                    onClick={() => publishDailyGeneration(galleryDetail.item)}
                    disabled={publishingGenerationId === galleryDetail.item.id || isGenerationPublished(galleryDetail.item)}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-black px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-gray-800 disabled:cursor-default disabled:bg-emerald-600 disabled:opacity-90 focus:outline-none focus:ring-4 focus:ring-rose-100"
                  >
                    {publishingGenerationId === galleryDetail.item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isGenerationPublished(galleryDetail.item) ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <ImagePlus className="h-4 w-4 text-rose-300" />
                    )}
                    {isGenerationPublished(galleryDetail.item) ? "Publie dans public" : "Publier dans public"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeGenerationSheet}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-100 bg-white px-4 text-sm font-black text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <X className="h-4 w-4" />
                  Fermer
                </button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <div className="overflow-hidden rounded-[1.5rem] border border-gray-100 bg-gray-100 shadow-xl">
                <button
                  type="button"
                  onClick={() => setZoomImage(galleryDetail.item.imageUrl)}
                  className="group relative block aspect-[3/4] w-full cursor-pointer overflow-hidden"
                  aria-label="Agrandir la vue de face"
                >
                  <img
                    src={galleryDetail.item.imageUrl}
                    alt={`${galleryDetail.item.styleName} face`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = createLocalPreviewFallback(galleryDetail.item);
                    }}
                  />
                  <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-2xl bg-black/60 px-4 py-3 text-white backdrop-blur-xl">
                    <span className="text-xs font-black uppercase tracking-widest">Face</span>
                    <Maximize2 className="h-4 w-4" />
                  </div>
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Morphologie</div>
                  <div className="mt-1 text-sm font-black text-gray-950">{galleryDetail.item.faceShape}</div>
                </div>

                {galleryDetail.scope === 'daily' && galleryDetail.item.originalImageUrl && (
                  <div className="overflow-hidden rounded-3xl border border-rose-100 bg-rose-50/60 p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Photo d'origine</div>
                        <div className="text-xs font-bold text-gray-500">Reference de depart</div>
                      </div>
                      <a
                        href={galleryDetail.item.originalImageUrl}
                        download={imageDownloadName(galleryDetail.item.styleName, "origine", galleryDetail.item.originalImageUrl)}
                        className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-3 text-[9px] font-black uppercase tracking-widest text-gray-600 shadow-sm transition-all hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Telecharger
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => setZoomImage(galleryDetail.item.originalImageUrl || null)}
                      className="group relative block aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-2xl bg-gray-100"
                      aria-label="Agrandir la photo d'origine"
                    >
                      <img
                        src={galleryDetail.item.originalImageUrl}
                        alt="Photo d'origine"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = createLocalPreviewFallback(galleryDetail.item);
                        }}
                      />
                      <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/55 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                        Origine
                      </div>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {generationImages(galleryDetail.item).map((entry) => (
                    <div key={`${galleryDetail.item.id}-${entry.key}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setZoomImage(entry.url)}
                        className="group relative block aspect-[3/4] w-full cursor-pointer overflow-hidden bg-gray-100"
                        aria-label={`Agrandir ${entry.label}`}
                      >
                        <img
                          src={entry.url}
                          alt={`${galleryDetail.item.styleName} ${entry.label}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = createLocalPreviewFallback(galleryDetail.item);
                          }}
                        />
                        <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/55 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                          {entry.label}
                        </div>
                      </button>
                      <div className="p-2">
                        <a
                          href={entry.url}
                          download={imageDownloadName(galleryDetail.item.styleName, entry.key, entry.url)}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-all hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Telecharger
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
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
