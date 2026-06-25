<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10dDcgWoNH7yhJXuDBBWmZlneVpJW7j0R

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the API server:
   `npm run dev:api`
3. Run the app:
   `npm run dev`

The project now starts with `VITE_FREE_IMAGE_PROVIDER=comfy-preview`, `VITE_IMAGE_TO_IMAGE_PROVIDER=server`, and `SERVER_IMAGE_TO_IMAGE_PROVIDER=free-chain` in [.env.local](.env.local). In this mode, no Google, Gemini, Pollinations, Puter, or FAL paid image API is used for preview cards or for the final local retouch.

The free final chain is:

- Local ComfyUI SDXL masked inpainting for the uploaded portrait.
- AI Horde anonymous inpainting as a remote free fallback if local ComfyUI is unavailable.

Preview cards use local ComfyUI SDXL image-to-image from the uploaded portrait, so each proposed haircut keeps the user's photo as the visual reference. If no source photo is available, ComfyUI text-to-image can still generate a preview; local SVG hairstyle visuals remain as a last fallback if ComfyUI is unavailable.

Optional: `VITE_IMAGE_TO_IMAGE_PROVIDER=puter-flux`, `hf-kontext`, and `local-retouch` can still be tested manually, but they are not the default path.
