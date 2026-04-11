from vispy.scene.cameras import TurntableCamera


class OrbitCameraController:
    """TurntableCamera 的轻量封装，提供重置和灵敏度设置。"""

    def __init__(self, camera: TurntableCamera):
        self.camera = camera
        self.default_state = dict(
            azimuth=camera.azimuth,
            elevation=camera.elevation,
            distance=camera.distance,
            center=tuple(camera.center),
        )

    def reset(self) -> None:
        self.camera.azimuth = self.default_state["azimuth"]
        self.camera.elevation = self.default_state["elevation"]
        self.camera.distance = self.default_state["distance"]
        self.camera.center = self.default_state["center"]

    def zoom(self, factor: float) -> None:
        self.camera.distance = max(2.0, self.camera.distance * factor)
