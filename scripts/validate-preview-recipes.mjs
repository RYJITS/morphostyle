import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const defaultApi = process.env.MORPHOSTYLE_API || "http://127.0.0.1:8787";
const outputRoot = path.join(rootDir, "output", "recipe-validation");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  const key = value.slice(2);
  const next = process.argv[index + 1];
  if (!next || next.startsWith("--")) {
    args.set(key, true);
  } else {
    args.set(key, next);
    index += 1;
  }
}

const apiBase = String(args.get("api") || defaultApi).replace(/\/$/, "");
const selectedFamilies = String(args.get("families") || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const runId = String(args.get("run") || new Date().toISOString().replace(/[:.]/g, "-"));
const runDir = path.join(outputRoot, runId);

const faceGoals = {
  "visage rond": "allonger visuellement le visage sans ajouter de largeur aux joues",
  "visage allonge": "eviter d'allonger davantage et ramener l'equilibre vers les yeux",
  "visage carre": "adoucir les angles tout en gardant une structure lisible",
  "visage ovale": "respecter l'equilibre naturel et adapter le style demande"
};

const lengthLabels = {
  short: "longueur courte",
  medium: "longueur moyenne",
  long: "longueur longue",
  any: "longueur libre"
};

const maintenanceLabels = {
  low: "entretien rapide",
  medium: "entretien modere",
  high: "rituel de coiffage"
};

const lifestyleLabels = {
  classic: "style classique",
  modern: "style moderne",
  bold: "style audacieux"
};

const objectiveFor = (recipe) => {
  const faceGoal = faceGoals[recipe.faceShape] || faceGoals["visage ovale"];
  return `${faceGoal}; famille ${recipe.family}; ${lengthLabels[recipe.length]}, ${maintenanceLabels[recipe.maintenance]}, ${lifestyleLabels[recipe.lifestyle]}`;
};

const buildCase = ({
  family,
  key,
  name,
  description,
  expected,
  avoid,
  faceShape = "visage ovale",
  length = "medium",
  maintenance = "medium",
  lifestyle = "modern",
  gender = "male",
  ageGroup = "adult",
  color = "brun naturel",
  volume = "medium",
  sides = "natural",
  fringe = "none",
  texture = "textured",
  beard = gender === "male" ? "Rase de pres" : "Aucune"
}) => {
  const recipe = {
    family,
    length,
    maintenance,
    lifestyle,
    faceShape,
    volume,
    sides,
    fringe,
    texture,
    color,
    beard,
    gender,
    ageGroup
  };
  recipe.objective = objectiveFor(recipe);

  return {
    family,
    key,
    expected,
    avoid,
    payload: {
      gender,
      ageGroup,
      style: {
        id: `validation-${family}-${key}-${length}-${maintenance}-${lifestyle}`,
        name,
        description,
        color,
        faceShape,
        recipe
      }
    }
  };
};

const validationCases = [
  buildCase({
    family: "taper",
    key: "male-short-classic",
    name: "Taper net structure",
    description: "Cotes nets, nuque propre et texture controlee au sommet.",
    expected: ["cotes tres propres", "nuque nette", "dessus court texture"],
    avoid: ["cheveux longs", "frange lourde", "raie centrale"],
    faceShape: "visage rond",
    length: "short",
    maintenance: "low",
    lifestyle: "classic",
    gender: "male",
    color: "brun froid",
    volume: "medium",
    sides: "tight",
    texture: "clean"
  }),
  buildCase({
    family: "taper",
    key: "nonbinary-short-modern",
    name: "Texture moderne",
    description: "Volume controle sur le dessus, lignes propres et entretien simple.",
    expected: ["contours nets", "dessus controle", "coupe courte moderne"],
    avoid: ["longueur epaule", "bob", "cheveux flottants"],
    faceShape: "visage ovale",
    length: "short",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "non-binary",
    color: "brun lumineux",
    volume: "medium",
    sides: "tight"
  }),
  buildCase({
    family: "taper",
    key: "teen-short-bold",
    name: "Crop ado texture",
    description: "Court moderne, texture facile et finition naturelle.",
    expected: ["court", "texture facile", "look jeune moderne"],
    avoid: ["barbe mature", "cheveux longs", "forme feminine marquee"],
    faceShape: "visage carre",
    length: "short",
    maintenance: "medium",
    lifestyle: "bold",
    gender: "male",
    ageGroup: "teen",
    color: "brun naturel",
    volume: "medium",
    sides: "tight"
  }),

  buildCase({
    family: "crop",
    key: "male-short-textured",
    name: "Crop texture arrondi",
    description: "Texture douce au-dessus, angles moins marques aux tempes.",
    expected: ["crop compact", "frange courte visible", "tempes adoucies"],
    avoid: ["quiff haut", "long dos", "mi-long"],
    faceShape: "visage carre",
    length: "short",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "male",
    color: "brun lumineux",
    volume: "medium",
    sides: "tight",
    fringe: "short",
    texture: "textured"
  }),
  buildCase({
    family: "crop",
    key: "child-short-low",
    name: "Coupe courte souple",
    description: "Court pratique, contours doux et dessus facile a coiffer.",
    expected: ["court enfant", "contours doux", "dessus simple"],
    avoid: ["barbe", "style adulte agressif", "longueur epaule"],
    faceShape: "visage rond",
    length: "short",
    maintenance: "low",
    lifestyle: "classic",
    gender: "male",
    ageGroup: "child",
    color: "naturel doux",
    volume: "low",
    sides: "tight",
    texture: "clean"
  }),
  buildCase({
    family: "crop",
    key: "female-short-bold",
    name: "Court texture affirme",
    description: "Coupe courte compacte avec texture expressive.",
    expected: ["court compact", "texture expressive", "silhouette feminine ou androgyne"],
    avoid: ["cheveux longs", "bob rond", "quatre visages"],
    faceShape: "visage ovale",
    length: "short",
    maintenance: "high",
    lifestyle: "bold",
    gender: "female",
    color: "brun glace",
    volume: "medium",
    sides: "tight",
    fringe: "short"
  }),

  buildCase({
    family: "side_part",
    key: "male-medium-classic",
    name: "Raie laterale souple",
    description: "Mouvement asymetrique et longueurs legeres sur le dessus.",
    expected: ["raie diagonale laterale", "dessus peigne sur un cote", "cotes propres"],
    avoid: ["raie centrale", "rideau", "cheveux sous les epaules"],
    faceShape: "visage rond",
    length: "medium",
    maintenance: "low",
    lifestyle: "classic",
    gender: "male",
    color: "brun lumineux",
    volume: "medium",
    sides: "natural",
    fringe: "side",
    texture: "clean"
  }),
  buildCase({
    family: "side_part",
    key: "female-long-bold",
    name: "Balayage lateral",
    description: "Meche laterale fluide avec finition naturelle.",
    expected: ["meche laterale", "diagonale visible", "mouvement fluide"],
    avoid: ["frange droite", "raie centrale stricte", "crop court"],
    faceShape: "visage carre",
    length: "long",
    maintenance: "high",
    lifestyle: "bold",
    gender: "female",
    color: "reflets miel",
    volume: "medium",
    sides: "natural",
    fringe: "side",
    texture: "soft"
  }),
  buildCase({
    family: "side_part",
    key: "nonbinary-medium-modern",
    name: "Balayage lateral",
    description: "Meche laterale fluide avec finition naturelle.",
    expected: ["asymetrie", "ligne laterale", "finition moderne"],
    avoid: ["cheveux attaches", "bob symetrique", "pigtails"],
    faceShape: "visage ovale",
    length: "medium",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "non-binary",
    color: "chatain naturel",
    volume: "medium",
    sides: "natural",
    fringe: "side"
  }),

  buildCase({
    family: "curtain",
    key: "male-medium-modern",
    name: "Rideau long affine",
    description: "Meches rideau longues et effilees qui encadrent le visage.",
    expected: ["raie centrale", "deux rideaux frontaux", "meches connectees au cuir chevelu"],
    avoid: ["couettes", "paquets lateraux", "crop court"],
    faceShape: "visage rond",
    length: "medium",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "male",
    color: "reflets miel",
    volume: "medium",
    sides: "natural",
    fringe: "curtain",
    texture: "soft"
  }),
  buildCase({
    family: "curtain",
    key: "teen-medium-bold",
    name: "Rideau ado fluide",
    description: "Mi-long tendance avec mouvement leger autour du visage.",
    expected: ["rideau ado", "milieu visible", "mouvement leger"],
    avoid: ["barbe adulte", "cheveux en couettes", "slick back"],
    faceShape: "visage allonge",
    length: "medium",
    maintenance: "high",
    lifestyle: "bold",
    gender: "male",
    ageGroup: "teen",
    color: "reflets naturels",
    volume: "low",
    sides: "natural",
    fringe: "curtain",
    texture: "soft"
  }),
  buildCase({
    family: "curtain",
    key: "female-long-modern",
    name: "Rideau long affine",
    description: "Meches rideau longues et effilees qui encadrent le visage.",
    expected: ["raie centrale", "longues meches rideau", "encadrement du visage"],
    avoid: ["couettes", "frange droite courte", "crop masculin"],
    faceShape: "visage rond",
    length: "long",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "reflets miel",
    volume: "medium",
    sides: "layered",
    fringe: "curtain",
    texture: "soft"
  }),

  buildCase({
    family: "fringe",
    key: "male-short-classic",
    name: "Frange equilibree",
    description: "Frange douce et volume lateral pour raccourcir visuellement le front.",
    expected: ["frange courte douce", "front raccourci", "volume lateral modere"],
    avoid: ["front degage", "slicked back", "raie laterale seule"],
    faceShape: "visage allonge",
    length: "short",
    maintenance: "low",
    lifestyle: "classic",
    gender: "male",
    color: "chatain naturel",
    volume: "low",
    sides: "natural",
    fringe: "short",
    texture: "clean"
  }),
  buildCase({
    family: "fringe",
    key: "female-medium-modern",
    name: "Frange equilibree",
    description: "Frange douce et volume lateral pour raccourcir visuellement le front.",
    expected: ["bangs souples", "front partiellement couvert", "equilibre visage long"],
    avoid: ["front nu", "longueur raide sans frange", "side part dominant"],
    faceShape: "visage allonge",
    length: "medium",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "chatain naturel",
    volume: "low",
    sides: "natural",
    fringe: "short",
    texture: "soft"
  }),
  buildCase({
    family: "fringe",
    key: "nonbinary-medium-bold",
    name: "Frange graphique douce",
    description: "Frange visible avec texture creative et contour net.",
    expected: ["frange visible", "texture creative", "contour net"],
    avoid: ["raie centrale", "front completement degage", "cheveux longs plats"],
    faceShape: "visage carre",
    length: "medium",
    maintenance: "high",
    lifestyle: "bold",
    gender: "non-binary",
    color: "brun froid",
    volume: "medium",
    sides: "natural",
    fringe: "short",
    texture: "textured"
  }),

  buildCase({
    family: "waves",
    key: "female-medium-classic",
    name: "Ondulations laterales",
    description: "Mouvement ample sur les cotes avec hauteur moderee.",
    expected: ["ondulations S", "volume lateral", "hauteur moderee"],
    avoid: ["cheveux raides", "slick hair", "crop court"],
    faceShape: "visage allonge",
    length: "medium",
    maintenance: "medium",
    lifestyle: "classic",
    gender: "female",
    color: "brun caramel",
    volume: "medium",
    sides: "natural",
    fringe: "side",
    texture: "wavy"
  }),
  buildCase({
    family: "waves",
    key: "male-medium-modern",
    name: "Ondulations laterales",
    description: "Mouvement ample sur les cotes avec hauteur moderee.",
    expected: ["ondes naturelles", "mouvement lateral", "forme salon"],
    avoid: ["pompadour", "raide plaque", "longueur epaule feminine"],
    faceShape: "visage carre",
    length: "medium",
    maintenance: "high",
    lifestyle: "modern",
    gender: "male",
    color: "brun caramel",
    volume: "medium",
    sides: "natural",
    texture: "wavy"
  }),
  buildCase({
    family: "waves",
    key: "female-long-bold",
    name: "Long ondule lateral",
    description: "Longueur conservee avec ondulations laterales visibles.",
    expected: ["longueur conservee", "ondulations visibles", "mouvement ample"],
    avoid: ["cheveux courts", "bob strict", "cheveux raides"],
    faceShape: "visage ovale",
    length: "long",
    maintenance: "high",
    lifestyle: "bold",
    gender: "female",
    color: "brun caramel",
    volume: "medium",
    sides: "layered",
    texture: "wavy"
  }),

  buildCase({
    family: "volume",
    key: "male-short-bold",
    name: "Volume vertical texture",
    description: "Dessus aerien avec cotes propres pour allonger visuellement le visage.",
    expected: ["hauteur sur le dessus", "cotes propres", "texture verticale"],
    avoid: ["cheveux plats", "largeur joues", "cheveux longs"],
    faceShape: "visage rond",
    length: "short",
    maintenance: "high",
    lifestyle: "bold",
    gender: "male",
    color: "chatain naturel",
    volume: "high",
    sides: "tight",
    texture: "textured"
  }),
  buildCase({
    family: "volume",
    key: "female-short-modern",
    name: "Pixie volume haut",
    description: "Court texturise avec hauteur douce sur le dessus.",
    expected: ["volume haut doux", "court feminin", "dessus texture"],
    avoid: ["cheveux longs", "largeur laterale", "bob"],
    faceShape: "visage rond",
    length: "short",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "brun naturel",
    volume: "high",
    sides: "tight",
    texture: "textured"
  }),
  buildCase({
    family: "volume",
    key: "nonbinary-medium-bold",
    name: "Volume vertical texture",
    description: "Dessus aerien avec cotes propres pour allonger visuellement le visage.",
    expected: ["volume vertical", "silhouette plus haute", "texture visible"],
    avoid: ["cheveux plats", "frange lourde", "longueur epaule"],
    faceShape: "visage ovale",
    length: "medium",
    maintenance: "high",
    lifestyle: "bold",
    gender: "non-binary",
    color: "chatain naturel",
    volume: "high",
    sides: "natural",
    texture: "textured"
  }),

  buildCase({
    family: "long_flow",
    key: "female-long-classic",
    name: "Long fluide lumineux",
    description: "Longueur preservee, pointes legeres et contour propre.",
    expected: ["longueur sous les epaules", "pointes legeres", "contour fluide"],
    avoid: ["bob", "pixie", "cheveux courts"],
    faceShape: "visage ovale",
    length: "long",
    maintenance: "low",
    lifestyle: "classic",
    gender: "female",
    color: "chatain glace",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),
  buildCase({
    family: "long_flow",
    key: "female-long-modern",
    name: "Long degrade visage",
    description: "Longueurs conservees avec couches verticales autour des pommettes.",
    expected: ["longueur conservee", "couches visage", "lignes verticales"],
    avoid: ["cheveux courts", "bob net", "volume joue excessif"],
    faceShape: "visage rond",
    length: "long",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "chatain dore",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),
  buildCase({
    family: "long_flow",
    key: "child-long-soft",
    name: "Long enfant degrade",
    description: "Longueur gardee avec leger degrade pour eviter l'effet lourd.",
    expected: ["long enfant", "leger degrade", "forme douce"],
    avoid: ["style adulte glamour", "cheveux courts", "barbe"],
    faceShape: "visage ovale",
    length: "long",
    maintenance: "medium",
    lifestyle: "classic",
    gender: "female",
    ageGroup: "child",
    color: "naturel lumineux",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),

  buildCase({
    family: "bob",
    key: "female-medium-classic",
    name: "Carre volume lateral",
    description: "Carre souple sous les pommettes avec volume sur les cotes.",
    expected: ["carre souple", "volume lateral", "longueur sous pommettes"],
    avoid: ["cheveux longs epaule", "pixie", "crop masculin"],
    faceShape: "visage allonge",
    length: "medium",
    maintenance: "low",
    lifestyle: "classic",
    gender: "female",
    color: "chatain lumineux",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),
  buildCase({
    family: "bob",
    key: "female-medium-modern",
    name: "Carre degrade souple",
    description: "Couches progressives autour des joues et des maxillaires.",
    expected: ["carre degrade", "couches autour machoire", "perimetre arrondi"],
    avoid: ["long flow", "taper", "cheveux tres courts"],
    faceShape: "visage carre",
    length: "medium",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "brun espresso",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),
  buildCase({
    family: "bob",
    key: "child-medium-low",
    name: "Carre enfant leger",
    description: "Longueur moyenne, pointes souples et visage degage.",
    expected: ["carre enfant", "pointes souples", "visage degage"],
    avoid: ["barbe", "style mature", "longueur epaule lourde"],
    faceShape: "visage rond",
    length: "medium",
    maintenance: "low",
    lifestyle: "modern",
    gender: "female",
    ageGroup: "child",
    color: "naturel clair",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),

  buildCase({
    family: "pixie",
    key: "female-short-modern",
    name: "Pixie contours doux",
    description: "Court feminin avec nuque propre et meches arrondies.",
    expected: ["pixie court", "nuque propre", "meches arrondies"],
    avoid: ["bob", "cheveux longs", "coupe masculine dure"],
    faceShape: "visage carre",
    length: "short",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "brun glace",
    volume: "medium",
    sides: "tight",
    texture: "textured"
  }),
  buildCase({
    family: "pixie",
    key: "female-short-bold",
    name: "Pixie volume haut",
    description: "Court texturise avec hauteur douce sur le dessus.",
    expected: ["pixie", "volume doux dessus", "court texturise"],
    avoid: ["cheveux longs", "bob", "frange rideau longue"],
    faceShape: "visage rond",
    length: "short",
    maintenance: "high",
    lifestyle: "bold",
    gender: "female",
    color: "brun naturel",
    volume: "high",
    sides: "tight",
    texture: "textured"
  }),
  buildCase({
    family: "pixie",
    key: "nonbinary-short-modern",
    name: "Pixie contours doux",
    description: "Court avec nuque propre et meches arrondies.",
    expected: ["court doux", "contour arrondi", "nuque nette"],
    avoid: ["cheveux longs", "taper masculin strict", "bob"],
    faceShape: "visage ovale",
    length: "short",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "non-binary",
    color: "brun glace",
    volume: "medium",
    sides: "tight",
    texture: "textured"
  }),

  buildCase({
    family: "layered",
    key: "female-medium-classic",
    name: "Degrade aerien",
    description: "Couches legeres et mouvement naturel autour des pommettes.",
    expected: ["couches legeres", "mouvement naturel", "autour des pommettes"],
    avoid: ["bob strict", "crop court", "cheveux plats sans couches"],
    faceShape: "visage ovale",
    length: "medium",
    maintenance: "medium",
    lifestyle: "classic",
    gender: "female",
    color: "brun glace",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),
  buildCase({
    family: "layered",
    key: "female-long-modern",
    name: "Mi-long degrade",
    description: "Degrade doux autour des pommettes et pointes legeres.",
    expected: ["degrade doux", "pointes legeres", "volume milieu visage"],
    avoid: ["bob plein", "pixie", "crop court"],
    faceShape: "visage allonge",
    length: "long",
    maintenance: "medium",
    lifestyle: "modern",
    gender: "female",
    color: "reflets noisette",
    volume: "medium",
    sides: "layered",
    texture: "soft"
  }),
  buildCase({
    family: "layered",
    key: "nonbinary-medium-bold",
    name: "Contour doux structure",
    description: "Longueur equilibree avec mouvement leger autour du visage.",
    expected: ["longueur moyenne", "mouvement autour visage", "structure douce"],
    avoid: ["taper tres court", "bob strict", "cheveux sans mouvement"],
    faceShape: "visage carre",
    length: "medium",
    maintenance: "medium",
    lifestyle: "bold",
    gender: "non-binary",
    color: "chatain naturel",
    volume: "medium",
    sides: "layered",
    texture: "textured"
  })
];

const selectedCases = selectedFamilies.length
  ? validationCases.filter((item) => selectedFamilies.includes(item.family))
  : validationCases;

if (!selectedCases.length) {
  throw new Error(`Aucune recette trouvee pour: ${selectedFamilies.join(", ")}`);
}

const dataUrlToBuffer = (imageUrl) => {
  const match = /^data:image\/[^;]+;base64,(.+)$/s.exec(imageUrl || "");
  if (!match) throw new Error("La preview ne contient pas de data URL image.");
  return Buffer.from(match[1], "base64");
};

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(args.get("timeout") || 900000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      throw Object.assign(new Error(parsed.error || `HTTP ${response.status}`), { status: response.status, body: parsed });
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
};

const exists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  await mkdir(runDir, { recursive: true });
  const manifestPath = path.join(runDir, "manifest.json");
  const health = await fetchJson(`${apiBase}/api/health`);
  const previous = args.get("resume") && await exists(manifestPath)
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : null;
  const previousById = new Map((previous?.cases || []).map((item) => [item.id, item]));
  const manifest = {
    runId,
    apiBase,
    startedAt: new Date().toISOString(),
    health,
    caseCount: selectedCases.length,
    families: [...new Set(selectedCases.map((item) => item.family))],
    cases: []
  };

  for (const [index, item] of selectedCases.entries()) {
    const recipe = item.payload.style.recipe;
    const id = `${item.family}-${item.key}`;
    const imageName = `${String(index + 1).padStart(2, "0")}-${id}.png`;
    const imagePath = path.join(runDir, imageName);
    const previousCase = previousById.get(id);
    if (args.get("resume") && previousCase?.ok && await exists(path.join(runDir, previousCase.imageFile))) {
      manifest.cases.push(previousCase);
      console.log(`[${index + 1}/${selectedCases.length}] reuse ${id}`);
      continue;
    }

    console.log(`[${index + 1}/${selectedCases.length}] generate ${id}`);
    try {
      const result = await fetchJson(`${apiBase}/api/free-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.payload)
      });
      await writeFile(imagePath, dataUrlToBuffer(result.imageUrl));
      manifest.cases.push({
        id,
        family: item.family,
        key: item.key,
        ok: true,
        imageFile: imageName,
        model: result.model,
        referenceCacheKey: result.referenceCacheKey || "",
        style: {
          id: item.payload.style.id,
          name: item.payload.style.name,
          description: item.payload.style.description,
          color: item.payload.style.color
        },
        recipe,
        expected: item.expected,
        avoid: item.avoid,
        review: {
          status: "pending",
          notes: ""
        }
      });
    } catch (error) {
      manifest.cases.push({
        id,
        family: item.family,
        key: item.key,
        ok: false,
        error: error.message,
        status: error.status || "",
        body: error.body || null,
        style: item.payload.style,
        recipe,
        expected: item.expected,
        avoid: item.avoid,
        review: {
          status: "failed-generation",
          notes: error.message
        }
      });
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.successCount = manifest.cases.filter((item) => item.ok).length;
  manifest.failureCount = manifest.cases.length - manifest.successCount;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nManifest: ${manifestPath}`);
  console.log(`Images:   ${runDir}`);
  console.log(`OK: ${manifest.successCount}/${manifest.caseCount}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
