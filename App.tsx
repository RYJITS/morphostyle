
import React, { useRef, useState } from 'react';
import Header from './components/Header';
import { AppState, AnalysisResult, Proposal, ConsultationData } from './types';
import { analyzeMorphology, generateHairstyleImage, generateStyleAngles, generateQuickPreview, generateOpenAiUploadRecommendations, generateOpenAiSelectedResult, isOpenAiUploadStyle, isFreeImageApiMode, isImageToImageMode, isPuterFluxImageToImageMode, isHuggingFaceKontextImageToImageMode, isLocalRetouchImageToImageMode, createLocalPreviewFallback, createLocalExampleAnalysis } from './services/geminiService';
import { DEMO_EXAMPLES, DemoExample } from './services/demoExamples';
import { getPreparedCombinationBoardUrl, getPreparedProfileStyles, hasPreparedCombination, hasPreparedLookDatabase } from './services/profileLookDatabase';
import { 
  Loader2, Sparkles, ArrowLeft, AlertTriangle, X, ChevronRight, 
  RotateCcw, CheckCircle2, Maximize2, User, Info,
  Baby, GraduationCap, Briefcase, Glasses, Users, Upload
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
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null);
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
    setError(null);
    setState(AppState.CONSULTATION);
    scrollToTop();
  };

  const returnToSelection = () => {
    cancelActiveOperation();
    setProposals([]);
    setZoomImage(null);
    setError(null);
    setState(analysis ? AppState.SELECTION : AppState.CONSULTATION);
    scrollToTop();
  };

  const returnFromLoading = () => {
    cancelActiveOperation();
    setLoadingStep('');
    setError(null);
    setState(state === AppState.GENERATING && analysis ? AppState.SELECTION : AppState.CONSULTATION);
    scrollToTop();
  };

  const performInitialExpertise = async () => {
    if (!userImage) return;
    setError(null);
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
      setError(err.message || "Le service OpenAI est indisponible. Veuillez patienter.");
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
    setError(null);
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
    setError(null);
    setZoomImage(null);
    setAnalysis(null);
    setProposals([]);
    setSelectedStyles([]);
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
      setError("Veuillez charger une image valide.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      cancelActiveOperation();
      setError(null);
      setZoomImage(null);
      setAnalysis(null);
      setProposals([]);
      setSelectedStyles([]);
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
    reader.onerror = () => setError("Lecture de la photo impossible.");
    reader.readAsDataURL(file);
  };

  const runCompleteExample = async (example: DemoExample) => {
    const operationId = beginOperation();
    setError(null);
    setZoomImage(null);
    setSelectedExampleId(example.id);
    setConsultation(example.consultation);
    setUserImage(example.sourceImage);
    setSelectedStyles([]);
    setProposals([]);

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
      setProposals([{
        id: finalStyle.id,
        imageUrl,
        styleName: finalStyle.name,
        description: finalStyle.description,
        whyItWorks: finalStyle.whyItWorks,
        color: finalStyle.color,
        beardStyle: finalStyle.beardStyle,
        additionalViews: finalStyle.additionalViews,
        isPreparedAsset: finalStyle.isPreparedAsset
      }]);
      setState(AppState.RESULTS);
      scrollToTop();
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      setError(err.message || "Impossible de charger cet exemple complet.");
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
      setState(AppState.RESULTS);
      scrollToTop();
    } catch (err: any) {
      if (!isCurrentOperation(operationId)) return;
      setError(err.message || "Erreur de génération.");
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

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFCFB]">
      <Header />
      {topRightBack && !zoomImage && (
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
          <div className="fixed top-24 left-1/2 -translate-x-1/2 max-w-xl w-full z-[60] bg-red-50 p-6 rounded-2xl flex items-center gap-4 text-red-700 border border-red-100 shadow-xl animate-in slide-in-from-top-4">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div className="flex-grow">
               <p className="text-sm font-bold">Erreur de service</p>
               <p className="text-sm font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-red-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
        )}

        {showOriginalPreview && (
          <div className="lg:hidden max-w-4xl mx-auto mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
            <OriginalPhotoPreview compact />
          </div>
        )}

        {state === AppState.IDLE && (
          <div className="max-w-3xl mx-auto text-center py-12 animate-in fade-in duration-1000">
            <h1 className="serif text-5xl md:text-6xl font-bold text-gray-900 mb-5">Expertise <span className="text-rose-600 italic">Visagiste</span></h1>
            <p className="text-sm text-gray-500 mb-10 max-w-xl mx-auto">Chargez une photo ou selectionnez un profil exemple.</p>
            <DemoExampleGallery />
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
