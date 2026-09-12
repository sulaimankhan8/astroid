// ============================================
// ASTEROIDS SYNTH AUDIO & BGM ENGINE (Web Audio API)
// Rich Procedural Synthesizer Soundtrack & SFX
// ============================================

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem('asteroidsSoundEnabled') !== 'false';
        this.initialized = false;

        // Volumes (0.0 to 1.0)
        this.sfxVolume = parseFloat(localStorage.getItem('asteroidsSfxVolume') ?? '0.8');
        this.musicVolume = parseFloat(localStorage.getItem('asteroidsMusicVolume') ?? '0.7');

        // Master nodes
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;

        // Background music synthesizer state
        this.currentTrack = 'none'; // 'none' | 'menu' | 'combat' | 'boss' | 'gameover'
        this.isPlayingMusic = false;
        this.bpm = 120;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.schedulerTimer = null;
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.15; // s

        // Filter / effect bus for music
        this.musicFilter = null;
    }

    init() {
        if (this.initialized && this.ctx && this.ctx.state !== 'closed') {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('Web Audio API not supported');
                this.enabled = false;
                return;
            }

            this.ctx = new AudioContextClass();

            // Create Gain routing tree
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
            this.sfxGain.connect(this.masterGain);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);

            // Music Lowpass Filter for dynamic mood effects (e.g. paused / muffled)
            this.musicFilter = this.ctx.createBiquadFilter();
            this.musicFilter.type = 'lowpass';
            this.musicFilter.frequency.setValueAtTime(12000, this.ctx.currentTime);
            this.musicFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

            this.musicGain.connect(this.musicFilter);
            this.musicFilter.connect(this.masterGain);

            this.initialized = true;

            // Start music scheduler
            this._startMusicScheduler();

            if (this.currentTrack !== 'none') {
                this.playMusic(this.currentTrack);
            }
        } catch (e) {
            console.warn('AudioContext initialization error:', e);
            this.enabled = false;
        }
    }

    // ============================================
    // VOLUME & SETTINGS CONTROLS
    // ============================================

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        localStorage.setItem('asteroidsSfxVolume', String(this.sfxVolume));
        if (this.ctx && this.sfxGain) {
            this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.03);
        }
    }

    setMusicVolume(val) {
        this.musicVolume = Math.max(0, Math.min(1, val));
        localStorage.setItem('asteroidsMusicVolume', String(this.musicVolume));
        if (this.ctx && this.musicGain) {
            this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.03);
        }
    }

    toggleSound() {
        this.enabled = !this.enabled;
        localStorage.setItem('asteroidsSoundEnabled', String(this.enabled));
        if (!this.initialized) this.init();
        if (this.ctx && this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.enabled ? 1.0 : 0.0, this.ctx.currentTime, 0.04);
            if (this.enabled && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }
        return this.enabled;
    }

    // ============================================
    // PROCEDURAL SYNTHESIZER BACKGROUND MUSIC
    // ============================================

    playMusic(trackName) {
        if (!this.initialized) {
            this.currentTrack = trackName;
            return;
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        if (this.currentTrack === trackName && this.isPlayingMusic) return;

        this.currentTrack = trackName;
        this.isPlayingMusic = (trackName !== 'none');
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05;

        switch (trackName) {
            case 'menu':
                this.bpm = 104;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(9000, this.ctx.currentTime, 0.2);
                break;
            case 'combat':
                this.bpm = 126;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(14000, this.ctx.currentTime, 0.2);
                break;
            case 'boss':
                this.bpm = 138;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(16000, this.ctx.currentTime, 0.2);
                break;
            case 'gameover':
                this.bpm = 82;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(5000, this.ctx.currentTime, 0.4);
                break;
            default:
                this.isPlayingMusic = false;
                break;
        }
    }

    stopMusic() {
        this.isPlayingMusic = false;
        this.currentTrack = 'none';
    }

    setMuffled(isMuffled) {
        if (!this.ctx || !this.musicFilter) return;
        const targetFreq = isMuffled ? 800 : (this.currentTrack === 'boss' ? 16000 : 12000);
        this.musicFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
    }

    _startMusicScheduler() {
        if (this.schedulerTimer) clearInterval(this.schedulerTimer);
        this.schedulerTimer = setInterval(() => {
            if (!this.initialized || !this.ctx || !this.isPlayingMusic) return;
            while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
                this._scheduleStep(this.currentStep, this.nextNoteTime);
                this._advanceStep();
            }
        }, this.lookahead);
    }

    _advanceStep() {
        const secondsPerBeat = 60.0 / this.bpm;
        const stepTime = 0.25 * secondsPerBeat; // 16th note step
        this.nextNoteTime += stepTime;
        this.currentStep = (this.currentStep + 1) % 32; // 2-bar 32-step loop
    }

    _scheduleStep(step, time) {
        if (!this.ctx || this.musicVolume <= 0.001) return;

        const track = this.currentTrack;
        if (track === 'combat') {
            this._stepCombatTrack(step, time);
        } else if (track === 'boss') {
            this._stepBossTrack(step, time);
        } else if (track === 'menu') {
            this._stepMenuTrack(step, time);
        } else if (track === 'gameover') {
            this._stepGameOverTrack(step, time);
        }
    }

    // --- TRACK PATTERNS ---

    // 1. COMBAT TRACK (Cyber Synthwave)
    _stepCombatTrack(step, time) {
        // Kick on 0, 4, 8, 12, 16, 20, 24, 28
        if (step % 4 === 0) {
            this._synthKick(time, 0.45);
        }

        // Hi-Hat on 2, 6, 10, 14, 18, 22, 26, 30 (offbeat)
        if (step % 4 === 2) {
            this._synthHiHat(time, 0.18, false);
        }
        if (step % 8 === 4) {
            this._synthSnare(time, 0.28);
        }

        // Bass arpeggio (16th notes in D Minor)
        // Root notes: D1 (36.7Hz), F1 (43.65Hz), G1 (49Hz), A1 (55Hz), C2 (65.4Hz), D2 (73.4Hz)
        const dMinorBass = [
            73.4, 73.4, 146.8, 73.4, 87.3, 73.4, 98.0, 110.0,
            73.4, 73.4, 146.8, 73.4, 87.3, 98.0, 110.0, 130.8,
            65.4, 65.4, 130.8, 65.4, 87.3, 65.4, 98.0, 110.0,
            55.0, 55.0, 110.0, 55.0, 87.3, 98.0, 110.0, 146.8
        ];
        const bassFreq = dMinorBass[step % dMinorBass.length];
        this._synthBass(time, bassFreq, 0.12, 0.22, 'sawtooth');

        // Synth Lead melody line on select steps
        const leadPattern = {
            0: 293.66, 3: 349.23, 6: 440.00, 10: 523.25, 12: 587.33,
            16: 440.00, 19: 392.00, 22: 349.23, 26: 329.63, 28: 293.66
        };
        if (leadPattern[step]) {
            this._synthLead(time, leadPattern[step], 0.24, 0.14);
        }

        // Ambient Pad chord pulse on every bar (step 0 and 16)
        if (step === 0) {
            this._synthPad(time, [293.66, 349.23, 440.00], 1.8, 0.12); // Dm
        } else if (step === 16) {
            this._synthPad(time, [261.63, 329.63, 392.00], 1.8, 0.12); // C
        }
    }

    // 2. BOSS TRACK (Dark Fast Cyber Adrenaline)
    _stepBossTrack(step, time) {
        // Driving intense beats: Kick on 0, 3, 6, 8, 12, 14, 16, 19, 22, 24, 28
        if ([0, 3, 6, 8, 12, 14, 16, 19, 22, 24, 28, 30].includes(step)) {
            this._synthKick(time, 0.55);
        }
        if (step % 2 === 1) {
            this._synthHiHat(time, 0.22, step % 4 === 1);
        }
        if ([4, 12, 20, 28].includes(step)) {
            this._synthSnare(time, 0.42);
        }

        // Heavy dark bassline in C# / D diminished
        const bossBass = [
            65.4, 69.3, 65.4, 77.8, 65.4, 69.3, 65.4, 82.4,
            65.4, 69.3, 65.4, 77.8, 87.3, 82.4, 77.8, 69.3
        ];
        const bassFreq = bossBass[step % bossBass.length];
        this._synthBass(time, bassFreq, 0.10, 0.32, 'square');

        // Aggressive Siren / Lead Stabs
        if ([0, 4, 8, 12, 16, 20, 24, 28].includes(step)) {
            const stabFreq = step >= 16 ? 622.25 : 554.37;
            this._synthLead(time, stabFreq, 0.18, 0.2, 'sawtooth');
        }
    }

    // 3. MENU / HANGAR TRACK (Atmospheric Space Synth)
    _stepMenuTrack(step, time) {
        // Soft kick pulse every 8 steps
        if (step % 8 === 0) {
            this._synthKick(time, 0.25, 60, 25);
        }
        if (step % 4 === 2) {
            this._synthHiHat(time, 0.08, false);
        }

        // Warm Arpeggio (A Minor 9)
        const menuArp = [
            220.00, 261.63, 329.63, 392.00, 493.88, 392.00, 329.63, 261.63,
            196.00, 246.94, 293.66, 392.00, 440.00, 392.00, 293.66, 246.94
        ];
        const note = menuArp[step % menuArp.length];
        this._synthLead(time, note, 0.28, 0.09, 'sine');

        // Deep sub pulse
        if (step === 0) {
            this._synthBass(time, 55.0, 0.9, 0.18, 'sine');
            this._synthPad(time, [220.00, 261.63, 329.63, 440.00], 3.2, 0.08); // Am
        } else if (step === 16) {
            this._synthBass(time, 49.0, 0.9, 0.18, 'sine');
            this._synthPad(time, [196.00, 246.94, 293.66, 392.00], 3.2, 0.08); // G
        }
    }

    // 4. GAME OVER TRACK (Somber Cosmic Ambient)
    _stepGameOverTrack(step, time) {
        if (step === 0) {
            this._synthBass(time, 43.65, 2.5, 0.25, 'sine'); // F1
            this._synthPad(time, [174.61, 220.00, 261.63], 3.8, 0.14);
        } else if (step === 16) {
            this._synthBass(time, 36.71, 2.5, 0.25, 'sine'); // D1
            this._synthPad(time, [146.83, 174.61, 220.00], 3.8, 0.14);
        }
    }

    // ============================================
    // SYNTHESIZER INSTRUMENT VOICES
    // ============================================

    _synthKick(time, gainVal = 0.4, startFreq = 140, endFreq = 32) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(startFreq, time);
            osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.12);

            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

            osc.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + 0.15);
        } catch (e) {}
    }

    _synthHiHat(time, gainVal = 0.15, isOpen = false) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const dur = isOpen ? 0.09 : 0.035;
            const bufferSize = Math.floor(this.ctx.sampleRate * dur);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(8000, time);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            noise.start(time);
            noise.stop(time + dur);
        } catch (e) {}
    }

    _synthSnare(time, gainVal = 0.3) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const dur = 0.16;
            // Noise component
            const bufferSize = Math.floor(this.ctx.sampleRate * dur);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600, time);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(gainVal, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + dur);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.musicGain);

            // Tonal snap
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, time);
            osc.frequency.exponentialRampToValueAtTime(90, time + 0.08);
            oscGain.gain.setValueAtTime(gainVal * 0.7, time);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

            osc.connect(oscGain);
            oscGain.connect(this.musicGain);

            noise.start(time);
            osc.start(time);
            noise.stop(time + dur);
            osc.stop(time + 0.09);
        } catch (e) {}
    }

    _synthBass(time, freq, dur = 0.18, gainVal = 0.25, type = 'sawtooth') {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 5, time);
            filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + dur);
            filter.Q.setValueAtTime(2.5, time);

            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + dur);
        } catch (e) {}
    }

    _synthLead(time, freq, dur = 0.22, gainVal = 0.12, type = 'sawtooth') {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 4, time);
            filter.frequency.exponentialRampToValueAtTime(freq * 1.8, time + dur);

            gain.gain.setValueAtTime(0.001, time);
            gain.gain.linearRampToValueAtTime(gainVal, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + dur);
        } catch (e) {}
    }

    _synthPad(time, freqs = [], dur = 2.0, gainVal = 0.1) {
        if (!this.ctx || !this.musicGain) return;
        freqs.forEach(freq => {
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, time);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1400, time);

                gain.gain.setValueAtTime(0.001, time);
                gain.gain.linearRampToValueAtTime(gainVal / freqs.length, time + 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.musicGain);

                osc.start(time);
                osc.stop(time + dur);
            } catch (e) {}
        });
    }

    // ============================================
    // SOUND EFFECTS (SFX)
    // ============================================

    playLaser() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.15);

            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        } catch (e) {}
    }

    playExplosion(scale = 'medium') {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const duration = scale === 'large' ? 0.5 : (scale === 'boss' ? 0.8 : 0.25);
            const baseFreq = scale === 'large' ? 80 : (scale === 'boss' ? 50 : 140);

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + duration);

            gain.gain.setValueAtTime(0.45, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    }

    playPowerUp() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((f, i) => {
            setTimeout(() => {
                try {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(f, this.ctx.currentTime);
                    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
                    osc.connect(gain);
                    gain.connect(this.sfxGain);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 0.12);
                } catch (e) {}
            }, i * 45);
        });
    }

    playWarp() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.25);
            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.25);
        } catch (e) {}
    }

    playBossAlarm() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                try {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
                    osc.connect(gain);
                    gain.connect(this.sfxGain);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 0.15);
                } catch (e) {}
            }, i * 200);
        }
    }

    playButtonClick() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.04);
        } catch (e) {}
    }
}

export const audio = new SoundEngine();

// Auto unlock audio on any user gesture
const unlockAudio = () => {
    if (!audio.initialized) {
        audio.init();
    } else if (audio.ctx && audio.ctx.state === 'suspended') {
        audio.ctx.resume();
    }
};

['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev => {
    document.addEventListener(ev, unlockAudio, { once: false, passive: true });
});
