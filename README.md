# MR Player

Interactive MR physics demos.

## Run The Shepp-Logan Excitation Demo

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. The current demo visualizes a 3D Shepp-Logan phantom or homogeneous ellipsoid in a B0 field with excited magnetic moment vectors, off-resonance phase dispersion, T1 recovery, T2 decay, net magnetization, a coil model, and an Mz-over-time trace.

Slice selection can be enabled in the sequence controls. The demo applies a slice-select Gz gradient during RF pulses, derives the selected slab thickness from RF bandwidth / (gamma * Gz), shows the slab and gradient arrows in 3D, and only strongly tips spins inside the selected slice. The timeline includes dedicated RF B1(t) and SSG waveform axes. With slice selection off, RF is shown as a single-frequency hard pulse; with slice selection on, RF is a numerically normalized windowed-sinc pulse with peak B1 and time-bandwidth product readouts.

The vector style control supports classic arrows, slim needles, cone glyphs, and phase disks.

The sequence selector currently supports a single RF pulse and a Spin Echo sequence with adjustable echo time and refocusing angle.

RF pulse timing uses a 3 ms 90-degree reference pulse and scales with flip angle, so the 180-degree refocusing pulse is 6 ms at the same B1 amplitude and is centered at TE/2 in the Spin Echo sequence.

The Spin Echo transverse envelope separates irreversible T2 from reversible inhomogeneity: before the 180-degree pulse it decays as exp(-t/T2) exp(-t/T2_inhom), and after the refocusing pulse it decays as exp(-t/T2) exp(-abs(t - TE)/T2_inhom). The 180-degree pulse smoothly rotates the displayed magnetization vector through its finite pulse window rather than flipping instantly.

The B0 control now uses real proton Larmor precession, with gamma / 2pi = 42.57747892 MHz/T. At the default 1.5 T field, the Larmor frequency is 63.87 MHz and one precession period is about 15.66 ns.

The reference frame selector switches between Laboratory view, which displays the full Larmor precession around B0, and Rotating view, which subtracts the on-resonance B0 rotation so slower off-resonance and relaxation behavior is easier to inspect.

The lower timeline has a video-editor-style loop range: drag the handles on the mini strip to zoom the event track and Mz chart into a shorter window. Playback repeats inside that selected window, which makes the millisecond-scale RF pulse and early dephasing easier to inspect even when T1/T2 settings require a long full cycle.

The signal panel shows both Mz and Mxy traces over the selected time window.

The animation speed slider is logarithmic from 1e-9x to about 3.2x, making real Larmor precession visible while keeping faster speeds available for RF and relaxation events.

The tissue presets provide approximate teaching values for white matter, gray matter, CSF/fluid, fat, and muscle; field strength, sequence, temperature, and fitting method can shift real T1/T2 values.
