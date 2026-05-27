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
  results.push({ ...check, stats });
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
    || stats.coloredRatio < 0.005;
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
