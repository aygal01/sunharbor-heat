// The renderer: camera follow over the city, then the world in layers — district ground,
// water and sand, roads with lane markings and street names, sidewalks, buildings with
// oblique roofs and lit windows, props, palms, cars, people — finished with a warm
// time-of-day grade, screen shake and hit flashes. The HUD is hud.js's job; the title,
// pause, busted and wasted panels are drawn here over the world.
import { COAST, CONTROLS, DISTRICT_GROUND, GRID, PALETTE, STREET_NAMES_HORIZONTAL, STREET_NAMES_VERTICAL } from './config.js';
import { drawHUD } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Deterministic 0..1 hash for window lights and other per-building variety. */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Sky-grade keyframes by hour: [hour, r, g, b, alpha] of the wash laid over the world. */
const GRADE_KEYS = [
  [0, 18, 20, 62, 0.26], [6, 30, 30, 70, 0.18], [10, 0, 0, 0, 0], [16, 255, 170, 90, 0.05],
  [18, 255, 140, 60, 0.13], [20, 120, 60, 110, 0.2], [22, 30, 30, 80, 0.24], [24, 18, 20, 62, 0.26],
];

function gradeFor(minutes) {
  const hour = (minutes / 60) % 24;
  for (let i = 0; i < GRADE_KEYS.length - 1; i += 1) {
    const a = GRADE_KEYS[i];
    const b = GRADE_KEYS[i + 1];
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
      return [
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
        Math.round(a[3] + (b[3] - a[3]) * t),
        a[4] + (b[4] - a[4]) * t,
      ];
    }
  }
  return [0, 0, 0, 0];
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  const view = { w: 1280, h: 720 };
  const camera = { x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * ratio);
    canvas.height = Math.round(view.h * ratio);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function text(value, x, y, size, color, align = 'left', weight = 600) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'top';
    g.fillText(value, x, y);
  }

  function inView(x, y, margin = 90) {
    return x > camera.x - margin && x < camera.x + view.w + margin && y > camera.y - margin && y < camera.y + view.h + margin;
  }

  // ---------- world layers ----------

  function drawGround(city) {
    g.fillStyle = DISTRICT_GROUND.midtown;
    g.fillRect(camera.x - 40, camera.y - 40, view.w + 80, view.h + 80);
    g.fillStyle = DISTRICT_GROUND.suburbs;
    g.fillRect(0, 0, 1364, 1864);
    g.fillStyle = DISTRICT_GROUND.industrial;
    g.fillRect(0, 1736, 1364, 1864);
    g.fillStyle = DISTRICT_GROUND.downtown;
    g.fillRect(1364, 864, 1736, 1736);
    g.fillStyle = DISTRICT_GROUND.marina;
    g.fillRect(3036, 2236, 944, 1364);
    g.fillStyle = PALETTE.sand;
    g.fillRect(COAST.sandX, 0, COAST.waterX - COAST.sandX, city.height);
    // Water with slow moving wave glints.
    g.fillStyle = PALETTE.water;
    g.fillRect(COAST.waterX, 0, city.width - COAST.waterX, city.height);
    g.strokeStyle = PALETTE.waterLight;
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    const t = performance.now() / 900;
    for (let y = 30; y < city.height; y += 64) {
      const x = COAST.waterX + 26 + ((y * 7 + Math.sin(t + y) * 22) % 260);
      if (!inView(x, y, 30)) continue;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 16, y - 6, x + 32, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Boardwalk planks.
    g.fillStyle = PALETTE.boardwalk;
    g.fillRect(COAST.boardwalkX, 0, COAST.sandX - COAST.boardwalkX, city.height);
    g.strokeStyle = PALETTE.boardwalkDark;
    g.lineWidth = 1;
    for (let y = 0; y < city.height; y += 18) {
      if (!inView(COAST.boardwalkX + 50, y, 20)) continue;
      g.beginPath();
      g.moveTo(COAST.boardwalkX, y);
      g.lineTo(COAST.sandX, y);
      g.stroke();
    }
  }

  function drawRoads(city) {
    const half = GRID.roadWidth / 2;
    // Sidewalk slabs first (wider), asphalt on top.
    g.fillStyle = PALETTE.sidewalk;
    for (const vx of city.vRoads) {
      if (vx > COAST.boardwalkX) continue;
      g.fillRect(vx - half - 15, 0, GRID.roadWidth + 30, city.height);
    }
    for (const hy of city.hRoads) g.fillRect(0, hy - half - 15, COAST.waterX, GRID.roadWidth + 30);
    g.fillStyle = PALETTE.asphalt;
    for (const vx of city.vRoads) {
      if (vx > COAST.boardwalkX) continue;
      g.fillRect(vx - half, 0, GRID.roadWidth, city.height);
    }
    for (const hy of city.hRoads) g.fillRect(0, hy - half, COAST.waterX, GRID.roadWidth);
    // Lane dashes down the centre of every road.
    g.fillStyle = PALETTE.laneMarking;
    g.globalAlpha = 0.75;
    for (const vx of city.trafficVRoads) {
      for (let y = 14; y < city.height; y += 56) {
        if (city.hRoads.some((hy) => Math.abs(hy - y) < half + 12)) continue;
        if (inView(vx, y, 30)) g.fillRect(vx - 2, y, 4, 30);
      }
    }
    for (const hy of city.hRoads) {
      for (let x = 14; x < COAST.waterX; x += 56) {
        if (city.vRoads.some((vx) => Math.abs(vx - x) < half + 12)) continue;
        if (inView(x, hy, 30)) g.fillRect(x, hy - 2, 30, 4);
      }
    }
    g.globalAlpha = 1;
    // Street names painted on the asphalt.
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.font = `700 15px ${FONT}`;
    g.textAlign = 'center';
    city.trafficVRoads.forEach((vx, i) => {
      for (let y = 500; y < city.height; y += 1150) {
        if (!inView(vx, y, 60)) continue;
        g.save();
        g.translate(vx + 44, y);
        g.rotate(Math.PI / 2);
        g.fillText(STREET_NAMES_VERTICAL[i] ?? '', 0, 0);
        g.restore();
      }
    });
    city.hRoads.forEach((hy, i) => {
      for (let x = 700; x < 3900; x += 1250) {
        if (!inView(x, hy, 60)) continue;
        g.fillText(STREET_NAMES_HORIZONTAL[i] ?? '', x, hy + 40);
      }
    });
  }

  /** Multiply a #rrggbb colour by a factor, for per-building roof variety. */
  function shade(hex, factor) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
    const gg = Math.min(255, Math.round(((n >> 8) & 255) * factor));
    const bb = Math.min(255, Math.round((n & 255) * factor));
    return `rgb(${r},${gg},${bb})`;
  }

  function drawBuilding(b) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) return;
    const lift = Math.min(15, 3 + b.floors * 1.1);
    const ox = lift * 0.35;
    const oy = lift * 0.45;
    // Shadow, then the wall block, then the roof shifted up-left by the building's height.
    g.fillStyle = PALETTE.shadow;
    g.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    g.fillStyle = b.color;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = shade(b.roof, 0.82 + hash(b.seed + 5) * 0.36);
    g.fillRect(b.x - ox, b.y - oy, b.w, b.h);
    g.strokeStyle = 'rgba(20,14,10,0.35)';
    g.lineWidth = 1.5;
    g.strokeRect(b.x - ox, b.y - oy, b.w, b.h);
    // A sunlit facade band inside the roof's south edge, with lit windows, on the
    // taller buildings; low houses and warehouses stay plain-roofed.
    if (b.floors >= 3) {
      const rows = b.floors >= 7 ? 2 : 1;
      const bandH = rows * 10 + 5;
      const bandY = b.y - oy + b.h - bandH;
      g.fillStyle = shade(b.color, 1.06);
      g.fillRect(b.x - ox + 2, bandY, b.w - 4, bandH - 2);
      const cols = Math.max(2, Math.floor(b.w / 16));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const lit = hash(b.seed + c * 31 + r * 57) > 0.45;
          g.fillStyle = lit ? 'rgba(255,205,110,0.92)' : 'rgba(30,36,48,0.55)';
          g.fillRect(b.x - ox + 6 + c * 16, bandY + 3 + r * 10, 7, 5);
        }
      }
      // Roof clutter on the taller blocks: vents and water tanks.
      g.fillStyle = 'rgba(0,0,0,0.22)';
      const n = 1 + Math.floor(hash(b.seed) * 3);
      for (let i = 0; i < n; i += 1) {
        g.fillRect(b.x + hash(b.seed + i * 7) * (b.w - 34), b.y + hash(b.seed + i * 13) * (b.h - 30 - bandH), 20, 14);
      }
    }
  }

  function drawProps(city, time) {
    for (const pier of city.piers) {
      if (!inView(pier.x + pier.w / 2, pier.y, 160)) continue;
      g.fillStyle = PALETTE.boardwalk;
      g.fillRect(pier.x, pier.y, pier.w, pier.h);
      g.strokeStyle = PALETTE.boardwalkDark;
      for (let x = pier.x + 12; x < pier.x + pier.w; x += 18) {
        g.beginPath();
        g.moveTo(x, pier.y);
        g.lineTo(x, pier.y + pier.h);
        g.stroke();
      }
    }
    for (const boat of city.boats) {
      if (!inView(boat.x, boat.y, 90)) continue;
      g.save();
      g.translate(boat.x, boat.y + Math.sin(time * 0.9 + boat.x) * 2);
      g.rotate(boat.angle);
      g.fillStyle = boat.color;
      g.beginPath();
      g.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2ede2';
      g.fillRect(-7, -5, 13, 10);
      g.restore();
    }
    for (const prop of city.props) {
      if (!inView(prop.x, prop.y, 80)) continue;
      if (prop.kind === 'container') {
        g.fillStyle = PALETTE.shadow;
        g.fillRect(prop.x + 4, prop.y + 5, prop.w, prop.h);
        g.fillStyle = prop.color;
        g.fillRect(prop.x, prop.y, prop.w, prop.h);
        g.strokeStyle = 'rgba(0,0,0,0.3)';
        for (let x = prop.x + 8; x < prop.x + prop.w - 4; x += 9) {
          g.beginPath();
          g.moveTo(x, prop.y + 2);
          g.lineTo(x, prop.y + prop.h - 2);
          g.stroke();
        }
      } else if (prop.kind === 'umbrella') {
        g.fillStyle = prop.color;
        g.beginPath();
        g.arc(prop.x, prop.y, 15, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.beginPath();
        g.arc(prop.x, prop.y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const palm of city.palms) {
      if (!inView(palm.x, palm.y, 60)) continue;
      const s = palm.size;
      g.fillStyle = PALETTE.shadow;
      g.beginPath();
      g.ellipse(palm.x + 7, palm.y + 6, 15 * s, 6 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#4d7d3a';
      g.lineWidth = 3.4 * s;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + palm.seed;
        g.beginPath();
        g.moveTo(palm.x, palm.y);
        g.quadraticCurveTo(
          palm.x + Math.cos(a) * 13 * s, palm.y + Math.sin(a) * 13 * s - 4,
          palm.x + Math.cos(a) * 21 * s, palm.y + Math.sin(a) * 21 * s + 3,
        );
        g.stroke();
      }
      g.fillStyle = '#7d5a36';
      g.beginPath();
      g.arc(palm.x, palm.y, 3.6 * s, 0, Math.PI * 2);
      g.fill();
    }
    for (const lamp of city.lamps) {
      if (!inView(lamp.x, lamp.y, 30)) continue;
      g.fillStyle = '#3a3f4a';
      g.fillRect(lamp.x - 1.5, lamp.y - 1.5, 3, 3);
    }
  }

  // ---------- entities ----------

  function drawPerson(x, y, angle, shirt, pants, phase, moving, down) {
    g.fillStyle = PALETTE.shadow;
    g.beginPath();
    g.ellipse(x + 3, y + 5, 10, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    if (down) {
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      g.fillStyle = pants;
      g.fillRect(-4, -13, 8, 15);
      g.fillStyle = shirt;
      g.fillRect(-5, 0, 10, 13);
      g.fillStyle = PALETTE.skin;
      g.beginPath();
      g.arc(0, 17, 5.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
      return;
    }
    const stride = moving ? Math.sin(phase) * 5.6 : 0;
    g.strokeStyle = pants;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(angle + 0.5) * (7 + stride), y + Math.sin(angle + 0.5) * (7 + stride));
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(angle - 0.5) * (7 - stride), y + Math.sin(angle - 0.5) * (7 - stride));
    g.stroke();
    g.fillStyle = shirt;
    g.beginPath();
    g.arc(x, y, 9.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.skin;
    g.beginPath();
    g.arc(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, 6, 0, Math.PI * 2);
    g.fill();
  }

  function drawCar(car, time) {
    if (!inView(car.x, car.y, 90)) return;
    const { w, h } = car.type;
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle);
    g.fillStyle = PALETTE.shadow;
    g.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
    g.fillStyle = car.color;
    roundRect(-w / 2, -h / 2, w, h, 6);
    g.fill();
    if (car.kind === 'police') {
      g.fillStyle = '#22242c';
      g.fillRect(-w / 2, -h / 2, 13, h);
      g.fillRect(w / 2 - 13, -h / 2, 13, h);
      const flash = Math.floor(time * 2.6) % 2 === 0;
      g.fillStyle = flash ? '#ff3b30' : '#7db4ff';
      g.fillRect(-8, -h / 2 + 3, 7, 5);
      g.fillStyle = flash ? '#7db4ff' : '#ff3b30';
      g.fillRect(1, -h / 2 + 3, 7, 5);
      g.fillStyle = flash ? '#ff3b30' : '#3f8fff';
      g.fillRect(-8, h / 2 - 8, 7, 5);
      g.fillStyle = flash ? '#3f8fff' : '#ff3b30';
      g.fillRect(1, h / 2 - 8, 7, 5);
    }
    // Cabin, windshield and rear glass.
    g.fillStyle = 'rgba(24,30,42,0.9)';
    roundRect(-w * 0.18, -h * 0.36, w * 0.34, h * 0.72, 4);
    g.fill();
    g.fillStyle = 'rgba(140,190,220,0.5)';
    g.fillRect(w * 0.13, -h * 0.33, 4, h * 0.66);
    // Headlights and tail lights.
    g.fillStyle = '#ffe9a8';
    g.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
    g.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
    g.fillStyle = '#d43a2e';
    g.fillRect(-w / 2, -h / 2 + 3, 3, 5);
    g.fillRect(-w / 2, h / 2 - 8, 3, 5);
    g.restore();
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawMarker(x, y, color, label, time) {
    const bob = Math.sin(time * 3.2) * 5;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y - 44 + bob);
    g.lineTo(x - 8, y - 60 + bob);
    g.lineTo(x + 8, y - 60 + bob);
    g.closePath();
    g.fill();
    if (label) text(label, x, y - 84 + bob, 13, color, 'center', 800);
  }

  function drawCheckpoint(target, time) {
    const pulse = 1 + Math.sin(time * 3.4) * 0.1;
    g.save();
    g.globalAlpha = 0.16;
    const grad = g.createLinearGradient(0, target.y - 190, 0, target.y);
    grad.addColorStop(0, 'rgba(255,210,62,0)');
    grad.addColorStop(1, 'rgba(255,210,62,0.85)');
    g.fillStyle = grad;
    g.fillRect(target.x - 9, target.y - 190, 18, 190);
    g.globalAlpha = 1;
    g.strokeStyle = '#ffd23e';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.55;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(target.x, target.y, 46 * pulse, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  // ---------- screens ----------

  function drawPanel(lines, title, titleColor) {
    g.fillStyle = 'rgba(14,10,20,0.72)';
    g.fillRect(0, 0, view.w, view.h);
    text(title, view.w / 2, view.h / 2 - 120, 54, titleColor, 'center', 800);
    lines.forEach((line, i) => text(line, view.w / 2, view.h / 2 - 44 + i * 27, 17, '#e8e2d4', 'center', 500));
  }

  function drawTitle(game) {
    const grad = g.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, 'rgba(20,10,26,0.55)');
    grad.addColorStop(0.55, 'rgba(20,10,26,0.25)');
    grad.addColorStop(1, 'rgba(20,10,26,0.78)');
    g.fillStyle = grad;
    g.fillRect(0, 0, view.w, view.h);
    text('SUNHARBOR', view.w / 2, view.h * 0.16, 76, '#ffd23e', 'center', 800);
    text('H E A T', view.w / 2, view.h * 0.16 + 82, 40, '#ff7a4d', 'center', 800);
    text('Raka runs parcels along the boardwalk — until the dockside crews start asking favours.', view.w / 2, view.h * 0.16 + 148, 18, '#f2ede2', 'center', 500);
    text('Steal rides, run errands, and keep one step ahead of the Sunharbor PD.', view.w / 2, view.h * 0.16 + 174, 18, '#f2ede2', 'center', 500);
    const startY = view.h * 0.16 + 224;
    CONTROLS.forEach(([key, what], i) => {
      text(key, view.w / 2 - 26, startY + i * 24, 15, '#ffd23e', 'right', 700);
      text(what, view.w / 2 - 12, startY + i * 24, 15, '#e8e2d4', 'left', 500);
    });
    const promptY = startY + CONTROLS.length * 24 + 22;
    if (game.hasSave) {
      text('Press C to continue your saved game', view.w / 2, promptY, 20, '#7de08a', 'center', 800);
      text('or Enter for a fresh start', view.w / 2, promptY + 28, 15, '#e8e2d4', 'center', 500);
    } else {
      text('Press Enter or click to start', view.w / 2, promptY, 20, '#7de08a', 'center', 800);
    }
  }

  /** Paint one frame of the whole game. */
  function draw(game, screen) {
    const time = game.time;
    // Camera: follow the player unless a shot or the title screen overrides it.
    if (game.cameraOverride) {
      camera.x = game.cameraOverride.x;
      camera.y = game.cameraOverride.y;
    } else if (screen === SCREEN_TITLE) {
      camera.x = 1750 + Math.sin(time * 0.05) * 500;
      camera.y = 1150 + Math.cos(time * 0.037) * 340;
    } else {
      camera.x = game.player.x - view.w / 2;
      camera.y = game.player.y - view.h / 2;
    }
    camera.x = Math.max(0, Math.min(game.city.width - view.w, camera.x));
    camera.y = Math.max(0, Math.min(game.city.height - view.h, camera.y));
    if (game.shake > 0.2) {
      camera.x += (Math.random() - 0.5) * game.shake;
      camera.y += (Math.random() - 0.5) * game.shake;
    }

    g.save();
    g.translate(-camera.x, -camera.y);
    drawGround(game.city);
    drawRoads(game.city);
    drawProps(game.city, time);
    for (const b of game.city.buildings) drawBuilding(b);

    const objective = game.objective;
    if (objective && objective.target && screen !== SCREEN_TITLE) drawCheckpoint(objective.target, time);

    for (const car of game.trafficCars) drawCar(car, time);
    for (const car of game.parkedCars) drawCar(car, time);
    for (const car of game.police.cars) drawCar(car, time);
    if (game.missionVan && game.missionVan.driver !== 'player'
      && game.missions.active && game.missions.active.def.id === 'hot-cargo' && game.missions.active.stageIndex === 0) {
      drawMarker(game.missionVan.x, game.missionVan.y, '#ffd23e', 'VAN', time);
    }
    for (const ped of game.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.pants, ped.phase, ped.state !== 'down', ped.state === 'down');
    }
    for (const officer of game.police.officers) {
      drawPerson(officer.x, officer.y, officer.angle, '#2c3e70', '#1d2742', officer.phase, true, false);
    }
    const giver = game.giver;
    if (giver && screen === SCREEN_PLAY) {
      drawPerson(giver.x, giver.y, Math.PI / 2, '#3fa39a', '#2e3d55', 0, false, false);
      drawMarker(giver.x, giver.y, '#7de08a', giver.name.toUpperCase(), time);
    }
    // Raka (hidden while he is inside a car; the car is drawn instead).
    const p = game.player;
    if (!p.car) {
      drawPerson(p.x, p.y, p.angle, PALETTE.playerShirt, PALETTE.playerPants, p.walkPhase, p.moving, false);
      if (p.hasPistol) {
        g.strokeStyle = '#22242c';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x + Math.cos(p.angle) * 17, p.y + Math.sin(p.angle) * 17);
        g.stroke();
      }
      if (p.muzzle > 0) {
        g.fillStyle = '#ffd76a';
        g.beginPath();
        g.arc(p.x + Math.cos(p.angle) * 21, p.y + Math.sin(p.angle) * 21, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Tracers and smoke.
    if (p.lastShot) {
      g.strokeStyle = 'rgba(255,220,130,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.lastShot.x1, p.lastShot.y1);
      g.lineTo(p.lastShot.x2, p.lastShot.y2);
      g.stroke();
    }
    for (const puff of game.effects.smoke) {
      g.fillStyle = `rgba(90,86,92,${0.34 * (1 - puff.t / puff.life)})`;
      g.beginPath();
      g.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // Warm grade over the world, then the HUD, then any screen panel.
    const [r, gg, b, a] = gradeFor(game.clockMinutes);
    if (a > 0.005) {
      g.fillStyle = `rgba(${r},${gg},${b},${a})`;
      g.fillRect(0, 0, view.w, view.h);
    }
    if (game.flash > 0) {
      g.fillStyle = `rgba(200,30,20,${Math.min(0.32, game.flash * 0.5)})`;
      g.fillRect(0, 0, view.w, view.h);
    }
    if (screen === SCREEN_TITLE) {
      drawTitle(game);
    } else {
      drawHUD(g, game, view.w, view.h);
      if (screen === SCREEN_PAUSED) {
        drawPanel(['The city waits. Your wanted level does not cool while paused.', '', ...CONTROLS.map(([k, w]) => `${k} — ${w}`)], 'PAUSED', '#ffd23e');
      } else if (screen === SCREEN_BUSTED) {
        const flash = Math.floor(time * 2.6) % 2 === 0;
        g.fillStyle = flash ? 'rgba(40,60,180,0.25)' : 'rgba(180,40,30,0.25)';
        g.fillRect(0, 0, view.w, view.h);
        drawPanel(['The Sunharbor PD got their hands on you.', 'You pay a fine, lose the heat, and walk out of the station.'], 'BUSTED', '#7db4ff');
      } else if (screen === SCREEN_WASTED) {
        g.fillStyle = 'rgba(90,8,8,0.35)';
        g.fillRect(0, 0, view.w, view.h);
        drawPanel(['You wake up at Sunharbor General with a bill and no wheels.', 'The heat is gone. Your cash took the hit.'], 'WASTED', '#ff5a4d');
      }
    }
  }

  return { draw, view, camera };
}
