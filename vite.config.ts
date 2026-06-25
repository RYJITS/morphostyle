
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawGeminiKey = env.API_KEY || env.GEMINI_API_KEY || '';
  const apiKey = /PLACEHOLDER/i.test(rawGeminiKey) ? '' : rawGeminiKey;
  const freeImageProvider = env.VITE_FREE_IMAGE_PROVIDER || env.FREE_IMAGE_PROVIDER || '';
  const imageToImageProvider = env.VITE_IMAGE_TO_IMAGE_PROVIDER || env.IMAGE_TO_IMAGE_PROVIDER || '';
  const imageToImageEndpoint = env.VITE_IMAGE_TO_IMAGE_ENDPOINT || env.IMAGE_TO_IMAGE_ENDPOINT || '/api/generate-hairstyle';
  const imageToImageTimeoutMs = env.VITE_IMAGE_TO_IMAGE_TIMEOUT_MS || env.IMAGE_TO_IMAGE_TIMEOUT_MS || '180000';
  const freeImageToImageFallbacks = env.VITE_FREE_IMAGE_TO_IMAGE_FALLBACKS || env.FREE_IMAGE_TO_IMAGE_FALLBACKS || 'false';
  const freePreviewEndpoint = env.VITE_FREE_PREVIEW_ENDPOINT || env.FREE_PREVIEW_ENDPOINT || '/api/free-preview';
  const puterFluxModel = env.VITE_PUTER_FLUX_MODEL || env.PUTER_FLUX_MODEL || 'black-forest-labs/flux.1-kontext-pro';
  const hfKontextSpaceUrl = env.VITE_HF_KONTEXT_SPACE_URL || env.HF_KONTEXT_SPACE_URL || 'https://black-forest-labs-flux-1-kontext-dev.hf.space';
  const hfKontextSteps = env.VITE_HF_KONTEXT_STEPS || env.HF_KONTEXT_STEPS || '20';
  const hfKontextAttempts = env.VITE_HF_KONTEXT_ATTEMPTS || env.HF_KONTEXT_ATTEMPTS || '3';
  const hfKontextTimeoutMs = env.VITE_HF_KONTEXT_TIMEOUT_MS || env.HF_KONTEXT_TIMEOUT_MS || '180000';
  const hfKontextFallbackEndpoint = env.VITE_HF_KONTEXT_FALLBACK_ENDPOINT || env.HF_KONTEXT_FALLBACK_ENDPOINT || '';
  const demoMode = env.VITE_DEMO_MODE || env.DEMO_MODE || (!apiKey && !freeImageProvider ? 'true' : 'false');
  const allowBrowserGemini = env.VITE_ALLOW_BROWSER_GEMINI === 'true';

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(allowBrowserGemini ? apiKey : ''),
      'process.env.DEMO_MODE': JSON.stringify(demoMode),
      'process.env.FREE_IMAGE_PROVIDER': JSON.stringify(freeImageProvider),
      'process.env.IMAGE_TO_IMAGE_PROVIDER': JSON.stringify(imageToImageProvider),
      'process.env.IMAGE_TO_IMAGE_ENDPOINT': JSON.stringify(imageToImageEndpoint),
      'process.env.IMAGE_TO_IMAGE_TIMEOUT_MS': JSON.stringify(imageToImageTimeoutMs),
      'process.env.FREE_IMAGE_TO_IMAGE_FALLBACKS': JSON.stringify(freeImageToImageFallbacks),
      'process.env.FREE_PREVIEW_ENDPOINT': JSON.stringify(freePreviewEndpoint),
      'process.env.PUTER_FLUX_MODEL': JSON.stringify(puterFluxModel),
      'process.env.HF_KONTEXT_SPACE_URL': JSON.stringify(hfKontextSpaceUrl),
      'process.env.HF_KONTEXT_STEPS': JSON.stringify(hfKontextSteps),
      'process.env.HF_KONTEXT_ATTEMPTS': JSON.stringify(hfKontextAttempts),
      'process.env.HF_KONTEXT_TIMEOUT_MS': JSON.stringify(hfKontextTimeoutMs),
      'process.env.HF_KONTEXT_FALLBACK_ENDPOINT': JSON.stringify(hfKontextFallbackEndpoint),
      'process.env.POLLINATIONS_MODEL': JSON.stringify(env.VITE_POLLINATIONS_MODEL || env.POLLINATIONS_MODEL || 'sana'),
      'process.env.GEMINI_TEXT_MODEL': JSON.stringify(env.VITE_GEMINI_TEXT_MODEL || env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash'),
      'process.env.GEMINI_IMAGE_MODEL': JSON.stringify(env.VITE_GEMINI_IMAGE_MODEL || env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image')
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: false
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
