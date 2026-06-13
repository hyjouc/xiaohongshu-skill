from __future__ import annotations

import argparse
import base64
import json
import os
import time
from pathlib import Path
from typing import Any

import requests


class ImageGenerationError(RuntimeError):
    pass


ROLE_SIZES = {
    "cover": "3:4",
    "card": "3:4",
    "body": "1:1",
}


def read_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def xhs_prompt(item: dict[str, Any]) -> str:
    role = item.get("role", "card")
    cover_direction = []
    if role == "cover":
        cover_direction = [
            "Cover-specific direction: design it as a scroll-stopping Xiaohongshu cover background, not a generic stock photo",
            "Layout: reserve a clean empty title area in the top 35% or left 35%; keep the main subject bold, large, and clearly separated",
            "Feed readability: high contrast, strong focal point, minimal props, no tiny scattered cards, no busy desk clutter",
        ]
    return "\n".join(
        [
            "Use case: ads-marketing",
            f"Asset type: Xiaohongshu / 小红书 {role} image",
            f"Primary request: {item['prompt']}",
            "Style/medium: premium Xiaohongshu editorial cover visual, clean lifestyle or polished semi-realistic illustration, tasteful and high-end",
            "Composition/framing: vertical 3:4 feed-first composition, one clear large subject, generous negative space for later Chinese text overlay, strong visual hierarchy",
            *cover_direction,
            "Lighting/mood: bright, clean, soft natural light or refined studio light; inviting but not childish",
            "Color palette: fresh warm neutrals plus one restrained accent color; use enough contrast for phone-feed visibility; avoid cheap neon and heavy purple-blue AI gradients",
            "Constraints: text-free image, no watermark, no QR code, no app/platform logos, no fake UI screenshot, no fake proof, no illegible text",
            "Avoid: plastic 3D look, clutter, stock-photo smiles, distorted hands or faces, sci-fi robots, glowing brains, low-resolution artifacts, exaggerated before-after claims",
        ]
    )


def generate_apimart_image(
    *,
    api_key: str,
    model: str,
    prompt: str,
    size: str,
    resolution: str,
) -> bytes:
    response = requests.post(
        "https://api.apimart.ai/v1/images/generations",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "prompt": prompt,
            "size": size,
            "resolution": resolution,
            "n": 1,
        },
        timeout=180,
    )
    data = parse_json_response(response, "APIMart image generation")
    if response.status_code >= 400:
        raise ImageGenerationError(f"APIMart image API error: {data}")

    images = data.get("data") or []
    if isinstance(images, list) and images:
        first = images[0]
        if "b64_json" in first:
            return base64.b64decode(first["b64_json"])
        if "url" in first:
            return download_image(first["url"])
        task_id = first.get("task_id") or first.get("id")
        if task_id:
            return wait_for_task(api_key, task_id)

    payload = data.get("data")
    if isinstance(payload, dict):
        task_id = payload.get("task_id") or payload.get("id")
        if task_id:
            return wait_for_task(api_key, task_id)

    raise ImageGenerationError(f"APIMart returned no image or task id: {data}")


def wait_for_task(api_key: str, task_id: str, timeout_seconds: int = 240) -> bytes:
    deadline = time.time() + timeout_seconds
    last_status: dict[str, Any] | None = None
    while time.time() < deadline:
        response = requests.get(
            f"https://api.apimart.ai/v1/tasks/{task_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"language": "zh"},
            timeout=60,
        )
        data = parse_json_response(response, "APIMart task status")
        if response.status_code >= 400:
            raise ImageGenerationError(f"APIMart task status error: {data}")
        task = data.get("data") or data
        last_status = task
        status = task.get("status")
        if status == "completed":
            images = ((task.get("result") or {}).get("images") or [])
            if not images:
                raise ImageGenerationError(f"APIMart task completed without images: {data}")
            url = images[0].get("url")
            if isinstance(url, list):
                url = url[0] if url else None
            if not url:
                raise ImageGenerationError(f"APIMart task image has no URL: {data}")
            return download_image(url)
        if status in {"failed", "cancelled"}:
            raise ImageGenerationError(f"APIMart task {status}: {task}")
        time.sleep(5)
    raise ImageGenerationError(f"Timed out waiting for APIMart task {task_id}: {last_status}")


def download_image(url: str) -> bytes:
    response = requests.get(url, timeout=60)
    if response.status_code >= 400:
        raise ImageGenerationError(f"Failed to download generated image: {response.status_code} {url}")
    return response.content


def parse_json_response(response: requests.Response, label: str) -> dict[str, Any]:
    try:
        return response.json()
    except ValueError as exc:
        raise ImageGenerationError(
            f"{label} returned non-JSON {response.status_code}: {response.text[:500]}"
        ) from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Xiaohongshu images with APIMart.")
    parser.add_argument("--plan", type=Path, required=True, help="JSON image plan path.")
    parser.add_argument("--out-dir", type=Path, required=True, help="Output directory.")
    parser.add_argument("--env", type=Path, default=Path(".env"), help="Optional .env file.")
    parser.add_argument("--model", default=None, help="Defaults to APIMART_IMAGE_MODEL or gpt-image-2.")
    parser.add_argument("--resolution", default=None, help="Defaults to APIMART_IMAGE_RESOLUTION or 1k.")
    parser.add_argument("--resume-task-id", default=None, help="Poll an existing APIMart task id and save the result.")
    parser.add_argument("--resume-filename", default="cover.png", help="Filename to use with --resume-task-id.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files.")
    args = parser.parse_args()

    read_env_file(args.env)
    api_key = os.getenv("APIMART_API_KEY", "").strip()
    if not api_key:
        raise ImageGenerationError("Missing APIMART_API_KEY in environment or .env file.")

    model = args.model or os.getenv("APIMART_IMAGE_MODEL", "gpt-image-2")
    resolution = args.resolution or os.getenv("APIMART_IMAGE_RESOLUTION", "1k")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    if args.resume_task_id:
        out_path = args.out_dir / args.resume_filename
        out_path.write_bytes(wait_for_task(api_key, args.resume_task_id, timeout_seconds=600))
        print(json.dumps({"generated": [str(out_path)], "resumed_task_id": args.resume_task_id}, ensure_ascii=False, indent=2))
        return

    plan = json.loads(args.plan.read_text(encoding="utf-8"))

    generated: list[str] = []
    for item in plan:
        if not item.get("required", True):
            continue
        out_path = args.out_dir / item["filename"]
        if out_path.exists() and not args.overwrite:
            generated.append(str(out_path))
            continue
        prompt = xhs_prompt(item)
        image = generate_apimart_image(
            api_key=api_key,
            model=model,
            prompt=prompt,
            size=ROLE_SIZES.get(item.get("role", "card"), "3:4"),
            resolution=resolution,
        )
        out_path.write_bytes(image)
        generated.append(str(out_path))

    print(json.dumps({"generated": generated}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
