// ============================================
// ASTEROIDS GAME ENTITIES - REFINED
// ============================================

export class Ship {
    constructor(x, y, type = 'viper') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 18;
        this.angle = -Math.PI / 2; // Pointing up
        this.targetAngle = -Math.PI / 2;
        this.vx = 0;
        this.vy = 0;
        this.isThrusting = false;

        // Base stats (overridden per ship type)
        this.rotationSpeed = 0.07;
        this.thrustPower = 0.32;
        this.maxSpeed = 9;
        this.friction = 0.982;

        // Upgradable stats
        this.laserPower = 1;
        this.fireRateDelay = 14;
        this.fireCooldown = 0;
        this.shieldHp = 0;
        this.maxShieldHp = 0;

        this.invulnerableTimer = 0;
        this.specialCooldown = 0;
        this.warpPhase = false; // brief phase-out during warp

        this.configureShipType(type);
    }

    configureShipType(type) {
        switch (type) {
            case 'titan':
                this.thrustPower = 0.24;
                this.maxSpeed = 7;
                this.radius = 22;
                this.rotationSpeed = 0.055;
                this.maxShieldHp = 3;
                this.shieldHp = 3;
                this.fireRateDelay = 11; // Dual cannon, slightly faster
                break;
            case 'quantum':
                this.thrustPower = 0.38;
                this.maxSpeed = 11;
                this.radius = 15;
                this.rotationSpeed = 0.09;
                this.fireRateDelay = 9;
                break;
            default: // viper
                this.thrustPower = 0.35;
                this.maxSpeed = 10;
                this.radius = 18;
                this.rotationSpeed = 0.075;
                this.fireRateDelay = 13;
                break;
        }
    }

    rotate(dir) {
        this.angle += dir * this.rotationSpeed;
    }

    // Smoothly steer toward a target angle (for mouse aim)
    steerToward(targetAngle, lerpFactor = 0.18) {
        let diff = targetAngle - this.angle;
        // Normalize to [-PI, PI]
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.angle += diff * lerpFactor;
    }

    thrust() {
        this.vx += Math.cos(this.angle) * this.thrustPower;
        this.vy += Math.sin(this.angle) * this.thrustPower;

        // Cap velocity
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > this.maxSpeed) {
            this.vx = (this.vx / spd) * this.maxSpeed;
            this.vy = (this.vy / spd) * this.maxSpeed;
        }
        this.isThrusting = true;
    }

    update(width, height) {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.isThrusting = false; // Reset each frame; game loop sets it when thrusting

        // Screen wrapping (pad by radius so ship fully exits before wrapping)
        if (this.x < -this.radius) this.x = width + this.radius;
        if (this.x > width + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = height + this.radius;
        if (this.y > height + this.radius) this.y = -this.radius;

        if (this.fireCooldown > 0) this.fireCooldown--;
        if (this.invulnerableTimer > 0) this.invulnerableTimer--;
        if (this.specialCooldown > 0) this.specialCooldown--;
    }

    get color() {
        if (this.type === 'titan') return '#ffd700';
        if (this.type === 'quantum') return '#ff2a85';
        return '#38bdf8';
    }

    draw(ctx) {
        if (this.warpPhase) return; // Invisible during quantum warp

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Blink during spawn invulnerability
        if (this.invulnerableTimer > 0 && Math.floor(this.invulnerableTimer / 8) % 2 === 0) {
            ctx.restore();
            return;
        }

        // Shield bubble
        if (this.shieldHp > 0) {
            ctx.save();
            const shieldColor = '#00f5d4';
            ctx.strokeStyle = shieldColor;
            ctx.shadowColor = shieldColor;
            ctx.shadowBlur = 18;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Ship hull glow
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';

        // Draw different hull shapes per ship type
        ctx.beginPath();
        if (this.type === 'titan') {
            // Wider, blockier cruiser
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(-this.radius * 0.6, -this.radius * 0.85);
            ctx.lineTo(-this.radius * 0.3, -this.radius * 0.35);
            ctx.lineTo(-this.radius * 0.3, this.radius * 0.35);
            ctx.lineTo(-this.radius * 0.6, this.radius * 0.85);
        } else if (this.type === 'quantum') {
            // Sleek diamond
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(0, -this.radius * 0.6);
            ctx.lineTo(-this.radius * 0.8, 0);
            ctx.lineTo(0, this.radius * 0.6);
        } else {
            // Classic viper
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(-this.radius * 0.8, -this.radius * 0.65);
            ctx.lineTo(-this.radius * 0.4, 0);
            ctx.lineTo(-this.radius * 0.8, this.radius * 0.65);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }
}

export class Bullet {
    constructor(x, y, angle, power = 1, isEnemy = false) {
        this.x = x;
        this.y = y;
        const speed = isEnemy ? 5.5 : 13;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = isEnemy ? 4 : 3.5;
        this.power = power;
        this.life = isEnemy ? 90 : 70; // frames
        this.isEnemy = isEnemy;
        this.maxLife = this.life;
    }

    update(width, height) {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        // Bullets die at edges instead of wrapping (feels cleaner)
        if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
            this.life = 0;
        }
    }

    draw(ctx) {
        const alpha = Math.min(1, this.life / (this.maxLife * 0.4));
        ctx.save();
        ctx.globalAlpha = alpha;

        if (this.isEnemy) {
            // Enemy: red plasma bolt
            ctx.fillStyle = '#ff4444';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 12;
        } else {
            // Player: elongated bright laser
            ctx.fillStyle = '#38bdf8';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 12;
        }

        // Draw as an elongated oval in the direction of travel
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, this.radius, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

export class Asteroid {
    constructor(x, y, size = 'large', waveFactor = 1) {
        this.x = x;
        this.y = y;
        this.size = size;

        if (size === 'large') {
            this.radius = 42;
            this.hp = 3;
            this.points = 100;
        } else if (size === 'medium') {
            this.radius = 24;
            this.hp = 2;
            this.points = 200;
        } else { // small
            this.radius = 12;
            this.hp = 1;
            this.points = 400;
        }

        // Progressively faster per wave
        const baseSpeed = (Math.random() * 1.2 + 0.7) * (size === 'small' ? 1.8 : 1);
        const waveBonus = Math.min((waveFactor - 1) * 0.12, 1.5);
        const speed = baseSpeed + waveBonus;

        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.rot = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.035;

        // Jagged polygon vertex offsets
        this.vertexCount = Math.floor(Math.random() * 4) + 8;
        this.offsets = Array.from({ length: this.vertexCount }, () => Math.random() * 0.4 + 0.8);
    }

    update(width, height) {
        this.x += this.vx;
        this.y += this.vy;
        this.rot += this.rotSpeed;

        const pad = this.radius + 4;
        if (this.x < -pad) this.x = width + pad;
        if (this.x > width + pad) this.x = -pad;
        if (this.y < -pad) this.y = height + pad;
        if (this.y > height + pad) this.y = -pad;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);

        const color = this.size === 'large' ? '#a855f7' : (this.size === 'medium' ? '#38bdf8' : '#00f5d4');
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;

        ctx.beginPath();
        for (let i = 0; i < this.vertexCount; i++) {
            const a = (i / this.vertexCount) * Math.PI * 2;
            const r = this.radius * this.offsets[i];
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }
}

export class UFO {
    constructor(width, height) {
        this.fromLeft = Math.random() > 0.5;
        this.x = this.fromLeft ? -30 : width + 30;
        this.y = Math.random() * (height * 0.7) + height * 0.15;
        const speed = Math.random() * 1.5 + 1.5;
        this.vx = (this.fromLeft ? 1 : -1) * speed;
        this.vy = 0;
        this.radius = 22;
        this.hp = 5;
        this.points = 600;
        this.shootTimer = 40; // First shot comes faster
        this.wobbleTimer = 0;
    }

    update(width, height) {
        this.wobbleTimer++;
        this.vy = Math.sin(this.wobbleTimer * 0.04) * 1.5;
        this.x += this.vx;
        this.y += this.vy;
        this.shootTimer++;

        // Clamp vertical
        if (this.y < 60) this.y = 60;
        if (this.y > height - 60) this.y = height - 60;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.strokeStyle = '#ff2a85';
        ctx.shadowColor = '#ff2a85';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2.5;

        // Bottom rim
        ctx.beginPath();
        ctx.ellipse(0, 2, 22, 9, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Top dome
        ctx.beginPath();
        ctx.ellipse(0, -2, 13, 10, 0, Math.PI, 0);
        ctx.stroke();

        // Cockpit glow dot
        ctx.fillStyle = '#ff8ac8';
        ctx.beginPath();
        ctx.arc(0, -4, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

export class BossMothership {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetY = y;
        this.radius = 68;
        this.hp = 80;
        this.maxHp = 80;
        this.angle = 0;
        this.shootTimer = 0;
        this.points = 5000;
        this.phase = 1; // Boss has 2 phases
        this.wobbleTimer = 0;
        this.orbAngle = 0;
    }

    update(W, H) {
        this.angle += 0.012;
        this.orbAngle += 0.04;
        this.wobbleTimer++;
        this.shootTimer++;

        // Slow horizontal drift in phase 2
        if (this.phase === 2) {
            this.x += Math.sin(this.wobbleTimer * 0.015) * 1.2;
            this.x = Math.max(this.radius + 20, Math.min(W - this.radius - 20, this.x));
        }

        // Enter phase 2 at 40% HP
        if (this.phase === 1 && this.hp <= this.maxHp * 0.4) {
            this.phase = 2;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Outer ring (rotates)
        ctx.save();
        ctx.rotate(this.angle);
        ctx.strokeStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 24;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = this.radius;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Inner ring (counter-rotates)
        ctx.save();
        ctx.rotate(-this.angle * 1.5);
        ctx.strokeStyle = this.phase === 2 ? '#ff8800' : '#ff4488';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = this.radius * 0.55;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Core glow
        const coreColor = this.phase === 2 ? '#ff6600' : '#ff2a85';
        ctx.shadowColor = coreColor;
        ctx.shadowBlur = 30;
        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();

        // Core inner pulse
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, 10 + Math.sin(Date.now() * 0.006) * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

export class Crystal {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 7;
        this.life = 480; // 8 seconds at 60fps
        this.value = 15;
        this.pulse = Math.random() * Math.PI * 2; // phase offset
    }

    update(width, height, ship) {
        this.life--;
        this.pulse += 0.08;

        if (ship) {
            const magnetLvl = ship.magnetLevel || 0;
            const magnetRadius = 140 + magnetLvl * 50;
            const dx = ship.x - this.x;
            const dy = ship.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (magnetLvl > 0 && dist < magnetRadius && dist > 1) {
                const pullSpeed = 4.5 + magnetLvl * 1.6;
                this.x += (dx / dist) * pullSpeed;
                this.y += (dy / dist) * pullSpeed;
            }
        }
    }

    draw(ctx) {
        // Fade out in last 120 frames
        const alpha = this.life < 120 ? this.life / 120 : 1;
        const r = this.radius + Math.sin(this.pulse) * 1.5;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#00f5d4';
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 14;

        // Draw diamond shape
        ctx.translate(this.x, this.y);
        ctx.rotate(this.pulse * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.3);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r * 1.3);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}
