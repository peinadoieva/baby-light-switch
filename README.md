# Baby Light Switch

A one-button cause-and-effect activity for very young children. Tap the glowing button and the screen goes bright. Tap again and it goes dark. Then the button moves to a new spot. After 5 rounds at the same size, the button gets smaller.

## Use it

1. Open the link on the iPhone in Safari.
2. Optional: tap Share, then **Add to Home Screen**, so it opens full-screen like an app.
3. Set the phone brightness to about 70 to 80% before handing it over.
4. Optional: turn on **Guided Access** (Settings, Accessibility) and triple-click the side button, so the app can't be swiped away.

## Parent controls

Hold the top right corner for 3 seconds. A panel opens with sound on/off, a level picker (L1 to L6), **Reset progress** and **Close**. The level is saved on the phone.

## Tuning

The numbers live in `CONFIG` at the top of `engine.js`:

- `ROUNDS_TO_ADVANCE`: 5. After this many completed rounds (light on, then off) at one size, the button gets smaller. Speed doesn't matter, and the button never gets bigger again on its own.
- `SLIDE_IN_LEVELS`: 2. On the first 2 levels, a finger that lands elsewhere and slides onto the button counts as a tap (once per touch). From level 3 on, only a direct tap works.
- `SIZES`: button size per level, as a percent of the shorter screen side.
- `SPOTS`: where the button can appear, as percent of width and height.

## Develop

- `node --test tests/engine.test.js` runs the game-logic tests.
- `node tests/browser.check.cjs` runs the browser checks in headless Chromium at iPhone sizes, portrait and landscape.
- `node scripts/make-single-file.mjs` builds the one-file version in `dist/`. Then `node tests/browser.check.cjs --single` checks it.
