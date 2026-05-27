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

    function chartStats() {
      const canvas = document.querySelector('#mzChart');
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
            chart: chartStats(),
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
      || !sequence.chart.ok
      || sequence.chart.bright <= 0
      || (sequence.sequence === 'single-pulse' && !sequence.spinEchoControlsHidden)
      || (sequence.sequence === 'spin-echo' && (
        sequence.spinEchoControlsHidden
        || sequence.eventZones < 3
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
    || result.fieldResults.periodReadout !== '15.66 ns';
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
