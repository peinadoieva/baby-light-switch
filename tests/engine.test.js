import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createState, completeRound, pickSpot, sanitizeLevel, sanitizeRounds, allowsSlide } from '../engine.js';

function play(state, rounds) {
  let s = state;
  for (let i = 0; i < rounds; i++) s = completeRound(s);
  return s;
}

test('createState defaults to level 0 with no rounds done', () => {
  assert.deepEqual(createState(), { level: 0, rounds: 0 });
});

test('createState keeps a given level and round count', () => {
  assert.deepEqual(createState(3, 2), { level: 3, rounds: 2 });
});

test('each completed round adds one to the count and keeps the level', () => {
  const s = completeRound(createState(1));
  assert.deepEqual(s, { level: 1, rounds: 1 });
});

test('4 rounds do not advance yet', () => {
  const s = play(createState(0), 4);
  assert.deepEqual(s, { level: 0, rounds: 4 });
});

test('5 rounds at the same size advance one level and reset the count', () => {
  const s = play(createState(0), 5);
  assert.deepEqual(s, { level: 1, rounds: 0 });
});

test('10 rounds advance two levels', () => {
  assert.deepEqual(play(createState(0), 10), { level: 2, rounds: 0 });
});

test('a saved count carries on: 3 done plus 2 more advances', () => {
  assert.deepEqual(play(createState(2, 3), 2), { level: 3, rounds: 0 });
});

test('never advances past the last size', () => {
  const last = CONFIG.SIZES.length - 1;
  const s = play(createState(last), 12);
  assert.equal(s.level, last);
  assert.ok(s.rounds < CONFIG.ROUNDS_TO_ADVANCE);
});

test('the level never goes down, however many rounds are played', () => {
  let s = createState(2);
  for (let i = 0; i < 30; i++) {
    const next = completeRound(s);
    assert.ok(next.level >= s.level);
    s = next;
  }
});

test('completeRound does not mutate its input', () => {
  const frozen = Object.freeze({ level: 1, rounds: 4 });
  const next = completeRound(frozen);
  assert.deepEqual(frozen, { level: 1, rounds: 4 });
  assert.deepEqual(next, { level: 2, rounds: 0 });
});

test('CONFIG holds the spec values', () => {
  assert.equal(CONFIG.ROUNDS_TO_ADVANCE, 5);
  assert.deepEqual(CONFIG.SIZES, [36, 30, 25, 21, 18, 15]);
  assert.deepEqual(CONFIG.SPOTS, [
    [50, 50], [74, 20], [26, 20], [26, 80], [74, 80], [24, 50], [76, 50], [50, 18], [50, 82],
  ]);
});

test('the old speed rules are gone from CONFIG', () => {
  for (const key of ['FAST_SECONDS', 'FAST_ROUNDS_TO_ADVANCE', 'SLOW_ROUNDS_TO_RETREAT']) {
    assert.equal(key in CONFIG, false, key);
  }
});

test('pickSpot never returns the previous index', () => {
  for (let prev = 0; prev < CONFIG.SPOTS.length; prev++) {
    for (let i = 0; i < 500; i++) {
      assert.notEqual(pickSpot(prev), prev);
    }
  }
});

test('pickSpot skips the previous index when rand lands on it', () => {
  const idx = pickSpot(0, () => 0);
  assert.notEqual(idx, 0);
  assert.ok(idx >= 0 && idx < CONFIG.SPOTS.length);
});

test('pickSpot with null previous can return any index', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(pickSpot(null));
  assert.equal(seen.size, CONFIG.SPOTS.length);
});

test('sanitizeLevel falls back to 0 for bad input', () => {
  for (const bad of ['abc', 99, -1, 2.5, null, undefined, '', true, {}, NaN, '1.5', '-1', '99']) {
    assert.equal(sanitizeLevel(bad), 0, `input ${String(bad)}`);
  }
});

test('sanitizeLevel accepts valid levels as numbers or numeric strings', () => {
  assert.equal(sanitizeLevel('3'), 3);
  assert.equal(sanitizeLevel(3), 3);
  assert.equal(sanitizeLevel(5), 5);
});

test('sanitizeRounds falls back to 0 for bad input, including a count that should have advanced', () => {
  for (const bad of ['abc', 99, 5, '5', -1, 2.5, null, undefined, '', true, {}, NaN, '1.5', '-1']) {
    assert.equal(sanitizeRounds(bad), 0, `input ${String(bad)}`);
  }
});

test('sanitizeRounds accepts 0 to 4 as numbers or numeric strings', () => {
  assert.equal(sanitizeRounds('3'), 3);
  assert.equal(sanitizeRounds(4), 4);
  assert.equal(sanitizeRounds(0), 0);
});

test('sliding onto the button is allowed on levels 1 and 2 only', () => {
  assert.equal(CONFIG.SLIDE_IN_LEVELS, 2);
  assert.equal(allowsSlide(0), true);
  assert.equal(allowsSlide(1), true);
  assert.equal(allowsSlide(2), false);
  assert.equal(allowsSlide(5), false);
});
