// Cars: the invented Sunharbor model range, parked cars on the kerbs, live traffic that
// follows the road grid in right-hand lanes and brakes for whatever is ahead, the driving
// physics the player uses, and damage with smoke. Police pursuit steering lives in
// police.js but drives through the same steerToward helper.
import { collideCircle, groundType } from './world.js';

/** The model range. Speeds are world pixels per second; health is crash hit points. */
export const CAR_TYPES = {
  compact: { name: 'Kestrel Compact', topSpeed: 330, accel: 300, colors: ['#c94f43', '#4f7dc9', '#c9c2b4', '#5da464'], w: 44, h: 24, health: 90 },
  sedan: { name: 'Marlin Sedan', topSpeed: 390, accel: 320, colors: ['#7d8ea3', '#3d4b5c', '#a33b3b', '#d8d3c3'], w: 48, h: 25, health: 110 },
  cruiser: { name: 'Coral Cruiser', topSpeed: 360, accel: 290, colors: ['#e0a83c', '#7a4fa3', '#3fa39a', '#d96f32'], w: 48, h: 26, health: 120 },
  pickup: { name: 'Tidewater Pickup', topSpeed: 350, accel: 300, colors: ['#6b7f5e', '#8a6f4d', '#54687d', '#9c4a2f'], w: 50, h: 26, health: 140 },
  van: { name: 'Anchor Van', topSpeed: 320, accel: 260, colors: ['#d8d3c3', '#7d8ea3', '#4d6b5d'], w: 54, h: 28, health: 150 },
  sport: { name: 'Gullwing GT', topSpeed: 540, accel: 430, colors: ['#e8c97a', '#c92f43', '#2f6fc9', '#22242c'], w: 48, h: 24, health: 80 },
  police: { name: 'SHD Interceptor', topSpeed: 470, accel: 400, colors: ['#eef1f5'], w: 50, h: 26, health: 160 },
};

const TRAFFIC_TYPE_NAMES = ['compact', 'sedan', 'cruiser', 'pickup', 'van', 'sport'];
const LANE_OFFSET = 32;

/** Create one car of a type at a spot. kind: 'traffic', 'parked' or 'police'. */
export function createCar(rng, typeName, x, y, angle, kind) {
  const type = CAR_TYPES[typeName];
  return {
    typeName,
    type,
    kind,
    x, y, angle,
    speed: 0,
    health: type.health,
    color: typeName === 'police' ? '#eef1f5' : rng.pick(type.colors),
    driver: null, // 'player' while Raka is behind the wheel
    stolen: false,
    smokeTimer: 0,
    honkTimer: 0,
    // Traffic route state: which road, which way along it, and any turn in progress.
    roadAxis: 'v',
    roadIndex: 0,
    dir: 1,
    turnTarget: null,
    decidedAt: '',
    cruise: 0,
  };
}

/** The lane centre for a car on a road: right-hand traffic, so the lane flips with dir. */
function lanePoint(city, car, ahead) {
  if (car.roadAxis === 'v') {
    const roadX = city.trafficVRoads[car.roadIndex];
    return { x: roadX - car.dir * LANE_OFFSET, y: car.y + car.dir * ahead };
  }
  const roadY = city.hRoads[car.roadIndex];
  return { x: car.x + car.dir * ahead, y: roadY + car.dir * LANE_OFFSET };
}

/** Put a traffic car on a random road, in its lane, facing along it. */
function placeOnRoad(rng, city, car) {
  if (rng.chance(0.5)) {
    car.roadAxis = 'v';
    car.roadIndex = rng.int(0, city.trafficVRoads.length - 1);
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.y = rng.range(80, city.height - 80);
    const p = lanePoint(city, car, 0);
    car.x = p.x;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.roadAxis = 'h';
    car.roadIndex = rng.int(0, city.hRoads.length - 1);
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.x = rng.range(80, 3700);
    const p = lanePoint(city, car, 0);
    car.y = p.y;
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
  car.cruise = car.type.topSpeed * rng.range(0.42, 0.58);
}

/** Spawn the ambient traffic fleet, spread over the grid. */
export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const car = createCar(rng, rng.pick(TRAFFIC_TYPE_NAMES), 0, 0, 0, 'traffic');
    placeOnRoad(rng, city, car);
    car.speed = car.cruise;
    cars.push(car);
  }
  return cars;
}

/** Spawn parked cars on the kerb spots the city precomputed. */
export function spawnParked(city, rng, count) {
  const spots = city.parkedSpots.slice();
  const cars = [];
  for (let i = 0; i < count && spots.length > 0; i += 1) {
    const index = Math.floor(rng.next() * spots.length);
    const spot = spots.splice(index, 1)[0];
    const car = createCar(rng, rng.pick(TRAFFIC_TYPE_NAMES), spot.x, spot.y, spot.angle + (rng.chance(0.5) ? 0 : Math.PI), 'parked');
    cars.push(car);
  }
  return cars;
}

/** Angle difference wrapped to -PI..PI. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Steer a car toward a point at up to its top speed times speedFactor, with a turn rate
 * that tightens as it slows. Shared by traffic, police pursuit and fleeing drivers.
 * Returns the distance left to the target.
 */
export function steerToward(car, dt, tx, ty, speedFactor) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const wanted = Math.atan2(dy, dx);
  const delta = angleDelta(car.angle, wanted);
  const turnRate = 2.4 - Math.min(1.2, Math.abs(car.speed) / car.type.topSpeed);
  car.angle += Math.max(-turnRate * dt, Math.min(turnRate * dt, delta));
  const target = car.type.topSpeed * speedFactor * (Math.abs(delta) > 2.2 ? 0.25 : 1);
  car.speed = approach(car.speed, target, car.type.accel * dt);
  return dist;
}

/** Move a value toward a target by at most step. */
export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

/** Anything solid ahead of a car: another car, or the player on foot. */
function obstacleAhead(car, ctx, lookAhead) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const check = (ox, oy, radius) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const along = dx * cos + dy * sin;
    if (along < 6 || along > lookAhead) return false;
    const across = Math.abs(-dx * sin + dy * cos);
    return across < radius + 16;
  };
  for (const other of ctx.cars) {
    if (other === car) continue;
    if (check(other.x, other.y, 24)) return other;
  }
  if (ctx.playerCar !== car && check(ctx.playerPos.x, ctx.playerPos.y, 12)) return 'player';
  return null;
}

/** Advance one traffic car: follow its lane, decide turns at intersections, brake for trouble. */
export function updateTrafficCar(car, dt, ctx, rng) {
  if (car.driver === 'player' || car.kind !== 'traffic') return;
  const city = ctx.city;
  // Decide a turn when rolling into an intersection we have not judged yet.
  const crossRoads = car.roadAxis === 'v' ? city.hRoads : city.trafficVRoads;
  const along = car.roadAxis === 'v' ? car.y : car.x;
  for (let i = 0; i < crossRoads.length; i += 1) {
    const centre = crossRoads[i];
    if (Math.abs(along + car.dir * 46 - centre) < 24) {
      const key = `${car.roadAxis}:${car.roadIndex}:${i}`;
      if (car.decidedAt !== key) {
        car.decidedAt = key;
        const roll = rng.next();
        if (roll > 0.55) {
          // Turn: aim at the exit lane of the crossing road.
          const turnDir = roll > 0.775 ? 1 : -1; // relative: keep it simple, world dir by axis
          const exit = { axis: car.roadAxis === 'v' ? 'h' : 'v', index: i, dir: turnDir * (rng.chance(0.5) ? 1 : -1) };
          const probe = { roadAxis: exit.axis, roadIndex: exit.index, dir: exit.dir, x: car.x, y: car.y };
          if (exit.axis === 'h') { probe.y = centre; probe.x = car.x; } else { probe.x = centre; probe.y = car.y; }
          const lane = lanePoint(city, probe, 0);
          car.turnTarget = { x: lane.x + (exit.axis === 'h' ? exit.dir * 60 : 0), y: lane.y + (exit.axis === 'v' ? exit.dir * 60 : 0), exit };
        }
      }
    }
  }

  const blocked = obstacleAhead(car, ctx, 84);
  if (car.turnTarget) {
    const dist = steerToward(car, dt, car.turnTarget.x, car.turnTarget.y, blocked ? 0 : 0.5);
    if (dist < 30) {
      car.roadAxis = car.turnTarget.exit.axis;
      car.roadIndex = car.turnTarget.exit.index;
      car.dir = car.turnTarget.exit.dir;
      car.turnTarget = null;
    }
  } else {
    const target = lanePoint(city, car, 320);
    steerToward(car, dt, target.x, target.y, blocked ? 0 : car.cruise / car.type.topSpeed);
  }
  if (blocked && car.speed < 4) car.honkTimer = Math.max(0, car.honkTimer - dt);

  moveCar(car, dt, city);
}

/** Integrate a car's motion and keep it out of buildings; returns impact speed on a hard hit. */
export function moveCar(car, dt, city) {
  const ground = groundType(city, car.x, car.y);
  const grip = ground === 'sand' ? 0.45 : ground === 'boardwalk' ? 0.7 : 1;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt * grip;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt * grip;
  const solved = collideCircle(city, nx, ny, 17);
  const impact = solved.hit && Math.abs(car.speed) > 150 ? Math.abs(car.speed) : 0;
  car.x = solved.x;
  car.y = solved.y;
  if (solved.hit) car.speed *= 0.4;
  return impact;
}

/** Apply crash damage; heavy damage smokes and saps speed. */
export function damageCar(car, amount) {
  car.health = Math.max(0, car.health - amount);
}

/** 0..1 engine health factor: a wreck barely crawls. */
export function engineFactor(car) {
  if (car.health <= 0) return 0.12;
  if (car.health < 30) return 0.45;
  if (car.health < 55) return 0.75;
  return 1;
}
