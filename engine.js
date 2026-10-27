// Pure game logic: no browser APIs. Tune the game by editing CONFIG.
export const CONFIG = {
  // Completed rounds (light on, then off) at one size before the button gets smaller. Time does not matter.
  ROUNDS_TO_ADVANCE: 5,
  // On the first N levels, sliding a finger onto the button counts as a tap. After that, only a direct tap does.
  SLIDE_IN_LEVELS: 2,
  // Button size per level, in percent of the shorter screen side.
  SIZES: [36, 30, 25, 21, 18, 15],
  // Button center per spot, in percent of screen width and height.
  SPOTS: [[50, 50], [74, 20], [26, 20], [26, 80], [74, 80], [24, 50], [76, 50], [50, 18], [50, 82]],
};

export function createState(level = 0, rounds = 0) {
  return { level, rounds };
}

export function completeRound(state, config = CONFIG) {
  const rounds = state.rounds + 1;
  if (rounds >= config.ROUNDS_TO_ADVANCE) {
    return { level: Math.min(state.level + 1, config.SIZES.length - 1), rounds: 0 };
  }
  return { level: state.level, rounds };
}

export function pickSpot(previousIndex, rand = Math.random, config = CONFIG) {
  const n = config.SPOTS.length;
  if (previousIndex === null || previousIndex === undefined) {
    return Math.min(Math.floor(rand() * n), n - 1);
  }
  // Draw from the n - 1 other spots, then skip over the previous one.
  const pick = Math.min(Math.floor(rand() * (n - 1)), n - 2);
  return pick >= previousIndex ? pick + 1 : pick;
}

export function allowsSlide(level, config = CONFIG) {
  return level < config.SLIDE_IN_LEVELS;
}

// An integer in 0..limit-1 (a number or a numeric string), otherwise 0.
function safeIndex(raw, limit) {
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) n = Number(raw.trim());
  else return 0;
  return Number.isInteger(n) && n >= 0 && n < limit ? n : 0;
}

export function sanitizeLevel(raw, config = CONFIG) {
  return safeIndex(raw, config.SIZES.length);
}

export function sanitizeRounds(raw, config = CONFIG) {
  return safeIndex(raw, config.ROUNDS_TO_ADVANCE);
}
