from __future__ import annotations

import time

import numpy as np
from vispy import app, scene
from vispy.scene import visuals

from .config import Config
from .orbit_camera import OrbitCameraController
from .particle_system import ParticleSystem3D


class ParticleApp:
    def __init__(self, config: Config, system: ParticleSystem3D):
        self.config = config
        self.system = system
        self.paused = False

        self.canvas = scene.SceneCanvas(
            keys="interactive",
            size=config.canvas_size,
            show=True,
            bgcolor=config.background_color,
            title="3D Particle Poetry - 小音 / 我爱你",
            resizable=True,
        )

        self.view = self.canvas.central_widget.add_view()
        self.camera = scene.cameras.TurntableCamera(
            fov=48,
            azimuth=25,
            elevation=18,
            distance=20,
            center=(0, 0, 0),
            up="y",
        )
        self.camera.elevation = np.clip(self.camera.elevation, -88, 88)
        self.view.camera = self.camera
        self.camera_controller = OrbitCameraController(self.camera)

        self.markers = visuals.Markers(parent=self.view.scene)
        self.markers.set_gl_state("translucent", depth_test=True, blend=True)

        self._fps_t0 = time.perf_counter()
        self._fps_frames = 0

        self.info = visuals.Text(
            "",
            parent=self.canvas.scene,
            color="white",
            anchor_x="left",
            anchor_y="top",
            pos=(12, 14),
            font_size=10,
        )

        self.canvas.events.key_press.connect(self.on_key_press)
        self.canvas.events.resize.connect(self.on_resize)

        self.timer = app.Timer(interval="auto", connect=self.on_timer, start=True)
        self.t_global = 0.0

    def on_resize(self, event):
        self._update_info_text(0.0)

    def on_key_press(self, event):
        key = (event.key.name or "").upper()
        if key == "SPACE":
            self.paused = not self.paused
        elif key == "R":
            self.camera_controller.reset()
        elif key == "C":
            self.system.toggle_color_mode()
        elif key in {"PLUS", "EQUAL"}:
            self.camera_controller.zoom(0.9)
        elif key in {"MINUS", "UNDERSCORE"}:
            self.camera_controller.zoom(1.1)

    def _update_info_text(self, fps: float):
        self.info.text = (
            f"FPS: {fps:5.1f} | Phase: {self.system.phase.name:<8} | Text: {self.system.text_index + 1}"
            "\nMouse drag: orbit, Wheel: zoom | [Space] pause [C] palette [R] reset"
        )

    def on_timer(self, event):
        dt = min(0.033, event.dt if event.dt is not None else 1 / 60)
        if not self.paused:
            self.t_global += dt
            self.system.update(dt, self.t_global)

        pos, colors, sizes = self.system.get_render_payload()
        self.markers.set_data(
            pos,
            edge_width=0,
            face_color=colors,
            size=sizes,
            symbol="o",
        )

        self._fps_frames += 1
        now = time.perf_counter()
        elapsed = now - self._fps_t0
        if elapsed >= 0.5:
            fps = self._fps_frames / elapsed
            self._fps_frames = 0
            self._fps_t0 = now
            self._update_info_text(fps)

        self.canvas.update()

    def run(self):
        app.run()
