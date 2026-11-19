// The Sunharbor Police Department: a wanted level of 0-5 stars fed by witnessed crime,
// patrol interceptors that spawn on nearby roads and hunt the player, on-foot officers
// at high heat, a bust meter when they get close to a slow or cornered player, and heat
// that fades star by star while nobody in uniform can see the player.
import { WANTED } from './config.js';
import { createCar, moveCar, steerToward } from './vehicles.js';
import { collideCircle, isOnRoad } from './world.js';

/** Star cost of each crime, applied only when a witness is close enough to report it. */
export const CRIME_STARS = {
  theft: 1,
  reckless: 1,
  assault: 2,
  shots: 2,
  grandTheft: 2,
};

export function createPoliceSystem() {
  return {
    stars: 0,
    /** Seconds since any officer or police car last had eyes on the player. */
    unseenTimer: 0,
    bust: 0, // 0..1
    cars: [],
    officers: [],
    spawnTimer: 0,
  };
}

/** Is there a witness (walker or officer) within sight of a point? */
function witnessedBy(peds, officers, x, y, radius = 230) {
  for (const ped of peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < radius) return true;
  }
  for (const officer of officers) {
    if (Math.hypot(officer.x - x, officer.y - y) < radius + 60) return true;
  }
  return false;
}

/**
 * Report a crime at a point. Unwitnessed crimes are free; witnessed ones raise the
 * wanted level (never past five) and reset the cool-off clock.
 */
export function reportCrime(police, peds, kind, x, y) {
  if (!witnessedBy(peds, police.officers, x, y)) return false;
  police.stars = Math.min(WANTED.maxStars, police.stars + (CRIME_STARS[kind] ?? 1));
  police.unseenTimer = 0;
  return true;
}

/** Force the wanted level (mission scripts and staged scenes use this). */
export function setWanted(police, stars) {
  police.stars = Math.max(0, Math.min(WANTED.maxStars, stars));
  police.unseenTimer = 0;
  police.bust = 0;
}

/** Drop all heat at once (respawn after busted/wasted, or a clean save load). */
export function clearWanted(police) {
  police.stars = 0;
  police.unseenTimer = 0;
  police.bust = 0;
  police.cars.length = 0;
  police.officers.length = 0;
}

/** A road point a good way from the player, for police to arrive from. */
function spawnPoint(city, rng, playerPos) {
  for (let tries = 0; tries < 24; tries += 1) {
    const onVertical = rng.chance(0.5);
    const x = onVertical ? city.trafficVRoads[rng.int(0, city.trafficVRoads.length - 1)] : rng.range(300, 3600);
    const y = onVertical ? rng.range(200, city.height - 200) : city.hRoads[rng.int(0, city.hRoads.length - 1)];
    const dist = Math.hypot(x - playerPos.x, y - playerPos.y);
    if (dist > 520 && dist < 1100 && isOnRoad(city, x, y)) return { x, y };
  }
  return { x: Math.max(80, playerPos.x - 700), y: playerPos.y };
}

/**
 * Advance the whole police response. ctx carries the city, the rng, the player position
 * and speed, and whether the player is in a car. Returns 'busted' when the meter fills.
 */
export function updatePolice(police, dt, ctx) {
  const { city, rng, playerPos, playerSpeed, playerInCar } = ctx;
  if (police.stars === 0) {
    police.bust = 0;
    return null;
  }

  // Eyes on the player? Any police unit within sight range resets the cool-off.
  let seen = false;
  let nearest = Infinity;
  for (const car of police.cars) {
    const d = Math.hypot(car.x - playerPos.x, car.y - playerPos.y);
    nearest = Math.min(nearest, d);
    if (d < 460) seen = true;
  }
  for (const officer of police.officers) {
    const d = Math.hypot(officer.x - playerPos.x, officer.y - playerPos.y);
    nearest = Math.min(nearest, d);
    if (d < 300) seen = true;
  }
  police.unseenTimer = seen ? 0 : police.unseenTimer + dt;
  if (police.unseenTimer > WANTED.decaySeconds) {
    police.stars -= 1;
    police.unseenTimer = 0;
    if (police.stars === 0) {
      clearWanted(police);
      return null;
    }
  }

  // Keep the fleet at the size the wanted level calls for.
  police.spawnTimer -= dt;
  const wantedCars = WANTED.policeCars[police.stars];
  if (police.cars.length < wantedCars && police.spawnTimer <= 0) {
    const spot = spawnPoint(city, rng, playerPos);
    const car = createCar(rng, 'police', spot.x, spot.y, rng.range(0, Math.PI * 2), 'police');
    police.cars.push(car);
    police.spawnTimer = 1.6;
  }
  // Officers pile out near the player at high heat.
  const wantedOfficers = police.stars >= WANTED.officersFromStars ? police.stars - 2 : 0;
  if (police.officers.length < wantedOfficers && police.spawnTimer <= 0) {
    const spot = spawnPoint(city, rng, playerPos);
    police.officers.push({ x: spot.x + rng.range(-40, 40), y: spot.y + rng.range(-40, 40), angle: 0, phase: rng.range(0, 6), speed: rng.range(120, 140) });
    police.spawnTimer = 1.2;
  }
  // Units that fall far behind give up and peel off.
  police.cars = police.cars.filter((car) => Math.hypot(car.x - playerPos.x, car.y - playerPos.y) < 1500);
  police.officers = police.officers.filter((o) => Math.hypot(o.x - playerPos.x, o.y - playerPos.y) < 900);

  // Pursuit: aim ahead of the player to cut them off; ram when close.
  for (const car of police.cars) {
    const lead = playerInCar ? 0.45 : 0.15;
    const tx = playerPos.x + ctx.playerVel.x * lead;
    const ty = playerPos.y + ctx.playerVel.y * lead;
    steerToward(car, dt, tx, ty, 1);
    const impact = moveCar(car, dt, city);
    if (impact > 260) ctx.onPoliceCrash?.(car, impact);
  }
  for (const officer of police.officers) {
    const dx = playerPos.x - officer.x;
    const dy = playerPos.y - officer.y;
    const dist = Math.hypot(dx, dy) || 1;
    officer.phase += dt * 11;
    if (dist > 26) {
      const solved = collideCircle(city, officer.x + (dx / dist) * officer.speed * dt, officer.y + (dy / dist) * officer.speed * dt, 10);
      officer.x = solved.x;
      officer.y = solved.y;
      officer.angle = Math.atan2(dy, dx);
    }
  }

  // The bust meter fills while police are close and the player is slow, and drains
  // again when the player breaks away. On foot it fills much faster.
  const bustRange = playerInCar ? 95 : 130;
  const close = nearest < bustRange;
  if (close && playerSpeed < (playerInCar ? 130 : 60)) {
    police.bust = Math.min(1, police.bust + dt / WANTED.bustSeconds * (playerInCar ? 0.8 : 1.4));
  } else {
    police.bust = Math.max(0, police.bust - dt * 0.35);
  }
  police.nearest = nearest;
  return police.bust >= 1 ? 'busted' : null;
}
