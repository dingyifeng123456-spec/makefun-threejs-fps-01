// Procedural sound: every effect is synthesised with WebAudio, so the game ships
// no audio files and makes no network request. The context is created on the first
// user gesture; before that every call is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(seconds, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || ctx.state === 'suspended') return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(ctx.currentTime + seconds);
  }

  function tone(freq, seconds, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure() || ctx.state === 'suspended') return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    shot(far = false) {
      burst(far ? 0.18 : 0.12, far ? 900 : 2400, far ? 0.25 : 0.5);
      tone(160, 0.08, 0.25, 'square', 60);
    },
    enemyShot() {
      burst(0.12, 900, 0.18);
    },
    hit() {
      tone(1200, 0.05, 0.2, 'sine');
    },
    kill() {
      tone(880, 0.09, 0.25, 'sine');
      setTimeout(() => tone(1320, 0.12, 0.22, 'sine'), 70);
    },
    reload() {
      tone(500, 0.05, 0.15, 'square');
      setTimeout(() => tone(700, 0.05, 0.15, 'square'), 160);
    },
    explosion() {
      burst(0.9, 300, 0.9);
      tone(70, 0.7, 0.5, 'sine', 30);
    },
    beep() {
      tone(1100, 0.08, 0.2, 'sine');
    },
    plant() {
      tone(660, 0.15, 0.2, 'sine');
      setTimeout(() => tone(990, 0.2, 0.2, 'sine'), 140);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.22, 'triangle'), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.2, 'triangle'), i * 130));
    },
    click() {
      tone(900, 0.04, 0.15, 'sine');
    },
    empty() {
      tone(300, 0.05, 0.2, 'square');
    },
  };
}
