// The staged scenes behind ?shot=cover|chase|foot|mission|beach (shots.json uses cover,
// foot, mission and beach). Each one takes the freshly built game and moves its real
// cars, walkers and police into a composed moment — a downtown chase, a busy crossing, a
// drive at a checkpoint, a sunset cruise — sets the wanted level and the objective the
// HUD should show, and freezes it. Same seed, same frame, every run.
import { STORY_MISSIONS } from './missions.js';
import { setWanted } from './police.js';
import { CAR_TYPES, createCar } from './vehicles.js';

/** Move a traffic car to an exact spot and heading for a staged frame. */
function placeTraffic(game, index, x, y, angle) {
  const car = game.trafficCars[index % game.trafficCars.length];
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  return car;
}

/** Scatter walkers around a point so a staged street feels lived in. */
function placePeds(game, cx, cy, count) {
  const spots = [
    [52, -38], [-64, 24], [30, 66], [-38, -70], [86, 44], [-96, -30], [12, -104], [110, -58],
  ];
  for (let i = 0; i < count; i += 1) {
    const ped = game.peds[i % game.peds.length];
    const [dx, dy] = spots[i % spots.length];
    ped.x = cx + dx;
    ped.y = cy + dy;
    ped.state = 'walk';
    ped.angle = (i * 1.3) % (Math.PI * 2);
  }
}

/** Park two extra cars at a crossing for depth. */
function placeParked(game, index, x, y, angle) {
  const car = game.parkedCars[index % game.parkedCars.length];
  car.x = x;
  car.y = y;
  car.angle = angle;
  return car;
}

function stageCover(game) {
  // A chase through the Coral Boulevard / Solstice crossing, three stars up.
  const p = game.player;
  const car = placeTraffic(game, 0, 2080, 1466, 0);
  p.car = car;
  car.driver = 'player';
  car.typeName = 'sport';
  car.type = CAR_TYPES.sport;
  car.color = '#e8c97a';
  p.x = car.x;
  p.y = car.y;
  p.angle = 0;
  const cop1 = createCar(game.rng, 'police', 1935, 1398, 0.18, 'police');
  const cop2 = createCar(game.rng, 'police', 1862, 1510, -0.08, 'police');
  game.police.cars.push(cop1, cop2);
  setWanted(game.police, 3);
  placeTraffic(game, 1, 2330, 1336, Math.PI);
  placeTraffic(game, 2, 2460, 1466, Math.PI);
  placeTraffic(game, 3, 2266, 1180, Math.PI / 2);
  placeTraffic(game, 4, 2134, 1700, -Math.PI / 2);
  placeParked(game, 0, 2036, 1560, Math.PI / 2);
  placePeds(game, 2200, 1400, 6);
  game.missions.active = { def: STORY_MISSIONS[0], stageIndex: 1, timeLeft: 96 };
  game.objectiveOverride = {
    title: 'First Run',
    text: 'Deliver the crate to the Dockside warehouse',
    target: { x: 700, y: 2380 },
    timeLeft: 96,
  };
  game.cameraOverride = { x: 2080 - 640, y: 1466 - 360 };
}

function stageFoot(game) {
  // On foot at the same busy crossing, late light, traffic and walkers everywhere.
  const p = game.player;
  p.car = null;
  p.x = 2122;
  p.y = 1330;
  p.angle = 0.7;
  placeTraffic(game, 0, 2330, 1336, Math.PI);
  placeTraffic(game, 1, 1980, 1466, 0);
  placeTraffic(game, 2, 2266, 1150, Math.PI / 2);
  placeTraffic(game, 3, 2134, 1690, -Math.PI / 2);
  placeTraffic(game, 4, 2560, 1336, Math.PI);
  placeParked(game, 0, 2036, 1560, Math.PI / 2);
  placeParked(game, 1, 2364, 1240, -Math.PI / 2);
  placePeds(game, 2200, 1400, 8);
  game.cameraOverride = { x: 2122 - 640, y: 1330 - 360 };
}

function stageMission(game) {
  // Mid-mission: Raka drives west toward the glowing warehouse checkpoint, timer running.
  const p = game.player;
  const car = placeTraffic(game, 0, 1330, 2266, Math.PI);
  p.car = car;
  car.driver = 'player';
  car.color = '#c94f43';
  p.x = car.x;
  p.y = car.y;
  p.angle = Math.PI;
  placeTraffic(game, 1, 1050, 2134, 0);
  placeTraffic(game, 2, 1620, 2266, Math.PI);
  placeTraffic(game, 3, 866, 1980, Math.PI / 2);
  placePeds(game, 900, 2300, 4);
  game.missions.active = { def: STORY_MISSIONS[0], stageIndex: 1, timeLeft: 118 };
  game.objectiveOverride = {
    title: 'First Run',
    text: 'Deliver the crate to the Dockside warehouse',
    target: { x: 700, y: 2380 },
    timeLeft: 118,
  };
  game.cameraOverride = { x: 1330 - 640, y: 2266 - 360 };
}

function stageBeach(game) {
  // Sunset cruise along the shore: sand, palms and water, one star of flavour.
  const p = game.player;
  const car = placeTraffic(game, 0, 4300, 1500, Math.PI / 2);
  p.car = car;
  car.driver = 'player';
  car.typeName = 'cruiser';
  car.type = CAR_TYPES.cruiser;
  car.color = '#d96f32';
  p.x = car.x;
  p.y = car.y;
  p.angle = Math.PI / 2;
  // Extra staged palms and a beach umbrella dress the shoreline.
  game.city.palms.push(
    { x: 4245, y: 1330, size: 1.25, seed: 42 },
    { x: 4365, y: 1620, size: 1.1, seed: 77 },
    { x: 4150, y: 1700, size: 0.95, seed: 91 },
  );
  game.city.props.push({ kind: 'umbrella', x: 4370, y: 1415, color: '#e2543e' });
  const cop = createCar(game.rng, 'police', 3866, 1190, Math.PI / 2, 'police');
  game.police.cars.push(cop);
  setWanted(game.police, 1);
  placeTraffic(game, 1, 3734, 1336, 0);
  placePeds(game, 4030, 1330, 5);
  game.objectiveOverride = {
    title: 'SunPost Courier',
    text: 'Deliver the parcel',
    target: { x: 4030, y: 720 },
    timeLeft: null,
  };
  game.clockMinutes = 18 * 60 + 42;
  game.cameraOverride = { x: 4300 - 640, y: 1500 - 360 };
}

/**
 * Set the game to the named scene. 'chase' is an alias of the cover chase; any other
 * unknown name falls back to the cover scene so a bad query still yields a frame.
 */
export function stageShot(name, game) {
  if (name === 'foot') stageFoot(game);
  else if (name === 'mission') stageMission(game);
  else if (name === 'beach') stageBeach(game);
  else stageCover(game);
}
