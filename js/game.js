// ============================================
// ASTEROIDS DELUXE - MAIN GAME ENGINE (REFINED)
// ============================================

import { Ship, Bullet, Asteroid, UFO, BossMothership, Crystal } from './entities.js';
import { ParticleSystem } from './particles.js';
import { Shop } from './shop.js';
import { audio } from './audio.js';

const GAME_MODES = { CLASSIC: 'classic', TIMERUSH: 'timerush', BOSSRUSH: 'bossrush' };
const SHIP_LIVES = { classic: 3, timerush: 5, bossrush: 3 };
const TIME_RUSH_LIMIT = 180;

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.state = 'menu'; // 'menu' | 'starting' | 'playing' | 'waveannounce' | 'paused' | 'gameover'
        this.mode = GAME_MODES.CLASSIC;
        this.shipType = 'viper';

        this.ship = null;
        this.bullets = [];
        this.asteroids = [];
        this.ufos = [];
        this.enemies = [];
        this.crystals = [];
        this.boss = null;

        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.highScore = parseInt(localStorage.getItem('asteroidsHiScore') || '0');
        this.wave = 1;
        this.lives = 3;
        this.crystalCount = 0;
        this.asteroidsDestroyed = 0;
        this.bombs = 2;
        this.timeLeft = TIME_RUSH_LIMIT;
        this.timeTicker = 0;

        // Wave announce overlay state
        this.waveAnnounce = { active: false, timer: 0, text: '' };

        // Floating score popups
        this.popups = [];

        this.shop = new Shop();
        this.particles = new ParticleSystem();
        this.animFrame = null;

        // ---- Input state ----
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false };
        this.aimWithMouse = false; // toggled when mouse moves significantly
        this.touchJoystick = { dx: 0, dy: 0, active: false };
        this.touchFireHeld = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._bindInput();
        this._bindUI();
        this._loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
        this.particles.resizeStarfield(this.W, this.H);
    }

    // ===================== LIFECYCLE =====================

    startGame() {
        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.wave = 1;
        this.lives = SHIP_LIVES[this.mode] || 3;
        this.crystalCount = 0;
        this.asteroidsDestroyed = 0;
        this.bombs = 2;
        this.timeLeft = TIME_RUSH_LIMIT;
        this.timeTicker = 0;
        this.popups = [];

        this.bullets = [];
        this.asteroids = [];
        this.ufos = [];
        this.enemies = [];
        this.crystals = [];
        this.boss = null;
        this.waveAnnounce = { active: false, timer: 0, text: '' };

        this.particles.clear();
        this.shop = new Shop();

        this.ship = new Ship(this.W / 2, this.H / 2, this.shipType);
        this.ship.invulnerableTimer = 200;
        this.shop.applyToShip(this.ship);
        this.aimWithMouse = false;

        if (this.mode === GAME_MODES.BOSSRUSH) {
            this._announceWave('👾 BOSS RUSH — WAVE 1', () => this._spawnBoss());
        } else {
            this._announceWave(`WAVE 1`, () => this._spawnWave(1));
        }

        this.state = 'playing';
        this._updateHUD();
    }

    _nextWave() {
        if (this.state !== 'playing') return;
        this.wave++;
        this.bullets = [];
        this.enemies = [];
        this.ufos = [];
        this.crystals = [];
        this.popups = [];

        // Bonus crystals for clearing wave
        const bonus = 10 + this.wave * 4;
        this.crystalCount += bonus;
        this._spawnPopup(this.W / 2, this.H / 2 - 60, `+${bonus} 💎`, '#00f5d4');
        this._updateHUD();

        const isBossWave = this.mode === GAME_MODES.BOSSRUSH || (this.mode === GAME_MODES.CLASSIC && this.wave % 5 === 0);

        if (isBossWave) {
            this._announceWave(`⚠️ BOSS WAVE ${this.wave}`, () => this._spawnBoss());
        } else {
            this._announceWave(`WAVE ${this.wave}`, () => {
                this._spawnWave(this.wave);
                // Spawn UFO escort on wave 3+
                if (this.wave >= 3 && this.wave % 3 === 0) {
                    setTimeout(() => {
                        if (this.state === 'playing') this.ufos.push(new UFO(this.W, this.H));
                    }, 4000);
                }
            });
        }
    }

    _announceWave(text, callback) {
        this.waveAnnounce = { active: true, timer: 0, text, callback };
    }

    _spawnWave(wave) {
        const count = Math.min(4 + wave, 16);
        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            do {
                x = Math.random() * this.W;
                y = Math.random() * this.H;
                attempts++;
            } while (this._dist(x, y, this.W / 2, this.H / 2) < 180 && attempts < 20);
            this.asteroids.push(new Asteroid(x, y, 'large', wave));
        }
        this._setWaveBadge(`WAVE ${wave}`);
    }

    _spawnBoss() {
        this.boss = new BossMothership(this.W / 2, 130);
        this._setWaveBadge(`⚠️ BOSS WAVE ${this.wave}`);
        audio.playBossAlarm();

        const bc = document.getElementById('bossHealthContainer');
        if (bc) {
            bc.style.display = 'block';
            document.getElementById('bossName').textContent =
                this.boss.phase === 2 ? 'ALIEN MOTHERSHIP — ENRAGED' : 'ALIEN MOTHERSHIP';
            document.getElementById('bossHealthFill').style.width = '100%';
        }
    }

    loseLife() {
        if (!this.ship || this.ship.invulnerableTimer > 0) return;

        // Absorb with shield first
        if (this.ship.shieldHp > 0) {
            this.ship.shieldHp--;
            this.ship.invulnerableTimer = 90;
            this.particles.spawnExplosion(this.ship.x, this.ship.y, '#00f5d4', 18);
            audio.playWarp();
            this._updateHUD();
            return;
        }

        this.lives--;
        this.combo = 0;
        this.comboTimer = 0;
        this.particles.spawnExplosion(this.ship.x, this.ship.y, '#ff2a85', 50);
        audio.playExplosion('large');

        if (this.lives <= 0) {
            this.ship = null;
            setTimeout(() => this._gameOver(), 800);
        } else {
            this.ship = new Ship(this.W / 2, this.H / 2, this.shipType);
            this.ship.invulnerableTimer = 200;
            this.shop.applyToShip(this.ship);
            this._updateHUD();
        }
    }

    _gameOver() {
        this.state = 'gameover';
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('asteroidsHiScore', String(this.highScore));
        }
        this._showModal('gameover');
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this._showModal('paused');
    }

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        const m = document.getElementById('statusModal');
        m.style.display = 'none';
        m.classList.remove('active');
    }

    // ===================== UPDATE =====================

    _update() {
        // ---- Wave announce overlay ----
        if (this.waveAnnounce.active) {
            this.waveAnnounce.timer++;
            if (this.waveAnnounce.timer === 1 && this.waveAnnounce.callback) {
                // Trigger spawn callback early (entities spawn but game proceeds)
                this.waveAnnounce.callback();
                this.waveAnnounce.callback = null;
            }
            // Show overlay for ~120 frames (2s), then fade
            if (this.waveAnnounce.timer >= 120) {
                this.waveAnnounce.active = false;
                this.waveAnnounce.timer = 0;
            }
        }

        if (this.state !== 'playing') return;

        const { W, H } = this;
        if (!this.ship) return;

        // ---- Ship Rotation ----
        const rotLeft  = this.keys['ArrowLeft']  || this.keys['KeyA'];
        const rotRight = this.keys['ArrowRight'] || this.keys['KeyD'];

        if (rotLeft)  this.ship.rotate(-1);
        if (rotRight) this.ship.rotate(1);

        // ---- Mouse Aim (smooth steer toward cursor, only when NOT rotating with keys) ----
        if (this.aimWithMouse && !rotLeft && !rotRight) {
            const dx = this.mouse.x - this.ship.x;
            const dy = this.mouse.y - this.ship.y;
            const target = Math.atan2(dy, dx);
            this.ship.steerToward(target, 0.15);
        }

        // ---- Thrust ----
        const thrusting = this.keys['ArrowUp'] || this.keys['KeyW'];
        if (thrusting) {
            this.ship.thrust();
            this.ship.isThrusting = true;
            this.particles.spawnThrusterTrail(this.ship.x, this.ship.y, this.ship.angle,
                this.shipType === 'titan' ? '#ffd700' :
                this.shipType === 'quantum' ? '#ff2a85' : '#ff6030');
        }

        // ---- Touch joystick steering + thrust ----
        if (this.touchJoystick.active) {
            const mag = Math.hypot(this.touchJoystick.dx, this.touchJoystick.dy);
            if (mag > 12) {
                const jAngle = Math.atan2(this.touchJoystick.dy, this.touchJoystick.dx);
                this.ship.steerToward(jAngle, 0.12);
                this.ship.thrust();
                this.ship.isThrusting = true;
                this.particles.spawnThrusterTrail(this.ship.x, this.ship.y, this.ship.angle, '#ff6030');
            }
        }

        // ---- Shooting (auto-fire when holding) ----
        const shooting = this.keys['Space'] || this.mouse.down || this.touchFireHeld;
        if (shooting && this.ship.fireCooldown <= 0) {
            this._fireBullet();
        }

        this.ship.update(W, H);

        // ---- Combo decay ----
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) this.combo = 0;
        }

        // ---- Time Rush countdown ----
        if (this.mode === GAME_MODES.TIMERUSH) {
            this.timeTicker++;
            if (this.timeTicker >= 60) {
                this.timeTicker = 0;
                this.timeLeft--;
                if (this.timeLeft <= 0) this._gameOver();
            }
        }

        // ---- Update bullets ----
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(W, H);
            if (b.life <= 0) { this.bullets.splice(i, 1); }
        }

        // ---- Update enemy bullets ----
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const b = this.enemies[i];
            b.update(W, H);
            if (b.life <= 0) { this.enemies.splice(i, 1); continue; }
            if (this.ship && this._circlesCollide(b, this.ship)) {
                this.enemies.splice(i, 1);
                this.loseLife();
            }
        }

        // ---- Update asteroids ----
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            const a = this.asteroids[i];
            a.update(W, H);

            if (this.ship && this._circlesCollide(a, this.ship)) {
                this.loseLife();
            }

            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const b = this.bullets[j];
                if (this._circlesCollide(b, a)) {
                    this.bullets.splice(j, 1);
                    a.hp -= b.power;
                    if (a.hp <= 0) {
                        this._destroyAsteroid(i, a);
                        break;
                    } else {
                        this.particles.spawnExplosion(a.x, a.y, '#38bdf8', 6);
                    }
                    break;
                }
            }
        }

        // ---- Update UFOs ----
        for (let i = this.ufos.length - 1; i >= 0; i--) {
            const ufo = this.ufos[i];
            ufo.update(W, H);

            // Exit bounds
            if (ufo.x < -60 || ufo.x > W + 60) {
                this.ufos.splice(i, 1); continue;
            }

            // UFO shoots toward player
            if (ufo.shootTimer >= 90 && this.ship) {
                ufo.shootTimer = 0;
                const angle = Math.atan2(this.ship.y - ufo.y, this.ship.x - ufo.x);
                // Add slight inaccuracy so it's not pixel-perfect
                const spread = (Math.random() - 0.5) * 0.25;
                this.enemies.push(new Bullet(ufo.x, ufo.y, angle + spread, 1, true));
            }

            // Bullets hit UFO
            let ufoDestroyed = false;
            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const b = this.bullets[j];
                if (this._circlesCollide(b, ufo)) {
                    this.bullets.splice(j, 1);
                    ufo.hp -= b.power;
                    this.particles.spawnExplosion(b.x, b.y, '#ff2a85', 8);
                    if (ufo.hp <= 0) {
                        const earned = ufo.points * (1 + this.combo * 0.1 | 0);
                        this.score += earned;
                        this.crystalCount += 25;
                        this._incrementCombo(ufo.x, ufo.y, earned);
                        this.particles.spawnExplosion(ufo.x, ufo.y, '#ff2a85', 35);
                        audio.playExplosion('large');
                        this.ufos.splice(i, 1);
                        this._updateHUD();
                        ufoDestroyed = true;
                    }
                    break;
                }
            }
            if (ufoDestroyed) continue;

            if (this.ship && this._circlesCollide(ufo, this.ship)) this.loseLife();
        }

        // ---- Update Boss ----
        if (this.boss) {
            this.boss.update(W, H);

            const shootInterval = this.boss.phase === 2 ? 55 : 80;
            if (this.boss.shootTimer >= shootInterval) {
                this.boss.shootTimer = 0;
                this._bossFire();
            }

            // Player bullets hit boss
            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const b = this.bullets[j];
                if (this._circlesCollide(b, this.boss)) {
                    this.bullets.splice(j, 1);
                    this.boss.hp -= b.power;
                    this.particles.spawnExplosion(b.x, b.y, '#ef4444', 8);

                    const pct = Math.max(0, (this.boss.hp / this.boss.maxHp) * 100);
                    const fill = document.getElementById('bossHealthFill');
                    if (fill) fill.style.width = pct + '%';

                    // Update boss name color for phase 2
                    if (this.boss.phase === 2) {
                        document.getElementById('bossName').textContent = 'ALIEN MOTHERSHIP — ENRAGED';
                    }

                    if (this.boss.hp <= 0) {
                        this.score += this.boss.points;
                        this.crystalCount += 100;
                        this._spawnPopup(this.boss.x, this.boss.y - 40, '💀 BOSS DESTROYED!', '#ffd700');
                        this.particles.spawnExplosion(this.boss.x, this.boss.y, '#ef4444', 100);
                        audio.playExplosion('boss');
                        this.boss = null;
                        document.getElementById('bossHealthContainer').style.display = 'none';
                        this._updateHUD();
                        setTimeout(() => this._nextWave(), 2500);
                    }
                    break;
                }
            }

            if (this.boss && this.ship && this._circlesCollide(this.boss, this.ship)) this.loseLife();
        }

        // ---- Update crystals ----
        for (let i = this.crystals.length - 1; i >= 0; i--) {
            const c = this.crystals[i];
            c.update();
            if (c.life <= 0) { this.crystals.splice(i, 1); continue; }
            if (this.ship && this._dist(c.x, c.y, this.ship.x, this.ship.y) < c.radius + this.ship.radius + 18) {
                this.crystalCount += c.value;
                this.crystals.splice(i, 1);
                audio.playPowerUp();
                this._updateHUD();
            }
        }

        // ---- Update popups ----
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.y -= 1.2;
            p.life--;
            if (p.life <= 0) this.popups.splice(i, 1);
        }

        // ---- Check wave clear (no asteroids, no boss, no UFOs) ----
        if (this.asteroids.length === 0 && !this.boss && this.ufos.length === 0 && this.state === 'playing') {
            // Debounce: only fire once
            if (!this._waveClearPending) {
                this._waveClearPending = true;
                setTimeout(() => {
                    this._waveClearPending = false;
                    if (this.asteroids.length === 0 && !this.boss && this.state === 'playing') {
                        this._nextWave();
                    }
                }, 1200);
            }
        } else {
            this._waveClearPending = false;
        }
    }

    _bossFire() {
        if (!this.boss || !this.ship) return;
        const b = this.boss;

        // Phase 1: radial burst
        const shots = b.phase === 2 ? 10 : 6;
        for (let s = 0; s < shots; s++) {
            const a = (s / shots) * Math.PI * 2 + b.angle;
            this.enemies.push(new Bullet(b.x, b.y, a, 1, true));
        }

        // Always fire aimed shot at player
        const aimAngle = Math.atan2(this.ship.y - b.y, this.ship.x - b.x);
        this.enemies.push(new Bullet(b.x, b.y, aimAngle, 1, true));

        // Phase 2 also fires spread triple-shot
        if (b.phase === 2) {
            this.enemies.push(new Bullet(b.x, b.y, aimAngle - 0.2, 1, true));
            this.enemies.push(new Bullet(b.x, b.y, aimAngle + 0.2, 1, true));
        }
    }

    // ===================== FIRE =====================

    _fireBullet() {
        if (!this.ship) return;
        const a = this.ship.angle;
        const tip = {
            x: this.ship.x + Math.cos(a) * this.ship.radius,
            y: this.ship.y + Math.sin(a) * this.ship.radius
        };

        this.bullets.push(new Bullet(tip.x, tip.y, a, this.ship.laserPower));

        // Titan: always dual cannons (side-by-side)
        if (this.shipType === 'titan') {
            const perp = a + Math.PI / 2;
            const ox = Math.cos(perp) * 8;
            const oy = Math.sin(perp) * 8;
            this.bullets.push(new Bullet(tip.x + ox, tip.y + oy, a, this.ship.laserPower));
            this.bullets.push(new Bullet(tip.x - ox, tip.y - oy, a, this.ship.laserPower));
        }

        // Upgrade level 4+ adds spread triple shot for any ship
        if (this.ship.laserPower >= 4 && this.shipType !== 'titan') {
            this.bullets.push(new Bullet(tip.x, tip.y, a - 0.14, this.ship.laserPower));
            this.bullets.push(new Bullet(tip.x, tip.y, a + 0.14, this.ship.laserPower));
        }

        this.ship.fireCooldown = this.ship.fireRateDelay;
        audio.playLaser();
    }

    // ===================== DESTROY =====================

    _destroyAsteroid(idx, a) {
        this.combo++;
        this.comboTimer = 90; // Reset combo window
        const multiplier = Math.max(1, this.combo);
        const earned = a.points * multiplier;
        this.score += earned;
        this.asteroidsDestroyed++;
        this.asteroids.splice(idx, 1);

        const colors = { large: '#a855f7', medium: '#38bdf8', small: '#00f5d4' };
        const count = a.size === 'large' ? 42 : (a.size === 'medium' ? 22 : 12);
        this.particles.spawnExplosion(a.x, a.y, colors[a.size] || '#38bdf8', count);
        audio.playExplosion(a.size);

        // Popup with combo
        const label = this.combo > 1 ? `x${this.combo} ${earned}` : `${earned}`;
        this._spawnPopup(a.x, a.y - 20, label, this.combo > 2 ? '#ffd700' : '#ffffff');

        // Crystal drop (~45% chance)
        if (Math.random() < 0.45) {
            this.crystals.push(new Crystal(a.x + (Math.random() - 0.5) * 20, a.y + (Math.random() - 0.5) * 20));
        }

        // Fragment into smaller pieces
        if (a.size === 'large') {
            for (let i = 0; i < 3; i++) this.asteroids.push(new Asteroid(a.x, a.y, 'medium', this.wave));
        } else if (a.size === 'medium') {
            for (let i = 0; i < 2; i++) this.asteroids.push(new Asteroid(a.x, a.y, 'small', this.wave));
        }

        this._updateHUD();
    }

    _incrementCombo(x, y, earned) {
        this.combo++;
        this.comboTimer = 90;
        const label = this.combo > 1 ? `x${this.combo} ${earned}` : `${earned}`;
        this._spawnPopup(x, y - 20, label, '#ffffff');
    }

    useBomb() {
        if (this.bombs <= 0 || this.state !== 'playing') return;
        this.bombs--;

        let bonusScore = 0;
        this.asteroids.forEach(a => {
            bonusScore += Math.floor(a.points / 2);
            this.particles.spawnExplosion(a.x, a.y, '#38bdf8', 20);
        });
        this.ufos.forEach(u => {
            bonusScore += 300;
            this.particles.spawnExplosion(u.x, u.y, '#ff2a85', 20);
        });
        this.score += bonusScore;
        this.asteroids = [];
        this.ufos = [];
        this.enemies = [];
        audio.playExplosion('boss');
        if (bonusScore > 0) this._spawnPopup(this.W / 2, this.H / 2 - 80, `💣 +${bonusScore}`, '#ffd700');
        this._updateHUD();
    }

    _spawnPopup(x, y, text, color = '#ffffff') {
        this.popups.push({ x, y, text, color, life: 80 });
    }

    // ===================== RENDER =====================

    _render() {
        const ctx = this.ctx;
        const { W, H } = this;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, H);

        // Draw stars + particles
        this.particles.updateAndDraw(ctx, W, H);

        if (this.state === 'playing' || this.state === 'paused') {
            this.asteroids.forEach(a => a.draw(ctx));
            this.ufos.forEach(u => u.draw(ctx));
            if (this.boss) this.boss.draw(ctx);
            this.crystals.forEach(c => c.draw(ctx));
            this.bullets.forEach(b => b.draw(ctx));
            this.enemies.forEach(b => b.draw(ctx));
            if (this.ship) this.ship.draw(ctx);

            // Thruster flame (drawn after ship for layering)
            if (this.ship && this.ship.isThrusting) {
                this._drawThrusterFlame(ctx);
            }

            // Floating score popups
            this._drawPopups(ctx);

            // Time Rush HUD
            if (this.mode === GAME_MODES.TIMERUSH) {
                this._drawTimerHUD(ctx, W, H);
            }

            // Combo indicator
            if (this.combo >= 2) {
                this._drawComboIndicator(ctx, W);
            }

            // Bomb count mini HUD
            this._drawBombHUD(ctx, W, H);
        }

        // Wave announce overlay
        if (this.waveAnnounce.active) {
            this._drawWaveAnnounce(ctx, W, H);
        }
    }

    _drawThrusterFlame(ctx) {
        if (!this.ship) return;
        const s = this.ship;
        const backAngle = s.angle + Math.PI;
        const dist = s.radius * 0.6;
        const bx = s.x + Math.cos(backAngle) * dist;
        const by = s.y + Math.sin(backAngle) * dist;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(backAngle);

        const flameLen = s.radius * (0.8 + Math.random() * 0.5);
        const shipColor = s.type === 'titan' ? '#ffd700' : (s.type === 'quantum' ? '#ff2a85' : '#ff6030');

        const grad = ctx.createLinearGradient(0, 0, flameLen, 0);
        grad.addColorStop(0, shipColor);
        grad.addColorStop(0.6, 'rgba(255,120,0,0.5)');
        grad.addColorStop(1, 'rgba(255,80,0,0)');

        ctx.shadowColor = shipColor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(flameLen / 2, 0, flameLen / 2, 4 + Math.random() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawPopups(ctx) {
        this.popups.forEach(p => {
            const alpha = Math.min(1, p.life / 30);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold 16px 'Outfit', sans-serif`;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
            ctx.restore();
        });
    }

    _drawTimerHUD(ctx, W, H) {
        const urgent = this.timeLeft < 30;
        ctx.save();
        ctx.font = `bold 22px 'Outfit', sans-serif`;
        ctx.fillStyle = urgent ? '#ef4444' : '#ffd700';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = urgent ? 16 : 6;
        ctx.textAlign = 'center';
        ctx.fillText(`⏱ ${this.timeLeft}s`, W / 2, H - 36);
        ctx.restore();
    }

    _drawComboIndicator(ctx, W) {
        ctx.save();
        ctx.font = `bold 20px 'Outfit', sans-serif`;
        ctx.fillStyle = this.combo >= 5 ? '#ffd700' : '#00f5d4';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
        ctx.textAlign = 'right';
        ctx.fillText(`🔥 COMBO x${this.combo}`, W - 28, 120);
        ctx.restore();
    }

    _drawBombHUD(ctx, W, H) {
        ctx.save();
        ctx.font = `14px 'Outfit', sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'left';
        ctx.fillText(`💣 x${this.bombs}  [E]`, 24, H - 36);
        ctx.restore();
    }

    _drawWaveAnnounce(ctx, W, H) {
        const t = this.waveAnnounce.timer;
        const totalDur = 120;
        let alpha;
        if (t < 20) alpha = t / 20;
        else if (t > totalDur - 30) alpha = (totalDur - t) / 30;
        else alpha = 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Semi-transparent backdrop band
        const bh = 120;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H / 2 - bh / 2, W, bh);

        // Wave text
        ctx.font = `bold 48px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20;

        const isBoss = this.waveAnnounce.text.includes('BOSS');
        ctx.fillStyle = isBoss ? '#ef4444' : '#38bdf8';
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillText(this.waveAnnounce.text, W / 2, H / 2);

        // Sub-label
        ctx.font = `16px 'Outfit', sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.shadowBlur = 0;
        ctx.fillText(isBoss ? 'PREPARE FOR BATTLE' : 'GET READY!', W / 2, H / 2 + 38);
        ctx.restore();
    }

    // ===================== LOOP =====================

    _loop() {
        this._update();
        this._render();
        requestAnimationFrame(() => this._loop());
    }

    // ===================== HUD =====================

    _updateHUD() {
        const fmt = n => n.toLocaleString();
        document.getElementById('scoreDisplay').textContent = fmt(this.score);
        document.getElementById('highScoreDisplay').textContent = fmt(this.highScore);
        document.getElementById('crystalDisplay').textContent = `💎 ${this.crystalCount}`;

        const lives = document.getElementById('livesContainer');
        if (lives) {
            lives.innerHTML = '';
            const icon = this.shipType === 'titan' ? '🛡️' : this.shipType === 'quantum' ? '🌀' : '⚡';
            for (let i = 0; i < this.lives; i++) {
                const sp = document.createElement('span');
                sp.className = 'life-icon';
                sp.textContent = icon;
                lives.appendChild(sp);
            }
        }
    }

    _setWaveBadge(text) {
        const el = document.getElementById('waveBadge');
        if (el) el.textContent = text;
    }

    // ===================== MODALS =====================

    _showModal(type) {
        const modal = document.getElementById('statusModal');
        document.getElementById('modalIcon').textContent    = type === 'gameover' ? '💥' : '⏸️';
        document.getElementById('modalTitle').textContent   = type === 'gameover' ? 'GAME OVER' : 'PAUSED';
        document.getElementById('modalSubtitle').textContent = type === 'gameover'
            ? 'Your starfighter was destroyed in the void.'
            : 'Mission on hold. Resume when ready, Commander.';
        document.getElementById('resumeBtn').style.display  = type === 'paused' ? 'block' : 'none';
        document.getElementById('summaryScore').textContent = this.score.toLocaleString();
        document.getElementById('summaryWave').textContent  = this.wave;
        document.getElementById('summaryAsteroids').textContent = this.asteroidsDestroyed;

        if (type === 'gameover' && this.score >= this.highScore) {
            document.getElementById('modalSubtitle').textContent = '🏆 NEW HIGH SCORE! Well done, Commander.';
        }

        modal.style.display = 'flex';
        modal.classList.add('active');
    }

    // ===================== INPUT BINDING =====================

    _bindInput() {
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;

            if (e.code === 'Space') e.preventDefault();

            if (this.state !== 'playing' || !this.ship) return;

            // Quantum Warp Dash (Shift)
            if (e.code === 'ShiftLeft' && this.shipType === 'quantum' && this.ship.specialCooldown <= 0) {
                this._quantumWarp();
            }

            // EMP Bomb (E or B)
            if (e.code === 'KeyE' || e.code === 'KeyB') {
                this.useBomb();
            }

            // Pause toggle
            if (e.code === 'Escape' || e.code === 'KeyP') {
                this.pause();
            }
        });

        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });

        // Mouse move: activates mouse-aim mode
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;

            // Only activate mouse aim if cursor moved significantly (not just a nudge)
            if (this.ship) {
                const dx = this.mouse.x - this.ship.x;
                const dy = this.mouse.y - this.ship.y;
                if (Math.hypot(dx, dy) > 40) this.aimWithMouse = true;
            }
        });

        // Left-click = fire
        this.canvas.addEventListener('mousedown', e => {
            if (e.button === 0) {
                this.mouse.down = true;
                this.aimWithMouse = true;
            }
            // Right-click = Quantum warp
            if (e.button === 2 && this.shipType === 'quantum' && this.ship?.specialCooldown <= 0) {
                this._quantumWarp();
            }
        });

        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });

        // WASD pressed = disable mouse aim (switch back to keyboard)
        const kbCodes = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
        window.addEventListener('keydown', e => {
            if (kbCodes.includes(e.code)) this.aimWithMouse = false;
        });

        this._bindJoystick();
    }

    _quantumWarp() {
        if (!this.ship) return;
        this.ship.specialCooldown = 240;
        this.ship.invulnerableTimer = 60;
        // Brief phase-out flash
        this.ship.warpPhase = true;
        this.particles.spawnExplosion(this.ship.x, this.ship.y, '#ff2a85', 30);
        setTimeout(() => {
            if (!this.ship) return;
            let nx, ny, attempts = 0;
            do {
                nx = Math.random() * (this.W * 0.8) + this.W * 0.1;
                ny = Math.random() * (this.H * 0.8) + this.H * 0.1;
                attempts++;
            } while (attempts < 10 && this.asteroids.some(a => this._dist(nx, ny, a.x, a.y) < a.radius + 80));
            this.ship.x = nx;
            this.ship.y = ny;
            this.ship.vx = 0;
            this.ship.vy = 0;
            this.ship.warpPhase = false;
            this.particles.spawnExplosion(nx, ny, '#ff2a85', 30);
            audio.playWarp();
        }, 180);
    }

    _bindUI() {
        // Mode tabs
        document.querySelectorAll('.mode-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.mode;
            });
        });

        // Ship cards
        document.querySelectorAll('.ship-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.ship-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.shipType = card.dataset.ship;
            });
        });

        // Launch
        document.getElementById('startGameBtn').addEventListener('click', () => {
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('startScreen').classList.remove('active');
            this.startGame();
        });

        // Pause button
        document.getElementById('pauseBtn').addEventListener('click', () => {
            if (this.state === 'playing') this.pause();
            else if (this.state === 'paused') this.resume();
        });

        // Resume / Restart / Hangar
        document.getElementById('resumeBtn').addEventListener('click', () => this.resume());
        document.getElementById('restartBtn').addEventListener('click', () => {
            const m = document.getElementById('statusModal');
            m.style.display = 'none';
            m.classList.remove('active');
            this.startGame();
        });
        document.getElementById('hangarBtn').addEventListener('click', () => {
            const m = document.getElementById('statusModal');
            m.style.display = 'none';
            m.classList.remove('active');
            const s = document.getElementById('startScreen');
            s.style.display = 'flex';
            s.classList.add('active');
            this.state = 'menu';
            this.ship = null;
        });

        // Shop
        document.getElementById('shopBtn').addEventListener('click', () => {
            if (this.state === 'playing') this.pause();
            document.getElementById('shopDrawer').classList.add('active');
            this.shop.updateUI(this.crystalCount);
        });
        document.getElementById('closeShopBtn').addEventListener('click', () => {
            document.getElementById('shopDrawer').classList.remove('active');
            if (this.state === 'paused') this.resume();
        });

        // Shop buy buttons
        ['laser', 'firerate', 'shield', 'bomb'].forEach(type => {
            const capType = type.charAt(0).toUpperCase() + type.slice(1);
            document.getElementById(`buy${capType}Btn`)?.addEventListener('click', () => {
                const result = this.shop.purchase(type, this.crystalCount);
                if (result.success) {
                    this.crystalCount = result.newCrystals;
                    if (this.ship) this.shop.applyToShip(this.ship);
                }
                this.shop.updateUI(this.crystalCount);
                this._updateHUD();
            });
        });

        // Sound
        document.getElementById('soundBtn').addEventListener('click', () => {
            const on = audio.toggleSound();
            document.getElementById('soundIcon').textContent = on ? '🔊' : '🔇';
        });

        // Touch action buttons
        document.getElementById('touchFireBtn')?.addEventListener('touchstart', e => {
            e.preventDefault();
            this.touchFireHeld = true;
        });
        document.getElementById('touchFireBtn')?.addEventListener('touchend', e => {
            e.preventDefault();
            this.touchFireHeld = false;
        });

        document.getElementById('touchSpecialBtn')?.addEventListener('touchstart', e => {
            e.preventDefault();
            if (this.shipType === 'quantum' && this.ship?.specialCooldown <= 0) this._quantumWarp();
        });

        document.getElementById('touchBombBtn')?.addEventListener('touchstart', e => {
            e.preventDefault();
            this.useBomb();
        });
    }

    _bindJoystick() {
        const zone = document.getElementById('joystickZone');
        const stick = document.getElementById('joystickStick');
        const base = document.getElementById('joystickBase');
        if (!zone || !stick || !base) return;

        let baseX = 0, baseY = 0;
        const maxR = 42;

        zone.addEventListener('touchstart', e => {
            e.preventDefault();
            const touch = e.touches[0];
            const r = base.getBoundingClientRect();
            baseX = r.left + r.width / 2;
            baseY = r.top + r.height / 2;
            this.touchJoystick.active = true;
        }, { passive: false });

        zone.addEventListener('touchmove', e => {
            e.preventDefault();
            const touch = e.touches[0];
            let dx = touch.clientX - baseX;
            let dy = touch.clientY - baseY;
            const dist = Math.hypot(dx, dy);
            if (dist > maxR) {
                dx = (dx / dist) * maxR;
                dy = (dy / dist) * maxR;
            }
            stick.style.transform = `translate(${dx}px, ${dy}px)`;
            this.touchJoystick.dx = dx;
            this.touchJoystick.dy = dy;
        }, { passive: false });

        const endJoy = () => {
            stick.style.transform = 'translate(0,0)';
            this.touchJoystick.dx = 0;
            this.touchJoystick.dy = 0;
            this.touchJoystick.active = false;
        };
        zone.addEventListener('touchend', endJoy);
        zone.addEventListener('touchcancel', endJoy);
    }

    // ===================== HELPERS =====================

    _circlesCollide(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy) < (a.radius + b.radius) * 0.82;
    }

    _dist(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
