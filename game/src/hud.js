// The HUD, drawn over the world every frame: cash and health top-left, wanted stars and
// the clock top-right, the mission banner with its objective line (and countdown) across
// the top centre, dialog and prompts along the bottom, and a live minimap in the corner
// with roads, water, the player arrow, police blips and the objective marker.
import { COAST, GRID, PALETTE } from './config.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function text(g, value, x, y, size, color, align = 'left', weight = 600) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillText(value, x, y);
}

function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawStars(g, stars, x, y) {
  for (let i = 0; i < 5; i += 1) {
    text(g, '★', x + i * 30, y, 30, i < stars ? '#ffb02e' : 'rgba(255,255,255,0.25)', 'left', 700);
  }
}

function drawMinimap(g, game, viewW, viewH) {
  const w = 224;
  const h = 168;
  const x0 = viewW - w - 16;
  const y0 = viewH - h - 16;
  const sx = w / game.city.width;
  const sy = h / game.city.height;
  const px = (wx) => x0 + wx * sx;
  const py = (wy) => y0 + wy * sy;

  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  g.fillStyle = '#776f60';
  g.fillRect(x0, y0, w, h);
  g.fillStyle = PALETTE.sand;
  g.fillRect(px(COAST.sandX), y0, (game.city.width - COAST.sandX) * sx, h);
  g.fillStyle = PALETTE.water;
  g.fillRect(px(COAST.waterX), y0, (game.city.width - COAST.waterX) * sx, h);
  g.strokeStyle = 'rgba(30,28,36,0.85)';
  g.lineWidth = Math.max(1.4, GRID.roadWidth * sx * 0.8);
  for (const vx of game.city.trafficVRoads) {
    g.beginPath();
    g.moveTo(px(vx), y0);
    g.lineTo(px(vx), y0 + h);
    g.stroke();
  }
  for (const hy of game.city.hRoads) {
    g.beginPath();
    g.moveTo(x0, py(hy));
    g.lineTo(px(COAST.waterX), py(hy));
    g.stroke();
  }
  // Police blips flash blue/red; the objective is a gold diamond; the giver is green.
  const flash = Math.floor(game.time * 2.4) % 2 === 0;
  g.fillStyle = flash ? '#3f8fff' : '#ff4d4d';
  for (const car of game.police.cars) g.fillRect(px(car.x) - 2, py(car.y) - 2, 4, 4);
  for (const officer of game.police.officers) g.fillRect(px(officer.x) - 2, py(officer.y) - 2, 4, 4);
  const objective = game.objective;
  if (objective && objective.target) {
    g.fillStyle = '#ffd23e';
    g.save();
    g.translate(px(objective.target.x), py(objective.target.y));
    g.rotate(Math.PI / 4);
    g.fillRect(-3.4, -3.4, 6.8, 6.8);
    g.restore();
  }
  // The player: a white arrow pointing the way Raka faces.
  g.save();
  g.translate(px(game.player.x), py(game.player.y));
  g.rotate(game.player.angle + Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(4.4, 5);
  g.lineTo(-4.4, 5);
  g.closePath();
  g.fill();
  g.restore();
  g.restore();

  g.strokeStyle = 'rgba(12,10,16,0.8)';
  g.lineWidth = 2;
  g.strokeRect(x0, y0, w, h);
  text(g, 'SUNHARBOR', x0 + 6, y0 + 4, 10, 'rgba(255,255,255,0.75)', 'left', 700);
}

/** Draw the whole HUD for the current frame. */
export function drawHUD(g, game, viewW, viewH) {
  const player = game.player;
  // Cash and health, top-left.
  text(g, `$ ${player.cash.toLocaleString('en-US')}`, 18, 14, 26, '#7de08a', 'left', 800);
  g.fillStyle = 'rgba(10,8,14,0.55)';
  g.fillRect(18, 48, 184, 15);
  g.fillStyle = player.health > 30 ? '#e2543e' : '#ff2e2e';
  g.fillRect(20, 50, 180 * Math.max(0, player.health) / 100, 11);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.strokeRect(18, 48, 184, 15);
  if (player.car) {
    g.fillStyle = 'rgba(10,8,14,0.55)';
    g.fillRect(18, 68, 184, 10);
    g.fillStyle = '#e8c97a';
    g.fillRect(20, 70, 180 * Math.max(0, player.car.health) / player.car.type.health, 6);
    text(g, player.car.type.name, 18, 82, 12, 'rgba(255,255,255,0.8)');
  }

  // Wanted stars and the clock, top-right.
  drawStars(g, game.police.stars, viewW - 168, 12);
  text(g, formatClock(game.clockMinutes), viewW - 18, 48, 20, '#ffffff', 'right', 700);
  if (game.police.bust > 0.02) {
    g.fillStyle = 'rgba(10,8,14,0.55)';
    g.fillRect(viewW - 188, 76, 170, 13);
    g.fillStyle = '#ff4d4d';
    g.fillRect(viewW - 186, 78, 166 * game.police.bust, 9);
    text(g, 'BUSTED', viewW - 103, 92, 12, '#ff8080', 'center', 800);
  }

  // Mission banner, top centre: name, objective, countdown when a stage is timed.
  const objective = game.objective;
  if (objective) {
    const title = objective.title.toUpperCase();
    text(g, title, viewW / 2, 12, 15, '#ffd23e', 'center', 800);
    text(g, objective.text, viewW / 2, 32, 17, '#ffffff', 'center', 600);
    if (objective.timeLeft !== null && objective.timeLeft !== undefined) {
      const seconds = Math.max(0, Math.ceil(objective.timeLeft));
      const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      text(g, label, viewW / 2, 54, 20, seconds < 20 ? '#ff5a4d' : '#e8c97a', 'center', 800);
    }
  }

  // Toast (mission complete, pay-outs), fading under the banner.
  if (game.toast && game.toast.t > 0) {
    g.globalAlpha = Math.min(1, game.toast.t / 0.6);
    text(g, game.toast.text, viewW / 2, 86, 24, '#7de08a', 'center', 800);
    g.globalAlpha = 1;
  }

  // Dialog line, bottom centre, above the minimap line.
  if (game.dialog) {
    const boxW = Math.min(680, viewW - 240);
    const x0 = (viewW - boxW) / 2;
    const y0 = viewH - 86;
    g.fillStyle = 'rgba(12,10,18,0.78)';
    g.fillRect(x0, y0, boxW, 56);
    g.strokeStyle = 'rgba(255,210,62,0.5)';
    g.strokeRect(x0, y0, boxW, 56);
    text(g, game.dialog.who, x0 + 14, y0 + 8, 13, '#ffd23e', 'left', 800);
    g.font = `15px ${FONT}`;
    g.fillStyle = '#f2ede2';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    wrapText(g, game.dialog.text, x0 + 14, y0 + 27, boxW - 28, 18);
  }

  // The interact prompt, when a giver or the courier hub is in reach.
  if (game.missions.prompt) {
    text(g, game.missions.prompt, viewW / 2, viewH - 122, 16, '#ffd23e', 'center', 700);
  }

  drawMinimap(g, game, viewW, viewH);
}

function wrapText(g, value, x, y, maxWidth, lineHeight) {
  const words = value.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxWidth && line) {
      g.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, yy);
}
