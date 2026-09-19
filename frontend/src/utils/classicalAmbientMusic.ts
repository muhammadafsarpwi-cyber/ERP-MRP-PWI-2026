/**
 * Classical Ambient Music Generator using native Web Audio API
 * Generates soft, peaceful, light classical ambient piano & string harmonies.
 * No external audio files needed; 100% royalty-free, zero latency, seamless looping.
 */

class ClassicalAmbientEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private masterGain: GainNode | null = null;
  private loopTimer: number | null = null;
  private currentChordIndex = 0;

  // Soothing classical chord progression (frequencies in Hz)
  // Voiced with warm gentle harmonies (Cmaj9 -> Am9 -> Fmaj7 -> Gsus4)
  private readonly chords: number[][] = [
    // Cmaj9: C3, G3, B3, D4, E4
    [130.81, 196.00, 246.94, 293.66, 329.63],
    // Am9: A2, E3, G3, C4, B4
    [110.00, 164.81, 196.00, 261.63, 493.88],
    // Fmaj7: F2, C3, E3, A3, C4
    [87.31, 130.81, 164.81, 220.00, 261.63],
    // Gsus4 / G6: G2, D3, G3, C4, E4
    [98.00, 146.83, 196.00, 261.63, 329.63],
  ];

  // Delicate classical piano arpeggio melody notes
  private readonly melodyPool: number[] = [
    329.63, 392.00, 493.88, 523.25, 587.33, 659.25, 783.99,
  ];

  private initContext(): boolean {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      // Soft ambient background level (~0.16)
      this.masterGain.gain.setValueAtTime(0.16, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    return true;
  }

  public playNote(freq: number, startTime: number, duration: number, isBass = false): void {
    if (!this.ctx || !this.masterGain) return;

    // Dual oscillator for rich, warm, acoustic classical timbre
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Gentle low-pass filter to sound like soft felt piano / cello
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBass ? 450 : 950, startTime);
    filter.frequency.exponentialRampToValueAtTime(isBass ? 200 : 400, startTime + duration);

    osc1.type = isBass ? 'triangle' : 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    // Subtle detune for lush acoustic warmth
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.002, startTime);

    const peakVolume = isBass ? 0.08 : 0.04;

    // Soft attack & long resonant decay
    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.12);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration + 0.05);
    osc2.stop(startTime + duration + 0.05);
  }

  private scheduleNextMeasure = (): void => {
    if (!this.isPlaying || !this.ctx) return;

    const now = this.ctx.currentTime;
    const chord = this.chords[this.currentChordIndex];
    const measureDuration = 4.2; // 4.2 seconds per slow, tranquil classical phrase

    // Play chord tones with subtle arpeggiation (staggered entry like piano keys)
    chord.forEach((note, idx) => {
      const stagger = idx === 0 ? 0 : 0.15 * idx + Math.random() * 0.08;
      this.playNote(note, now + stagger, measureDuration * 0.9, idx === 0);
    });

    // Play 2-3 delicate classical melody notes fluttering softly over the chords
    const numMelodyNotes = 2 + Math.floor(Math.random() * 2);
    for (let m = 0; m < numMelodyNotes; m++) {
      const noteTime = now + 1.2 + m * 0.9 + Math.random() * 0.3;
      const noteFreq = this.melodyPool[Math.floor(Math.random() * this.melodyPool.length)];
      this.playNote(noteFreq, noteTime, 2.0, false);
    }

    this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;

    // Schedule next measure
    this.loopTimer = window.setTimeout(this.scheduleNextMeasure, (measureDuration - 0.2) * 1000);
  };

  public start(): boolean {
    if (this.isPlaying) return true;
    const ok = this.initContext();
    if (!ok || !this.ctx) return false;

    this.isPlaying = true;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.scheduleNextMeasure();
      }).catch(() => {});
    } else {
      this.scheduleNextMeasure();
    }
    return true;
  }

  public stop(fadeOutMs = 300): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.loopTimer) {
      window.clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    if (this.ctx && this.masterGain) {
      try {
        const now = this.ctx.currentTime;
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeOutMs / 1000);
        window.setTimeout(() => {
          if (!this.isPlaying && this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(0.16, this.ctx.currentTime);
          }
        }, fadeOutMs + 50);
      } catch {
        /* ignore */
      }
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setVolume(volume: number): void {
    if (this.ctx && this.masterGain) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
    }
  }
}

export const classicalAmbientMusic = new ClassicalAmbientEngine();
