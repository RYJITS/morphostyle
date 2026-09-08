
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
  assetPreviewUrl?: string;
  resultImageUrl?: string;
  additionalViews?: AdditionalViews;
  isPreparedAsset?: boolean;
  isPreviewLoading?: boolean;
  sourceProvider?: 'openai-upload' | 'alibaba-upload' | 'static-demo';
  generationSessionId?: string;
  sourceAssetUrl?: string;
  selectedReferenceAssetUrl?: string;
}

export interface AnalysisResult {
  faceShape: string;
  hairTexture: string;
  skinTone: string;
  professionalAdvice: string;
  detectedGender: 'male' | 'female' | 'non-binary';
  recommendedStyles: StyleRecommendation[];
  generationSessionId?: string;
  historyItem?: PublicGeneration;
  quota?: {
    baseLimit?: number;
    bonus?: number;
    limit: number;
    used: number;
    remaining: number;
    resetLabel: string;
  };
}

export type BackgroundTreatment = 'gray' | 'original';

export interface Proposal {
  id: string;
  imageUrl: string;
  styleName: string;
  description: string;
  whyItWorks: string;
  color: string;
  beardStyle: string;
  additionalViews?: AdditionalViews;
  assetImageUrl?: string;
  assetAdditionalViews?: AdditionalViews;
  historyItem?: PublicGeneration;
  backgroundTreatment?: BackgroundTreatment;
  isGeneratingAngles?: boolean;
  isPreparedAsset?: boolean;
}

export interface PublicGeneration {
  id: string;
  personalGenerationId?: string;
  imageUrl: string;
  styleName: string;
  color: string;
  faceShape: string;
  sourceLabel: string;
  createdAt: string;
  additionalViews?: AdditionalViews;
  backgroundTreatment?: BackgroundTreatment;
  publicImageUrl?: string;
  publicAdditionalViews?: AdditionalViews;
  consultation?: Partial<ConsultationData>;
  publicGenerationId?: string;
  originalImageUrl?: string;
  selectedProposalKey?: string;
  selectedProposalAssetUrl?: string;
  recommendationSessionId?: string;
  parentGenerationId?: string;
  generatedFinalIds?: string[];
  status?: string;
  recommendations?: Array<{
    id?: string;
    styleName?: string;
    name?: string;
    previewUrl?: string;
    assetPreviewUrl?: string;
    imageUrl?: string;
    color?: string;
    whyItWorks?: string;
    description?: string;
    beardStyle?: string;
  }>;
}

export enum AppState {
  IDLE = 'IDLE',
  CONSULTATION = 'CONSULTATION',
  ANALYZING = 'ANALYZING',
  SELECTION = 'SELECTION',
  GENERATING = 'GENERATING',
  RESULTS = 'RESULTS'
}
