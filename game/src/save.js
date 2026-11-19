// The save file: one localStorage entry holding cash, story progress, whether Raka has
// the pistol, and where he was standing. Written whenever a mission pays out and every
// few seconds of play; read on the title screen, where a save offers Continue. Storage
// can be unavailable (private windows) — every function here then quietly does nothing.
import { SAVE_KEY } from './config.js';

/** The saved game, or null when there is none (or it is unreadable). */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Persist cash, story progress, the pistol flag and the player's position. */
export function writeSave({ cash, storyIndex, storyDone, hasPistol, x, y }) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash, storyIndex, storyDone, hasPistol, x, y }));
  } catch {
    // A full or blocked store simply means this visit is not remembered.
  }
}

/** Forget the save (a fresh start from the title screen). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget if storage is unavailable.
  }
}
