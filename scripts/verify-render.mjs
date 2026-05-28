import fs from 'node:fs/promises';

const debugPort = Number(process.env.CDP_PORT || 9333);
const targetUrl = process.env.TARGET_URL || 'http://127.0.0.1:5173/';

const checks = [
  { name: 'desktop', width: 1440, height: 960, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

const browserInfo = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
const pageInfo = await createPage(debugPort);
const cdp = await connectCdp(pageInfo.webSocketDebuggerUrl || browserInfo.webSocketDebuggerUrl);

const events = {
  console: [],
  exceptions: [],
  logs: [],
};

cdp.on('Runtime.consoleAPICalled', (event) => {
  events.console.push(event.args?.map((arg) => arg.value || arg.description).join(' '));
});
cdp.on('Runtime.exceptionThrown', (event) => {
  events.exceptions.push(event.exceptionDetails?.text || event.exceptionDetails?.exception?.description || 'Exception');
});
cdp.on('Log.entryAdded', (event) => {
  events.logs.push(event.entry?.text || 'Log entry');
});

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');

const results = [];

for (const check of checks) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: check.width,
    height: check.height,
    deviceScaleFactor: 1,
    mobile: check.mobile,
  });
  await navigateAndWait(cdp, targetUrl);
  await waitForRender(cdp);
  await delay(500);
  await waitForRender(cdp);

  const stats = await evaluate(cdp, `(() => {
    const canvas = document.querySelector('#scene canvas');
    const readout = document.querySelector('#sampleReadout')?.textContent || '';
    const errors = window.__mrDemoErrors || [];
    const appStats = window.__mrDemoStats || null;
    if (!canvas) {
      return { ok: false, reason: 'No canvas', readout, errors, appStats };
    }

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      return { ok: false, reason: 'No WebGL context', width: canvas.width, height: canvas.height, readout, errors, appStats };
    }

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const strideX = Math.max(1, Math.floor(width / 96));
    const strideY = Math.max(1, Math.floor(height / 72));
    const pixel = new Uint8Array(4);
    let bright = 0;
    let colored = 0;
    let checked = 0;

    for (let y = 0; y < height; y += strideY) {
      for (let x = 0; x < width; x += strideX) {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const max = Math.max(pixel[0], pixel[1], pixel[2]);
        const min = Math.min(pixel[0], pixel[1], pixel[2]);
        if (max > 38) bright += 1;
        if (max - min > 18) colored += 1;
        checked += 1;
      }
    }

    return {
      ok: true,
      width,
      height,
      readout,
      errors,
      appStats,
      checked,
      brightRatio: bright / checked,
      coloredRatio: colored / checked,
    };
  })()`);

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await fs.writeFile(`${check.name}-demo.png`, Buffer.from(screenshot.data, 'base64'));
  const styleResults = await evaluate(cdp, `new Promise((resolve) => {
    const styles = ['classic', 'needle', 'cone', 'phase'];
    const select = document.querySelector('#vectorStyle');
    const results = [];
    let index = 0;

    function next() {
      if (!select || index >= styles.length) {
        resolve(results);
        return;
      }

      const style = styles[index];
      index += 1;
      select.value = style;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          results.push({
            style,
            value: select.value,
            samples: window.__mrDemoStats?.samples || 0,
            errors: [...(window.__mrDemoErrors || [])],
          });
          next();
        });
      });
    }

    next();
  })`);
  const sequenceResults = await evaluate(cdp, `new Promise((resolve) => {
    const sequences = ['single-pulse', 'spin-echo'];
    const select = document.querySelector('#sequenceType');
    const results = [];
    let index = 0;

    function chartStats(selector) {
      const canvas = document.querySelector(selector);
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        return { ok: false };
      }

      const width = canvas.width;
      const height = canvas.height;
      const data = ctx.getImageData(0, 0, width, height).data;
      let bright = 0;
      for (let i = 0; i < data.length; i += 16) {
        if (Math.max(data[i], data[i + 1], data[i + 2]) > 34) {
          bright += 1;
        }
      }
      return { ok: true, width, height, bright };
    }

    function next() {
      if (!select || index >= sequences.length) {
        resolve(results);
        return;
      }

      const sequence = sequences[index];
      index += 1;
      select.value = sequence;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          results.push({
            sequence,
            value: select.value,
            appSequence: window.__mrDemoStats?.sequence,
            referenceFrame: window.__mrDemoStats?.referenceFrame,
            samples: window.__mrDemoStats?.samples || 0,
            loopStart: window.__mrDemoStats?.loopStart,
            loopEnd: window.__mrDemoStats?.loopEnd,
            cycleSeconds: window.__mrDemoStats?.cycleSeconds,
            rf90Seconds: window.__mrDemoStats?.rf90Seconds,
            refocusSeconds: window.__mrDemoStats?.refocusSeconds,
            refocusCenter: window.__mrDemoStats?.refocusCenter,
            echoTime: window.__mrDemoStats?.echoTime,
            hasLoopControls: Boolean(document.querySelector('#loopStrip') && document.querySelector('#loopStartHandle') && document.querySelector('#loopEndHandle')),
            spinEchoControlsHidden: [...document.querySelectorAll('.spin-echo-only')].every((item) => item.hidden),
            eventZones: document.querySelectorAll('.event-zone').length,
            eventMarkers: document.querySelectorAll('.event-marker').length,
            coilToggle: Boolean(document.querySelector('#showCoil')?.checked),
            rfChart: chartStats('#rfChart'),
            ssgChart: chartStats('#ssgChart'),
            chart: chartStats('#mzChart'),
            mxyChart: chartStats('#mxyChart'),
            errors: [...(window.__mrDemoErrors || [])],
          });
          next();
        });
      });
    }

    next();
  })`);
  const loopResults = await evaluate(cdp, `(() => {
    const setter = window.__mrDemoSetLoopRange;
    const strip = document.querySelector('#loopStrip');
    const selection = document.querySelector('#loopSelection');
    const startHandle = document.querySelector('#loopStartHandle');
    const endHandle = document.querySelector('#loopEndHandle');
    const chart = document.querySelector('#mzChart');

    const setResult = typeof setter === 'function' ? setter(0.02, 0.12) : null;
    const stats = window.__mrDemoStats || {};
    const ctx = chart?.getContext('2d');
    let chartBright = 0;
    if (chart && ctx) {
      const data = ctx.getImageData(0, 0, chart.width, chart.height).data;
      for (let i = 0; i < data.length; i += 16) {
        if (Math.max(data[i], data[i + 1], data[i + 2]) > 34) {
          chartBright += 1;
        }
      }
    }

    return {
      hasControls: Boolean(strip && selection && startHandle && endHandle),
      setResult,
      loopStart: stats.loopStart,
      loopEnd: stats.loopEnd,
      loopSpan: stats.loopSpan,
      localTime: stats.localTime,
      cycleSeconds: stats.cycleSeconds,
      startReadout: document.querySelector('#loopStartReadout')?.textContent || '',
      endReadout: document.querySelector('#loopEndReadout')?.textContent || '',
      zoomReadout: document.querySelector('#zoomReadout')?.textContent || '',
      eventZones: document.querySelectorAll('#eventTrack .event-zone').length,
      selectionWidth: selection ? Number.parseFloat(getComputedStyle(selection).width) : 0,
      chartBright,
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const frameResults = await evaluate(cdp, `(() => {
    const frame = document.querySelector('#referenceFrame');
    const sequence = document.querySelector('#sequenceType');
    if (!frame) {
      return { ok: false, reason: 'Missing reference frame control' };
    }

    if (sequence) {
      sequence.value = 'single-pulse';
      sequence.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const setter = window.__mrDemoSetLoopRange;
    if (typeof setter === 'function') {
      setter(0.02, 0.12);
    }

    const samples = [];
    for (const value of ['laboratory', 'rotating']) {
      frame.value = value;
      frame.dispatchEvent(new Event('change', { bubbles: true }));
      samples.push({
        value: frame.value,
        appFrame: window.__mrDemoStats?.referenceFrame,
        displayedMainFieldCycles: window.__mrDemoStats?.displayedMainFieldCycles,
        localTime: window.__mrDemoStats?.localTime,
        larmorHz: window.__mrDemoStats?.larmorHz,
        phaseLabel: document.querySelector('#phaseLabelB')?.textContent || '',
      });
    }

    return {
      ok: true,
      samples,
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const speedResults = await evaluate(cdp, `(() => {
    const speed = document.querySelector('#speed');
    const readout = document.querySelector('#speedValue');
    if (!speed || !readout) {
      return { ok: false, reason: 'Missing speed control' };
    }

    const samples = [];
    for (const value of ['-9', '-6', '-2', '0', '0.5']) {
      speed.value = value;
      speed.dispatchEvent(new Event('input', { bubbles: true }));
      samples.push({
        value: speed.value,
        readout: readout.textContent,
        appSpeed: window.__mrDemoStats?.speed,
        slider: window.__mrDemoStats?.speedSlider,
      });
    }

    return {
      ok: true,
      min: speed.min,
      max: speed.max,
      step: speed.step,
      samples,
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const fieldResults = await evaluate(cdp, `(() => {
    const field = document.querySelector('#b0Rate');
    const fieldReadout = document.querySelector('#b0Value');
    const larmorReadout = document.querySelector('#larmorValue');
    const periodReadout = document.querySelector('#larmorPeriodValue');
    if (!field || !fieldReadout || !larmorReadout || !periodReadout) {
      return { ok: false, reason: 'Missing B0/Larmor controls' };
    }

    field.value = '1.5';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const stats = window.__mrDemoStats || {};
    return {
      ok: true,
      min: field.min,
      max: field.max,
      step: field.step,
      value: field.value,
      fieldReadout: fieldReadout.textContent,
      larmorReadout: larmorReadout.textContent,
      periodReadout: periodReadout.textContent,
      b0Tesla: stats.b0Tesla,
      larmorHz: stats.larmorHz,
      larmorPeriodSeconds: stats.larmorPeriodSeconds,
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const numberInputResults = await evaluate(cdp, `(() => {
    const ranges = [...document.querySelectorAll('input[type="range"]')];

    function numberFor(id) {
      return document.querySelector('#' + id)?.closest('.range-input-pair')?.querySelector('.range-number') || null;
    }

    function commit(id, value) {
      const range = document.querySelector('#' + id);
      const number = numberFor(id);
      if (!range || !number) {
        return { ok: false, id };
      }

      number.value = value;
      number.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        ok: true,
        id,
        range: range.value,
        number: number.value,
        numericNumber: Number(number.value),
      };
    }

    const all = ranges.map((range) => {
      const number = numberFor(range.id);
      const control = range.closest('.control');
      const output = control?.querySelector('output') || null;
      const unit = range.closest('.range-input-pair')?.querySelector('.range-number-unit') || null;
      return {
        id: range.id,
        hasPair: Boolean(range.closest('.range-input-pair')),
        hasNumber: Boolean(number),
        unit: unit?.textContent || '',
        outputHidden: output ? getComputedStyle(output).display === 'none' : false,
        rangeMin: range.min,
        rangeMax: range.max,
        numberMin: number?.min || '',
        numberMax: number?.max || '',
        numberStep: number?.step || '',
      };
    });

    const tests = {
      t1High: commit('t1', '9999'),
      t1Low: commit('t1', '100'),
      echoHigh: commit('echoTime', '9999'),
      echoLow: commit('echoTime', '-1'),
      speedLow: commit('speed', '0'),
      speedHigh: commit('speed', '999'),
      sliceHigh: commit('sliceCenter', '999'),
      sliceLow: commit('sliceCenter', '-999'),
      densityHigh: commit('density', '99'),
    };

    return {
      ok: true,
      rangeCount: ranges.length,
      numberCount: document.querySelectorAll('.range-number').length,
      all,
      tests,
      readouts: {
        t1: document.querySelector('#t1Value')?.textContent || '',
        echoTime: document.querySelector('#teValue')?.textContent || '',
        speed: document.querySelector('#speedValue')?.textContent || '',
        sliceCenter: document.querySelector('#sliceCenterValue')?.textContent || '',
        density: document.querySelector('#densityValue')?.textContent || '',
      },
      stats: window.__mrDemoStats || {},
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const rfResults = await evaluate(cdp, `(() => {
    const sequence = document.querySelector('#sequenceType');
    const enable = document.querySelector('#sliceGradientEnabled');
    const bandwidth = document.querySelector('#rfBandwidth');
    const center = document.querySelector('#sliceCenter');
    const gradient = document.querySelector('#sliceGradient');
    const probe = window.__mrDemoGetRfProbe;
    const chart = document.querySelector('#rfChart');

    if (!sequence || !enable || !bandwidth || !center || !gradient || typeof probe !== 'function' || !chart) {
      return { ok: false, reason: 'Missing RF waveform controls' };
    }

    sequence.value = 'single-pulse';
    sequence.dispatchEvent(new Event('change', { bubbles: true }));
    enable.checked = false;
    enable.dispatchEvent(new Event('change', { bubbles: true }));
    const hard = probe();

    sequence.value = 'spin-echo';
    sequence.dispatchEvent(new Event('change', { bubbles: true }));
    enable.checked = true;
    enable.dispatchEvent(new Event('change', { bubbles: true }));
    bandwidth.value = '4';
    bandwidth.dispatchEvent(new Event('input', { bubbles: true }));
    center.value = '20';
    center.dispatchEvent(new Event('input', { bubbles: true }));
    gradient.value = '5';
    gradient.dispatchEvent(new Event('input', { bubbles: true }));
    const sinc = probe();

    const ctx = chart.getContext('2d');
    const data = ctx.getImageData(0, 0, chart.width, chart.height).data;
    let bright = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 34) {
        bright += 1;
      }
    }

    return {
      ok: true,
      hard,
      sinc,
      chart: { ok: true, width: chart.width, height: chart.height, bright },
      modeReadout: document.querySelector('#rfModeValue')?.textContent || '',
      centerReadout: document.querySelector('#rfCenterValue')?.textContent || '',
      peakReadout: document.querySelector('#rfPeakB1Value')?.textContent || '',
      tbwReadout: document.querySelector('#rfTbwValue')?.textContent || '',
      chartReadout: document.querySelector('#chartRfReadout')?.textContent || '',
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const sliceResults = await evaluate(cdp, `(() => {
    const sequence = document.querySelector('#sequenceType');
    const enable = document.querySelector('#sliceGradientEnabled');
    const center = document.querySelector('#sliceCenter');
    const gradient = document.querySelector('#sliceGradient');
    const bandwidth = document.querySelector('#rfBandwidth');
    const centerReadout = document.querySelector('#sliceCenterValue');
    const gradientReadout = document.querySelector('#sliceGradientValue');
    const bandwidthReadout = document.querySelector('#rfBandwidthValue');
    const thicknessReadout = document.querySelector('#sliceThicknessValue');
    const showSlice = document.querySelector('#showSlice');
    const showSliceVectorsOnly = document.querySelector('#showSliceVectorsOnly');
    const probe = window.__mrDemoGetSliceProbe;
    const spinEchoProbe = window.__mrDemoGetSpinEchoProbe;

    if (!sequence || !enable || !center || !gradient || !bandwidth || !showSliceVectorsOnly || typeof probe !== 'function' || typeof spinEchoProbe !== 'function') {
      return { ok: false, reason: 'Missing slice selection controls' };
    }

    sequence.value = 'spin-echo';
    sequence.dispatchEvent(new Event('change', { bubbles: true }));
    enable.checked = true;
    enable.dispatchEvent(new Event('change', { bubbles: true }));
    center.value = '20';
    center.dispatchEvent(new Event('input', { bubbles: true }));
    gradient.value = '5';
    gradient.dispatchEvent(new Event('input', { bubbles: true }));
    bandwidth.value = '4';
    bandwidth.dispatchEvent(new Event('input', { bubbles: true }));

    const enabledProbe = probe();
    const outsideMomentProbe = spinEchoProbe();
    const enabledStats = window.__mrDemoStats || {};
    showSliceVectorsOnly.checked = true;
    showSliceVectorsOnly.dispatchEvent(new Event('change', { bubbles: true }));
    const sliceOnlyStats = window.__mrDemoStats || {};
    const enabledZones = [...document.querySelectorAll('.event-zone')].map((zone) => zone.className);
    const ssgChart = (() => {
      const canvas = document.querySelector('#ssgChart');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        return { ok: false };
      }
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let bright = 0;
      for (let i = 0; i < data.length; i += 16) {
        if (Math.max(data[i], data[i + 1], data[i + 2]) > 34) {
          bright += 1;
        }
      }
      return { ok: true, width: canvas.width, height: canvas.height, bright };
    })();
    const ssgReadout = document.querySelector('#chartSsgReadout')?.textContent || '';

    enable.checked = false;
    enable.dispatchEvent(new Event('change', { bubbles: true }));
    const sliceOnlyNoGradientStats = window.__mrDemoStats || {};
    const disabledProbe = probe();
    const disabledZones = [...document.querySelectorAll('.event-zone')].map((zone) => zone.className);

    showSliceVectorsOnly.checked = false;
    showSliceVectorsOnly.dispatchEvent(new Event('change', { bubbles: true }));
    enable.checked = true;
    enable.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      ok: true,
      centerValue: center.value,
      gradientValue: gradient.value,
      bandwidthValue: bandwidth.value,
      centerReadout: centerReadout?.textContent || '',
      gradientReadout: gradientReadout?.textContent || '',
      bandwidthReadout: bandwidthReadout?.textContent || '',
      thicknessReadout: thicknessReadout?.textContent || '',
      showSliceChecked: Boolean(showSlice?.checked),
      showSliceVectorsOnlyChecked: Boolean(showSliceVectorsOnly?.checked),
      enabledProbe,
      outsideMomentProbe,
      disabledProbe,
      enabledStats,
      sliceOnlyStats,
      sliceOnlyNoGradientStats,
      enabledZones,
      disabledZones,
      ssgChart,
      ssgReadout,
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const spinEchoEnvelopeResults = await evaluate(cdp, `(() => {
    const sequence = document.querySelector('#sequenceType');
    const frame = document.querySelector('#referenceFrame');
    const echoTime = document.querySelector('#echoTime');
    const offRes = document.querySelector('#offRes');
    const sliceEnable = document.querySelector('#sliceGradientEnabled');
    const envelopeAt = window.__mrDemoGetSpinEchoEnvelope;
    const probe = window.__mrDemoGetSpinEchoProbe;

    if (!sequence || !frame || !echoTime || !offRes || !sliceEnable || typeof envelopeAt !== 'function' || typeof probe !== 'function') {
      return { ok: false, reason: 'Missing spin-echo envelope probes' };
    }

    sequence.value = 'spin-echo';
    sequence.dispatchEvent(new Event('change', { bubbles: true }));
    echoTime.value = '0.16';
    echoTime.dispatchEvent(new Event('input', { bubbles: true }));
    sliceEnable.checked = false;
    sliceEnable.dispatchEvent(new Event('change', { bubbles: true }));
    frame.value = 'rotating';
    frame.dispatchEvent(new Event('change', { bubbles: true }));
    offRes.value = '0.45';
    offRes.dispatchEvent(new Event('input', { bubbles: true }));

    const times = [0.04, 0.16, 0.2];
    const samples = times.map((time) => {
      const envelope = envelopeAt(time);
      const expectedT2Decay = Math.exp(-envelope.timeSinceExcitation / envelope.t2Seconds);
      const expectedInhomDecay = Number.isFinite(envelope.t2Inhom)
        ? Math.exp(-envelope.inhomElapsed / envelope.t2Inhom)
        : 1;
      return {
        time,
        envelope,
        expectedT2Decay,
        expectedInhomDecay,
        expectedTransverse: expectedT2Decay * expectedInhomDecay,
      };
    });
    const inversion = probe();

    return {
      ok: true,
      samples,
      inversion,
      errors: [...(window.__mrDemoErrors || [])],
    };
  })()`);
  const tissueResults = await evaluate(cdp, `new Promise((resolve) => {
    const presets = [
      { key: 'whiteMatter', t1: '850', t2: '80' },
      { key: 'grayMatter', t1: '1300', t2: '100' },
      { key: 'csf', t1: '4000', t2: '2000' },
      { key: 'fat', t1: '250', t2: '70' },
      { key: 'muscle', t1: '900', t2: '50' },
    ];
    const select = document.querySelector('#tissuePreset');
    const t1 = document.querySelector('#t1');
    const t2 = document.querySelector('#t2');
    const results = [];
    let index = 0;

    function next() {
      if (!select || !t1 || !t2 || index >= presets.length) {
        resolve(results);
        return;
      }

      const preset = presets[index];
      index += 1;
      select.value = preset.key;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      requestAnimationFrame(() => {
        results.push({
          preset: preset.key,
          value: select.value,
          t1: t1.value,
          t2: t2.value,
          expectedT1: preset.t1,
          expectedT2: preset.t2,
          appPreset: window.__mrDemoStats?.tissuePreset,
          appT1: String(window.__mrDemoStats?.t1Ms),
          appT2: String(window.__mrDemoStats?.t2Ms),
          errors: [...(window.__mrDemoErrors || [])],
        });
        next();
      });
    }

    next();
  })`);
  const phantomResults = await evaluate(cdp, `new Promise((resolve) => {
    const phantoms = ['shepp-logan', 'ellipsoid'];
    const select = document.querySelector('#phantomType');
    const results = [];
    let index = 0;

    function next() {
      if (!select || index >= phantoms.length) {
        resolve(results);
        return;
      }

      const phantom = phantoms[index];
      index += 1;
      select.value = phantom;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          results.push({
            phantom,
            value: select.value,
            appPhantom: window.__mrDemoStats?.phantomType,
            samples: window.__mrDemoStats?.samples || 0,
            readout: document.querySelector('#sampleReadout')?.textContent || '',
            errors: [...(window.__mrDemoErrors || [])],
          });
          next();
        });
      });
    }

    next();
  })`);
  results.push({
    ...check,
    stats,
    styleResults,
    sequenceResults,
    loopResults,
    frameResults,
    speedResults,
    fieldResults,
    numberInputResults,
    rfResults,
    spinEchoEnvelopeResults,
    sliceResults,
    tissueResults,
    phantomResults,
  });
}

await cdp.send('Page.close').catch(() => {});
cdp.close();

const failed = results.filter((result) => {
  const stats = result.stats;
  return !stats.ok
    || stats.errors.length > 0
    || Number(stats.readout) <= 0
    || !stats.appStats?.ready
    || stats.appStats.samples <= 0
    || stats.brightRatio < 0.01
    || stats.coloredRatio < 0.005
    || result.styleResults.some((style) => (
      style.value !== style.style
      || style.samples <= 0
      || style.errors.length > 0
    ))
    || result.sequenceResults.some((sequence) => (
      sequence.value !== sequence.sequence
      || sequence.appSequence !== sequence.sequence
      || !['laboratory', 'rotating'].includes(sequence.referenceFrame)
      || sequence.samples <= 0
      || sequence.errors.length > 0
      || !sequence.hasLoopControls
      || sequence.loopEnd <= sequence.loopStart
      || sequence.loopEnd >= sequence.cycleSeconds
      || Math.abs(sequence.rf90Seconds - 0.003) > 0.00001
      || (sequence.sequence === 'spin-echo' && (
        Math.abs(sequence.refocusSeconds - 0.006) > 0.00001
        || Math.abs(sequence.refocusCenter - sequence.echoTime / 2) > 0.00001
      ))
      || !sequence.coilToggle
      || !sequence.rfChart.ok
      || sequence.rfChart.bright <= 0
      || !sequence.ssgChart.ok
      || sequence.ssgChart.bright <= 0
      || !sequence.chart.ok
      || sequence.chart.bright <= 0
      || !sequence.mxyChart.ok
      || sequence.mxyChart.bright <= 0
      || (sequence.sequence === 'single-pulse' && !sequence.spinEchoControlsHidden)
      || (sequence.sequence === 'spin-echo' && (
        sequence.spinEchoControlsHidden
        || sequence.eventZones !== 1
        || sequence.eventMarkers < 1
      ))
    ))
    || result.tissueResults.some((preset) => (
      preset.value !== preset.preset
      || preset.t1 !== preset.expectedT1
      || preset.t2 !== preset.expectedT2
      || preset.appPreset !== preset.preset
      || preset.appT1 !== preset.expectedT1
      || preset.appT2 !== preset.expectedT2
      || preset.errors.length > 0
    ))
    || result.phantomResults.some((phantom) => (
      phantom.value !== phantom.phantom
      || phantom.appPhantom !== phantom.phantom
      || phantom.samples <= 0
      || Number(phantom.readout) <= 0
      || phantom.errors.length > 0
    ))
    || !result.loopResults.hasControls
    || result.loopResults.errors.length > 0
    || result.loopResults.loopStart < 0.019
    || result.loopResults.loopEnd > 0.121
    || result.loopResults.loopSpan <= 0.03
    || result.loopResults.localTime < result.loopResults.loopStart
    || result.loopResults.localTime > result.loopResults.loopEnd
    || result.loopResults.selectionWidth <= 0
    || result.loopResults.chartBright <= 0
    || !result.frameResults.ok
    || result.frameResults.errors.length > 0
    || result.frameResults.samples.length !== 2
    || result.frameResults.samples.some((sample) => sample.value !== sample.appFrame)
    || result.frameResults.samples.some((sample) => (
      sample.value === 'laboratory'
      && Math.abs(sample.displayedMainFieldCycles - sample.larmorHz * sample.localTime) > 0.01
    ))
    || result.frameResults.samples.some((sample) => (
      sample.value === 'rotating'
      && (Math.abs(sample.displayedMainFieldCycles) > 0.000001 || sample.phaseLabel !== 'Rotating-frame off-resonance')
    ))
    || !result.speedResults.ok
    || result.speedResults.errors.length > 0
    || result.speedResults.min !== '-9'
    || result.speedResults.max !== '0.5'
    || result.speedResults.step !== '0.01'
    || result.speedResults.samples.some((sample) => {
      const expected = 10 ** Number(sample.value);
      return Math.abs(sample.appSpeed - expected) > 0.000001
        || Number(sample.slider) !== Number(sample.value)
        || !sample.readout.endsWith('x');
    })
    || !result.fieldResults.ok
    || result.fieldResults.errors.length > 0
    || result.fieldResults.min !== '0.05'
    || result.fieldResults.max !== '7'
    || result.fieldResults.step !== '0.05'
    || Math.abs(result.fieldResults.b0Tesla - 1.5) > 0.000001
    || Math.abs(result.fieldResults.larmorHz - 63866218.38) > 2
    || Math.abs(result.fieldResults.larmorPeriodSeconds - (1 / 63866218.38)) > 1e-16
    || result.fieldResults.fieldReadout !== '1.50 T'
    || result.fieldResults.larmorReadout !== '63.87 MHz'
    || result.fieldResults.periodReadout !== '15.66 ns'
    || !result.numberInputResults.ok
    || result.numberInputResults.errors.length > 0
    || result.numberInputResults.rangeCount <= 0
    || result.numberInputResults.rangeCount !== result.numberInputResults.numberCount
    || result.numberInputResults.all.some((control) => (
      !control.hasPair
      || !control.hasNumber
      || !control.outputHidden
      || control.numberMin === ''
      || control.numberMax === ''
    ))
    || result.numberInputResults.all.some((control) => (
      control.id !== 'density'
      && control.unit === ''
    ))
    || result.numberInputResults.tests.t1High.range !== '5000'
    || result.numberInputResults.tests.t1High.number !== '5000'
    || result.numberInputResults.tests.t1Low.range !== '200'
    || result.numberInputResults.tests.t1Low.number !== '200'
    || result.numberInputResults.tests.echoHigh.range !== '0.5'
    || result.numberInputResults.tests.echoHigh.number !== '500'
    || result.numberInputResults.tests.echoLow.range !== '0.08'
    || result.numberInputResults.tests.echoLow.number !== '80'
    || result.numberInputResults.tests.speedLow.range !== '-9'
    || Math.abs(result.numberInputResults.tests.speedLow.numericNumber - 1e-9) > 1e-12
    || result.numberInputResults.tests.speedHigh.range !== '0.5'
    || Math.abs(result.numberInputResults.tests.speedHigh.numericNumber - (10 ** 0.5)) > 0.0001
    || result.numberInputResults.tests.sliceHigh.range !== '90'
    || result.numberInputResults.tests.sliceHigh.number !== '90'
    || result.numberInputResults.tests.sliceLow.range !== '-90'
    || result.numberInputResults.tests.sliceLow.number !== '-90'
    || result.numberInputResults.tests.densityHigh.range !== '16'
    || result.numberInputResults.tests.densityHigh.number !== '16'
    || !result.rfResults.ok
    || result.rfResults.errors.length > 0
    || !result.rfResults.chart.ok
    || result.rfResults.chart.bright <= 0
    || result.rfResults.hard.mode !== 'Single frequency'
    || result.rfResults.hard.sliceGradientEnabled !== false
    || result.rfResults.hard.pulses.length !== 1
    || Math.abs(result.rfResults.hard.pulses[0].peakTesla - (Math.PI / 2) / (2 * Math.PI * 42577478.92 * 0.003)) > 1e-10
    || result.rfResults.hard.pulses[0].tbw !== null
    || result.rfResults.sinc.mode !== 'Windowed sinc'
    || result.rfResults.sinc.sliceGradientEnabled !== true
    || result.rfResults.sinc.pulses.length !== 2
    || Math.abs(result.rfResults.sinc.pulses[0].tbw - 12) > 0.000001
    || Math.abs(result.rfResults.sinc.pulses[1].tbw - 24) > 0.000001
    || result.rfResults.sinc.pulses[0].peakTesla <= result.rfResults.hard.pulses[0].peakTesla
    || Math.abs(result.rfResults.sinc.carrierHz - (63866218.38 + 42577478.92 * 0.005 * 0.02)) > 2
    || result.rfResults.modeReadout !== 'Windowed sinc'
    || result.rfResults.tbwReadout !== '12.0'
    || !result.rfResults.peakReadout.endsWith('uT')
    || !result.rfResults.chartReadout.endsWith('T')
    || !result.sliceResults.ok
    || result.sliceResults.errors.length > 0
    || result.sliceResults.centerValue !== '20'
    || result.sliceResults.gradientValue !== '5'
    || result.sliceResults.bandwidthValue !== '4'
    || result.sliceResults.centerReadout !== '20 mm'
    || result.sliceResults.gradientReadout !== '5.0 mT/m'
    || result.sliceResults.bandwidthReadout !== '4.0 kHz'
    || !result.sliceResults.thicknessReadout.endsWith('mm')
    || !result.sliceResults.showSliceChecked
    || !result.sliceResults.ssgChart.ok
    || result.sliceResults.ssgChart.bright <= 0
    || !result.sliceResults.ssgReadout.endsWith('mT/m')
    || !result.sliceResults.enabledProbe.enabled
    || Math.abs(result.sliceResults.enabledProbe.centerMm - 20) > 0.000001
    || Math.abs(result.sliceResults.enabledProbe.gradientMtM - 5) > 0.000001
    || Math.abs(result.sliceResults.enabledProbe.bandwidthKhz - 4) > 0.000001
    || Math.abs(result.sliceResults.enabledProbe.thicknessMm - (4000 / (42577478.92 * 0.005) * 1000)) > 0.01
    || result.sliceResults.enabledProbe.maxProfile < 0.5
    || result.sliceResults.enabledProbe.inactiveSamples <= 0
    || result.sliceResults.enabledProbe.activeSamples <= 0
    || result.sliceResults.outsideMomentProbe.outsideProfile >= 0.01
    || Math.abs(result.sliceResults.outsideMomentProbe.outsideBefore.mz - 1) > 0.000001
    || Math.abs(result.sliceResults.outsideMomentProbe.outsideAfter.mz - 1) > 0.00001
    || result.sliceResults.outsideMomentProbe.outsideAfterLength < 0.999
    || result.sliceResults.disabledProbe.enabled
    || result.sliceResults.disabledProbe.minProfile < 0.999
    || result.sliceResults.enabledStats.sliceGradientEnabled !== true
    || Math.abs(result.sliceResults.enabledStats.sliceThicknessMm - result.sliceResults.enabledProbe.thicknessMm) > 0.001
    || result.sliceResults.sliceOnlyStats.sliceVectorOnly !== true
    || result.sliceResults.sliceOnlyStats.visibleVectorCount <= 0
    || result.sliceResults.sliceOnlyStats.visibleVectorCount >= result.sliceResults.sliceOnlyStats.samples
    || result.sliceResults.sliceOnlyNoGradientStats.sliceGradientEnabled !== false
    || result.sliceResults.sliceOnlyNoGradientStats.sliceVectorOnly !== true
    || result.sliceResults.sliceOnlyNoGradientStats.visibleVectorCount !== result.sliceResults.sliceOnlyNoGradientStats.samples
    || result.sliceResults.enabledZones.some((className) => className.includes('slice-gradient'))
    || result.sliceResults.disabledZones.some((className) => className.includes('slice-gradient'))
    || result.sliceResults.enabledProbe.waveform.length < 3
    || Math.abs(result.sliceResults.enabledProbe.ssgDuringRf - 5) > 0.000001
    || Math.abs(result.sliceResults.enabledProbe.ssgRephase + 5) > 0.000001
    || Math.abs(result.sliceResults.enabledProbe.ssgDuringRefocus - 5) > 0.000001
    || !result.spinEchoEnvelopeResults.ok
    || result.spinEchoEnvelopeResults.errors.length > 0
    || result.spinEchoEnvelopeResults.samples.some((sample) => (
      Math.abs(sample.envelope.t2Decay - sample.expectedT2Decay) > 1e-10
      || Math.abs(sample.envelope.inhomDecay - sample.expectedInhomDecay) > 1e-10
      || Math.abs(sample.envelope.transverse - sample.expectedTransverse) > 1e-10
    ))
    || result.spinEchoEnvelopeResults.samples.some((sample) => (
      sample.time < sample.envelope.refocusStart
        ? Math.abs(sample.envelope.inhomElapsed - sample.envelope.timeSinceExcitation) > 1e-10
        : Math.abs(sample.envelope.inhomElapsed - Math.abs(sample.time - sample.envelope.echoTime)) > 1e-10
    ))
    || result.spinEchoEnvelopeResults.inversion.startDot <= 0.7
      * result.spinEchoEnvelopeResults.inversion.beforeLength
      * result.spinEchoEnvelopeResults.inversion.justAfterStartLength
    || result.spinEchoEnvelopeResults.inversion.endDot >= -0.2
      * result.spinEchoEnvelopeResults.inversion.beforeLength
      * result.spinEchoEnvelopeResults.inversion.afterLength;
});

console.log(JSON.stringify({ results, events }, null, 2));

if (failed.length > 0 || events.exceptions.length > 0) {
  process.exitCode = 1;
}

async function createPage(port) {
  const url = `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`;
  const response = await fetch(url, { method: 'PUT' });
  if (!response.ok) {
    throw new Error(`Failed to create CDP page: ${response.status}`);
  }
  return response.json();
}

async function waitForJson(url) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 5000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const callbacks = new Map();
  const handlers = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id && callbacks.has(payload.id)) {
      const callback = callbacks.get(payload.id);
      callbacks.delete(payload.id);
      if (payload.error) {
        callback.reject(new Error(payload.error.message));
      } else {
        callback.resolve(payload.result || {});
      }
      return;
    }

    if (payload.method && handlers.has(payload.method)) {
      for (const handler of handlers.get(payload.method)) {
        handler(payload.params || {});
      }
    }
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        callbacks.set(id, { resolve, reject });
      });
    },
    on(method, handler) {
      if (!handlers.has(method)) {
        handlers.set(method, []);
      }
      handlers.get(method).push(handler);
    },
    close() {
      socket.close();
    },
  };
}

async function navigateAndWait(cdp, url) {
  const loaded = new Promise((resolve) => {
    cdp.on('Page.loadEventFired', resolve);
  });
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, delay(5000)]);
}

async function waitForRender(cdp) {
  const started = Date.now();
  while (Date.now() - started < 6000) {
    const ready = await evaluate(cdp, `Boolean(window.__mrDemoStats?.ready && window.__mrDemoStats.samples > 0 && document.querySelector('#scene canvas'))`);
    if (ready) {
      await delay(350);
      return;
    }
    await delay(100);
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result.value;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
