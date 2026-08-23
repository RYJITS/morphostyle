import { ConsultationData, StyleRecommendation } from "../types";
import { DemoExample } from "./demoExamples";

const lengthLabels: Record<ConsultationData["targetLength"], string> = {
  short: "Court",
  medium: "Mi-long",
  long: "Long",
  any: "Libre"
};

const lifestyleLabels: Record<ConsultationData["lifestyle"], string> = {
  classic: "classique",
  modern: "moderne",
  bold: "signature"
};

const maintenanceLabels: Record<ConsultationData["maintenance"], string> = {
  low: "entretien rapide",
  medium: "entretien modere",
  high: "rituel soigne"
};

const lifestyleColors: Record<ConsultationData["lifestyle"], string> = {
  classic: "Brun naturel",
  modern: "Brun lumineux",
  bold: "Reflets acajou"
};

const profileLifestyleColors: Record<string, Partial<Record<ConsultationData["lifestyle"], string>>> = {
  elena: {
    classic: "Gris argent naturel",
    modern: "Blanc lumineux",
    bold: "Argent perle"
  },
  marc: {
    classic: "Poivre et sel",
    modern: "Cendre naturel",
    bold: "Sel sombre"
  },
  sam: {
    classic: "Brun enfant naturel",
    modern: "Brun doux",
    bold: "Brun texture"
  }
};

const variants = ["primary", "soft", "structured", "signature"] as const;
type PreparedCoverage = "all" | readonly string[];

const preparedCombinationCoverage: Record<string, PreparedCoverage> = {
  sofia: "all",
  lya: "all",
  elena: "all",
  marc: "all",
  sam: "all"
};

const selectionKey = (data: ConsultationData) =>
  `${data.targetLength}-${data.maintenance}-${data.lifestyle}`;

export const hasPreparedLookDatabase = (example: DemoExample | null | undefined) =>
  !!example && preparedCombinationCoverage[example.assetId] !== undefined;

export const hasPreparedCombination = (
  example: DemoExample | null | undefined,
  data: ConsultationData
) => {
  if (!example) return false;
  const coverage = preparedCombinationCoverage[example.assetId];
  if (!coverage) return false;
  return coverage === "all" || coverage.includes(selectionKey(data));
};

const lookUrl = (
  assetId: string,
  length: ConsultationData["targetLength"],
  maintenance: ConsultationData["maintenance"],
  lifestyle: ConsultationData["lifestyle"],
  variant: typeof variants[number]
) => `/demo-profiles/${assetId}/looks/${length}-${maintenance}-${lifestyle}-${variant}.jpg`;

const recommendationPreviewUrl = (
  assetId: string,
  length: ConsultationData["targetLength"],
  maintenance: ConsultationData["maintenance"],
  lifestyle: ConsultationData["lifestyle"],
  variant: typeof variants[number]
) => `/demo-profiles/${assetId}/recommendation-previews/${length}-${maintenance}-${lifestyle}-${variant}.webp?v=morphology-20`;

const finalViewUrl = (
  assetId: string,
  length: ConsultationData["targetLength"],
  maintenance: ConsultationData["maintenance"],
  lifestyle: ConsultationData["lifestyle"],
  variant: typeof variants[number],
  view: "front" | "left" | "right" | "back"
) => `/demo-profiles/${assetId}/final-views/${length}-${maintenance}-${lifestyle}-${variant}-${view}.webp?v=morphology-views-5`;

const combinationBoardUrl = (
  assetId: string,
  length: ConsultationData["targetLength"],
  maintenance: ConsultationData["maintenance"],
  lifestyle: ConsultationData["lifestyle"]
) => `/demo-profiles/${assetId}/combination-boards/${length}-${maintenance}-${lifestyle}.png?v=morphology-19`;

const hasPreparedFinalBoard = (
  example: DemoExample,
  data: ConsultationData
) => hasPreparedCombination(example, data);

const variantLabels: Record<ConsultationData["targetLength"], Record<typeof variants[number], string>> = {
  short: {
    primary: "Bob arrondi",
    soft: "Bixie doux",
    structured: "Frange rideau",
    signature: "Bob-crop texture"
  },
  medium: {
    primary: "Lob arrondi",
    soft: "Shag doux",
    structured: "Frange rideau mi-long",
    signature: "Degrade lateral"
  },
  long: {
    primary: "Long degrade doux",
    soft: "Rideau equilibrant",
    structured: "Ondulations laterales",
    signature: "Long texture bas"
  },
  any: {
    primary: "Equilibre morphologie",
    soft: "Souple encadrant",
    structured: "Rideau structure",
    signature: "Signature laterale"
  }
};

const variantDescriptions: Record<ConsultationData["targetLength"], Record<typeof variants[number], string>> = {
  short: {
    primary: "arrondi a la machoire pour apporter une largeur douce",
    soft: "bixie souple avec meche laterale et volume bas",
    structured: "bob court avec frange rideau legere",
    signature: "bob-crop texture aux pommettes, nuque nette"
  },
  medium: {
    primary: "lob sous la machoire pour equilibrer la longueur du visage",
    soft: "texture souple sans hauteur au sommet",
    structured: "frange rideau legere pour raccourcir visuellement le front",
    signature: "degrade lateral pour ramener du mouvement horizontal"
  },
  long: {
    primary: "longueur degradee sans effet vertical trop raide",
    soft: "rideau souple qui encadre et casse la verticalite",
    structured: "ondulations laterales basses autour des pommettes",
    signature: "texture basse et mouvement lateral, sans volume haut"
  },
  any: {
    primary: "longueur choisie pour equilibrer le visage allonge",
    soft: "volume lateral doux et entretien adapte",
    structured: "encadrement du visage sans hauteur excessive",
    signature: "mouvement lateral plus marque, toujours morphologique"
  }
};

const profileVariantLabels: Record<string, Partial<Record<ConsultationData["targetLength"], Record<typeof variants[number], string>>>> = {
  lya: {
    short: {
      primary: "Bob court enfant",
      soft: "Bixie rond doux",
      structured: "Bob court frange",
      signature: "Court texture naturel"
    },
    medium: {
      primary: "Lob simple enfant",
      soft: "Degrade cote souple",
      structured: "Bob rond frange douce",
      signature: "Shag mi-long naturel"
    },
    long: {
      primary: "Long cadre doux",
      soft: "Long degrade cote",
      structured: "Long frange legere",
      signature: "Long texture naturel"
    },
    any: {
      primary: "Libre lob doux",
      soft: "Libre bob court",
      structured: "Libre long frange",
      signature: "Libre texture longue"
    }
  },
  elena: {
    short: {
      primary: "Crop boucle doux",
      soft: "Pixie-bob argent",
      structured: "Bob court frange",
      signature: "Court sculpte"
    },
    medium: {
      primary: "Lob boucle argent",
      soft: "Shag mi-long doux",
      structured: "Bob rond frange",
      signature: "Mi-long asymetrique"
    },
    long: {
      primary: "Long degrade doux",
      soft: "Long shag argent",
      structured: "Long frange douce",
      signature: "Long mouvement cote"
    },
    any: {
      primary: "Libre mi-long",
      soft: "Libre court argent",
      structured: "Libre long frange",
      signature: "Libre epaule texture"
    }
  },
  marc: {
    short: {
      primary: "Buzz classique barbe nette",
      soft: "Couronne gardee naturelle",
      structured: "Fondu court barbe carree",
      signature: "Court senior texture"
    },
    medium: {
      primary: "Mi-court barbe nette",
      soft: "Couronne adoucie",
      structured: "Contour barbe structure",
      signature: "Texture mature moderne"
    },
    long: {
      primary: "Couronne longue controlee",
      soft: "Barbe allongee adoucie",
      structured: "Long barbe cadree",
      signature: "Signature barbe forte"
    },
    any: {
      primary: "Libre barbe nette",
      soft: "Libre court sobre",
      structured: "Libre contour precis",
      signature: "Libre texture mature"
    }
  },
  sam: {
    short: {
      primary: "Court enfant classique",
      soft: "Court rond naturel",
      structured: "Court ecole net",
      signature: "Court texture joueur"
    },
    medium: {
      primary: "Mi-court enfant",
      soft: "Mop top doux",
      structured: "Coupe bol legere",
      signature: "Texture mi-longue"
    },
    long: {
      primary: "Long enfant cadre",
      soft: "Long souple naturel",
      structured: "Long frange douce",
      signature: "Long texture enfant"
    },
    any: {
      primary: "Libre court enfant",
      soft: "Libre mi-court doux",
      structured: "Libre frange nette",
      signature: "Libre texture joueur"
    }
  }
};

const profileVariantDescriptions: Record<string, Partial<Record<ConsultationData["targetLength"], Record<typeof variants[number], string>>>> = {
  lya: {
    short: {
      primary: "bob court arrondi, adapte aux joues et facile a replacer",
      soft: "bixie doux avec volume bas, sans effet adulte",
      structured: "bob court avec frange legere pour cadrer le visage rond",
      signature: "court texture naturel, enfantin et facile a vivre"
    },
    medium: {
      primary: "lob epaule simple, naturel et rapide a replacer",
      soft: "degrade mi-long a raie de cote avec mouvement leger",
      structured: "bob rond sous le menton avec frange douce pour cadrer les joues",
      signature: "shag mi-long naturel, texture souple sans coiffage complique"
    },
    long: {
      primary: "longueur douce avec cadre lateral pour ne pas alourdir les joues",
      soft: "degrade cote enfantin, garde la longueur sans effet masse",
      structured: "long avec frange legere pour raccourcir visuellement le visage",
      signature: "long texture naturel avec mouvement bas et entretien adapte"
    },
    any: {
      primary: "option libre equilibree autour du visage rond",
      soft: "option courte douce pour alleger la masse",
      structured: "option longue avec frange, tres distincte de la coupe courte",
      signature: "option texture longue avec mouvement naturel"
    }
  },
  elena: {
    short: {
      primary: "crop boucle qui adoucit le visage fin sans masquer la maturite",
      soft: "pixie-bob argent avec volume lateral et nuque legere",
      structured: "bob court avec frange douce pour encadrer le front",
      signature: "court sculpte, texture argent et nuque nette"
    },
    medium: {
      primary: "lob boucle au cou pour redonner du volume lateral",
      soft: "shag mi-long souple qui garde la boucle naturelle",
      structured: "bob rond avec frange douce pour adoucir les traits fins",
      signature: "mi-long asymetrique avec mouvement sur le cote"
    },
    long: {
      primary: "long degrade doux sans tirer le visage vers le bas",
      soft: "long shag argent avec mouvement naturel et volume lateral",
      structured: "long avec frange douce pour equilibrer le front",
      signature: "long mouvement cote, texture argent controlee"
    },
    any: {
      primary: "option mi-longue equilibree pour visage ovale tres mature",
      soft: "option courte argent pour alleger la nuque",
      structured: "option longue avec frange douce, tres distincte du court",
      signature: "option epaule texturee avec mouvement lateral"
    }
  },
  marc: {
    short: {
      primary: "court sobre qui assume la calvitie sans chercher a recréer une masse artificielle",
      soft: "contour naturel avec barbe raccourcie pour adoucir les traits fatigues",
      structured: "fondu court plus net avec barbe dessinee pour clarifier la ligne du visage",
      signature: "texture courte plus marquee, toujours credible avec la couronne clairsemee"
    },
    medium: {
      primary: "mi-court sobre avec barbe tenue pour garder une ligne mature credible",
      soft: "couronne plus douce et barbe raccourcie sans masquer la calvitie",
      structured: "contour plus precis autour de la barbe et des tempes",
      signature: "texture mature plus marquee, barbe presente mais controlee"
    },
    long: {
      primary: "longueur gardee sur barbe et couronne, mais mieux equilibree",
      soft: "barbe plus allongee et adoucie pour ne pas durcir le bas du visage",
      structured: "barbe cadree avec lignes plus propres autour du visage",
      signature: "signature plus forte avec barbe assumee et volume controle"
    },
    any: {
      primary: "option libre qui clarifie la barbe sans nier la calvitie",
      soft: "option sobre, facile a maintenir et plus douce au visage",
      structured: "option plus precise sur les contours et la moustache",
      signature: "option texture mature avec presence visuelle plus forte"
    }
  },
  sam: {
    short: {
      primary: "court classique enfant, facile a replacer et adapte au visage rond",
      soft: "forme courte plus ronde qui garde un effet naturel sans durcir les traits",
      structured: "coupe ecole nette avec contour propre, differente du court rond",
      signature: "texture courte plus vivante, enfantine et simple a entretenir"
    },
    medium: {
      primary: "mi-court enfantin qui degage le regard sans effet adulte",
      soft: "volume doux sur le dessus avec contour souple autour des joues",
      structured: "forme plus nette avec frange legere et nuque propre",
      signature: "texture mi-longue joueuse qui reste simple a recoiffer"
    },
    long: {
      primary: "longueur enfant cadrante, gardee naturelle autour du visage rond",
      soft: "long souple et doux pour conserver un cote enfantin",
      structured: "long avec frange douce pour organiser la masse sans durcir",
      signature: "long texture naturel, vivant mais sans coiffage adulte"
    },
    any: {
      primary: "option libre courte et sure pour le quotidien",
      soft: "option libre mi-courte avec volume doux",
      structured: "option libre avec frange nette et contour propre",
      signature: "option libre texturee, enfantine et facile a vivre"
    }
  }
};

const profileBeardStyles: Record<string, Partial<Record<typeof variants[number], string>>> = {
  marc: {
    primary: "Barbe raccourcie naturelle",
    soft: "Barbe adoucie, joues nettoyees",
    structured: "Barbe carree et moustache nette",
    signature: "Barbe texturee controlee"
  }
};

const getWhyItWorks = (
  example: DemoExample,
  data: ConsultationData
) => {
  const lengthLabel = lengthLabels[data.targetLength].toLowerCase();
  const lifestyleLabel = lifestyleLabels[data.lifestyle];
  const maintenanceLabel = maintenanceLabels[data.maintenance];

  if (example.assetId === "marc") {
    return `Adapte au ${example.faceShape}: assume la calvitie marquee, clarifie la barbe et garde une ligne masculine credible avec ${maintenanceLabel}, ${lengthLabel}, style ${lifestyleLabel}.`;
  }

  if (example.assetId === "sam") {
    return `Adapte au ${example.faceShape}: degage le regard, garde un volume enfantin et reste facile a vivre avec ${maintenanceLabel}, ${lengthLabel}, style ${lifestyleLabel}.`;
  }

  return `Adapte au ${example.faceShape}: ajoute un cadre doux, evite d'elargir les joues et respecte ${maintenanceLabel}, ${lengthLabel}, style ${lifestyleLabel}.`;
};

const getVariantLabel = (
  example: DemoExample,
  length: ConsultationData["targetLength"],
  variant: typeof variants[number]
) => profileVariantLabels[example.assetId]?.[length]?.[variant] || variantLabels[length][variant];

const getVariantDescription = (
  example: DemoExample,
  length: ConsultationData["targetLength"],
  variant: typeof variants[number]
) => profileVariantDescriptions[example.assetId]?.[length]?.[variant] || variantDescriptions[length][variant];

const getLifestyleColor = (
  example: DemoExample,
  lifestyle: ConsultationData["lifestyle"]
) => profileLifestyleColors[example.assetId]?.[lifestyle] || lifestyleColors[lifestyle];

const getBeardStyle = (
  example: DemoExample,
  variant: typeof variants[number]
) => profileBeardStyles[example.assetId]?.[variant] || "Aucune";

export const getPreparedCombinationBoardUrl = (
  example: DemoExample | null | undefined,
  data: ConsultationData
) => {
  if (!example || !hasPreparedCombination(example, data)) return null;
  if (!hasPreparedFinalBoard(example, data)) return null;
  return combinationBoardUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle);
};

export const getPreparedProfileStyles = (
  example: DemoExample,
  data: ConsultationData
): StyleRecommendation[] => {
  if (!hasPreparedCombination(example, data)) return [];

  return variants.map((variant) => {
    const imageUrl = lookUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle, variant);
    const previewUrl = hasPreparedFinalBoard(example, data)
      ? recommendationPreviewUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle, variant)
      : imageUrl;
    const resultImageUrl = hasPreparedFinalBoard(example, data)
      ? finalViewUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle, variant, "front")
      : imageUrl;
    const additionalViews = hasPreparedFinalBoard(example, data)
      ? {
        left: finalViewUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle, variant, "left"),
        right: finalViewUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle, variant, "right"),
        back: finalViewUrl(example.assetId, data.targetLength, data.maintenance, data.lifestyle, variant, "back")
      }
      : undefined;
    const lengthLabel = lengthLabels[data.targetLength];
    const lifestyleLabel = lifestyleLabels[data.lifestyle];
    const variantLabel = getVariantLabel(example, data.targetLength, variant);
    const variantDescription = getVariantDescription(example, data.targetLength, variant);
    const name = `${lengthLabel} ${lifestyleLabel} ${variantLabel}`;

    return {
      id: `prepared-${example.assetId}-${data.targetLength}-${data.maintenance}-${data.lifestyle}-${variant}`,
      name,
      description: `Look ${lengthLabel.toLowerCase()} en univers ${lifestyleLabel}, ${variantDescription}, calibre pour ${maintenanceLabels[data.maintenance]}.`,
      color: getLifestyleColor(example, data.lifestyle),
      beardStyle: getBeardStyle(example, variant),
      whyItWorks: getWhyItWorks(example, data),
      faceShape: example.faceShape,
      previewUrl,
      resultImageUrl,
      additionalViews,
      isPreparedAsset: true
    };
  });
};
