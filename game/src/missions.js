// The story of Sunharbor Heat: Raka, a boardwalk courier, gets pulled into the dockside
// crews' errands. Four story missions chain across the city — a marina pickup, a hot van,
// a passenger run, and a three-point dash under heat — each with a named giver, short
// dialog, checkpoint rings, timers where the fiction wants urgency, and cash rewards.
// Between them, the SunPost courier hub pays for repeatable parcel runs. This file is the
// state machine; the world, the car and the player live elsewhere and report in via ctx.
import { COAST } from './config.js';

/** Where the courier side job is taken: the SunPost hub in south midtown. */
export const COURIER_HUB = { x: 1840, y: 2852, name: 'SunPost Courier Hub' };

export const STORY_MISSIONS = [
  {
    id: 'first-run',
    name: 'First Run',
    giver: { name: 'Mira', x: 3560, y: 2900 },
    lines: [
      { who: 'Mira', text: 'Raka! You still owe me for the boat fuel. Earn it back.' },
      { who: 'Mira', text: 'Pick up a crate at the boatyard, drop it at the Dockside warehouse. Quick and quiet.' },
    ],
    stages: [
      { text: 'Pick up the crate at the marina boatyard', target: { x: 3560, y: 3270 } },
      { text: 'Deliver the crate to the Dockside warehouse', target: { x: 700, y: 2380 }, timer: 170 },
    ],
    reward: 250,
  },
  {
    id: 'hot-cargo',
    name: 'Hot Cargo',
    giver: { name: 'Dario', x: 700, y: 2620 },
    lines: [
      { who: 'Dario', text: 'That Anchor Van by the foundry is loaded and the crew wants it moved.' },
      { who: 'Dario', text: 'Take it to the south dock gate. Expect company — and take this, you will need it.' },
    ],
    stages: [
      { text: 'Steal the marked Anchor Van near Foundry Road', target: { x: 1000, y: 2260 }, needsVan: true },
      { text: 'Deliver the van to the south dock gate', target: { x: 640, y: 3300 }, needsCar: true },
    ],
    reward: 400,
    givesPistol: true,
  },
  {
    id: 'beach-run',
    name: 'Beach Run',
    giver: { name: 'Sinta', x: COAST.boardwalkX + 50, y: 720 },
    lines: [
      { who: 'Sinta', text: 'My shift ended an hour ago and the buses gave up. You are my ride now.' },
      { who: 'Sinta', text: 'The Coral Hotel downtown, and do not spare the horses.' },
    ],
    stages: [
      { text: 'Pick up Sinta at the north boardwalk', target: { x: COAST.boardwalkX + 50, y: 720 } },
      { text: 'Drive Sinta to the Coral Hotel downtown', target: { x: 2260, y: 1560 }, needsCar: true, timer: 130 },
    ],
    reward: 350,
  },
  {
    id: 'the-long-way',
    name: 'The Long Way Round',
    giver: { name: 'Bram', x: 2260, y: 1980 },
    lines: [
      { who: 'Bram', text: 'One night, three drops, every patrol in Sunharbor awake. That is the job.' },
      { who: 'Bram', text: 'Suburbs, east shore, south docks. Finish it and the crews leave you alone. Forever.' },
    ],
    stages: [
      { text: 'First drop: the suburbs, Kestrel Street', target: { x: 420, y: 700 } },
      { text: 'Second drop: the east shore road', target: { x: 3560, y: 760 } },
      { text: 'Final drop: the south docks', target: { x: 1060, y: 3300 }, timer: 260 },
    ],
    reward: 900,
    heatOnStart: 3,
  },
];

export function createMissionState() {
  return {
    storyIndex: 0,
    active: null, // { def, stageIndex, timeLeft }
    sideJob: null, // { stage: 'pickup'|'dropoff', target, reward }
    storyDone: false,
    prompt: '', // "Press E ..." hint for whoever is near
  };
}

/** The next story giver waiting in the world, or null. */
export function nextGiver(state) {
  if (state.active || state.storyDone) return null;
  const def = STORY_MISSIONS[state.storyIndex];
  return def ? { ...def.giver, missionName: def.name } : null;
}

function startStory(state, ctx) {
  const def = STORY_MISSIONS[state.storyIndex];
  state.active = { def, stageIndex: 0, timeLeft: def.stages[0].timer ?? null };
  ctx.emit({ type: 'dialog', lines: def.lines });
  ctx.emit({ type: 'missionStart', name: def.name });
  if (def.heatOnStart) ctx.emit({ type: 'setWanted', stars: def.heatOnStart });
  if (def.id === 'hot-cargo') ctx.emit({ type: 'spawnMissionVan' });
}

function startSideJob(state, ctx) {
  const pickup = ctx.randomRoadPoint();
  state.sideJob = { stage: 'pickup', target: pickup, reward: 0 };
  ctx.emit({ type: 'dialog', lines: [{ who: 'SunPost', text: 'Parcel on board. Get it to the drop-off, we pay on delivery.' }] });
}

function completeStory(state, ctx) {
  const def = state.active.def;
  state.active = null;
  state.storyIndex += 1;
  if (state.storyIndex >= STORY_MISSIONS.length) state.storyDone = true;
  ctx.emit({ type: 'missionComplete', name: def.name, reward: def.reward, givesPistol: def.givesPistol === true });
}

function advanceStage(state, ctx) {
  const active = state.active;
  active.stageIndex += 1;
  if (active.stageIndex >= active.def.stages.length) {
    completeStory(state, ctx);
    return;
  }
  const stage = active.def.stages[active.stageIndex];
  active.timeLeft = stage.timer ?? null;
  if (active.def.id === 'hot-cargo' && active.stageIndex === 1) {
    ctx.emit({ type: 'setWanted', stars: 2 });
  }
  ctx.emit({ type: 'stageAdvance', text: stage.text });
}

/**
 * Advance missions one step. ctx: playerPos, inCar, playerCarMissionId, interactPressed,
 * randomRoadPoint(), emit(event). Failing a timed stage clears the mission; the giver
 * offers it again.
 */
export function updateMissions(state, dt, ctx) {
  state.prompt = '';
  const pos = ctx.playerPos;

  if (state.active) {
    const stage = state.active.def.stages[state.active.stageIndex];
    if (state.active.timeLeft !== null) {
      state.active.timeLeft -= dt;
      if (state.active.timeLeft <= 0) {
        ctx.emit({ type: 'missionFailed', name: state.active.def.name });
        state.active = null;
        return;
      }
    }
    if (stage.needsVan) {
      if (ctx.playerCarMissionId === 'hot-van') advanceStage(state, ctx);
      return;
    }
    const dist = Math.hypot(pos.x - stage.target.x, pos.y - stage.target.y);
    const reach = stage.needsCar ? 78 : 48;
    if (dist < reach && (!stage.needsCar || ctx.inCar)) advanceStage(state, ctx);
    return;
  }

  if (state.sideJob) {
    const job = state.sideJob;
    const dist = Math.hypot(pos.x - job.target.x, pos.y - job.target.y);
    if (dist < 70) {
      if (job.stage === 'pickup') {
        const drop = ctx.randomRoadPoint();
        job.reward = Math.round(45 + Math.hypot(drop.x - job.target.x, drop.y - job.target.y) / 22);
        job.target = drop;
        job.stage = 'dropoff';
        ctx.emit({ type: 'stageAdvance', text: 'Parcel collected — take it to the drop-off' });
      } else {
        ctx.emit({ type: 'sideJobComplete', reward: job.reward });
        state.sideJob = null;
      }
    }
    return;
  }

  // Nothing running: offer the next story mission, or a courier run at the hub.
  const giver = nextGiver(state);
  if (giver && Math.hypot(pos.x - giver.x, pos.y - giver.y) < 74) {
    state.prompt = `Press E — talk to ${giver.name} (${giver.missionName})`;
    if (ctx.interactPressed) startStory(state, ctx);
    return;
  }
  if (Math.hypot(pos.x - COURIER_HUB.x, pos.y - COURIER_HUB.y) < 74) {
    state.prompt = 'Press E — take a SunPost courier run';
    if (ctx.interactPressed) startSideJob(state, ctx);
  }
}

/** What the HUD shows: current objective title, text, target point and timer. */
export function currentObjective(state) {
  if (state.active) {
    const stage = state.active.def.stages[state.active.stageIndex];
    return {
      title: state.active.def.name,
      text: stage.text,
      target: stage.target,
      timeLeft: state.active.timeLeft,
    };
  }
  if (state.sideJob) {
    return {
      title: 'SunPost Courier',
      text: state.sideJob.stage === 'pickup' ? 'Collect the parcel' : 'Deliver the parcel',
      target: state.sideJob.target,
      timeLeft: null,
    };
  }
  const giver = nextGiver(state);
  if (giver) {
    return { title: 'Story', text: `See ${giver.name} — ${giver.missionName}`, target: giver, timeLeft: null };
  }
  return { title: 'Sunharbor', text: 'Free roam — the SunPost hub pays for courier runs', target: COURIER_HUB, timeLeft: null };
}
