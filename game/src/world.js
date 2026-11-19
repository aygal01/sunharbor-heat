// City generation for Sunharbor: a seeded road grid with named streets, sidewalks and
// blocks, and a building (or a few) on every block styled by its district — downtown
// towers, suburb houses, dockside warehouses, marina flats, midtown shops. The east edge
// is boardwalk, sand and open water. Everything the other systems need is precomputed
// here: collision rectangles, parked-car spots, palm trees, props, spawn points and the
// raw geometry the minimap draws. Same seed, same city, every visit.
import { COAST, DISTRICT, GRID, WORLD } from './config.js';

/** Building paint per district: wall colours to choose from, roof colours, floor range. */
const DISTRICT_STYLE = {
  downtown: { walls: ['#8ba0b8', '#b08d6a', '#97a5b8', '#c09a72', '#7d94ac'], roofs: ['#5f7d99', '#71879c', '#93765a', '#66788c', '#a08b6d', '#54707f'], floors: [8, 14] },
  midtown: { walls: ['#c2a37e', '#b59a77', '#a8b2ba', '#cdb088'], roofs: ['#b07a45', '#8f6a4f', '#c19a63', '#7d6a58', '#a85f3d'], floors: [3, 6] },
  suburbs: { walls: ['#e2cc9e', '#cfdbbc', '#e6bfa8', '#bfd2e2'], roofs: ['#b0603c', '#a45536', '#c07a4a', '#7d8a5f', '#9c4a2f'], floors: [1, 1] },
  industrial: { walls: ['#978a7a', '#84929c', '#a08a6c'], roofs: ['#9c5a3c', '#4d7d7a', '#8a6a4a', '#6e6257', '#7a4a38'], floors: [1, 2] },
  marina: { walls: ['#d8dfd8', '#c4dbe0', '#ecd9b2'], roofs: ['#5f8f88', '#7a9a94', '#c2a37e', '#4d7d7a'], floors: [2, 3] },
  beach: { walls: [], roofs: ['#000000'], floors: [0, 0] },
};

const CONTAINER_COLORS = ['#b3543f', '#3f6fb3', '#4d8a4f', '#c2a13d', '#7a5fa3'];

/** Which district a point belongs to. Pure geography; the generator and renderer share it. */
export function districtAt(x, y) {
  if (x >= COAST.sandX) return DISTRICT.BEACH;
  if (x >= 3100 && y >= 2300) return DISTRICT.MARINA;
  if (x <= 1300 && y >= 1800) return DISTRICT.INDUSTRIAL;
  if (x <= 1300) return DISTRICT.SUBURBS;
  if (x >= 1400 && x <= 3000 && y >= 900 && y <= 2500) return DISTRICT.DOWNTOWN;
  return DISTRICT.MIDTOWN;
}

function makeBuilding(rng, x, y, w, h, district) {
  const style = DISTRICT_STYLE[district];
  return {
    x, y, w, h, district,
    color: rng.pick(style.walls),
    roof: rng.pick(style.roofs),
    floors: rng.int(style.floors[0], style.floors[1]),
    seed: rng.int(1, 100000),
  };
}

/** Fill one block with buildings in its district's style, adding colliders as we go. */
function fillBlock(rng, block, buildings, colliders, props) {
  const { x, y, w, h, district } = block;
  if (district === DISTRICT.BEACH) {
    // Open sand: umbrellas, towels and palms, nothing to crash into.
    const umbrellas = rng.int(2, 4);
    for (let i = 0; i < umbrellas; i += 1) {
      props.push({ kind: 'umbrella', x: rng.range(x + 30, x + w - 30), y: rng.range(y + 30, y + h - 30), color: rng.pick(['#e2543e', '#3f8fb3', '#e8c97a', '#ff7d9a']) });
    }
    const towels = rng.int(1, 3);
    for (let i = 0; i < towels; i += 1) {
      props.push({ kind: 'towel', x: rng.range(x + 24, x + w - 24), y: rng.range(y + 24, y + h - 24), color: rng.pick(['#ff7d9a', '#ffd23e', '#4fc3e8', '#8ae86a', '#f2ede2']), angle: rng.range(0, Math.PI) });
    }
    return;
  }
  if (district === DISTRICT.DOWNTOWN) {
    if (rng.chance(0.45)) {
      const bw = w * rng.range(0.36, 0.44);
      buildings.push(makeBuilding(rng, x + 8, y + 8, bw, h - 16, district));
      buildings.push(makeBuilding(rng, x + w - 8 - bw, y + 8, bw, h - 16, district));
    } else {
      buildings.push(makeBuilding(rng, x + rng.range(6, 26), y + rng.range(6, 26), w * rng.range(0.68, 0.86), h * rng.range(0.68, 0.86), district));
    }
  } else if (district === DISTRICT.SUBURBS) {
    const hw = (w - 36) / 2;
    const hh = (h - 36) / 2;
    for (const ox of [8, 20 + hw]) {
      for (const oy of [8, 20 + hh]) {
        buildings.push(makeBuilding(rng, x + ox, y + oy, hw, hh, district));
      }
    }
  } else if (district === DISTRICT.INDUSTRIAL) {
    buildings.push(makeBuilding(rng, x + 14, y + 14, w - 28, h * rng.range(0.52, 0.66), district));
    const boxes = rng.int(2, 4);
    for (let i = 0; i < boxes; i += 1) {
      const box = { kind: 'container', x: rng.range(x + 10, x + w - 62), y: rng.range(y + h * 0.62, y + h - 30), w: 52, h: 22, color: rng.pick(CONTAINER_COLORS) };
      props.push(box);
      colliders.push(box);
    }
  } else {
    // Midtown and marina: two or three smaller buildings with lanes between them.
    const count = rng.int(2, 3);
    const bw = (w - 16 - (count - 1) * 14) / count;
    for (let i = 0; i < count; i += 1) {
      buildings.push(makeBuilding(rng, x + 8 + i * (bw + 14), y + rng.range(8, 30), bw, h * rng.range(0.6, 0.82), district));
    }
  }
  for (const b of buildings) {
    if (!colliders.includes(b)) colliders.push(b);
  }
}

/** Generate the whole city from a seeded generator. */
export function generateCity(rng) {
  const vRoads = [];
  const hRoads = [];
  for (let x = GRID.first; x < WORLD.width; x += GRID.pitch) vRoads.push(x);
  for (let y = GRID.first; y < WORLD.height; y += GRID.pitch) hRoads.push(y);
  const halfRoad = GRID.roadWidth / 2;

  const buildings = [];
  const colliders = [];
  const props = [];
  const blocks = [];
  for (let cx = 0; cx < vRoads.length - 1; cx += 1) {
    for (let cy = 0; cy < hRoads.length - 1; cy += 1) {
      const block = {
        x: vRoads[cx] + halfRoad,
        y: hRoads[cy] + halfRoad,
        w: GRID.pitch - GRID.roadWidth,
        h: GRID.pitch - GRID.roadWidth,
        district: DISTRICT.MIDTOWN,
      };
      block.district = districtAt(block.x + block.w / 2, block.y + block.h / 2);
      blocks.push(block);
      fillBlock(rng, block, buildings, colliders, props);
    }
  }
  // The sea itself is a wall: nobody walks or drives on water.
  colliders.push({ x: COAST.waterX, y: -64, w: WORLD.width - COAST.waterX + 128, h: WORLD.height + 128 });

  // Palms line the boardwalk and the sand's edge, shade Palm Terrace, and dot the
  // suburbs and beach blocks.
  const palms = [];
  for (let y = 60; y < WORLD.height - 40; y += rng.range(55, 100)) {
    palms.push({ x: COAST.boardwalkX + rng.range(14, 66), y, size: rng.range(0.85, 1.35), seed: rng.int(1, 9999) });
  }
  for (let y = 90; y < WORLD.height - 40; y += rng.range(80, 140)) {
    palms.push({ x: COAST.sandX + rng.range(26, 84), y, size: rng.range(0.8, 1.25), seed: rng.int(1, 9999) });
  }
  for (let y = 120; y < WORLD.height - 60; y += rng.range(150, 230)) {
    palms.push({ x: 3800 - GRID.roadWidth / 2 - 26, y, size: rng.range(0.8, 1.15), seed: rng.int(1, 9999) });
    palms.push({ x: 3800 + GRID.roadWidth / 2 + 26, y: y + 60, size: rng.range(0.8, 1.15), seed: rng.int(1, 9999) });
  }
  for (const block of blocks) {
    if ((block.district === DISTRICT.SUBURBS || block.district === DISTRICT.BEACH) && rng.chance(0.7)) {
      palms.push({ x: rng.range(block.x + 16, block.x + block.w - 16), y: rng.range(block.y + 16, block.y + block.h - 16), size: rng.range(0.7, 1.1), seed: rng.int(1, 9999) });
    }
  }
  // Lifeguard stands watch the swimming shore.
  for (let y = 480; y < WORLD.height - 200; y += 640) {
    props.push({ kind: 'lifeguard', x: COAST.waterX - 52, y });
  }

  // Street lamps along every drivable road, boats at anchor off the marina shore.
  const lamps = [];
  for (const x of vRoads) {
    if (x > 3900) continue;
    for (let y = 90; y < WORLD.height; y += 260) lamps.push({ x: x - halfRoad - 8, y });
  }
  for (const y of hRoads) {
    for (let x = 150; x < 3900; x += 340) lamps.push({ x, y: y - halfRoad - 8 });
  }
  const boats = [];
  for (let i = 0; i < 15; i += 1) {
    const nearMarina = i < 9;
    boats.push({
      x: rng.range(COAST.waterX + 60, WORLD.width - 90),
      y: nearMarina ? rng.range(2350, 3450) : rng.range(200, 2250),
      angle: rng.range(-0.4, 0.4),
      color: rng.pick(['#e8e2d4', '#b3543f', '#3f6fb3', '#e8c97a', '#3fa39a']),
    });
  }
  const piers = [];
  for (const y of [1560, 2520, 2920, 3320]) piers.push({ x: COAST.waterX - 10, y, w: 190, h: 26 });

  // Parked-car spots hug the kerbs of the drivable roads, clear of intersections.
  const parkedSpots = [];
  for (const x of vRoads) {
    if (x > 3900) continue;
    for (let y = 320; y < WORLD.height - 160; y += rng.range(150, 320)) {
      if (hRoads.some((hy) => Math.abs(hy - y) < 120)) continue;
      parkedSpots.push({ x: x + (rng.chance(0.5) ? -1 : 1) * (halfRoad + 17), y, angle: Math.PI / 2 });
    }
  }
  for (const y of hRoads) {
    for (let x = 330; x < 3850; x += rng.range(170, 340)) {
      if (vRoads.some((vx) => Math.abs(vx - x) < 120)) continue;
      parkedSpots.push({ x, y: y + (rng.chance(0.5) ? -1 : 1) * (halfRoad + 17), angle: 0 });
    }
  }

  return {
    width: WORLD.width,
    height: WORLD.height,
    vRoads,
    hRoads,
    buildings,
    colliders,
    props,
    palms,
    lamps,
    boats,
    piers,
    blocks,
    parkedSpots,
    /** Where Raka starts: the south boardwalk, a short walk from Mira at the marina. */
    playerSpawn: { x: 4020, y: 3180 },
    /** Drivable vertical roads (the boardwalk and the sea take over further east). */
    trafficVRoads: vRoads.filter((x) => x <= 3900),
  };
}

/** What the ground is at a point: decides car grip and what the renderer paints underfoot. */
export function groundType(city, x, y) {
  if (x >= COAST.waterX) return 'water';
  if (x >= COAST.sandX) return 'sand';
  if (x >= COAST.boardwalkX) return 'boardwalk';
  const halfRoad = GRID.roadWidth / 2;
  for (const vx of city.vRoads) if (Math.abs(x - vx) <= halfRoad) return 'road';
  for (const hy of city.hRoads) if (Math.abs(y - hy) <= halfRoad) return 'road';
  for (const vx of city.vRoads) if (Math.abs(x - vx) <= halfRoad + 16) return 'sidewalk';
  for (const hy of city.hRoads) if (Math.abs(y - hy) <= halfRoad + 16) return 'sidewalk';
  return 'ground';
}

/** True when a point sits on a drivable road (traffic routes and police spawns use this). */
export function isOnRoad(city, x, y) {
  const halfRoad = GRID.roadWidth / 2;
  if (x >= COAST.waterX) return false;
  for (const vx of city.trafficVRoads) if (Math.abs(x - vx) <= halfRoad) return true;
  for (const hy of city.hRoads) if (Math.abs(y - hy) <= halfRoad && x < COAST.sandX) return true;
  return false;
}

/**
 * Push a circle out of every collider and the world bounds. Returns the corrected
 * position and whether anything was hit, so cars can notice crashes and people can stop.
 */
export function collideCircle(city, x, y, radius) {
  let hit = false;
  const colliders = city.colliders;
  for (let i = 0; i < colliders.length; i += 1) {
    const r = colliders[i];
    const nearX = Math.max(r.x, Math.min(x, r.x + r.w));
    const nearY = Math.max(r.y, Math.min(y, r.y + r.h));
    const dx = x - nearX;
    const dy = y - nearY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      x = nearX + (dx / dist) * radius;
      y = nearY + (dy / dist) * radius;
    } else {
      // Centre inside the rectangle: leave by the shortest side.
      const left = x - r.x;
      const right = r.x + r.w - x;
      const top = y - r.y;
      const bottom = r.y + r.h - y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = r.x - radius;
      else if (min === right) x = r.x + r.w + radius;
      else if (min === top) y = r.y - radius;
      else y = r.y + r.h + radius;
    }
  }
  if (x < radius) { x = radius; hit = true; }
  if (y < radius) { y = radius; hit = true; }
  if (x > city.width - radius) { x = city.width - radius; hit = true; }
  if (y > city.height - radius) { y = city.height - radius; hit = true; }
  return { x, y, hit };
}
