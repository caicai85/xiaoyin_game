from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class AnimationTiming:
    free_duration: float = 4.0
    gather_duration: float = 3.5
    hold_duration: float = 2.8
    disperse_duration: float = 3.0


@dataclass
class Config:
    particle_count: int = 6500
    canvas_size: tuple[int, int] = (1280, 720)
    text_sequence: tuple[str, ...] = ("小音", "我爱你")

    # 文字采样
    sample_canvas: tuple[int, int] = (1024, 420)
    sample_step: int = 4
    text_scale: float = 0.018
    text_thickness: float = 0.12

    # 粒子运动
    space_radius: float = 9.0
    max_speed: float = 2.8
    attraction_strength: float = 4.5
    damping: float = 0.90
    free_noise_strength: float = 0.9
    jitter_strength: float = 0.08

    # 渲染
    point_size_range: tuple[float, float] = (2.5, 7.0)
    base_alpha: float = 0.80
    background_color: tuple[float, float, float, float] = (0.02, 0.01, 0.06, 1.0)
    color_mode: str = "pastel"  # pastel / rainbow / palette

    timing: AnimationTiming = field(default_factory=AnimationTiming)

    preferred_font_paths: tuple[str, ...] = (
        # Linux 常见
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        # macOS 常见
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        # Windows 常见
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
    )


DEFAULT_CONFIG = Config()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
