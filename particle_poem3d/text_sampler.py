from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .config import Config


def _pick_font(font_size: int, candidates: Iterable[str]) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, font_size)
            except OSError:
                continue
    # 最后兜底：默认字体（可能不支持中文）
    return ImageFont.load_default()


def sample_text_points(text: str, config: Config, rng: np.random.Generator) -> np.ndarray:
    """将中文文字采样为 3D 点云 (N,3)。"""
    w, h = config.sample_canvas
    img = Image.new("L", (w, h), color=0)
    draw = ImageDraw.Draw(img)

    font = _pick_font(int(h * 0.55), config.preferred_font_paths)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    ox = (w - tw) // 2
    oy = (h - th) // 2
    draw.text((ox, oy), text, fill=255, font=font)

    arr = np.array(img)
    ys, xs = np.where(arr > 16)

    if len(xs) == 0:
        return np.zeros((1, 3), dtype=np.float32)

    step = max(1, config.sample_step)
    keep = np.arange(0, len(xs), step)
    xs = xs[keep]
    ys = ys[keep]

    x = (xs - w * 0.5) * config.text_scale
    y = -(ys - h * 0.5) * config.text_scale
    z = (rng.random(len(x)) - 0.5) * config.text_thickness

    points = np.column_stack((x, y, z)).astype(np.float32)

    # 再做一次随机子采样，防止点太密
    if len(points) > 20000:
        idx = rng.choice(len(points), size=20000, replace=False)
        points = points[idx]

    return points
