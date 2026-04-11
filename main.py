from __future__ import annotations

import numpy as np

from particle_poem3d.config import DEFAULT_CONFIG
from particle_poem3d.particle_system import ParticleSystem3D
from particle_poem3d.renderer import ParticleApp
from particle_poem3d.text_sampler import sample_text_points


def main() -> None:
    config = DEFAULT_CONFIG
    rng = np.random.default_rng(12345)

    text_targets = [sample_text_points(text, config, rng) for text in config.text_sequence]

    system = ParticleSystem3D(config=config, text_targets=text_targets)
    app = ParticleApp(config=config, system=system)
    app.run()


if __name__ == "__main__":
    main()
