from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import Config


@dataclass
class Phase:
    name: str
    duration: float


def _ease_in_out(t: np.ndarray) -> np.ndarray:
    return t * t * (3.0 - 2.0 * t)


class ParticleSystem3D:
    def __init__(self, config: Config, text_targets: list[np.ndarray]):
        self.config = config
        self.rng = np.random.default_rng(20260411)
        self.n = config.particle_count

        self.positions = self.rng.uniform(-config.space_radius, config.space_radius, (self.n, 3)).astype(np.float32)
        self.velocities = self.rng.normal(0.0, 0.15, (self.n, 3)).astype(np.float32)
        self.seeds = self.rng.uniform(0, 1000, self.n).astype(np.float32)
        self.sizes = self.rng.uniform(config.point_size_range[0], config.point_size_range[1], self.n).astype(np.float32)
        self.base_colors = self._generate_colors(config.color_mode)
        self.colors = self.base_colors.copy()
        self.text_targets = text_targets

        self.text_index = 0
        self.time_in_phase = 0.0
        self.phases = [
            Phase("free", config.timing.free_duration),
            Phase("gather", config.timing.gather_duration),
            Phase("hold", config.timing.hold_duration),
            Phase("disperse", config.timing.disperse_duration),
        ]
        self.phase_idx = 0

        self.target_positions = self._build_targets(self.text_targets[self.text_index])
        self.prev_target_positions = self.positions.copy()

    def _generate_colors(self, mode: str) -> np.ndarray:
        hue = self.rng.uniform(0.72, 0.98, self.n)
        sat = self.rng.uniform(0.35, 0.95, self.n)
        val = self.rng.uniform(0.75, 1.00, self.n)

        if mode == "palette":
            palette = np.array(
                [
                    [1.0, 0.65, 0.86],
                    [0.73, 0.89, 1.0],
                    [0.82, 0.72, 1.0],
                    [0.66, 1.0, 0.90],
                ],
                dtype=np.float32,
            )
            idx = self.rng.integers(0, len(palette), self.n)
            rgb = palette[idx]
        else:
            if mode == "pastel":
                sat *= 0.65
                val = np.clip(val + 0.08, 0, 1)
            rgb = self._hsv_to_rgb(hue, sat, val)

        alpha = np.full((self.n, 1), self.config.base_alpha, dtype=np.float32)
        return np.concatenate([rgb.astype(np.float32), alpha], axis=1)

    @staticmethod
    def _hsv_to_rgb(h: np.ndarray, s: np.ndarray, v: np.ndarray) -> np.ndarray:
        i = np.floor(h * 6.0).astype(int)
        f = h * 6.0 - i
        p = v * (1.0 - s)
        q = v * (1.0 - f * s)
        t = v * (1.0 - (1.0 - f) * s)
        i = i % 6

        rgb = np.zeros((len(h), 3), dtype=np.float32)
        conds = [i == k for k in range(6)]
        vals = [
            np.stack([v, t, p], axis=1),
            np.stack([q, v, p], axis=1),
            np.stack([p, v, t], axis=1),
            np.stack([p, q, v], axis=1),
            np.stack([t, p, v], axis=1),
            np.stack([v, p, q], axis=1),
        ]
        for c, val in zip(conds, vals):
            rgb[c] = val[c]
        return rgb

    def _build_targets(self, text_points: np.ndarray) -> np.ndarray:
        m = len(text_points)
        targets = np.zeros((self.n, 3), dtype=np.float32)

        if m >= self.n:
            idx = self.rng.choice(m, size=self.n, replace=False)
            targets[:] = text_points[idx]
            return targets

        fill = min(m, int(self.n * 0.78))
        chosen = self.rng.choice(m, size=fill, replace=False if m >= fill else True)
        targets[:fill] = text_points[chosen]

        # 剩余粒子作为环绕层
        theta = self.rng.uniform(0, 2 * np.pi, self.n - fill)
        r = self.rng.uniform(3.0, 7.0, self.n - fill)
        y = self.rng.uniform(-2.2, 2.2, self.n - fill)
        ring = np.column_stack([np.cos(theta) * r, y, np.sin(theta) * r * 0.8])
        targets[fill:] = ring.astype(np.float32)

        self.rng.shuffle(targets)
        return targets

    @property
    def phase(self) -> Phase:
        return self.phases[self.phase_idx]

    def toggle_color_mode(self) -> None:
        modes = ["pastel", "rainbow", "palette"]
        current = self.config.color_mode
        next_mode = modes[(modes.index(current) + 1) % len(modes)]
        self.config.color_mode = next_mode
        self.base_colors = self._generate_colors(next_mode)
        self.colors = self.base_colors.copy()

    def _advance_phase(self) -> None:
        self.time_in_phase = 0.0
        self.phase_idx = (self.phase_idx + 1) % len(self.phases)

        # 每次进入 gather：切到下一个文字
        if self.phase.name == "gather":
            self.text_index = (self.text_index + 1) % len(self.text_targets)
            self.prev_target_positions = self.positions.copy()
            self.target_positions = self._build_targets(self.text_targets[self.text_index])

    def update(self, dt: float, t_global: float) -> None:
        self.time_in_phase += dt
        if self.time_in_phase >= self.phase.duration:
            self._advance_phase()

        p = self.positions
        v = self.velocities

        # 自由流动速度场（正弦+相位）
        s = self.seeds
        field = np.column_stack(
            [
                np.sin(0.75 * p[:, 1] + 0.45 * t_global + s * 0.01),
                np.cos(0.65 * p[:, 2] - 0.55 * t_global + s * 0.012),
                np.sin(0.70 * p[:, 0] + 0.35 * t_global - s * 0.008),
            ]
        )
        v += field * self.config.free_noise_strength * dt

        phase = self.phase.name

        if phase in {"gather", "hold", "disperse"}:
            if phase == "gather":
                blend = _ease_in_out(np.array([self.time_in_phase / self.phase.duration], dtype=np.float32))[0]
            elif phase == "hold":
                blend = 1.0
            else:
                blend = 1.0 - _ease_in_out(np.array([self.time_in_phase / self.phase.duration], dtype=np.float32))[0]

            desired = self.prev_target_positions * (1.0 - blend) + self.target_positions * blend

            # 呼吸抖动
            jitter = np.column_stack(
                [
                    np.sin(t_global * 2.2 + s * 0.31),
                    np.cos(t_global * 1.8 + s * 0.23),
                    np.sin(t_global * 2.4 + s * 0.19),
                ]
            ) * self.config.jitter_strength
            desired = desired + jitter

            attract = (desired - p) * self.config.attraction_strength * dt
            v += attract

        # 空间约束
        rad = np.linalg.norm(p, axis=1)
        outside = rad > self.config.space_radius * 1.25
        if np.any(outside):
            inward = -p[outside] / (rad[outside, None] + 1e-6)
            v[outside] += inward * 1.8 * dt

        speed = np.linalg.norm(v, axis=1)
        fast = speed > self.config.max_speed
        if np.any(fast):
            v[fast] = v[fast] / speed[fast, None] * self.config.max_speed

        v *= self.config.damping
        p += v * dt

        # 亮度轻微波动，避免闪烁
        pulse = 0.08 * np.sin(t_global * 1.6 + s * 0.1)
        self.colors[:, :3] = np.clip(self.base_colors[:, :3] * (1.0 + pulse[:, None]), 0.0, 1.0)

    def get_render_payload(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        return self.positions, self.colors, self.sizes
