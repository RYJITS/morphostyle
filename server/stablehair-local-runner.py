import argparse
import os
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run the local Stable-Hair two-stage hairstyle transfer pipeline."
    )
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--debug-output")
    parser.add_argument("--pretrained-model", default="runwayml/stable-diffusion-v1-5")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--guidance-scale", type=float, default=1.5)
    parser.add_argument("--hair-scale", type=float, default=1.0)
    parser.add_argument("--bald-scale", type=float, default=0.9)
    parser.add_argument("--controlnet-scale", type=float, default=1.0)
    parser.add_argument("--dtype", choices=["fp16", "fp32"], default="fp16")
    return parser.parse_args()


def add_repo_paths(repo_root):
    repo_root = Path(repo_root).resolve()
    deps = repo_root / ".deps"
    if deps.exists():
        sys.path.insert(0, str(deps))
    sys.path.insert(0, str(repo_root))
    return repo_root


def fit_square(path, size):
    image = Image.open(path).convert("RGB")
    return ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def save_contact_sheet(images, output_path):
    pil_images = []
    for image in images:
        if isinstance(image, np.ndarray):
            if image.dtype != np.uint8:
                image = np.clip(image * 255.0, 0, 255).astype(np.uint8)
            image = Image.fromarray(image)
        pil_images.append(image.convert("RGB"))

    width = sum(image.width for image in pil_images)
    height = max(image.height for image in pil_images)
    sheet = Image.new("RGB", (width, height), "white")
    x = 0
    for image in pil_images:
        sheet.paste(image, (x, 0))
        x += image.width
    sheet.save(output_path)


def main():
    args = parse_args()
    repo_root = add_repo_paths(args.repo_root)

    from diffusers import UniPCMultistepScheduler
    from diffusers.models import UNet2DConditionModel
    from ref_encoder.adapter import adapter_injection, set_scale
    from ref_encoder.latent_controlnet import ControlNetModel
    from ref_encoder.reference_unet import ref_unet
    from utils.pipeline import StableHairPipeline
    from utils.pipeline_cn import StableDiffusionControlNetPipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    weight_dtype = torch.float16 if args.dtype == "fp16" and device == "cuda" else torch.float32
    pretrained_folder = repo_root / "models" / "stage2"
    stage1_path = repo_root / "models" / "stage1" / "pytorch_model.bin"

    source_image = fit_square(args.source, args.size)
    reference_image = fit_square(args.reference, args.size)
    reference_array = np.array(reference_image)

    with torch.inference_mode():
        print("Loading Stable-Hair base UNet...", flush=True)
        unet = UNet2DConditionModel.from_pretrained(
            args.pretrained_model,
            subfolder="unet",
        ).to(device)

        print("Loading Latent IdentityNet controlnet...", flush=True)
        controlnet = ControlNetModel.from_unet(unet).to(device)
        state_dict = torch.load(pretrained_folder / "pytorch_model_2.bin", map_location="cpu")
        controlnet.load_state_dict(state_dict, strict=False)
        controlnet.to(weight_dtype)
        del state_dict

        print("Loading Stable-Hair transfer pipeline...", flush=True)
        pipeline = StableHairPipeline.from_pretrained(
            args.pretrained_model,
            controlnet=controlnet,
            safety_checker=None,
            torch_dtype=weight_dtype,
        ).to(device)
        pipeline.scheduler = UniPCMultistepScheduler.from_config(pipeline.scheduler.config)

        print("Loading hair encoder and adapter...", flush=True)
        hair_encoder = ref_unet.from_pretrained(args.pretrained_model, subfolder="unet").to(device)
        state_dict = torch.load(pretrained_folder / "pytorch_model.bin", map_location="cpu")
        hair_encoder.load_state_dict(state_dict, strict=False)
        del state_dict
        hair_adapter = adapter_injection(pipeline.unet, device=device, dtype=weight_dtype, use_resampler=False)
        state_dict = torch.load(pretrained_folder / "pytorch_model_1.bin", map_location="cpu")
        hair_adapter.load_state_dict(state_dict, strict=False)
        del state_dict

        print("Loading bald converter...", flush=True)
        bald_converter = ControlNetModel.from_unet(unet).to(device)
        state_dict = torch.load(stage1_path, map_location="cpu")
        bald_converter.load_state_dict(state_dict, strict=False)
        bald_converter.to(dtype=weight_dtype)
        del state_dict
        del unet

        remove_hair_pipeline = StableDiffusionControlNetPipeline.from_pretrained(
            args.pretrained_model,
            controlnet=bald_converter,
            safety_checker=None,
            torch_dtype=weight_dtype,
        ).to(device)
        remove_hair_pipeline.scheduler = UniPCMultistepScheduler.from_config(
            remove_hair_pipeline.scheduler.config
        )

        hair_encoder.to(weight_dtype)
        hair_adapter.to(weight_dtype)

        print("Generating bald base...", flush=True)
        bald_image = remove_hair_pipeline(
            prompt="",
            negative_prompt="",
            num_inference_steps=30,
            guidance_scale=1.5,
            width=args.size,
            height=args.size,
            image=source_image,
            controlnet_conditioning_scale=args.bald_scale,
            generator=None,
        ).images[0]
        bald_array = np.array(bald_image)

        print("Transferring hairstyle...", flush=True)
        set_scale(pipeline.unet, args.hair_scale)
        generator = torch.Generator(device=device)
        generator.manual_seed(args.seed)
        sample = pipeline(
            "",
            negative_prompt="",
            num_inference_steps=args.steps,
            guidance_scale=args.guidance_scale,
            width=args.size,
            height=args.size,
            controlnet_condition=bald_array,
            controlnet_conditioning_scale=args.controlnet_scale,
            generator=generator,
            reference_encoder=hair_encoder,
            ref_image=reference_array,
        ).samples

    if sample.ndim == 4:
        sample = sample[0]
    result_array = np.clip(sample * 255.0, 0, 255).astype(np.uint8)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(result_array).save(output_path)
    print(f"Saved {output_path}", flush=True)

    if args.debug_output:
        debug_path = Path(args.debug_output)
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        save_contact_sheet([source_image, bald_image, reference_image, result_array], debug_path)
        print(f"Saved debug {debug_path}", flush=True)


if __name__ == "__main__":
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    main()
