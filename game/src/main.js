// Boot and the one loop for Sunharbor Heat: build the city and everyone in it, then run
// fixed 1/60 s steps — player, traffic, walkers, police, missions, collisions, effects —
// and paint through the renderer. This file owns the screens (title, play, paused, busted,
// wasted), the event bus every other system reports through, respawns, and saving.
//
// ?seed=N fixes the city. ?shot=cover|foot|mission|beach (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { CLOCK, STEP } from './config.js';
import { createRandom } from './random.js';
import { generateCity } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createCar, damageCar, spawnParked, spawnTraffic, updateTrafficCar } from './vehicles.js';
import { createPeds, knockDown, scarePeds, updatePeds } from './pedestrians.js';
import { clearWanted, createPoliceSystem, reportCrime, setWanted, updatePolice } from './police.js';
import { createPlayer, hurtPlayer, playerPos, playerSpeed, playerVelocity, updatePlayer } from './player.js';
import { createMissionState, currentObjective, nextGiver, updateMissions } from './missions.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const HOSPITAL = { x: 2260, y: 1500 };
const POLICE_STATION = { x: 2580, y: 940 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

function createGame() {
  const worldRng = createRandom(seed);
  const rng = createRandom((seed ^ 0x9e3779b9) >>> 0);
  const city = generateCity(worldRng);
  return {
    rng,
    city,
    player: createPlayer(city.playerSpawn),
    trafficCars: spawnTraffic(city, worldRng, 26),
    parkedCars: spawnParked(city, worldRng, 30),
    peds: createPeds(city, worldRng, 42),
    police: createPoliceSystem(),
    missions: createMissionState(),
    time: 0,
    clockMinutes: CLOCK.startMinutes,
    effects: { smoke: [] },
    shake: 0,
    flash: 0,
    toast: null,
    dialog: null,
    dialogQueue: [],
    objective: null,
    objectiveOverride: null,
    giver: null,
    missionVan: null,
    hasSave: loadSave() !== null,
    cameraOverride: null,
    started: false,
    saveTimer: 0,
  };
}

const game = createGame();
const renderer = createRenderer(canvas);

function announce(message) {
  status.textContent = message;
}

function toast(text, seconds = 3.6) {
  game.toast = { text, t: seconds };
}

/** Everything the systems report lands here: crime, sound, money and story beats. */
function handleEvent(e) {
  const p = game.player;
  switch (e.type) {
    case 'enterCar': {
      if (!e.car.stolen) {
        e.car.stolen = true;
        reportCrime(game.police, game.peds, e.car.kind === 'police' ? 'grandTheft' : 'theft', e.car.x, e.car.y);
        scarePeds(game.peds, e.car.x, e.car.y, 95);
      }
      announce(`Driving the ${e.car.type.name}.`);
      break;
    }
    case 'crash': {
      if (e.impact > 200) {
        audio.crash();
        game.shake = Math.min(11, e.impact / 34);
        scarePeds(game.peds, e.x, e.y, 150);
        if (e.impact > 300) reportCrime(game.police, game.peds, 'reckless', e.x, e.y);
      }
      break;
    }
    case 'punchPed':
      knockDown(e.ped, 6);
      audio.punch();
      scarePeds(game.peds, e.x, e.y, 130);
      reportCrime(game.police, game.peds, 'assault', e.x, e.y);
      break;
    case 'punchOfficer': {
      const index = game.police.officers.indexOf(e.officer);
      if (index >= 0) game.police.officers.splice(index, 1);
      audio.punch();
      reportCrime(game.police, game.peds, 'assault', e.x, e.y);
      break;
    }
    case 'punchCar':
      audio.punch();
      game.shake = Math.max(game.shake, 2);
      break;
    case 'shot': {
      audio.gunshot();
      scarePeds(game.peds, e.x, e.y, 280);
      reportCrime(game.police, game.peds, 'shots', e.x, e.y);
      if (e.hitEntity) {
        if (e.hitEntity.kind === 'ped') knockDown(e.hitEntity.ref, 8);
        else if (e.hitEntity.kind === 'officer') {
          const index = game.police.officers.indexOf(e.hitEntity.ref);
          if (index >= 0) game.police.officers.splice(index, 1);
        } else if (e.hitEntity.kind === 'car') damageCar(e.hitEntity.ref, 26);
      }
      break;
    }
    case 'dialog':
      game.dialogQueue.push(...e.lines);
      break;
    case 'missionStart':
      announce(`Mission started: ${e.name}.`);
      break;
    case 'stageAdvance':
      audio.pickup();
      break;
    case 'missionComplete': {
      p.cash += e.reward;
      audio.jingle();
      let extra = '';
      if (e.givesPistol && !p.hasPistol) {
        p.hasPistol = true;
        extra = ' — pistol acquired (aim with the mouse, click to fire)';
      }
      toast(`Mission complete: ${e.name}  +$${e.reward}${extra}`, 4.6);
      announce(`Mission complete: ${e.name}. Earned ${e.reward} dollars.`);
      persist();
      break;
    }
    case 'missionFailed':
      audio.sting();
      toast(`Mission failed: ${e.name} — the giver will offer it again`);
      break;
    case 'sideJobComplete':
      p.cash += e.reward;
      audio.pickup();
      toast(`SunPost delivery complete  +$${e.reward}`);
      persist();
      break;
    case 'setWanted':
      setWanted(game.police, e.stars);
      break;
    case 'spawnMissionVan': {
      const van = createCar(game.rng, 'van', 1000, 2260, 0, 'parked');
      van.color = '#e8c97a';
      van.missionId = 'hot-van';
      game.parkedCars.push(van);
      game.missionVan = van;
      break;
    }
    default:
      break;
  }
}

function persist() {
  if (!game.started) return;
  writeSave({
    cash: game.player.cash,
    storyIndex: game.missions.storyIndex,
    storyDone: game.missions.storyDone,
    hasPistol: game.player.hasPistol,
    x: Math.round(game.player.x),
    y: Math.round(game.player.y),
  });
  game.hasSave = true;
}

/** Cars running people over, and people being run over: checked once per step. */
function checkCollisions() {
  const p = game.player;
  const allCars = [...game.trafficCars, ...game.parkedCars, ...game.police.cars];
  for (const car of allCars) {
    const speed = Math.abs(car.speed);
    if (speed > 55) {
      for (const ped of game.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 24) {
          knockDown(ped, 7);
          scarePeds(game.peds, ped.x, ped.y, 130);
          car.speed *= 0.55;
          if (car === p.car) {
            audio.crash();
            game.shake = Math.max(game.shake, 4);
            reportCrime(game.police, game.peds, 'assault', ped.x, ped.y);
          }
        }
      }
      if (!p.car && Math.hypot(p.x - car.x, p.y - car.y) < 27) {
        hurtPlayer(p, 13);
        game.flash = 1;
        audio.crash();
        const away = Math.atan2(p.y - car.y, p.x - car.x);
        p.x += Math.cos(away) * 30;
        p.y += Math.sin(away) * 30;
      }
    }
    // Shunt other cars out of the player's car instead of overlapping them.
    if (p.car && car !== p.car && Math.abs(p.car.speed) > 30) {
      const dx = car.x - p.car.x;
      const dy = car.y - p.car.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01 && dist < 46) {
        car.x += (dx / dist) * (46 - dist);
        car.y += (dy / dist) * (46 - dist);
        if (Math.abs(p.car.speed) > 220) {
          damageCar(car, 9);
          damageCar(p.car, 5);
          audio.crash();
          game.shake = Math.max(game.shake, 5);
          reportCrime(game.police, game.peds, 'reckless', car.x, car.y);
        }
      }
    }
  }
}

/** One fixed step of the playing world. frame carries this frame's input snapshot. */
function stepPlaying(dt, frame) {
  const p = game.player;
  game.time += dt;
  game.clockMinutes = (game.clockMinutes + dt * CLOCK.minutesPerSecond) % (24 * 60);

  updatePlayer(p, dt, {
    city: game.city,
    input: frame.input,
    actions: frame.actions,
    allCars: frame.allCars,
    peds: game.peds,
    officers: game.police.officers,
    mouseWorld: frame.mouseWorld,
    mouseClicked: frame.mouseClicked,
    emit: handleEvent,
  });
  for (const car of game.trafficCars) updateTrafficCar(car, dt, { city: game.city, cars: frame.allCars, playerPos: p, playerCar: p.car }, game.rng);
  updatePeds(game.peds, dt, game.city, game.rng);

  const busted = updatePolice(game.police, dt, {
    city: game.city,
    rng: game.rng,
    playerPos: playerPos(p),
    playerVel: playerVelocity(p),
    playerSpeed: playerSpeed(p),
    playerInCar: p.car !== null,
    onPoliceCrash: (car, impact) => damageCar(car, impact * 0.03),
  });

  updateMissions(game.missions, dt, {
    playerPos: playerPos(p),
    inCar: p.car !== null,
    playerCarMissionId: p.car && p.car.missionId ? p.car.missionId : null,
    interactPressed: (frame.actions & ACTION_INTERACT) !== 0,
    randomRoadPoint: () => {
      if (game.rng.chance(0.5)) {
        return { x: game.city.trafficVRoads[game.rng.int(0, game.city.trafficVRoads.length - 1)], y: game.rng.range(200, game.city.height - 200) };
      }
      return { x: game.rng.range(200, 3600), y: game.city.hRoads[game.rng.int(0, game.city.hRoads.length - 1)] };
    },
    emit: handleEvent,
  });

  checkCollisions();

  // Smoke from hurt engines, drifting up and thinning out.
  for (const car of frame.allCars) {
    if (car.health < 55 && game.rng.chance(0.24)) {
      game.effects.smoke.push({ x: car.x + Math.cos(car.angle) * 16, y: car.y + Math.sin(car.angle) * 16, r: 5, t: 0, life: 1.3 });
    }
  }
  for (const puff of game.effects.smoke) {
    puff.t += dt;
    puff.r += 13 * dt;
    puff.y -= 16 * dt;
  }
  game.effects.smoke = game.effects.smoke.filter((puff) => puff.t < puff.life);

  game.shake = Math.max(0, game.shake - dt * 26);
  game.flash = Math.max(0, game.flash - dt * 2.2);
  if (game.toast) {
    game.toast.t -= dt;
    if (game.toast.t <= 0) game.toast = null;
  }
  if (game.dialog) {
    game.dialog.t -= dt;
    if (game.dialog.t <= 0) game.dialog = null;
  }
  if (!game.dialog && game.dialogQueue.length > 0) {
    const line = game.dialogQueue.shift();
    game.dialog = { who: line.who, text: line.text, t: 4.4 };
  }
  game.objective = game.objectiveOverride ?? currentObjective(game.missions);
  game.giver = nextGiver(game.missions);

  game.saveTimer += dt;
  if (game.saveTimer > 5) {
    game.saveTimer = 0;
    persist();
  }
  audio.update(dt, p.car ? Math.abs(p.car.speed) / p.car.type.topSpeed : 0, game.police.nearest ?? Infinity);

  if (busted) return 'busted';
  if (p.health <= 0) return 'wasted';
  return null;
}

/** The title backdrop stays alive: traffic rolls and walkers stroll, nobody hunts. */
function stepAmbient(dt) {
  game.time += dt;
  const frame = { cars: [...game.trafficCars, ...game.parkedCars], playerPos: { x: -9999, y: -9999 }, playerCar: null };
  for (const car of game.trafficCars) updateTrafficCar(car, dt, { city: game.city, cars: frame.cars, playerPos: frame.playerPos, playerCar: null }, game.rng);
  updatePeds(game.peds, dt, game.city, game.rng);
}

function runShot(name) {
  stageShot(name, game);
  game.objective = game.objectiveOverride ?? currentObjective(game.missions);
  game.giver = nextGiver(game.missions);
  let painted = 0;
  function paint() {
    renderer.draw(game, SCREEN_PLAY);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let pendingActions = 0;
  let endTimer = 0;

  window.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());

  function startRun(continueSave) {
    if (continueSave) {
      const save = loadSave();
      if (save) {
        game.player.cash = save.cash;
        game.player.hasPistol = save.hasPistol === true;
        game.player.x = save.x;
        game.player.y = save.y;
        game.missions.storyIndex = save.storyIndex ?? 0;
        game.missions.storyDone = save.storyDone === true;
      }
    } else {
      clearSave();
      game.hasSave = false;
    }
    game.started = true;
    screen = SCREEN_PLAY;
    announce('Playing Sunharbor Heat.');
  }

  function respawn() {
    const p = game.player;
    if (p.car) {
      p.car.driver = null;
      if (p.car.kind !== 'police') p.car.kind = 'parked';
      p.car = null;
    }
    const spot = screen === SCREEN_BUSTED ? POLICE_STATION : HOSPITAL;
    p.x = spot.x;
    p.y = spot.y;
    p.health = 100;
    p.cash = Math.max(0, p.cash - Math.ceil(p.cash * 0.12));
    clearWanted(game.police);
    game.missions.active = null;
    game.missions.sideJob = null;
    screen = SCREEN_PLAY;
    persist();
    announce('Back on the street.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    pendingActions |= input.takeActions();
    const clicked = input.takeClick();

    if (screen === SCREEN_TITLE) {
      if (input.wasPressed('KeyC') && game.hasSave) startRun(true);
      else if (pendingActions & ACTION_CONFIRM) startRun(game.hasSave && clicked);
      pendingActions = 0;
    } else if (screen === SCREEN_PLAY && (pendingActions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      pendingActions = 0;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED && (pendingActions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      pendingActions = 0;
      announce('Playing.');
    } else if ((screen === SCREEN_BUSTED || screen === SCREEN_WASTED) && (pendingActions & ACTION_CONFIRM)) {
      pendingActions = 0;
      respawn();
    }

    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      steps += 1;
      accumulator -= STEP;
      if (screen === SCREEN_TITLE) {
        stepAmbient(STEP);
      } else if (screen === SCREEN_PLAY) {
        const allCars = [...game.trafficCars, ...game.parkedCars, ...game.police.cars];
        const mouseWorld = { x: input.mouse.x + renderer.camera.x, y: input.mouse.y + renderer.camera.y };
        const outcome = stepPlaying(STEP, {
          input,
          actions: pendingActions,
          allCars,
          mouseWorld,
          mouseClicked: clicked && steps === 1,
        });
        pendingActions = 0;
        if (outcome === 'busted' || outcome === 'wasted') {
          screen = outcome === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
          endTimer = 3.2;
          audio.sting();
          announce(outcome === 'busted' ? 'Busted.' : 'Wasted.');
          break;
        }
      } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
        endTimer -= STEP;
        if (endTimer <= 0) {
          respawn();
          break;
        }
      } else {
        break;
      }
    }
    if (steps === 5) accumulator = 0;
    renderer.draw(game, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sunharbor Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// A handle for automated playtests (and curious players in devtools): the live game state.
window.__sunharbor = game;
