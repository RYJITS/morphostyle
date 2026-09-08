// Test des vraies routes dans un stockage isole; seul le fournisseur image est simule.
// Aucun secret ni photo n'est charge implicitement. Les sorties privees restent dans output/.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (key, fallback = '') => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const sheetPath = option('--sheet');
if (!sheetPath) throw new Error('Usage: node scripts/test-portrait-background-api.mjs --sheet <planche privee> [--source <photo>] [--serve]');
const expectedBackground = option('--expect-background', 'gray');
const run = path.join(root, 'output', 'portrait-background-api', `${Date.now()}-${randomBytes(3).toString('hex')}`);
await mkdir(path.join(run, 'server'), { recursive: true });
const sheet = await readFile(path.resolve(sheetPath));
const source = await readFile(path.resolve(option('--source', sheetPath)));
const sourceDataUrl = `data:image/${/\.png$/i.test(option('--source', sheetPath)) ? 'png' : 'jpeg'};base64,${source.toString('base64')}`;

// Importer une copie exacte du routeur avec ses imports reels et un rootDir de test.
// Ne pas appeler loadMorphoStyleEnvironment : aucune cle centrale ni base reelle.
const serverSource = (await readFile(path.join(root, 'server/index.mjs'), 'utf8'))
  .replace(/from "\.\/([^\"]+)";/g, (_, file) => `from ${JSON.stringify(pathToFileURL(path.join(
    args.includes('--matting-unavailable') && file === 'portrait-background.mjs' ? path.join(run, 'server') : path.join(root, 'server'), file
  )).href)};`);
if (args.includes('--matting-unavailable')) {
  // Meme module, dans un repertoire sans modele : vraie panne de preparation, pas de branche test en production.
  await writeFile(path.join(run, 'server/portrait-background.mjs'), await readFile(path.join(root, 'server/portrait-background.mjs')));
}
await writeFile(path.join(run, 'server/index.mjs'), serverSource);
await symlink(path.join(root, 'dist'), path.join(run, 'dist'), 'junction');
for (const key of Object.keys(process.env)) {
  if (/^(MYSQL_|DB_|MORPHOSTYLE_DB_)/.test(key) || ['DATABASE_URL', 'MORPHOSTYLE_DATABASE_URL', 'HOSTINGER', 'HOSTINGER_ENV'].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'test', REQUIRE_MYSQL: 'false', MORPHOSTYLE_REQUIRE_MYSQL: 'false', ALLOW_JSON_USER_STORE: 'true',
  OPENAI_API_KEY: 'fixture-only-no-network', MORPHOSTYLE_PRIVATE_ASSET_SECRET: randomBytes(32).toString('hex'),
  PORTRAIT_BACKGROUND_MODE: option('--mode', 'gray')
});
const realFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://api.openai.com/v1/images/edits') {
    providerCalls += 1;
    assert.equal(options.body.get('n'), '1');
    assert.match(options.body.get('prompt'), /Preserve|preserve/);
    return Response.json({ data: [{ b64_json: sheet.toString('base64') }] });
  }
  assert.match(String(url), /^http:\/\/127\.0\.0\.1:/, 'Tout appel externe hors fixture est interdit');
  return realFetch(url, options);
};
const { handleMorphoStyleRequest } = await import(pathToFileURL(path.join(run, 'server/index.mjs')).href);
const server = createServer(handleMorphoStyleRequest);
await new Promise(resolve => server.listen(Number(option('--port', '0')), '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
const request = async (route, payload, authenticated = true) => {
  const response = await fetch(origin + route, {
    method: payload ? 'POST' : 'GET',
    headers: { ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return { response, data: await response.json() };
};

try {
  const health = await request('/api/health', undefined, false);
  assert.equal(health.response.status, 200);
  assert.equal(health.data.userStorage, 'json', 'Le test exige le stockage isole avant de creer un compte');
  const consultation = { targetLength: 'medium', maintenance: 'low', lifestyle: 'bold', gender: 'male', ageGroup: 'mature' };
  const base = { imageBase64: sourceDataUrl, consultation, clientId: 'portrait-background-api-test' };
  const denied = await request('/api/openai-upload-recommendations', base, false);
  assert.equal(denied.response.status, 401);
  assert.equal(providerCalls, 0);
  const credentials = { email: `portrait-${Date.now()}@example.invalid`, password: randomBytes(18).toString('hex') };
  const registration = await request('/api/auth/register', { ...credentials, clientId: base.clientId });
  assert.equal(registration.response.status, 200);
  assert.equal(registration.data.storage, 'json');
  const recommendations = await request('/api/openai-upload-recommendations', base);
  assert.equal(recommendations.response.status, 200, recommendations.data.error);
  assert.equal(providerCalls, 1);
  const style = recommendations.data.recommendedStyles[0];
  const before = performance.now();
  const result = await request('/api/openai-selected-result', {
    ...base, style, generationSessionId: recommendations.data.generationSessionId,
    selectedReferenceAssetUrl: style.assetPreviewUrl, selectedRecommendationId: style.id
  });
  assert.equal(result.response.status, 200, result.data.error);
  assert.equal(providerCalls, 2, 'Une requete fournisseur par planche; aucun appel pour le fond');
  const proposal = result.data.proposal;
  assert.equal(proposal.backgroundTreatment, expectedBackground);
  assert.equal(proposal.historyItem.backgroundTreatment, expectedBackground);
  const urls = [proposal.assetImageUrl, ...Object.values(proposal.assetAdditionalViews)];
  const displays = [proposal.imageUrl, ...Object.values(proposal.additionalViews)];
  for (let i = 0; i < urls.length; i++) {
    const url = new URL(urls[i], origin);
    const stored = await readFile(path.join(run, 'server/data', url.pathname));
    assert.deepEqual(Buffer.from(displays[i].split(',')[1], 'base64'), stored, 'Apercu identique au fichier persiste');
    const download = await fetch(url.href);
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), stored, 'Telechargement identique au fichier persiste');
    const privateAsset = await fetch(origin + url.pathname);
    assert.equal(privateAsset.status, 403, 'Photo privee sans signature');
  }
  const history = await request('/api/me?scope=all');
  assert.equal(history.response.status, 200);
  const saved = history.data.generations.find(item => item.id === proposal.historyItem.id);
  assert.ok(saved, 'Finale presente dans historique');
  assert.equal(saved.backgroundTreatment, expectedBackground);
  assert.equal(new URL(saved.imageUrl, origin).pathname, new URL(proposal.assetImageUrl, origin).pathname);
  const hydrated = await request(`/api/me/generations/${encodeURIComponent(saved.id)}/assets`);
  assert.equal(hydrated.response.status, 200);
  const parentId = saved.recommendationSessionId || saved.parentGenerationId;
  assert.equal(parentId, recommendations.data.generationSessionId);
  const parent = history.data.generations.find(item => item.id === parentId);
  assert.equal(parent?.status, 'recommendations_ready', 'Session interne conservee pour la reprise');
  const parentAssets = await request(`/api/me/generations/${encodeURIComponent(parentId)}/assets`);
  assert.equal(parentAssets.response.status, 200);
  assert.equal(parentAssets.data.generation.recommendations.length, 4);
  assert.match(parentAssets.data.generation.originalImageUrl, /^data:image\//);
  assert.equal(providerCalls, 2, 'Relire les recommandations ne genere aucune image');
  const extraFinal = await request('/api/openai-selected-result', {
    ...base, style, generationSessionId: parentId, resumeFromHistory: true,
    sourceAssetUrl: parent.originalImageUrl,
    selectedReferenceAssetUrl: style.assetPreviewUrl, selectedRecommendationId: style.id
  });
  assert.equal(extraFinal.response.status, 429, 'Une finale supplementaire exige toujours un credit');
  assert.match(extraFinal.data.error, /Ajoutez un credit/);
  assert.equal(providerCalls, 2, 'Aucun appel fournisseur sans credit disponible');
  const elapsedMs = Math.round(performance.now() - before);
  const report = { providerCalls, expectedBackground, finalElapsedMs: elapsedMs, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024), views: urls.length, history: true, savedRecommendations: true, extraFinalRequiresCredit: true, privateAssets: true, displayDownloadIdentical: true, storage: 'json-isole', run, origin };
  await writeFile(path.join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (args.includes('--serve')) {
    await writeFile(path.join(run, 'browser-session.json'), JSON.stringify({ origin, credentials }));
    console.log('Application de test disponible; identifiants jetables dans browser-session.json (non versionne).');
  } else server.close();
} catch (error) {
  server.close();
  throw error;
}
