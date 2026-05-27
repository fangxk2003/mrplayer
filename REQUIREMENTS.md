# MR Signal Acquisition Visualizer Requirements

Status: Draft
Date: 2026-05-27

## 1. Purpose

Build an educational software tool that visualizes the basic magnetic resonance (MR) signal acquisition process. The first release focuses on a Spin Echo sequence and a 3D vector-field view of magnetic moments, represented as arrows evolving over time.

The tool should help learners see how magnetic moments respond to RF pulses, relaxation, gradients, phase evolution, refocusing, echo formation, and signal readout.

## 2. Product Goals

- Visualize a 3D ensemble of magnetic moments as arrows in a spatial volume.
- Let the user select an MR sequence, starting with Spin Echo.
- Let the user set sequence and tissue parameters.
- Animate the time evolution of magnetization during the sequence.
- Show the relationship between microscopic vectors, net magnetization, RF events, gradients, and the acquired signal.
- Keep the physics model simple enough for real-time interaction while making assumptions visible.
- Support later expansion to Gradient Echo, Inversion Recovery, Fast Spin Echo, EPI, and basic k-space visualization.

## 3. Target Users

- Medical imaging students learning MR physics.
- MRI technologists reviewing acquisition concepts.
- Physics or biomedical engineering learners.
- Instructors creating interactive classroom demonstrations.

## 4. Scope

### 4.1 MVP Scope

The MVP shall include:

- Spin Echo sequence only.
- 3D vector-field visualization of magnetic moments.
- Net magnetization vector display.
- Time controls: play, pause, reset, scrub timeline, step forward/backward.
- User-adjustable Spin Echo parameters:
  - TR
  - TE
  - 90 deg RF pulse flip angle
  - 180 deg refocusing pulse flip angle
  - B0 strength or normalized Larmor frequency
  - T1
  - T2
  - proton density
  - off-resonance frequency
  - gradient strength for phase encoding/readout demonstration
  - vector-grid density
  - animation speed
- Graphs for:
  - Mx, My, Mz over time
  - transverse magnitude Mxy over time
  - received signal magnitude and phase
- Visual markers for pulse sequence events:
  - 90 deg excitation pulse
  - dephasing interval
  - 180 deg refocusing pulse
  - rephasing interval
  - echo at TE
  - acquisition window

### 4.2 Out of Scope for MVP

- Full Bloch simulation with realistic RF pulse waveforms.
- Accurate scanner vendor sequence timing.
- Full image reconstruction.
- Coil sensitivity maps.
- Noise modeling beyond optional simple Gaussian noise.
- Multi-slice acquisition.
- Patient-specific anatomy.
- Regulatory or clinical use.

## 5. User Experience Requirements

### 5.1 Main Layout

The first screen shall be the simulator itself, not a landing page.

Recommended layout:

- Left panel: sequence selection and parameters.
- Center: interactive 3D vector-field viewport.
- Right or bottom panel: sequence timeline and signal graphs.
- Header toolbar: run controls, reset, camera presets, export.

### 5.2 3D View

The 3D viewport shall show:

- A spatial grid or volume containing magnetic moment arrows.
- Arrow direction as local magnetization orientation.
- Arrow length or opacity as magnetization magnitude.
- Color encoding for one selected property:
  - phase
  - Mz
  - off-resonance
  - magnitude
- Axes labels for x, y, z.
- Optional B0 direction indicator.
- Optional RF pulse direction indicator.
- Optional net magnetization arrow.

The user shall be able to:

- Orbit, pan, and zoom the camera.
- Switch between 3D perspective, axial, sagittal, coronal, and transverse-plane views.
- Toggle individual visual layers.
- Adjust vector density to balance clarity and performance.

### 5.3 Sequence Controls

The user shall be able to:

- Select a sequence from a sequence dropdown.
- Change Spin Echo parameters with sliders and numeric inputs.
- Reset parameters to a default teaching preset.
- Save and load parameter presets.
- Scrub through sequence time.
- Slow down or speed up animation independently of physical time.

### 5.4 Graphs and Timeline

The timeline shall:

- Display RF pulses, gradients, acquisition window, and echo time.
- Show a moving time cursor synchronized with the 3D view.
- Allow clicking or dragging to jump to a time point.

Graphs shall:

- Update as parameters change.
- Share the same time cursor.
- Support toggling Mx, My, Mz, Mxy, signal magnitude, and signal phase.

## 6. Physics and Simulation Requirements

### 6.1 Coordinate System

- B0 is aligned with the positive z-axis.
- The transverse plane is x-y.
- RF rotations are modeled as ideal instantaneous rotations in MVP.
- Gradients create position-dependent phase accumulation.

### 6.2 Magnetization State

Each vector sample shall store:

- Position: x, y, z
- Magnetization: Mx, My, Mz
- Tissue parameters: T1, T2, proton density
- Off-resonance value: delta_f
- Phase

### 6.3 Relaxation Model

Between sequence events, magnetization shall evolve using a simplified Bloch model:

- Transverse relaxation: Mxy decays with exp(-dt / T2)
- Longitudinal recovery: Mz returns toward M0 with T1 recovery
- Off-resonance precession: transverse phase accumulates with delta_f
- Gradient dephasing: phase accumulates according to position and gradient strength

### 6.4 RF Pulse Model

The MVP shall model RF pulses as ideal rotations:

- 90 deg pulse rotates longitudinal magnetization into the transverse plane.
- 180 deg pulse flips transverse phase to create refocusing.
- Flip angles shall be adjustable, including imperfect values for teaching.

### 6.5 Spin Echo Event Model

The Spin Echo sequence shall include:

1. Equilibrium state before excitation.
2. 90 deg excitation pulse at t = 0.
3. Dephasing and T2 decay from t = 0 to TE / 2.
4. 180 deg refocusing pulse at t = TE / 2.
5. Rephasing and T2 decay from TE / 2 to TE.
6. Echo peak at t = TE.
7. Signal readout around TE.
8. Recovery toward equilibrium until TR.

### 6.6 Signal Model

The received signal shall be computed as the complex sum of transverse magnetization:

`S(t) = sum_i rho_i * (Mx_i(t) + j * My_i(t))`

The UI shall display:

- signal magnitude: `abs(S)`
- signal phase: `angle(S)`
- real and imaginary channels as optional advanced overlays

## 7. Functional Requirements

### FR-1: Sequence Selection

The system shall provide a sequence selector. The first implemented sequence shall be Spin Echo. Additional sequence names may appear disabled or marked as future.

### FR-2: Parameter Editing

The system shall provide validated controls for all MVP parameters. Invalid values shall be prevented or clearly corrected.

### FR-3: Real-Time Recalculation

Changing a parameter shall update the simulation and visualization without requiring a full page reload.

### FR-4: 3D Vector Field

The system shall render magnetic moment vectors as arrows in 3D. The arrow field shall support at least 10 x 10 x 10 samples on typical modern hardware, with a lower-density fallback.

### FR-5: Time Playback

The system shall animate the full sequence cycle and allow deterministic replay from the same parameter set.

### FR-6: Net Magnetization

The system shall compute and display the ensemble-average net magnetization vector.

### FR-7: Signal Graph

The system shall compute and display the simulated receive signal over time.

### FR-8: Teaching Annotations

The system shall show concise labels for major sequence events, but shall not clutter the 3D view with long explanations.

### FR-9: Export

The system should export:

- current parameter preset as JSON
- current viewport screenshot as PNG
- optional generated animation/video for teaching material

### FR-10: Presets

The system shall include built-in presets:

- Default Spin Echo
- Short TE
- Long TE
- Short TR
- Long TR
- T2 contrast demonstration
- imperfect 180 deg refocusing demonstration

## 8. Non-Functional Requirements

### Performance

- Maintain interactive playback at 30 FPS or better for default vector density.
- Recompute simulation within 200 ms for default settings.
- Use adjustable sample density for slower devices.

### Accuracy

- Use dimensionally consistent equations.
- Clearly document simplified assumptions.
- Include unit labels for all physical parameters.
- Provide reference tests for known Spin Echo behavior:
  - echo peak appears near TE
  - longer T2 preserves more transverse signal
  - longer TR restores more longitudinal magnetization
  - imperfect 180 deg pulses reduce refocusing quality

### Usability

- The simulator shall be usable without reading documentation first.
- Controls shall use domain terminology familiar to MR learners.
- Defaults shall produce a visually clear echo.

### Portability

- Prefer a browser-based implementation for easy sharing.
- Avoid requiring specialized GPU drivers beyond standard WebGL/WebGPU support.

### Maintainability

- Separate simulation logic from rendering logic.
- Keep sequence definitions data-driven where practical.
- Add new sequences by implementing a sequence event generator and parameter schema.

## 9. Recommended Architecture

### 9.1 Preferred Architecture

Use a browser-based interactive app:

- Frontend: TypeScript, React or another lightweight UI framework.
- 3D rendering: Three.js or React Three Fiber.
- Charts: Plotly.js, ECharts, or D3 depending on desired customization.
- Simulation core: TypeScript for MVP, with optional Python/WASM backend later.
- State management: local app state with serializable parameter presets.
- Export: browser screenshot/video capture, plus optional Manim export pipeline.

This is the recommended path because the primary product is interactive software with user-controlled parameters and real-time 3D rendering.

### 9.2 Role of Manim

Manim should be used as an optional companion tool, not the primary runtime for the interactive simulator.

Good uses for Manim:

- scripted explanatory animations
- polished lecture videos
- generated sequence diagrams
- exported educational clips from saved presets
- documentation and tutorials

Weak fit for Manim:

- live parameter sliders
- continuous real-time 3D interaction
- dense vector-field rendering with frequent updates
- browser-first distribution

Manim Community supports 3D scenes, Arrow3D, and vector-field objects, so it can produce attractive static or scripted animations. However, its OpenGL and interactive workflow is less mature as a general app platform than web-native 3D rendering.

### 9.3 Alternative Technology Options

#### Option A: Three.js / React Three Fiber

Best fit for the main application.

Pros:

- Native browser interactivity.
- Direct support for 3D arrows and custom geometry.
- Easy integration with sliders, charts, presets, screenshots, and web deployment.
- Good path to WebGL instancing for many arrows.

Cons:

- Requires implementing or adapting the physics simulation layer.
- More engineering work than a notebook prototype.

#### Option B: PyVista / VTK

Best fit for a Python desktop or scientific prototype.

Pros:

- Strong scientific visualization stack.
- Good support for glyphs, arrows, meshes, scalar fields, and volume rendering.
- Natural fit if simulation code is Python-heavy.

Cons:

- Harder to distribute as a clean web app.
- UI polish requires extra work with Qt, Panel, Trame, or another wrapper.

#### Option C: Plotly / Dash

Best fit for a quick browser prototype.

Pros:

- Built-in 3D cone plots for vector fields.
- Fast to build parameter dashboards.
- Good for notebooks and demos.

Cons:

- Less control over dense, animated, high-performance vector fields.
- More limited for custom 3D interaction and teaching-specific visual design.

#### Option D: Manim Only

Best fit for video generation, not the main interactive product.

Pros:

- Excellent animation grammar for education.
- Beautiful scripted transitions.
- Useful for producing consistent teaching clips.

Cons:

- Not ideal as the interactive app runtime.
- Parameter changes usually imply regenerating or rerunning scenes.
- Interactive OpenGL path is not the center of Manim's ecosystem.

## 10. MVP Milestones

### Milestone 1: Physics Prototype

- Implement Spin Echo event schedule.
- Implement simplified magnetization update functions.
- Verify Mx, My, Mz, Mxy, and signal curves.
- Add unit tests for relaxation and echo timing.

### Milestone 2: 3D Visualization Prototype

- Render a 3D arrow grid.
- Animate arrows from simulation frames.
- Add camera controls and density control.
- Add net magnetization vector.

### Milestone 3: Interactive UI

- Add sequence selector.
- Add parameter controls.
- Add play/pause/scrub timeline.
- Add synchronized signal graphs.

### Milestone 4: Teaching Polish

- Add event labels and visual pulse markers.
- Add presets.
- Add color modes.
- Add screenshots and preset export.

### Milestone 5: Optional Manim Export

- Convert saved preset and sequence timeline into a Manim scene.
- Render polished MP4 clips for classroom use.
- Keep Manim export separate from the real-time simulator.

## 11. Acceptance Criteria

The MVP is acceptable when:

- A user can open the app and run a default Spin Echo animation.
- The 3D arrows tip into the transverse plane after the 90 deg pulse.
- Arrows dephase before TE / 2.
- The 180 deg pulse visibly reverses phase dispersion.
- Arrows rephase near TE.
- The signal graph peaks near TE.
- Changing TE, TR, T1, T2, and flip angles changes the visualization plausibly.
- The default vector field runs smoothly at the target density.
- The user can save a preset and restore it.
- The assumptions and limitations are documented in the app or project docs.

## 12. Future Roadmap

- Gradient Echo sequence.
- Inversion Recovery sequence.
- Fast Spin Echo / Turbo Spin Echo.
- EPI timing and distortion demonstration.
- k-space trajectory visualization.
- Multiple tissue compartments.
- Slice selection model.
- RF pulse waveform visualization.
- Noise and SNR controls.
- Receive coil sensitivity visualization.
- Manim-generated lecture clips from simulator states.
- WebGPU acceleration for larger vector fields.

## 13. Risks and Mitigations

### Risk: Dense 3D arrows may become visually cluttered.

Mitigation: provide density control, slicing planes, transparency, color modes, and net-vector overlays.

### Risk: Physics accuracy may outgrow the simple model.

Mitigation: keep the simulation engine modular, document assumptions, and add tests before adding sequence complexity.

### Risk: Manim may slow down interactive development.

Mitigation: use Manim only for export and teaching clips while using Three.js or PyVista for live interaction.

### Risk: Users may confuse simplified behavior with clinical scanner behavior.

Mitigation: label the tool as educational and include clear model limitations.

## 14. Documentation Requirements

The project documentation shall include:

- Quick start.
- Parameter glossary.
- Physics model notes.
- Supported sequences.
- Known simplifications.
- Examples of teaching presets.
- Developer guide for adding a new sequence.

## 15. Recommended Initial Decision

Build the main simulator with Three.js or React Three Fiber, and keep Manim as an optional export layer for polished explanatory animations.

If the project must remain Python-first, use PyVista/VTK for the prototype and revisit a web frontend after the physics model is stable.

## 16. References Checked

- Manim Community ThreeDScene documentation: https://docs.manim.community/en/stable/reference/manim.scene.three_d_scene.ThreeDScene.html
- Manim Community 3D mobjects including Arrow3D: https://docs.manim.community/en/stable/reference/manim.mobject.three_d.three_dimensions.html
- Manim Community VectorField documentation: https://docs.manim.community/en/stable/reference/manim.mobject.vector_field.VectorField.html
- Manim Community OpenGL FAQ: https://docs.manim.community/en/stable/faq/opengl.html
- Three.js ArrowHelper documentation: https://threejs.org/docs/pages/ArrowHelper.html
- PyVista glyph/vector plotting documentation: https://docs.pyvista.org/examples/01-filter/glyph.html
- Plotly 3D cone plot documentation: https://plotly.com/python/cone-plot/
- VTK documentation: https://docs.vtk.org/en/latest/
