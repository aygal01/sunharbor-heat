// Keyboard and mouse state for the whole game. Held keys are read as a set every step;
// one-shot presses (interact, enter car, pause, punch, confirm) are edge-detected into a
// pressed set the loop consumes once per frame, so a tap between frames is never lost and
// never counted twice. The mouse is tracked in canvas pixels and converted to world
// coordinates by whoever owns the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_ENTER_CAR = 8;
export const ACTION_PUNCH = 16;

const KEY_ACTIONS = new Map([
  ['Enter', ACTION_CONFIRM | ACTION_ENTER_CAR],
  ['KeyF', ACTION_ENTER_CAR],
  ['KeyE', ACTION_INTERACT],
  ['Escape', ACTION_PAUSE],
  ['KeyP', ACTION_PAUSE],
  ['Space', ACTION_PUNCH],
]);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    held.add(event.code);
    if (!event.repeat) {
      pressed.add(event.code);
      const action = KEY_ACTIONS.get(event.code);
      if (action) actions |= action;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    mouse,
    /** True while the key is physically down. */
    isDown(code) {
      return held.has(code);
    },
    /** True once per physical press; consumes the press. */
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** The one-shot ACTION_* flags since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Consume and report the mouse click flag. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
    /** Movement axes from the held keys: x and y in -1..1, not normalised. */
    moveAxes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
  };
}
