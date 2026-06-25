
import React, { useState } from 'react';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import { AppState, AnalysisResult, Proposal, ConsultationData } from './types';
import { analyzeMorphology, generateHairstyleImage, generateStyleAngles, generateQuickPreview, isDemoMode, isFreeImageApiMode, isImageToImageMode, isPuterFluxImageToImageMode, isHuggingFaceKontextImageToImageMode, isLocalRetouchImageToImageMode, createLocalPreviewFallback } from './services/geminiService';
import { 
  Loader2, Sparkles, ArrowLeft, AlertTriangle, X, ChevronRight, 
  RotateCcw, CheckCircle2, Maximize2, User, Info,
  Baby, GraduationCap, Briefcase, Glasses, Users
} from 'lucide-react';

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
  const freeImageApiMode = isFreeImageApiMode();
  const imageToImageMode = isImageToImageMode();
  const puterFluxMode = isPuterFluxImageToImageMode();
  const hfKontextMode = isHuggingFaceKontextImageToImageMode();
  const localRetouchMode = isLocalRetouchImageToImageMode();
  const maxSelectableStyles = freeImageApiMode || imageToImageMode ? 1 : 4;
  const headerBadge = imageToImageMode ? 'Image-to-image gratuit' : freeImageApiMode ? 'API gratuite' : isDemoMode() ? 'Demo gratuit' : 'AI Powered';
  const showOriginalPreview = !!userImage && state !== AppState.IDLE && state !== AppState.RESULTS;
  const originalPreviewStatus = state === AppState.CONSULTATION
    ? 'Photo chargee'
    : state === AppState.ANALYZING
      ? 'Analyse en cours'
      : state === AppState.GENERATING
        ? 'Image source'
        : 'Reference active';

  const performInitialExpertise = async () => {
    if (!userImage) return;
    setError(null);
    try {
      setState(AppState.ANALYZING);
      setLoadingStep("Expertise de votre morphologie faciale...");
      const result = await analyzeMorphology(userImage, consultation);
      setAnalysis(result);
      setSelectedStyles([]);
      setState(AppState.SELECTION);
      
      loadThumbnails(result);
    } catch (err: any) {
      setError("Le service d'analyse est saturé. Veuillez patienter.");
      setState(AppState.IDLE);
    }
  };

  const loadThumbnails = async (res: AnalysisResult) => {
    for (const style of res.recommendedStyles) {
      setAnalysis(prev => prev ? {
        ...prev,
        recommendedStyles: prev.recommendedStyles.map(s => s.id === style.id ? { ...s, isPreviewLoading: true } : s)
      } : prev);

      try {
        const url = await generateQuickPreview(style, consultation.gender, consultation.ageGroup, userImage || undefined);
        setAnalysis(prev => prev ? {
          ...prev,
          recommendedStyles: prev.recommendedStyles.map(s => s.id === style.id ? { ...s, previewUrl: url, isPreviewLoading: false } : s)
        } : prev);
      } catch (e) {
        setAnalysis(prev => prev ? {
          ...prev,
          recommendedStyles: prev.recommendedStyles.map(s => s.id === style.id ? { ...s, isPreviewLoading: false } : s)
        } : prev);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  };

  const toggleStyleSelection = (styleId: string) => {
    setSelectedStyles(prev => {
      if (prev.includes(styleId)) return prev.filter(id => id !== styleId);
      if (prev.length >= maxSelectableStyles) return prev;
      return [...prev, styleId];
    });
  };

  const generateSelectedLooks = async () => {
    if (!analysis || !userImage) return;
    setState(AppState.GENERATING);
    const chosenStyles = analysis.recommendedStyles.filter(s => selectedStyles.includes(s.id));
    const newProposals: Proposal[] = [];

    try {
      for (let i = 0; i < chosenStyles.length; i++) {
        const style = chosenStyles[i];
        setLoadingStep(hfKontextMode ? `Image-to-image modifie vraiment la coupe : ${style.name}...` : localRetouchMode ? `Retouche locale sur votre photo : ${style.name}...` : imageToImageMode ? `Retouche image-to-image : ${style.name}...` : freeImageApiMode ? `Generation API gratuite : ${style.name}...` : `Transformation en cours : ${style.name}...`);
        try {
          const imageUrl = await generateHairstyleImage(userImage, style, consultation.gender, 'front', consultation.ageGroup);
          newProposals.push({
            id: style.id,
            imageUrl,
            styleName: style.name,
            description: style.description,
            whyItWorks: style.whyItWorks,
            color: style.color,
            beardStyle: style.beardStyle
          });
          if (i < chosenStyles.length - 1) await new Promise(r => setTimeout(r, 800));
        } catch (innerErr) {
          console.error(`Echec pour ${style.name}`, innerErr);
          if (imageToImageMode) {
            throw new Error(innerErr instanceof Error ? innerErr.message : "La retouche image-to-image n'a pas abouti.");
          }
        }
      }
      
      if (newProposals.length === 0) throw new Error("Génération impossible sur cette photo.");
      
      setProposals(newProposals);
      setState(AppState.RESULTS);
    } catch (err: any) {
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
        <div className="text-sm font-black text-gray-950 leading-tight mt-1">Portrait original</div>
        <div className="text-[11px] text-gray-500 leading-snug mt-1">Reference gardee pendant tout le processus.</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFCFB]">
      <Header badgeLabel={headerBadge} />
      {showOriginalPreview && (
        <div className="hidden lg:block fixed left-6 top-24 z-30 w-64 animate-in fade-in slide-in-from-left-3 duration-300">
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
          <div className="max-w-4xl mx-auto text-center py-12 animate-in fade-in duration-1000">
            <h1 className="serif text-6xl font-bold text-gray-900 mb-6">Expertise <span className="text-rose-600 italic">Visagiste</span></h1>
            <p className="text-lg text-gray-500 mb-12 max-w-xl mx-auto">Importez votre photo pour une analyse morphologique et des essais capillaires ultra-réalistes.</p>
            <ImageUploader onImageSelect={(img) => { setUserImage(img); setState(AppState.CONSULTATION); }} />
          </div>
        )}

        {state === AppState.CONSULTATION && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <button onClick={() => setState(AppState.IDLE)} className="mb-8 flex items-center gap-2 text-gray-400 hover:text-black transition-colors font-medium">
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>
            <h2 className="serif text-4xl font-bold mb-12 text-center">Votre Profil de Consultation</h2>
            
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                    <User className="w-3 h-3 text-rose-500" /> Genre
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:'male', label:'Masculin'}, {id:'female', label:'Féminin'}, {id:'non-binary', label:'Autre'}].map(g => (
                      <button key={g.id} onClick={() => setConsultation({...consultation, gender: g.id as any})} className={`py-3 rounded-xl border-2 text-[11px] font-bold transition-all ${consultation.gender === g.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                    <Users className="w-3 h-3 text-rose-500" /> Tranche d'âge
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ageGroups.map(a => (
                      <button key={a.id} onClick={() => setConsultation({...consultation, ageGroup: a.id as any})} className={`py-2 px-1 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 min-h-[80px] ${consultation.ageGroup === a.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-50 text-gray-400 hover:border-gray-200'}`}>
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
                Lancer l'Expertise AI <Sparkles className="w-5 h-5 text-rose-400" />
              </button>
            </div>
          </div>
        )}

        {state === AppState.SELECTION && analysis && (
          <div className="animate-in fade-in duration-700 pb-16 sm:pb-36">
            <div className="text-center mb-16">
              <h2 className="serif text-5xl font-bold mb-4">Recommandations Visagiste</h2>
              <div className="bg-rose-50/50 p-6 rounded-3xl border border-rose-100 inline-block max-w-2xl italic text-rose-900 shadow-sm leading-relaxed">
                "{analysis.professionalAdvice}"
              </div>
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
                  {hfKontextMode ? 'Modifier la coupe' : localRetouchMode ? 'Retoucher localement' : imageToImageMode ? 'Retoucher ma photo' : freeImageApiMode ? 'Generer la coupe' : 'Générer sur ma photo'} <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {(state === AppState.ANALYZING || state === AppState.GENERATING) && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
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
                  <button onClick={() => setState(AppState.IDLE)} className="w-full bg-black text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-md">
                    <RotateCcw className="w-4 h-4 text-rose-400" /> Nouvel Essai
                  </button>
                </div>
              </aside>

              <div className="lg:col-span-3">
                <div className="mb-12">
                  <h2 className="serif text-5xl font-bold mb-2">{hfKontextMode ? "Coupe modifiee par image-to-image" : localRetouchMode ? "Photo retouchee localement" : imageToImageMode ? "Photo transformee par image-to-image" : freeImageApiMode ? "Image Generee par API Gratuite" : "Simulations Haute Fidélité"}</h2>
                  <p className="text-gray-400 font-light italic text-lg">
                    {hfKontextMode ? "La photo chargee est envoyee en image-to-image avec une consigne stricte: garder la personne et modifier uniquement la coupe." : localRetouchMode ? "La photo chargee reste l'entree principale. La coupe choisie est simulee dans le navigateur, sans Google, sans Puter et sans appel payant." : puterFluxMode ? "La photo chargee sert d'entree a FLUX Kontext via Puter. Aucune API Google n'est utilisee." : imageToImageMode ? "La photo chargee sert d'entree au modele. Seule la coupe choisie doit etre modifiee." : freeImageApiMode ? "La coupe choisie est generee par API gratuite. Le portrait original reste votre reference." : "Seuls les cheveux et la barbe ont été adaptés. Le décor original est préservé."}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-24">
                  {proposals.map((p) => (
                    <div key={p.id} className="group animate-in fade-in slide-in-from-bottom-8 duration-700">
                      <div 
                        onClick={() => setZoomImage(p.imageUrl)}
                        className="relative aspect-[4/5] rounded-[2.5rem] overflow-hidden shadow-2xl mb-8 bg-gray-100 border border-gray-50 cursor-pointer"
                      >
                        <img
                          src={p.imageUrl}
                          className="w-full h-full object-cover transition-transform duration-[4s] group-hover:scale-105"
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
                        <div className="grid grid-cols-3 gap-4 mb-8 animate-in slide-in-from-top-4 duration-500">
                          {Object.entries(p.additionalViews).map(([k, url]) => (
                            <div key={k} className="relative aspect-square rounded-2xl overflow-hidden shadow-lg border border-gray-100 group/angle cursor-pointer" onClick={(e) => { e.stopPropagation(); setZoomImage(url); }}>
                              <img
                                src={url}
                                className="w-full h-full object-cover transition-transform group-hover/angle:scale-110"
                                alt={k}
                                onError={(event) => {
                                  event.currentTarget.onerror = null;
                                  event.currentTarget.src = createLocalPreviewFallback(p);
                                }}
                              />
                              <div className="absolute bottom-2 right-2 bg-black/40 px-2 py-0.5 rounded text-[7px] font-black text-white uppercase tracking-tighter opacity-70">{k === 'back' ? 'Dos' : k === 'left' ? 'G' : 'D'}</div>
                            </div>
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
                      
                      {!freeImageApiMode && !hfKontextMode && !p.additionalViews && (
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
          <button onClick={() => setZoomImage(null)} className="absolute top-8 right-8 text-white/50 hover:text-white p-4 transition-colors"><X className="w-10 h-10" /></button>
          <img src={zoomImage} className="max-w-full max-h-[90vh] rounded-3xl object-contain shadow-2xl animate-in zoom-in-95 duration-300" alt="Zoom" />
        </div>
      )}
    </div>
  );
};

export default App;
