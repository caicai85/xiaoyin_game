# 3D 粒子中文动画（小音 / 我爱你）

一个可直接运行的 Python 3D 粒子动画项目：粒子在自由漂浮与中文文字重组之间循环切换。

## 功能特性

- 大量多彩粒子（默认 `6500`）在 3D 空间持续运动。
- 循环重组文字：`小音` → `我爱你` → 重复。
- 平滑阶段切换：自由态 / 聚合 / 停留 / 散开。
- 鼠标可交互观察：左键拖拽旋转、滚轮缩放（Turntable 轨道相机）。
- 颜色模式可切换：`pastel` / `rainbow` / `palette`。
- 键盘控制：暂停、重置相机、切换配色。
- 自动窗口自适应、实时 FPS 显示。

## 安装

```bash
pip install -r requirements.txt
```

## 运行

```bash
python main.py
```

## 交互

- 鼠标左键拖动：旋转视角
- 鼠标滚轮：缩放
- `Space`：暂停 / 继续
- `C`：切换颜色风格
- `R`：重置相机
- `+` / `-`：键盘缩放

## 字体说明（中文采样关键）

项目使用 Pillow 在离屏画布绘制中文，再采样像素点作为粒子目标。

默认会按以下路径自动尝试中文字体：

- Linux: `NotoSansCJK` / `wqy-microhei`
- macOS: `PingFang` / `STHeiti`
- Windows: `msyh.ttc` / `simhei.ttf`

如果你机器上没有这些字体，请到 `particle_poem3d/config.py` 的 `preferred_font_paths` 添加可用中文字体路径。

## 核心实现原理（简述）

1. **文字采样**：
   - `text_sampler.py` 将中文文本渲染到灰度图。
   - 提取非透明像素并下采样。
   - 映射到 3D（`z` 方向增加轻微厚度扰动）。

2. **粒子运动系统**：
   - `particle_system.py` 为每粒子维护 position / velocity / color / size / seed。
   - 自由态：正弦组合速度场驱动“漂浮流动”感。
   - 聚字态：目标点吸引（类弹簧）+ 阻尼 + 呼吸抖动。
   - 阶段机循环：free → gather → hold → disperse。

3. **3D 渲染与交互**：
   - `renderer.py` 使用 VisPy `SceneCanvas + Markers` 绘制粒子。
   - `TurntableCamera` 提供轨道相机交互。

## 可调参数

在 `particle_poem3d/config.py` 可调整：

- `particle_count`：粒子数量（建议 3000~12000）
- `timing.*`：各阶段时长
- `space_radius` / `attraction_strength` / `free_noise_strength`
- `color_mode`：默认颜色模式
- `sample_step` / `text_scale` / `text_thickness`：文字采样密度与体积

## 项目结构

```text
xiaoyin_game/
├─ main.py
├─ requirements.txt
├─ README.md
└─ particle_poem3d/
   ├─ __init__.py
   ├─ config.py
   ├─ text_sampler.py
   ├─ particle_system.py
   ├─ orbit_camera.py
   └─ renderer.py
```
