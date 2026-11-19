// Pedestrians: Sunharbor's walkers. Each one loops the sidewalk around a city block (or
// strolls the boardwalk), pauses now and then, and reacts to the city: a gunshot, a crash
// or a punch nearby sends them running, and getting clipped by a car or knocked down puts
// them on the pavement for a while. They are witnesses, too — the police system reads
// their positions when a crime is reported.
import { collideCircle } from './world.js';

const SHIRTS = ['#e8c97a', '#7dc9e8', '#e87d9a', '#9ae87d', '#e8e2d4', '#b48ee8', '#e8975a', '#5ad9c2'];
const PANTS = ['#3d4b5c', '#5c4a3d', '#2e3d55', '#6e6257', '#445544'];

/** The four sidewalk corners of a block, just outside its building line. */
function blockCorners(block) {
  const inset = -11;
  return [
    { x: block.x + inset, y: block.y + inset },
    { x: block.x + block.w - inset, y: block.y + inset },
    { x: block.x + block.w - inset, y: block.y + block.h - inset },
    { x: block.x + inset, y: block.y + block.h - inset },
  ];
}

/** Create the walking population, spread over the city's blocks and the boardwalk. */
export function createPeds(city, rng, count) {
  const peds = [];
  const walkable = city.blocks.filter((b) => b.district !== 'beach');
  for (let i = 0; i < count; i += 1) {
    let x;
    let y;
    let corners = null;
    let corner = 0;
    if (i % 6 === 5) {
      // Every sixth walker strolls the boardwalk instead of a block.
      x = 4010 + rng.range(0, 50);
      y = rng.range(200, city.height - 200);
    } else {
      const block = rng.pick(walkable);
      corners = blockCorners(block);
      corner = rng.int(0, 3);
      x = corners[corner].x;
      y = corners[corner].y;
    }
    peds.push({
      x, y,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(46, 78),
      corners,
      corner,
      state: 'walk', // walk | flee | down
      pauseTimer: 0,
      fleeTimer: 0,
      fleeFrom: { x: 0, y: 0 },
      downTimer: 0,
      health: 60,
      phase: rng.range(0, Math.PI * 2),
      shirt: rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
    });
  }
  return peds;
}

/** Send every walker within earshot of a point running from it. */
export function scarePeds(peds, x, y, radius = 170) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.4;
      ped.fleeFrom.x = x;
      ped.fleeFrom.y = y;
    }
  }
}

/** Knock a walker down (car clip, punch, bullet). They get up again after a while. */
export function knockDown(ped, seconds = 6) {
  ped.state = 'down';
  ped.downTimer = seconds;
  ped.health -= 30;
}

/** Advance all walkers one step. */
export function updatePeds(peds, dt, city, rng) {
  for (const ped of peds) {
    ped.phase += dt * (ped.state === 'flee' ? 13 : 8);
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        ped.health = 60;
      }
      continue;
    }
    let tx;
    let ty;
    let speed = ped.speed;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      const dx = ped.x - ped.fleeFrom.x;
      const dy = ped.y - ped.fleeFrom.y;
      const len = Math.hypot(dx, dy) || 1;
      tx = ped.x + (dx / len) * 120;
      ty = ped.y + (dy / len) * 120;
      speed = 172;
    } else if (ped.corners) {
      if (ped.pauseTimer > 0) {
        ped.pauseTimer -= dt;
        continue;
      }
      const target = ped.corners[ped.corner];
      tx = target.x;
      ty = target.y;
      if (Math.hypot(tx - ped.x, ty - ped.y) < 8) {
        ped.corner = (ped.corner + 1) % 4;
        if (rng.chance(0.16)) ped.pauseTimer = rng.range(0.6, 2.4);
        continue;
      }
    } else {
      // Boardwalk stroller: drift north or south along the boards, turn at the ends.
      ty = ped.y + Math.sin(ped.phase * 0.11) * 90;
      tx = 4032;
      if (Math.hypot(tx - ped.x, ty - ped.y) < 10) ped.phase += 1.7;
    }
    const dx = tx - ped.x;
    const dy = ty - ped.y;
    const len = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy, dx);
    const solved = collideCircle(city, ped.x + (dx / len) * speed * dt, ped.y + (dy / len) * speed * dt, 9);
    ped.x = solved.x;
    ped.y = solved.y;
  }
}
