# MR Player

Interactive MR physics demos.

## Run The Shepp-Logan Excitation Demo

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. The current demo visualizes a 3D Shepp-Logan phantom or homogeneous ellipsoid in a B0 field with excited magnetic moment vectors, off-resonance phase dispersion, T1 recovery, T2 decay, net magnetization, a coil model, and an Mz-over-time trace.

The vector style control supports classic arrows, slim needles, cone glyphs, and phase disks.

The sequence selector currently supports a single RF pulse and a Spin Echo sequence with adjustable echo time and refocusing angle.

The lower timeline has a video-editor-style loop range: drag the handles on the mini strip to zoom the event track and Mz chart into a shorter window. Playback repeats inside that selected window, which makes the RF pulse and early dephasing easier to inspect even when T1/T2 settings require a long full cycle.

The tissue presets provide approximate teaching values for white matter, gray matter, CSF/fluid, fat, and muscle; field strength, sequence, temperature, and fitting method can shift real T1/T2 values.
