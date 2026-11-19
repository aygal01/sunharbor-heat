// Every shared tuning number, colour and name for Sunharbor Heat in one place: the world
// size, the road grid, the warm sunset palette, the five districts, the wanted-level tuning
// and the control bindings the title screen prints. No other file hard-codes one of these
// values; they all read them from here.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** The city in world pixels. The camera shows a window of this; the minimap shows all of it. */
export const WORLD = { width: 4800, height: 3600 };

/**
 * The road grid: roads are roadWidth wide, their centres pitch apart, the first centre at
 * first. Blocks (and the buildings on them) live in the squares between roads.
 */
export const GRID = { pitch: 400, roadWidth: 128, first: 200 };

/** East-edge geography: boardwalk, then sand, then open water nobody can enter. */
export const COAST = { boardwalkX: 3980, sandX: 4080, waterX: 4460 };

/** The warm sunset palette every district tints from. */
export const PALETTE = {
  asphalt: '#57493f',
  asphaltDark: '#4a3d35',
  asphaltPatch: '#63544a',
  laneMarking: '#f0cd72',
  sidewalk: '#b5a68d',
  sidewalkEdge: '#8f7f66',
  grass: '#6f9a4c',
  sand: '#eecf95',
  sandDark: '#dbba74',
  water: '#2b7d9c',
  waterLight: '#57aec9',
  boardwalk: '#a97a4e',
  boardwalkDark: '#86603a',
  shadow: 'rgba(58, 30, 14, 0.32)',
  playerShirt: '#e2543e',
  playerPants: '#2e3d55',
  skin: '#c98a5e',
};

/** The five districts plus the mixed blocks between them. */
export const DISTRICT = {
  DOWNTOWN: 'downtown',
  SUBURBS: 'suburbs',
  INDUSTRIAL: 'industrial',
  MARINA: 'marina',
  BEACH: 'beach',
  MIDTOWN: 'midtown',
};

/** District ground colours under the roads and buildings. */
export const DISTRICT_GROUND = {
  downtown: '#8a7a64',
  suburbs: '#67914a',
  industrial: '#7d6a54',
  marina: '#8b7c64',
  beach: '#eecf95',
  midtown: '#86755e',
};

/** Street names, west to east for the vertical roads, north to south for the horizontal. */
export const STREET_NAMES_VERTICAL = [
  'Kestrel Street', 'Dockside Avenue', 'Marlin Avenue', 'Coral Boulevard', 'Beacon Road',
  'Tidewater Avenue', 'Anchor Street', 'Gullwing Road', 'Breakwater Avenue', 'Palm Terrace',
  'Saltmarsh Road', 'Harborline Avenue',
];
export const STREET_NAMES_HORIZONTAL = [
  'North Quay', 'Lantern Row', 'Copperfield Avenue', 'Solstice Boulevard', 'Mango Lane',
  'Foundry Road', 'Ember Street', 'South Quay', 'Marina Way',
];

/** Wanted tuning: how many police answer at each level, and how the heat cools off. */
export const WANTED = {
  maxStars: 5,
  /** Seconds unseen before one star fades. */
  decaySeconds: 14,
  /** Police cars that hunt at each star count (index 0 unused). */
  policeCars: [0, 1, 2, 3, 4, 6],
  /** On-foot officers join the chase from this star count. */
  officersFromStars: 4,
  /** Seconds of close police contact that fill the bust meter. */
  bustSeconds: 2.6,
};

/** Player tuning on foot. */
export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sprintSpeed: 268,
  maxHealth: 100,
  punchRange: 36,
  punchDamage: 34,
  punchCooldown: 0.38,
  shotDamage: 40,
  shotCooldown: 0.24,
  shotRange: 560,
};

/** The in-game clock: game minutes per real second, and where the day starts (golden hour). */
export const CLOCK = { minutesPerSecond: 1.5, startMinutes: 17 * 60 + 24 };

/** The controls, printed on the title screen and the pause screen. */
export const CONTROLS = [
  ['WASD / Arrows', 'Move / drive'],
  ['Shift', 'Sprint'],
  ['F or Enter', 'Get in / out of a car'],
  ['E', 'Talk / start a job'],
  ['Space', 'Punch'],
  ['Mouse + Click', 'Aim and fire the pistol'],
  ['Esc', 'Pause'],
];

/** localStorage key for the save file. */
export const SAVE_KEY = 'sunharbor-heat-save-v1';
