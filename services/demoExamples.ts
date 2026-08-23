import { ConsultationData } from "../types";

export type DemoExampleStatus = "complete" | "partial" | "planned";

export interface DemoExample {
  id: string;
  assetId: string;
  name: string;
  profile: string;
  role: string;
  faceShape: string;
  hairTexture: string;
  skinTone: string;
  consultation: ConsultationData;
  sourceImage: string;
  status: DemoExampleStatus;
  databaseSummary: string;
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: "sofia-ovale-adulte",
    assetId: "sofia",
    name: "Sofia",
    profile: "Femme adulte, visage ovale allonge, base complete",
    role: "Profil 1 valide en base image",
    faceShape: "visage ovale allonge",
    hairTexture: "Cheveu brun moyen, base tiree en arriere",
    skinTone: "Sous-ton neutre chaud",
    consultation: {
      gender: "female",
      ageGroup: "adult",
      maintenance: "medium",
      lifestyle: "modern",
      targetLength: "medium"
    },
    sourceImage: "/demo-profiles/sofia/source.png",
    status: "complete",
    databaseSummary: "36 planches, 144 miniatures et 144 resultats finaux"
  },
  {
    id: "lya-enfant",
    assetId: "lya",
    name: "Ilia",
    profile: "Petite fille enveloppee, cheveux non coiffes",
    role: "Profil enfant valide en base image complete",
    faceShape: "visage rond enveloppe",
    hairTexture: "Cheveu long non coiffe, pas coupe depuis 2 mois",
    skinTone: "Sous-ton clair neutre",
    consultation: {
      gender: "female",
      ageGroup: "child",
      maintenance: "low",
      lifestyle: "modern",
      targetLength: "medium"
    },
    sourceImage: "/demo-profiles/lya/source.png?v=home-profile-v2",
    status: "complete",
    databaseSummary: "36 planches, 144 miniatures, 144 resultats finaux et 576 vues finales"
  },
  {
    id: "elena-senior",
    assetId: "elena",
    name: "Elena",
    profile: "Femme maigre de 80 ans, cheveux boucles delaves",
    role: "Profil senior valide en base image complete",
    faceShape: "visage ovale tres mature",
    hairTexture: "Cheveu gris blanc boucle, sec et non rafraichi",
    skinTone: "Sous-ton clair chaud",
    consultation: {
      gender: "female",
      ageGroup: "mature",
      maintenance: "medium",
      lifestyle: "classic",
      targetLength: "short"
    },
    sourceImage: "/demo-profiles/elena/source.png?v=home-profile-v2",
    status: "complete",
    databaseSummary: "36 planches, 144 miniatures, 144 resultats finaux et 576 vues finales"
  },
  {
    id: "marc-adulte",
    assetId: "marc",
    name: "Mark",
    profile: "Homme age mur, grosse calvitie, barbe longue mal taillee",
    role: "Profil homme mur valide en base image complete",
    faceShape: "visage mature avec calvitie marquee",
    hairTexture: "Cheveu clairseme, barbe longue mal coupee, poils nez/sourcils non tailles",
    skinTone: "Sous-ton neutre",
    consultation: {
      gender: "male",
      ageGroup: "mature",
      maintenance: "low",
      lifestyle: "classic",
      targetLength: "short"
    },
    sourceImage: "/demo-profiles/marc/source.png?v=home-profile-v2",
    status: "complete",
    databaseSummary: "36 planches, 144 miniatures, 144 resultats finaux et 576 vues finales"
  },
  {
    id: "sam-enfant",
    assetId: "sam",
    name: "Sam",
    profile: "Garcon de 5 ans, cheveux pas coiffes et mal coupes",
    role: "Profil enfant valide en base image complete",
    faceShape: "visage enfant rond",
    hairTexture: "Cheveu epais ondule, pas coiffe, mal coupe depuis 5 mois",
    skinTone: "Sous-ton olive clair",
    consultation: {
      gender: "male",
      ageGroup: "child",
      maintenance: "low",
      lifestyle: "classic",
      targetLength: "short"
    },
    sourceImage: "/demo-profiles/sam/source.png?v=home-profile-v2",
    status: "complete",
    databaseSummary: "36 planches, 144 miniatures, 144 resultats finaux et 576 vues finales"
  }
];
