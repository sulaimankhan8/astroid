// =============================================================================
// ASTEROIDS COSMIC SYNTHESIS AUDIO ENGINE (Web Audio API)
// Deep Space Procedural Soundtrack, Interstellar Drone & Spatial SFX
// =============================================================================

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem('asteroidsSoundEnabled') !== 'false';
        this.initialized = false;

        // Volumes (0.0 to 1.0)
        this.sfxVolume = parseFloat(localStorage.getItem('asteroidsSfxVolume') ?? '0.8');
        this.musicVolume = parseFloat(localStorage.getItem('asteroidsMusicVolume') ?? '0.7');
        this.cosmicTheme = localStorage.getItem('asteroidsCosmicTheme') ?? 'odyssey'; // 'odyssey' | 'nebula' | 'cyberpunk'

        // Audio Routing Nodes
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.compressor = null;
        this.musicFilter = null;

        // Spatial / Cosmic Effects Busses
        this.spaceReverbNode = null;
        this.reverbSendGain = null;
        this.pingPongLeftDelay = null;
        this.pingPongRightDelay = null;
        this.pingPongFeedbackGain = null;
        this.delaySendGain = null;

        // Background Music Sequencer State
        this.currentTrack = 'none'; // 'none' | 'menu' | 'combat' | 'boss' | 'gameover'
        this.isPlayingMusic = false;
        this.bpm = 120;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.schedulerTimer = null;
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.18; // s

        // Cosmic Drone Generator Nodes
        this.droneGain = null;
        this.droneOsc1 = null;
        this.droneOsc2 = null;
        this.droneFilter = null;
        this.droneLfo = null;
        this.droneLfoGain = null;
        this.droneNoise = null;
    }

    // =========================================================================
    // INITIALIZATION & AUDIO ROUTING
    // =========================================================================

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

            // 1. Master Compressor / Limiter (Prevents clipping across multi-synth voices)
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
            this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
            this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
            this.compressor.release.setValueAtTime(0.2, this.ctx.currentTime);

            // 2. Master Gain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0, this.ctx.currentTime);
            
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            // 3. SFX Bus
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
            this.sfxGain.connect(this.compressor);

            // 4. Music Master Gain & Dynamic Lowpass Filter
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);

            this.musicFilter = this.ctx.createBiquadFilter();
            this.musicFilter.type = 'lowpass';
            this.musicFilter.frequency.setValueAtTime(14000, this.ctx.currentTime);
            this.musicFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

            this.musicGain.connect(this.musicFilter);
            this.musicFilter.connect(this.compressor);

            // 5. Cosmic Spatial Effects: Synthetic Space Reverb Convolver
            this._setupSpaceReverb();

            // 6. Cosmic Spatial Effects: Stereo Ping-Pong Delay Line
            this._setupStereoDelay();

            // 7. Ambient Cosmic Sub-space Drone
            this._setupCosmicDrone();

            this.initialized = true;

            // Start music sequencer clock
            this._startMusicScheduler();

            if (this.currentTrack !== 'none') {
                this.playMusic(this.currentTrack);
            }
        } catch (e) {
            console.warn('AudioContext initialization error:', e);
            this.enabled = false;
        }
    }

    // Procedurally synthesize a lush, shimmering space reverb impulse response
    _setupSpaceReverb() {
        if (!this.ctx) return;
        try {
            const sampleRate = this.ctx.sampleRate;
            const length = Math.floor(sampleRate * 2.8); // 2.8s cosmic tail
            const impulse = this.ctx.createBuffer(2, length, sampleRate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);

            const decay = 2.4;
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * decay);
                // Dual stereo diffusion with subtle modulation
                left[i] = (Math.random() * 2 - 1) * env * (0.8 + 0.2 * Math.sin(t * 7.5));
                right[i] = (Math.random() * 2 - 1) * env * (0.8 + 0.2 * Math.cos(t * 8.2));
            }

            this.spaceReverbNode = this.ctx.createConvolver();
            this.spaceReverbNode.buffer = impulse;

            // Reverb send bus
            this.reverbSendGain = this.ctx.createGain();
            this.reverbSendGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

            this.reverbSendGain.connect(this.spaceReverbNode);
            this.spaceReverbNode.connect(this.musicGain);
        } catch (e) {
            console.warn('Space Reverb initialization failed:', e);
        }
    }

    // Setup Stereo Ping-Pong Echo for ethereal cosmic arpeggios
    _setupStereoDelay() {
        if (!this.ctx) return;
        try {
            const merger = this.ctx.createChannelMerger(2);

            this.pingPongLeftDelay = this.ctx.createDelay(1.0);
            this.pingPongLeftDelay.delayTime.setValueAtTime(0.28, this.ctx.currentTime); // 16th note sync approx

            this.pingPongRightDelay = this.ctx.createDelay(1.0);
            this.pingPongRightDelay.delayTime.setValueAtTime(0.42, this.ctx.currentTime); // Dotted 16th

            this.pingPongFeedbackGain = this.ctx.createGain();
            this.pingPongFeedbackGain.gain.setValueAtTime(0.32, this.ctx.currentTime);

            const dampingFilter = this.ctx.createBiquadFilter();
            dampingFilter.type = 'lowpass';
            dampingFilter.frequency.setValueAtTime(4500, this.ctx.currentTime);

            // Delay send
            this.delaySendGain = this.ctx.createGain();
            this.delaySendGain.gain.setValueAtTime(0.30, this.ctx.currentTime);

            // Routing: input -> delayLeft -> delayRight -> feedback -> dampingFilter -> merger
            this.delaySendGain.connect(this.pingPongLeftDelay);
            this.pingPongLeftDelay.connect(this.pingPongRightDelay);
            this.pingPongRightDelay.connect(this.pingPongFeedbackGain);
            this.pingPongFeedbackGain.connect(dampingFilter);
            dampingFilter.connect(this.pingPongLeftDelay);

            this.pingPongLeftDelay.connect(merger, 0, 0);
            this.pingPongRightDelay.connect(merger, 0, 1);

            merger.connect(this.musicGain);
        } catch (e) {
            console.warn('Stereo Delay initialization failed:', e);
        }
    }

    // Ambient interstellar hum & planetary wind drone
    _setupCosmicDrone() {
        if (!this.ctx || !this.musicGain) return;
        try {
            this.droneGain = this.ctx.createGain();
            this.droneGain.gain.setValueAtTime(0.07, this.ctx.currentTime);

            this.droneFilter = this.ctx.createBiquadFilter();
            this.droneFilter.type = 'lowpass';
            this.droneFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
            this.droneFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

            // LFO for slowly breathing space filter
            this.droneLfo = this.ctx.createOscillator();
            this.droneLfo.type = 'sine';
            this.droneLfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 12.5s cycle

            this.droneLfoGain = this.ctx.createGain();
            this.droneLfoGain.gain.setValueAtTime(60, this.ctx.currentTime);

            this.droneLfo.connect(this.droneLfoGain);
            this.droneLfoGain.connect(this.droneFilter.frequency);
            this.droneLfo.start();

            // Sub Osc 1 (D0 / 36.7Hz)
            this.droneOsc1 = this.ctx.createOscillator();
            this.droneOsc1.type = 'sine';
            this.droneOsc1.frequency.setValueAtTime(36.7, this.ctx.currentTime);

            // Sub Osc 2 (A0 / 55.0Hz - slight detuning for rich beating)
            this.droneOsc2 = this.ctx.createOscillator();
            this.droneOsc2.type = 'triangle';
            this.droneOsc2.frequency.setValueAtTime(55.2, this.ctx.currentTime);

            // Cosmic interstellar noise bed (filtered cosmic wind)
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                // Brown noise integration
                lastOut = (lastOut + 0.02 * white) / 1.02;
                data[i] = lastOut * 3.5;
            }

            this.droneNoise = this.ctx.createBufferSource();
            this.droneNoise.buffer = noiseBuffer;
            this.droneNoise.loop = true;

            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
            noiseFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.035, this.ctx.currentTime);

            this.droneNoise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.droneGain);

            this.droneOsc1.connect(this.droneFilter);
            this.droneOsc2.connect(this.droneFilter);
            this.droneFilter.connect(this.droneGain);
            this.droneGain.connect(this.musicGain);

            this.droneOsc1.start();
            this.droneOsc2.start();
            this.droneNoise.start();
        } catch (e) {
            console.warn('Cosmic Drone initialization failed:', e);
        }
    }

    // =========================================================================
    // VOLUME & SETTINGS CONTROLS
    // =========================================================================

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

    setCosmicTheme(theme) {
        this.cosmicTheme = theme;
        localStorage.setItem('asteroidsCosmicTheme', theme);
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

    // =========================================================================
    // PROCEDURAL MUSIC PLAYBACK & SCHEDULING
    // =========================================================================

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

        // Adjust tempo, filter cutoff, and drone intensity dynamically per track
        switch (trackName) {
            case 'menu':
                this.bpm = 92;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(10500, this.ctx.currentTime, 0.25);
                if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.3);
                break;
            case 'combat':
                this.bpm = 128;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(15000, this.ctx.currentTime, 0.2);
                if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.3);
                break;
            case 'boss':
                this.bpm = 144;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(16500, this.ctx.currentTime, 0.2);
                if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.09, this.ctx.currentTime, 0.3);
                break;
            case 'gameover':
                this.bpm = 72;
                if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(4500, this.ctx.currentTime, 0.5);
                if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.5);
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
        const targetFreq = isMuffled ? 650 : (this.currentTrack === 'boss' ? 16500 : 13500);
        this.musicFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.18);
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
        this.currentStep = (this.currentStep + 1) % 64; // Rich 4-bar 64-step loop
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

    // =========================================================================
    // COSMIC SOUNDTRACK COMPOSITIONS (64-Step Sequences)
    // =========================================================================

    // 1. MENU / HANGAR TRACK: "Nebula Horizon" (Atmospheric, Ethereal & Floating)
    _stepMenuTrack(step, time) {
        // Deep ambient pulse kick every 8 steps (gentle heartbeat of the cosmos)
        if (step % 8 === 0) {
            this._synthKick(time, 0.28, 55, 22, 0.18);
        }
        // Shimmering celestial hi-hat on offbeats
        if (step % 4 === 2) {
            this._synthHiHat(time, 0.07, true);
        }

        // 4-Bar Chord Progression:
        // Bar 1 (0..15):   Dm9      [D3, F3, A3, C4, E4]
        // Bar 2 (16..31):  Bbmaj7   [Bb2, D3, F3, A3, C4]
        // Bar 3 (32..47):  Fmaj9    [F2, A2, C3, E3, G3]
        // Bar 4 (48..63):  Asus4(9) [A2, D3, E3, G3, B3]
        if (step === 0) {
            this._synthCosmicPad(time, [146.83, 174.61, 220.00, 261.63, 329.63], 3.8, 0.16);
            this._synthSubBass(time, 36.71, 3.5, 0.22); // D1
        } else if (step === 16) {
            this._synthCosmicPad(time, [116.54, 146.83, 174.61, 220.00, 261.63], 3.8, 0.16);
            this._synthSubBass(time, 29.14, 3.5, 0.22); // Bb0
        } else if (step === 32) {
            this._synthCosmicPad(time, [174.61, 220.00, 261.63, 329.63, 392.00], 3.8, 0.16);
            this._synthSubBass(time, 43.65, 3.5, 0.22); // F1
        } else if (step === 48) {
            this._synthCosmicPad(time, [110.00, 146.83, 164.81, 196.00, 246.94], 3.8, 0.16);
            this._synthSubBass(time, 55.00, 3.5, 0.22); // A1
        }

        // Celestial Stardust Bells (Pentatonic Space Arpeggio)
        const stardustBells = {
            2: 587.33,  // D5
            4: 659.25,  // E5
            6: 880.00,  // A5
            10: 783.99, // G5
            12: 587.33, // D5
            14: 659.25, // E5

            18: 698.46, // F5
            20: 880.00, // A5
            22: 1046.50,// C6
            26: 880.00, // A5
            28: 698.46, // F5
            30: 587.33, // D5

            34: 659.25, // E5
            36: 783.99, // G5
            38: 1046.50,// C6
            42: 880.00, // A5
            44: 783.99, // G5
            46: 659.25, // E5

            50: 587.33, // D5
            52: 739.99, // F#5 / G5
            54: 880.00, // A5
            58: 659.25, // E5
            60: 587.33, // D5
            62: 440.00  // A4
        };

        if (stardustBells[step]) {
            const pan = ((step % 8) / 4) - 0.8; // Floating stereo pan
            this._synthStardustBell(time, stardustBells[step], 0.35, 0.12, pan);
        }
    }

    // 2. COMBAT TRACK: "Hyperspace Odyssey" (Pulsing Cosmic Synthwave & Astral Momentum)
    _stepCombatTrack(step, time) {
        // Tight, punchy space-synth kick (4 on the floor with syncopation)
        if (step % 4 === 0 || step === 14 || step === 30 || step === 46 || step === 62) {
            this._synthKick(time, 0.48, 140, 36, 0.11);
        }

        // Snappy cyber snare with space reverb tail on 4 and 12 of each 16-step bar
        if (step % 8 === 4) {
            this._synthSnare(time, 0.35);
        }

        // 16th-note Astral Hi-Hats with accents & stereo panning
        const hatVelocity = (step % 4 === 2) ? 0.22 : 0.11;
        this._synthHiHat(time, hatVelocity, step % 8 === 2);

        // Driving 16th-note Rolling Space Bassline (D Minor / Dorian)
        // Root changes every 16 steps: D -> Bb -> C -> A
        const bar = Math.floor(step / 16);
        const roots = [73.42, 58.27, 65.41, 55.00]; // D2, Bb1, C2, A1
        const root = roots[bar];
        const octaveRoot = root * 2;
        const fifth = root * 1.5;

        // 16-step rolling bass pattern
        const bassPattern = [
            root, root, octaveRoot, root,
            root, fifth, octaveRoot, root,
            root, root, octaveRoot, fifth,
            root, octaveRoot, fifth, root * 1.334
        ];
        const bassFreq = bassPattern[step % 16];
        this._synthBass(time, bassFreq, 0.11, 0.24, 'sawtooth');

        // Space Arpeggio (16th-note celestial arpeggiator ping-ponging across stereo)
        const arpScales = [
            // Bar 1: Dm (D4, F4, A4, C5, D5, C5, A4, F4)
            [293.66, 349.23, 440.00, 523.25, 587.33, 523.25, 440.00, 349.23],
            // Bar 2: Bb (Bb3, D4, F4, A4, D5, A4, F4, D4)
            [233.08, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66],
            // Bar 3: C  (C4, E4, G4, B4, C5, B4, G4, E4)
            [261.63, 329.63, 392.00, 493.88, 523.25, 493.88, 392.00, 329.63],
            // Bar 4: Am (A3, C4, E4, G4, A4, G4, E4, C4)
            [220.00, 261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 261.63]
        ];
        const scale = arpScales[bar];
        const arpNote = scale[step % 8];
        const arpPan = (step % 2 === 0) ? -0.45 : 0.45;
        this._synthSpaceArp(time, arpNote, 0.12, 0.08, arpPan);

        // Cosmic Pad chords sweeping on bar transitions
        if (step === 0) {
            this._synthCosmicPad(time, [293.66, 349.23, 440.00, 523.25], 2.8, 0.13); // Dm7
        } else if (step === 16) {
            this._synthCosmicPad(time, [233.08, 293.66, 349.23, 440.00], 2.8, 0.13); // Bbmaj7
        } else if (step === 32) {
            this._synthCosmicPad(time, [261.63, 329.63, 392.00, 493.88], 2.8, 0.13); // Cmaj7
        } else if (step === 48) {
            this._synthCosmicPad(time, [220.00, 261.63, 329.63, 392.00], 2.8, 0.13); // Am7
        }

        // Cinematic Soaring Space Lead (Bar 3 & 4 Lead Melodic Hook)
        const leadMelody = {
            0: 587.33,  // D5
            6: 659.25,  // E5
            10: 698.46, // F5
            12: 880.00, // A5
            16: 783.99, // G5
            22: 698.46, // F5
            26: 659.25, // E5
            28: 587.33, // D5
            32: 880.00, // A5
            36: 1046.50,// C6
            40: 987.77, // B5
            44: 880.00, // A5
            48: 783.99, // G5
            54: 698.46, // F5
            58: 659.25, // E5
            60: 587.33  // D5
        };

        if (leadMelody[step]) {
            this._synthCosmicLead(time, leadMelody[step], 0.32, 0.15);
        }
    }

    // 3. BOSS TRACK: "Black Hole Singularity" (Dark Aggressive Cosmic Tension)
    _stepBossTrack(step, time) {
        // Heavy relentless industrial cyber kick
        if ([0, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 26, 28, 30, 32, 35, 38, 40, 42, 44, 46, 48, 51, 54, 56, 58, 60, 62].includes(step)) {
            this._synthKick(time, 0.58, 160, 28, 0.12);
        }
        // Double-time astral hats
        this._synthHiHat(time, 0.18, step % 2 === 1);
        // Snare snaps
        if ([4, 12, 20, 28, 36, 44, 52, 60].includes(step)) {
            this._synthSnare(time, 0.44);
        }

        // Heavy Menacing Distorted Bass in C# / D Diminished
        const bossBassSequence = [
            65.41, 69.30, 65.41, 77.78, 65.41, 69.30, 82.41, 77.78,
            65.41, 69.30, 65.41, 77.78, 87.31, 82.41, 77.78, 69.30
        ];
        const bassFreq = bossBassSequence[step % 16];
        this._synthBass(time, bassFreq, 0.09, 0.34, 'sawtooth');

        // Dark Pulsar Siren / Anomaly Stabs
        if (step % 8 === 0) {
            const stabNote = (step >= 32) ? 622.25 : 554.37; // Eb5 / C#5
            this._synthCosmicLead(time, stabNote, 0.22, 0.20, true);
        }

        // Tension Riser Sweeps
        if (step === 28 || step === 60) {
            this._synthRiser(time, 0.35);
        }
    }

    // 4. GAME OVER TRACK: "Deep Space Void" (Somber, Floating Interstellar Eulogy)
    _stepGameOverTrack(step, time) {
        if (step === 0) {
            this._synthSubBass(time, 36.71, 4.5, 0.28); // D1
            this._synthCosmicPad(time, [146.83, 174.61, 220.00, 261.63], 4.5, 0.18);
            this._synthStardustBell(time, 587.33, 0.9, 0.14, -0.3); // Lone distress ping
        } else if (step === 16) {
            this._synthSubBass(time, 29.14, 4.5, 0.28); // Bb0
            this._synthCosmicPad(time, [116.54, 146.83, 174.61, 220.00], 4.5, 0.18);
            this._synthStardustBell(time, 440.00, 0.9, 0.14, 0.3);
        } else if (step === 32) {
            this._synthSubBass(time, 43.65, 4.5, 0.28); // F1
            this._synthCosmicPad(time, [174.61, 220.00, 261.63, 329.63], 4.5, 0.18);
            this._synthStardustBell(time, 392.00, 0.9, 0.14, -0.2);
        } else if (step === 48) {
            this._synthSubBass(time, 55.00, 4.5, 0.28); // A1
            this._synthCosmicPad(time, [110.00, 146.83, 164.81, 220.00], 4.5, 0.18);
            this._synthStardustBell(time, 293.66, 1.2, 0.16, 0.0);
        }
    }

    // =========================================================================
    // HIGH QUALITY SYNTHESIZER INSTRUMENT VOICES
    // =========================================================================

    // Lush Multi-Oscillator Cosmic Pad with stereo detune & lowpass envelope
    _synthCosmicPad(time, freqs = [], dur = 3.0, gainVal = 0.12) {
        if (!this.ctx || !this.musicGain) return;
        freqs.forEach(freq => {
            try {
                // Dual detuned oscillators (gives rich celestial chorus shimmer)
                const osc1 = this.ctx.createOscillator();
                const osc2 = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc1.type = 'sawtooth';
                osc2.type = 'triangle';

                osc1.frequency.setValueAtTime(freq, time);
                osc2.frequency.setValueAtTime(freq * 1.003, time); // Subtle detune

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(400, time);
                filter.frequency.linearRampToValueAtTime(1600, time + dur * 0.4);
                filter.frequency.exponentialRampToValueAtTime(300, time + dur);
                filter.Q.setValueAtTime(1.8, time);

                // Smooth organic swell envelope
                gain.gain.setValueAtTime(0.0001, time);
                gain.gain.linearRampToValueAtTime(gainVal / freqs.length, time + 0.6);
                gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

                osc1.connect(filter);
                osc2.connect(filter);
                filter.connect(gain);
                gain.connect(this.musicGain);

                // Send to space reverb for expansive cosmic dimension
                if (this.reverbSendGain) {
                    gain.connect(this.reverbSendGain);
                }

                osc1.start(time);
                osc2.start(time);
                osc1.stop(time + dur);
                osc2.stop(time + dur);
            } catch (e) {}
        });
    }

    // Twinkling Stardust Bell (Sine + Harmonic Overtone + Stereo Panning)
    _synthStardustBell(time, freq, dur = 0.4, gainVal = 0.12, pan = 0.0) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const oscHarmonic = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const panner = (this.ctx.createStereoPanner) ? this.ctx.createStereoPanner() : null;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            oscHarmonic.type = 'triangle';
            oscHarmonic.frequency.setValueAtTime(freq * 2.756, time); // Bell overtone

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(gainVal, time + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(gain);
            oscHarmonic.connect(gain);

            if (panner) {
                panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), time);
                gain.connect(panner);
                panner.connect(this.musicGain);
                if (this.delaySendGain) panner.connect(this.delaySendGain);
                if (this.reverbSendGain) panner.connect(this.reverbSendGain);
            } else {
                gain.connect(this.musicGain);
                if (this.delaySendGain) gain.connect(this.delaySendGain);
                if (this.reverbSendGain) gain.connect(this.reverbSendGain);
            }

            osc.start(time);
            oscHarmonic.start(time);
            osc.stop(time + dur);
            oscHarmonic.stop(time + dur);
        } catch (e) {}
    }

    // Space Arpeggio Voice (Sharp, rhythmic, crystalline)
    _synthSpaceArp(time, freq, dur = 0.12, gainVal = 0.10, pan = 0.0) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            const panner = (this.ctx.createStereoPanner) ? this.ctx.createStereoPanner() : null;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(freq * 2.2, time);
            filter.Q.setValueAtTime(3.5, time);

            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(filter);
            filter.connect(gain);

            if (panner) {
                panner.pan.setValueAtTime(pan, time);
                gain.connect(panner);
                panner.connect(this.musicGain);
                if (this.delaySendGain) panner.connect(this.delaySendGain);
            } else {
                gain.connect(this.musicGain);
                if (this.delaySendGain) gain.connect(this.delaySendGain);
            }

            osc.start(time);
            osc.stop(time + dur);
        } catch (e) {}
    }

    // Cinematic Soaring Space Lead (with smooth pitch slide & vibrato)
    _synthCosmicLead(time, freq, dur = 0.3, gainVal = 0.16, isDistorted = false) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();

            osc1.type = isDistorted ? 'sawtooth' : 'sawtooth';
            osc2.type = 'square';

            osc1.frequency.setValueAtTime(freq, time);
            osc2.frequency.setValueAtTime(freq * 1.004, time);

            // Subtle pitch glide
            osc1.frequency.exponentialRampToValueAtTime(freq * 1.002, time + dur);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 3.5, time);
            filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + dur);
            filter.Q.setValueAtTime(isDistorted ? 4.5 : 2.0, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(gainVal, time + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            if (this.reverbSendGain) gain.connect(this.reverbSendGain);
            if (this.delaySendGain) gain.connect(this.delaySendGain);

            osc1.start(time);
            osc2.start(time);
            osc1.stop(time + dur);
            osc2.stop(time + dur);
        } catch (e) {}
    }

    // Rolling Space Bass Voice
    _synthBass(time, freq, dur = 0.14, gainVal = 0.26, type = 'sawtooth') {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 4.2, time);
            filter.frequency.exponentialRampToValueAtTime(freq * 1.2, time + dur);
            filter.Q.setValueAtTime(3.2, time);

            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + dur);
        } catch (e) {}
    }

    // Deep Sub-Bass Drone Pulse
    _synthSubBass(time, freq, dur = 2.0, gainVal = 0.22) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(gainVal, time + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + dur);
        } catch (e) {}
    }

    // Punchy Space Kick
    _synthKick(time, gainVal = 0.45, startFreq = 140, endFreq = 32, dur = 0.14) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(startFreq, time);
            osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur * 0.85);

            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + dur + 0.02);
        } catch (e) {}
    }

    // Shimmering Hi-Hat (White noise burst + highpass filter)
    _synthHiHat(time, gainVal = 0.12, isOpen = false) {
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
            filter.frequency.setValueAtTime(8500, time);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(gainVal, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            noise.start(time);
            noise.stop(time + dur);
        } catch (e) {}
    }

    // Space Snare (Bandpass noise burst + tonal body)
    _synthSnare(time, gainVal = 0.32) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const dur = 0.18;
            const bufferSize = Math.floor(this.ctx.sampleRate * dur);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1800, time);
            filter.Q.setValueAtTime(1.5, time);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(gainVal, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.musicGain);

            // Tonal snap body
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(240, time);
            osc.frequency.exponentialRampToValueAtTime(85, time + 0.09);
            oscGain.gain.setValueAtTime(gainVal * 0.7, time);
            oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);

            osc.connect(oscGain);
            oscGain.connect(this.musicGain);

            if (this.reverbSendGain) {
                noiseGain.connect(this.reverbSendGain);
            }

            noise.start(time);
            osc.start(time);
            noise.stop(time + dur);
            osc.stop(time + 0.1);
        } catch (e) {}
    }

    // Tension Riser FX (Pitch sweep upward)
    _synthRiser(time, gainVal = 0.25) {
        if (!this.ctx || !this.musicGain) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, time);
            osc.frequency.exponentialRampToValueAtTime(1200, time + 0.45);

            gain.gain.setValueAtTime(0.001, time);
            gain.gain.linearRampToValueAtTime(gainVal, time + 0.35);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

            osc.connect(gain);
            gain.connect(this.musicGain);

            osc.start(time);
            osc.stop(time + 0.46);
        } catch (e) {}
    }

    // =========================================================================
    // SOUND EFFECTS (SFX)
    // =========================================================================

    playLaser() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const osc = this.ctx.createOscillator();
            const subOsc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(980, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(90, this.ctx.currentTime + 0.14);

            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(440, this.ctx.currentTime);
            subOsc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.12);

            gain.gain.setValueAtTime(0.32, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);

            osc.connect(gain);
            subOsc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start();
            subOsc.start();
            osc.stop(this.ctx.currentTime + 0.15);
            subOsc.stop(this.ctx.currentTime + 0.15);
        } catch (e) {}
    }

    playExplosion(scale = 'medium') {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const duration = scale === 'large' ? 0.6 : (scale === 'boss' ? 1.0 : 0.28);
            const baseFreq = scale === 'large' ? 75 : (scale === 'boss' ? 45 : 130);

            // Sub bass impact
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(15, this.ctx.currentTime + duration);

            oscGain.gain.setValueAtTime(0.42, this.ctx.currentTime);
            oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            osc.connect(oscGain);
            oscGain.connect(this.sfxGain);

            // Noise burst for debris rumble
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
            noiseFilter.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + duration);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.38, this.ctx.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.sfxGain);

            osc.start();
            noise.start();
            osc.stop(this.ctx.currentTime + duration);
            noise.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    }

    playPowerUp() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        freqs.forEach((f, i) => {
            setTimeout(() => {
                try {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(f, this.ctx.currentTime);
                    gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);
                    osc.connect(gain);
                    gain.connect(this.sfxGain);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 0.14);
                } catch (e) {}
            }, i * 40);
        });
    }

    playWarp() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.28);
            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.28);
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
                    osc.frequency.setValueAtTime(420, this.ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(840, this.ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
                    osc.connect(gain);
                    gain.connect(this.sfxGain);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 0.15);
                } catch (e) {}
            }, i * 180);
        }
    }

    playButtonClick() {
        if (!this.enabled || !this.initialized || !this.ctx || !this.sfxGain || this.sfxVolume <= 0.001) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(650, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, this.ctx.currentTime + 0.04);
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
