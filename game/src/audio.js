// All sound is synthesised with WebAudio: no audio files, nothing fetched. A low engine
// hum that follows the driven car's speed, a two-tone siren for nearby police, short
// noise/oscillator blips for punches, gunshots and pickups, a small jingle when a mission
// pays out, and a slow warm pad underneath everything. The context only starts on the
// first user gesture, as browsers require; until then every call is a quiet no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = 0;

  /** Start (or resume) the context. Call from any click or key handler. */
  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    startPad();
  }

  function startPad() {
    // Two detuned triangles a fifth apart through a slow filter: a warm evening haze.
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    for (const freq of [110, 164.8, 220]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
    }
    filter.connect(gain);
    gain.connect(master);
  }

  function tone(freq, seconds, type = 'square', volume = 0.15, slideTo = null, delay = 0) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume = 0.2, lowpass = 1200) {
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    unlock,
    /** Cash-register blip when money lands. */
    pickup() {
      tone(880, 0.09, 'square', 0.12);
      tone(1318, 0.14, 'square', 0.12, null, 0.07);
    },
    /** Soft thud for a landed punch. */
    punch() {
      noise(0.09, 0.25, 500);
      tone(120, 0.08, 'sine', 0.2, 60);
    },
    /** Crack for the pistol. */
    gunshot() {
      noise(0.16, 0.4, 2600);
      tone(220, 0.1, 'sawtooth', 0.1, 40);
    },
    /** Thunk when a car takes a hit. */
    crash() {
      noise(0.22, 0.3, 700);
    },
    /** Four rising notes when a mission completes. */
    jingle() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((freq, i) => tone(freq, 0.22, 'triangle', 0.16, null, i * 0.11));
    },
    /** Flat sting for busted / wasted. */
    sting() {
      tone(196, 0.5, 'sawtooth', 0.14, 98);
      tone(147, 0.7, 'sawtooth', 0.12, 73, 0.12);
    },
    /**
     * Continuous sounds, called every frame: engine pitch follows speed (0 when on foot),
     * the siren fades in with the nearest police distance.
     */
    update(dt, engineSpeed, sirenDistance) {
      if (!ctx) return;
      if (engineSpeed > 0.01) {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 300;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.value = 55 + engineSpeed * 130;
        engineGain.gain.value = Math.min(0.09, 0.02 + engineSpeed * 0.07);
      } else if (engineGain) {
        engineGain.gain.value = 0;
      }
      if (sirenDistance < 700) {
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
        }
        sirenFlip += dt;
        sirenOsc.frequency.value = sirenFlip % 0.8 < 0.4 ? 660 : 880;
        sirenGain.gain.value = 0.028 * (1 - sirenDistance / 700);
      } else if (sirenGain) {
        sirenGain.gain.value = 0;
      }
    },
  };
}
