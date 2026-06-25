
export interface ConsultationData {
  maintenance: 'low' | 'medium' | 'high';
  lifestyle: 'classic' | 'modern' | 'bold';
  targetLength: 'short' | 'medium' | 'long' | 'any';
  gender: 'male' | 'female' | 'non-binary';
  ageGroup: 'baby' | 'child' | 'teen' | 'adult' | 'mature';
}

export interface SearchSource {
  uri: string;
  title: string;
}

export interface AdditionalViews {
  left: string;
  right: string;
  back: string;
}

export interface HairstyleRecipe {
  family: string;
  length: ConsultationData['targetLength'];
  maintenance: ConsultationData['maintenance'];
  lifestyle: ConsultationData['lifestyle'];
  faceShape: string;
  volume: 'low' | 'medium' | 'high';
  sides: 'tight' | 'natural' | 'layered';
  fringe: 'none' | 'short' | 'curtain' | 'side';
  texture: 'clean' | 'textured' | 'wavy' | 'soft' | 'sleek';
  color: string;
  beard: string;
  gender: ConsultationData['gender'];
  ageGroup: ConsultationData['ageGroup'];
  objective: string;
}

export interface StyleRecommendation {
  id: string;
  name: string;
  description: string;
  color: string;
  beardStyle: string;
  whyItWorks: string;
  recipe?: HairstyleRecipe;
  referenceCacheKey?: string;
  selected?: boolean;
  previewUrl?: string;
  isPreviewLoading?: boolean;
}

export interface AnalysisResult {
  faceShape: string;
  hairTexture: string;
  skinTone: string;
  professionalAdvice: string;
  detectedGender: 'male' | 'female' | 'non-binary';
  recommendedStyles: StyleRecommendation[];
}

export interface Proposal {
  id: string;
  imageUrl: string;
  styleName: string;
  description: string;
  whyItWorks: string;
  color: string;
  beardStyle: string;
  additionalViews?: AdditionalViews;
  isGeneratingAngles?: boolean;
}

export enum AppState {
  IDLE = 'IDLE',
  CONSULTATION = 'CONSULTATION',
  ANALYZING = 'ANALYZING',
  SELECTION = 'SELECTION',
  GENERATING = 'GENERATING',
  RESULTS = 'RESULTS'
}
