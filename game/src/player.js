// Raka, the player: on-foot movement with a walk cycle, sprinting, ducking in and out of
// any car in reach (F or Enter), fists on Space, and — once the story arms him — a pistol
// aimed with the mouse and fired with a click. Driving uses the shared car physics.
// Everything the world should react to (a theft, a punch, a shot, a crash) is reported
// through ctx.emit so police, sound and missions stay out of this file.
import { PLAYER } from './config.js';
import { ACTION_ENTER_CAR, ACTION_PUNCH } from './input.js';
import { approach, damageCar, engineFactor, moveCar } from './vehicles.js';
import { collideCircle } from './world.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    car: null,
    hasPistol: false,
    cash: 0,
    walkPhase: 0,
    moving: false,
    punchTimer: 0,
    shotTimer: 0,
    hurtTimer: 0, // time since last damage; health creeps back when it stays quiet
    muzzle: 0, // seconds of muzzle flash left to draw
    lastShot: null, // {x1,y1,x2,y2,t} tracer for the renderer
  };
}

/** The point other systems treat as "where the player is", and how fast they are moving. */
export function playerPos(player) {
  return { x: player.x, y: player.y };
}

export function playerVelocity(player) {
  if (player.car) {
    return { x: Math.cos(player.car.angle) * player.car.speed, y: Math.sin(player.car.angle) * player.car.speed };
  }
  return { x: 0, y: 0 };
}

export function playerSpeed(player) {
  if (player.car) return Math.abs(player.car.speed);
  return player.moving ? PLAYER.walkSpeed : 0;
}

/** Hurt Raka. Returns true when this drops him (wasted). */
export function hurtPlayer(player, amount) {
  player.health = Math.max(0, player.health - amount);
  player.hurtTimer = 0;
  return player.health <= 0;
}

function driveCar(player, dt, ctx) {
  const car = player.car;
  const input = ctx.input;
  const factor = engineFactor(car);
  const forward = input.isDown('KeyW') || input.isDown('ArrowUp');
  const back = input.isDown('KeyS') || input.isDown('ArrowDown');
  const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
  const right = input.isDown('KeyD') || input.isDown('ArrowRight');
  if (forward) car.speed = approach(car.speed, car.type.topSpeed * factor, car.type.accel * dt);
  else if (back) car.speed = approach(car.speed, car.speed > 10 ? 0 : -car.type.topSpeed * 0.42, car.type.accel * 1.2 * dt);
  else car.speed = approach(car.speed, 0, 130 * dt);
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  if (steer !== 0 && Math.abs(car.speed) > 4) {
    const rate = 1.9 * Math.min(1, Math.abs(car.speed) / 190) * Math.sign(car.speed);
    car.angle += steer * rate * dt;
  }
  const impact = moveCar(car, dt, ctx.city);
  if (impact > 0) {
    damageCar(car, impact * 0.055);
    if (impact > 240) hurtPlayer(player, (impact - 240) * 0.02);
    ctx.emit({ type: 'crash', car, impact, x: car.x, y: car.y });
  }
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
}

function exitCar(player, ctx) {
  const car = player.car;
  const side = car.angle + Math.PI / 2;
  const solved = collideCircle(ctx.city, car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, PLAYER.radius);
  player.x = solved.x;
  player.y = solved.y;
  car.driver = null;
  if (car.kind !== 'police') car.kind = 'parked';
  player.car = null;
  ctx.emit({ type: 'exitCar', car });
}

function tryEnterCar(player, ctx) {
  let best = null;
  let bestDist = 58;
  for (const car of ctx.allCars) {
    if (car.driver) continue;
    if (car.kind === 'traffic' && Math.abs(car.speed) > 70) continue; // too fast to grab
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  if (!best) return;
  player.car = best;
  best.driver = 'player';
  best.speed = Math.min(best.speed, 40);
  player.x = best.x;
  player.y = best.y;
  ctx.emit({ type: 'enterCar', car: best, wasParked: best.kind === 'parked' || best.stolen });
}

function punch(player, ctx) {
  const reach = PLAYER.punchRange;
  const tx = player.x + Math.cos(player.angle) * reach;
  const ty = player.y + Math.sin(player.angle) * reach;
  for (const ped of ctx.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - tx, ped.y - ty) < 24) {
      ctx.emit({ type: 'punchPed', ped, x: ped.x, y: ped.y });
      return;
    }
  }
  for (const officer of ctx.officers) {
    if (Math.hypot(officer.x - tx, officer.y - ty) < 24) {
      ctx.emit({ type: 'punchOfficer', officer, x: officer.x, y: officer.y });
      return;
    }
  }
  for (const car of ctx.allCars) {
    if (Math.hypot(car.x - tx, car.y - ty) < 34) {
      damageCar(car, 6);
      ctx.emit({ type: 'punchCar', car, x: tx, y: ty });
      return;
    }
  }
  ctx.emit({ type: 'punchAir', x: tx, y: ty });
}

function shoot(player, ctx) {
  const from = { x: player.x, y: player.y };
  const angle = Math.atan2(ctx.mouseWorld.y - from.y, ctx.mouseWorld.x - from.x);
  player.angle = angle;
  const range = PLAYER.shotRange;
  let bestT = range;
  let hit = null;
  let hitEntity = null;
  const rayHit = (ox, oy, radius, entity) => {
    const dx = ox - from.x;
    const dy = oy - from.y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > bestT) return;
    const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (across < radius) {
      bestT = along;
      hit = { x: ox, y: oy, along };
      hitEntity = entity;
    }
  };
  for (const ped of ctx.peds) if (ped.state !== 'down') rayHit(ped.x, ped.y, 13, { kind: 'ped', ref: ped });
  for (const officer of ctx.officers) rayHit(officer.x, officer.y, 13, { kind: 'officer', ref: officer });
  for (const car of ctx.allCars) if (car !== player.car) rayHit(car.x, car.y, 26, { kind: 'car', ref: car });
  const end = {
    x: from.x + Math.cos(angle) * (hit ? hit.along : Math.min(range, Math.hypot(ctx.mouseWorld.x - from.x, ctx.mouseWorld.y - from.y))),
    y: from.y + Math.sin(angle) * (hit ? hit.along : Math.min(range, Math.hypot(ctx.mouseWorld.x - from.x, ctx.mouseWorld.y - from.y))),
  };
  player.muzzle = 0.06;
  player.lastShot = { x1: from.x, y1: from.y, x2: end.x, y2: end.y, t: 0.09 };
  ctx.emit({ type: 'shot', x: from.x, y: from.y, hit, hitEntity, end });
}

/** Advance Raka one step: driving if he is in a car, on foot otherwise. */
export function updatePlayer(player, dt, ctx) {
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.shotTimer = Math.max(0, player.shotTimer - dt);
  player.muzzle = Math.max(0, player.muzzle - dt);
  if (player.lastShot) {
    player.lastShot.t -= dt;
    if (player.lastShot.t <= 0) player.lastShot = null;
  }
  player.hurtTimer += dt;
  if (player.hurtTimer > 6 && player.health > 0 && player.health < PLAYER.maxHealth) {
    player.health = Math.min(PLAYER.maxHealth, player.health + 2.4 * dt);
  }

  const actions = ctx.actions;
  if (player.car) {
    if (actions & ACTION_ENTER_CAR) {
      exitCar(player, ctx);
      return;
    }
    driveCar(player, dt, ctx);
    return;
  }

  if (actions & ACTION_ENTER_CAR) {
    tryEnterCar(player, ctx);
    if (player.car) return;
  }

  const axes = ctx.input.moveAxes();
  const sprint = ctx.input.isDown('ShiftLeft') || ctx.input.isDown('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  player.moving = axes.x !== 0 || axes.y !== 0;
  if (player.moving) {
    const len = Math.hypot(axes.x, axes.y);
    const solved = collideCircle(ctx.city, player.x + (axes.x / len) * speed * dt, player.y + (axes.y / len) * speed * dt, PLAYER.radius);
    player.x = solved.x;
    player.y = solved.y;
    player.angle = Math.atan2(axes.y, axes.x);
    player.walkPhase += dt * (sprint ? 12 : 9);
  }
  // With a pistol out, Raka faces the aim when the mouse is being used to fire.
  if (player.hasPistol && ctx.input.mouse.down) {
    player.angle = Math.atan2(ctx.mouseWorld.y - player.y, ctx.mouseWorld.x - player.x);
  }
  if ((actions & ACTION_PUNCH) && player.punchTimer <= 0) {
    player.punchTimer = PLAYER.punchCooldown;
    punch(player, ctx);
  }
  if (player.hasPistol && ctx.mouseClicked && player.shotTimer <= 0) {
    player.shotTimer = PLAYER.shotCooldown;
    shoot(player, ctx);
  }
}
