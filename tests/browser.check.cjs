// Browser checks for the Baby Light Switch page, run in headless Chromium at iPhone sizes.
// Usage: node tests/browser.check.cjs            checks index.html
//        node tests/browser.check.cjs --single   checks dist/baby-light-switch.html (the one-file build)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SINGLE = process.argv.includes('--single');
const ROOT = SINGLE ? path.resolve(__dirname, '..', 'dist') : path.resolve(__dirname, '..');
const PAGE = SINGLE ? '/baby-light-switch.html' : '/index.html';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function startServer(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(dir, url === '/' ? PAGE : url);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(8123, '127.0.0.1', () => resolve(server));
  });
}

const failures = [];
async function check(name, fn) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failures.push(name); console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n')[0]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await startServer(ROOT);
  const browser = await chromium.launch();
  const errors = [];

  async function newPage(viewport = { width: 390, height: 844 }, init) {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    for (const script of [].concat(init || [])) await ctx.addInitScript(script);
    const page = await ctx.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:8123' + PAGE);
    await page.waitForSelector('#light-btn', { timeout: 3000 });
    return page;
  }
  const box = (page) => page.locator('#light-btn').boundingBox();
  const centerOf = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const tapButton = async (page) => { const c = centerOf(await box(page)); await page.touchscreen.tap(c.x, c.y); };
  const isOn = (page) => page.evaluate(() => window.__game.isOn());
  const stateOf = (page) => page.evaluate(() => window.__game.getState());
  const stageClass = (page) => page.evaluate(() => document.getElementById('stage').className);
  const inside = (b, vp) => b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height;

  try {
    const page = await newPage();

    await check('starts with the light off and the button visible', async () => {
      assert((await stageClass(page)).split(' ').includes('off'), 'stage should have class off');
      assert(await page.locator('#light-btn').isVisible(), 'button should be visible');
    });

    await check('a tap far from the button does nothing', async () => {
      await page.touchscreen.tap(20, 40);
      await sleep(400);
      assert(!(await isOn(page)), 'light should still be off');
      assert((await stageClass(page)).split(' ').includes('off'), 'stage should still be off');
    });

    await check('screen is near-black when off and bright warm white when on, with a 0.28s fade', async () => {
      const css = await page.evaluate(() => {
        const s = getComputedStyle(document.getElementById('stage'));
        return { bg: s.backgroundColor, dur: s.transitionDuration };
      });
      assert(css.bg === 'rgb(4, 6, 15)', 'off background was ' + css.bg);
      assert(css.dur.split(',').map((x) => x.trim()).includes('0.28s'), 'transition duration was ' + css.dur);
      await sleep(400);
      await tapButton(page);
      await sleep(450);
      const on = await page.evaluate(() => getComputedStyle(document.getElementById('stage')).backgroundColor);
      assert(on === 'rgb(255, 251, 232)', 'on background was ' + on);
      assert(await isOn(page), 'light should be on');
    });

    let before;
    await check('second tap turns the light off and the button moves to a new spot', async () => {
      before = centerOf(await box(page));
      await sleep(400);
      await tapButton(page);
      await sleep(700);
      assert(!(await isOn(page)), 'light should be off');
      assert((await stageClass(page)).split(' ').includes('off'), 'stage should be off');
      const after = centerOf(await box(page));
      assert(Math.abs(after.x - before.x) > 5 || Math.abs(after.y - before.y) > 5, 'button should have moved');
    });

    await check('taps are ignored while the button hops', async () => {
      await sleep(400);
      await tapButton(page);               // on
      await sleep(400);
      const c = centerOf(await box(page));
      await page.touchscreen.tap(c.x, c.y); // off, starts the hop
      await sleep(200);
      await page.touchscreen.tap(c.x, c.y); // during the hop
      await sleep(100);
      assert(!(await isOn(page)), 'a tap during the hop must not turn the light on');
      await sleep(500);
      assert(!(await isOn(page)), 'light should stay off after the hop');
    });

    await check('two touches within 100 ms on the button count as one tap', async () => {
      await sleep(300);
      const was = await isOn(page);
      await page.evaluate(() => {
        const b = document.getElementById('light-btn');
        const ev = () => new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'touch' });
        b.dispatchEvent(ev());
        setTimeout(() => b.dispatchEvent(ev()), 60);
      });
      await sleep(300);
      assert((await isOn(page)) === !was, 'light should have toggled exactly once');
    });

    await check('a tap on the button works while another finger rests on the screen', async () => {
      const p = await newPage();
      await p.evaluate(() => {
        document.getElementById('stage').dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'touch' }));
      });
      await sleep(400);
      await p.evaluate(() => {
        document.getElementById('light-btn').dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, isPrimary: false, pointerId: 2, pointerType: 'touch' }));
      });
      await sleep(300);
      assert(await isOn(p), 'the second finger should turn the light on');
      await p.context().close();
    });

    await check('a palm rolling onto the button over 260 ms counts as one tap', async () => {
      const p = await newPage();
      await p.evaluate(() => {
        const b = document.getElementById('light-btn');
        const down = (id) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: id === 1, pointerId: id, pointerType: 'touch' }));
        down(1);
        setTimeout(() => down(2), 120);
        setTimeout(() => down(3), 260);
      });
      await sleep(800);
      const s = await stateOf(p);
      assert(await isOn(p), 'the light should be on after one counted tap');
      assert(s.rounds === 0, 'no round should have completed: ' + JSON.stringify(s));
      await p.context().close();
    });

    await check('a round that takes longer than 5 seconds still counts, and the game keeps working', async () => {
      const p = await newPage();
      await sleep(400);
      await tapButton(p);                 // on
      await sleep(5600);                  // a long pause
      await tapButton(p);                 // off, round ends
      await sleep(700);
      const s = await stateOf(p);
      assert(s.level === 0 && s.rounds === 1, 'state was ' + JSON.stringify(s));
      assert(await p.locator('#light-btn').isVisible(), 'button should be back');
      await p.context().close();
    });

    await check('5 rounds at the same size shrink the button, and each round uses a new spot', async () => {
      const p = await newPage();
      const w0 = (await box(p)).width;
      const spots = [];
      for (let r = 0; r < 5; r++) {
        if (r === 4) assert((await box(p)).width === w0, 'the size should not change before the 5th round');
        await sleep(400); await tapButton(p);
        await sleep(400); await tapButton(p);
        await sleep(700);
        spots.push((await stateOf(p)).spot);
      }
      const s = await stateOf(p);
      assert(s.level === 1, 'level should be 1, was ' + s.level);
      assert(spots.every((x, i) => i === 0 || x !== spots[i - 1]), 'spots repeated: ' + spots);
      const w1 = (await box(p)).width;
      assert(w1 < w0 - 5, `button should be smaller (${w0} -> ${w1})`);
      await p.context().close();
    });

    await check('the button fits fully on screen at every level and spot, portrait and landscape', async () => {
      const sizes = [
        { width: 390, height: 844 }, { width: 844, height: 390 },
        { width: 320, height: 568 }, { width: 932, height: 430 },
      ];
      for (const vp of sizes) {
        const p = await newPage(vp);
        for (let level = 0; level < 6; level++) {
          for (let spot = 0; spot < 9; spot++) {
            await p.evaluate(([l, s]) => { window.__game.setLevel(l); window.__game.setSpot(s); }, [level, spot]);
            const b = await box(p);
            assert(inside(b, vp), `outside ${vp.width}x${vp.height} level ${level + 1} spot ${spot}: ${JSON.stringify(b)}`);
            assert(Math.abs(b.width - b.height) < 1, 'button should stay round');
          }
        }
        await p.context().close();
      }
    });

    await check('rotating the phone mid-game keeps the button on screen', async () => {
      const p = await newPage({ width: 390, height: 844 });
      await p.evaluate(() => { window.__game.setLevel(0); window.__game.setSpot(1); });
      await p.setViewportSize({ width: 844, height: 390 });
      await sleep(150);
      assert(inside(await box(p), { width: 844, height: 390 }), 'outside after rotating to landscape');
      await p.setViewportSize({ width: 390, height: 844 });
      await sleep(150);
      assert(inside(await box(p), { width: 390, height: 844 }), 'outside after rotating back');
      await p.context().close();
    });

    await check('zoom, scroll and text selection are blocked', async () => {
      const r = await page.evaluate(() => {
        const cs = getComputedStyle(document.body);
        const se = document.scrollingElement;
        return {
          touch: cs.touchAction, select: cs.userSelect || cs.webkitUserSelect,
          viewport: document.querySelector('meta[name=viewport]').content,
          scrolls: se.scrollHeight > se.clientHeight || se.scrollWidth > se.clientWidth,
        };
      });
      assert(r.touch === 'none', 'touch-action was ' + r.touch);
      assert(r.select === 'none', 'user-select was ' + r.select);
      assert(/user-scalable=no/.test(r.viewport) && /viewport-fit=cover/.test(r.viewport), 'viewport meta was ' + r.viewport);
      assert(!r.scrolls, 'page should not scroll');
    });

    // ---- sound, saved progress, wake lock ----
    const FAKE_AUDIO = `
      window.__audio = { created: 0, osc: 0, resumes: 0 };
      class FakeCtx {
        constructor() { window.__audio.created++; this.currentTime = 0; this.destination = {}; this.state = 'running'; }
        createOscillator() {
          window.__audio.osc++;
          return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
        }
        createGain() {
          return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
        }
        resume() { window.__audio.resumes++; return Promise.resolve(); }
      }
      window.AudioContext = FakeCtx; window.webkitAudioContext = FakeCtx;`;
    const FAKE_WAKELOCK = `
      window.__wl = 0;
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
        request: async () => { window.__wl++; return { release() {}, addEventListener() {} }; } } });`;
    const playRound = async (p) => { await sleep(400); await tapButton(p); await sleep(400); await tapButton(p); await sleep(700); };

    await check('the level is saved and restored after a reload', async () => {
      const p = await newPage();
      for (let r = 0; r < 5; r++) await playRound(p);
      assert((await stateOf(p)).level === 1, 'should have reached level 1');
      await p.reload();
      await p.waitForSelector('#light-btn', { timeout: 3000 });
      assert((await stateOf(p)).level === 1, 'level after reload was ' + (await stateOf(p)).level);
      await p.context().close();
    });

    await check('the round count is saved too, so a half-finished level carries on after a reload', async () => {
      const p = await newPage();
      for (let r = 0; r < 2; r++) await playRound(p);
      assert((await stateOf(p)).rounds === 2, 'two rounds should be counted');
      await p.reload();
      await p.waitForSelector('#light-btn', { timeout: 3000 });
      const s = await stateOf(p);
      assert(s.level === 0 && s.rounds === 2, 'state after reload was ' + JSON.stringify(s));
      await p.context().close();
    });

    await check('bad saved round counts (abc, 99, 5, -1) and a missing key all start at 0', async () => {
      for (const seed of ['abc', '99', '5', '-1', null]) {
        const init = seed === null ? [] : [`localStorage.setItem('bls.rounds', ${JSON.stringify(seed)});`];
        const p = await newPage(undefined, init);
        const s = await stateOf(p);
        assert(s.rounds === 0, `seed ${seed}: rounds was ${s.rounds}`);
        await p.context().close();
      }
    });

    await check('bad saved levels (abc, 99, -1) and a missing key all start at level 1', async () => {
      for (const seed of ['abc', '99', '-1', null]) {
        const init = seed === null ? [] : [`localStorage.setItem('bls.level', ${JSON.stringify(seed)});`];
        const p = await newPage(undefined, init);
        const s = await stateOf(p);
        assert(s.level === 0, `seed ${seed}: level was ${s.level}`);
        await p.context().close();
      }
    });

    await check('a saved valid level (3) is restored', async () => {
      const p = await newPage(undefined, [`localStorage.setItem('bls.level', '3');`]);
      assert((await stateOf(p)).level === 3, 'level should be 3');
      await p.context().close();
    });

    await check('the game plays normally when localStorage throws', async () => {
      const p = await newPage(undefined, [
        `Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });`,
      ]);
      await playRound(p);
      assert((await stateOf(p)).rounds === 1, 'a round should still be counted');
      await p.context().close();
    });

    await check('taps work with AudioContext and wakeLock missing', async () => {
      const p = await newPage(undefined, [
        `window.AudioContext = undefined; window.webkitAudioContext = undefined;
         Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });`,
      ]);
      await sleep(400); await tapButton(p);
      assert(await isOn(p), 'light should turn on');
      await p.context().close();
    });

    await check('sound on: one AudioContext, one tone per tap, created after the first tap', async () => {
      const p = await newPage(undefined, [FAKE_AUDIO]);
      assert((await p.evaluate(() => window.__audio.created)) === 0, 'no AudioContext before the first tap');
      assert(await p.evaluate(() => window.__game.getSound()), 'sound should default to on');
      await sleep(400); await tapButton(p);
      await sleep(400); await tapButton(p);
      const a = await p.evaluate(() => window.__audio);
      assert(a.created === 1 && a.osc === 2, 'audio was ' + JSON.stringify(a));
      await p.context().close();
    });

    await check('audio is unlocked on finger release, which iOS counts as the user gesture, without playing a tone', async () => {
      const p = await newPage(undefined, [FAKE_AUDIO]);
      await p.evaluate(() => {
        document.getElementById('light-btn').dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'touch' }));
      });
      const a = await p.evaluate(() => window.__audio);
      assert(a.created === 1 && a.resumes >= 1 && a.osc === 0, 'audio was ' + JSON.stringify(a));
      await p.context().close();
    });

    await check('sound off (saved) makes no AudioContext at all', async () => {
      const p = await newPage(undefined, [`localStorage.setItem('bls.sound', '0');`, FAKE_AUDIO]);
      assert(!(await p.evaluate(() => window.__game.getSound())), 'sound should be off');
      await sleep(400); await tapButton(p);
      assert((await p.evaluate(() => window.__audio.created)) === 0, 'no AudioContext expected');
      await p.context().close();
    });

    await check('the screen wake lock is requested', async () => {
      const p = await newPage(undefined, [FAKE_WAKELOCK]);
      await sleep(400); await tapButton(p);
      assert((await p.evaluate(() => window.__wl)) >= 1, 'wake lock should have been requested');
      await p.context().close();
    });

    // ---- parent panel ----
    async function holdCorner(p, ms, { slideOut = false } = {}) {
      const cdp = await p.context().newCDPSession(p);
      const b = await p.locator('#corner').boundingBox();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      if (slideOut) {
        await sleep(300);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 20, y: 400 }] });
      }
      await sleep(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const panelVisible = (p) => p.locator('#panel').isVisible();
    const tapEl = async (p, sel) => { const c = centerOf(await p.locator(sel).boundingBox()); await p.touchscreen.tap(c.x, c.y); };
    const saved = (p, key) => p.evaluate((k) => localStorage.getItem(k), key);
    async function openPanel(p) {
      await holdCorner(p, 3100);
      await p.waitForSelector('#panel', { state: 'visible', timeout: 1500 });
    }

    await check('the hidden corner is invisible', async () => {
      const p = await newPage();
      const css = await p.evaluate(() => {
        const s = getComputedStyle(document.getElementById('corner'));
        return { bg: s.backgroundColor, border: s.borderTopWidth, shadow: s.boxShadow };
      });
      assert(css.bg === 'rgba(0, 0, 0, 0)' && css.border === '0px' && css.shadow === 'none', JSON.stringify(css));
      assert(!(await panelVisible(p)), 'panel should start hidden');
      await p.context().close();
    });

    await check('holding the corner for only 2 seconds does not open the panel', async () => {
      const p = await newPage();
      await holdCorner(p, 2000);
      await sleep(1300);
      assert(!(await panelVisible(p)), 'panel should stay hidden');
      await p.context().close();
    });

    await check('sliding the finger out of the corner cancels the hold', async () => {
      const p = await newPage();
      await holdCorner(p, 3200, { slideOut: true });
      assert(!(await panelVisible(p)), 'panel should stay hidden');
      await p.context().close();
    });

    await check('a short tap on the corner does nothing', async () => {
      const p = await newPage();
      await tapEl(p, '#corner');
      await sleep(400);
      assert(!(await isOn(p)) && !(await panelVisible(p)), 'light and panel should be unchanged');
      await p.context().close();
    });

    await check('holding the corner for 3 seconds opens the panel; taps behind it change nothing', async () => {
      const p = await newPage();
      const spot0 = (await stateOf(p)).spot;
      const btnCenter = centerOf(await box(p));
      await openPanel(p);
      await p.touchscreen.tap(btnCenter.x, btnCenter.y);
      await p.touchscreen.tap(20, 300);
      await sleep(600);
      assert(!(await isOn(p)), 'light must not change behind the panel');
      assert((await stateOf(p)).spot === spot0, 'button must not move behind the panel');
      assert(await panelVisible(p), 'panel should stay open until Close');
      await p.context().close();
    });

    await check('sound toggle saves the choice', async () => {
      const p = await newPage();
      await openPanel(p);
      await tapEl(p, '#sound-toggle');
      assert((await saved(p, 'bls.sound')) === '0' && !(await p.evaluate(() => window.__game.getSound())), 'sound should be off');
      await tapEl(p, '#sound-toggle');
      assert((await saved(p, 'bls.sound')) === '1' && (await p.evaluate(() => window.__game.getSound())), 'sound should be on again');
      await p.context().close();
    });

    await check('the level picker sets and saves a level and resizes the button', async () => {
      const p = await newPage();
      await openPanel(p);
      await tapEl(p, '#level-picker [data-level="2"]');
      assert((await stateOf(p)).level === 2, 'level should be 2');
      assert((await saved(p, 'bls.level')) === '2', 'level should be saved');
      const w = (await box(p)).width;
      assert(Math.abs(w - 0.25 * 390) < 1.5, 'button width should be 25% of 390, was ' + w);
      await p.context().close();
    });

    await check('reset clears level and round count; Close returns to play', async () => {
      const p = await newPage();
      await playRound(p);
      assert((await stateOf(p)).rounds === 1, 'one round should be counted');
      await openPanel(p);
      await tapEl(p, '#level-picker [data-level="3"]');
      await tapEl(p, '#reset-btn');
      const s = await stateOf(p);
      assert(s.level === 0 && s.rounds === 0, 'state was ' + JSON.stringify(s));
      assert((await saved(p, 'bls.level')) === '0' && (await saved(p, 'bls.rounds')) === '0', 'saved level and rounds should be 0');
      await tapEl(p, '#close-btn');
      await sleep(200);
      assert(!(await panelVisible(p)), 'panel should be hidden after Close');
      await sleep(400);
      await tapButton(p);
      assert(await isOn(p), 'the game should respond again');
      await p.context().close();
    });

    await check('the panel fits on screen with thumb-sized buttons in portrait, landscape and small phones', async () => {
      for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
        const p = await newPage(vp);
        await openPanel(p);
        for (const sel of ['.sheet', '#sound-toggle', '#level-picker [data-level="0"]', '#level-picker [data-level="5"]', '#reset-btn', '#close-btn']) {
          const b = await p.locator(sel).boundingBox();
          assert(inside(b, vp), `${sel} outside ${vp.width}x${vp.height}: ${JSON.stringify(b)}`);
          if (sel !== '.sheet') assert(b.height >= 40 && b.width >= 40, `${sel} too small: ${b.width}x${b.height}`);
        }
        await p.context().close();
      }
    });

    // ---- Slide onto the button (early levels) ----
    // Drives real touch input: finger down at the first point, drag through the rest, then lift.
    async function slide(p, points, pause = 60) {
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0].x, y: points[0].y }] });
      for (const pt of points.slice(1)) {
        await sleep(pause);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x, y: pt.y }] });
      }
      await sleep(pause);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const AWAY = { x: 30, y: 330 };
    const AWAY2 = { x: 360, y: 760 };

    await check('level 1: sliding onto the button from elsewhere switches the light on', async () => {
      const p = await newPage();
      const c = centerOf(await box(p));
      await slide(p, [AWAY, { x: (AWAY.x + c.x) / 2, y: (AWAY.y + c.y) / 2 }, c]);
      await sleep(300);
      assert(await isOn(p), 'the light should be on');
      await p.context().close();
    });

    await check('level 2: sliding onto the button still works', async () => {
      const p = await newPage();
      await p.evaluate(() => window.__game.setLevel(1));
      const c = centerOf(await box(p));
      await slide(p, [AWAY, c]);
      await sleep(300);
      assert(await isOn(p), 'the light should be on');
      await p.context().close();
    });

    await check('level 3: sliding onto the button does nothing, a direct tap still works', async () => {
      const p = await newPage();
      await p.evaluate(() => window.__game.setLevel(2));
      const c = centerOf(await box(p));
      await slide(p, [AWAY, c]);
      await sleep(300);
      assert(!(await isOn(p)), 'sliding should not switch the light at level 3');
      await sleep(400);
      await tapButton(p);
      assert(await isOn(p), 'a direct tap should work');
      await p.context().close();
    });

    await check('one switch per touch: slide on, off and on again changes the light once', async () => {
      const p = await newPage();
      const c = centerOf(await box(p));
      await slide(p, [AWAY, c, AWAY2, c, AWAY, c]);
      await sleep(400);
      assert(await isOn(p), 'the light should be on, switched exactly once');
      assert((await stateOf(p)).rounds === 0, 'no round should have finished');
      await p.context().close();
    });

    await check('a touch that starts on the button and wanders over it switches once', async () => {
      const p = await newPage();
      const c = centerOf(await box(p));
      await slide(p, [c, { x: c.x + 20, y: c.y }, AWAY, c, { x: c.x - 20, y: c.y }]);
      await sleep(400);
      assert(await isOn(p), 'the light should be on, switched exactly once');
      await p.context().close();
    });

    await check('sliding onto the spot where the button just was does nothing during the hop', async () => {
      const p = await newPage();
      await sleep(400); await tapButton(p);            // on
      await sleep(400);
      const c = centerOf(await box(p));
      await p.touchscreen.tap(c.x, c.y);                // off, hop starts
      await sleep(120);
      await slide(p, [AWAY, c]);
      await sleep(200);
      assert(!(await isOn(p)), 'the light must stay off during the hop');
      await p.context().close();
    });

    await check('no console errors', async () => {
      assert(errors.length === 0, 'errors: ' + errors.join(' | '));
    });
  } catch (e) {
    failures.push('setup: ' + e.message.split('\n')[0]);
    console.log('FAIL setup\n     ' + e.message.split('\n')[0]);
  }

  await browser.close();
  server.close();
  if (failures.length) { console.log('\n' + failures.length + ' failed'); process.exit(1); }
  console.log('\nPASS');
})();
