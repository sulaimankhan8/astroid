// ============================================
// ASTEROIDS PARTICLE ENGINE & STARFIELD
// ============================================

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.stars = [];
        this.initStarfield(150);
    }

    initStarfield(count) {
        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 2 + 0.5,
                alpha: Math.random() * 0.8 + 0.2,
                speed: Math.random() * 0.5 + 0.1
            });
        }
    }

    resizeStarfield(width, height) {
        this.stars.forEach(star => {
            if (star.x > width) star.x = Math.random() * width;
            if (star.y > height) star.y = Math.random() * height;
        });
    }

    spawnExplosion(x, y, color = '#38bdf8', count = 25) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 1;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 4 + 1.5,
                color,
                alpha: 1,
                life: 1,
                decay: Math.random() * 0.03 + 0.015
            });
        }
    }

    spawnThrusterTrail(x, y, angle, color = '#ff2a85') {
        const spread = (Math.random() - 0.5) * 0.4;
        const speed = Math.random() * 3 + 2;
        const reverseAngle = angle + Math.PI + spread;

        this.particles.push({
            x,
            y,
            vx: Math.cos(reverseAngle) * speed,
            vy: Math.sin(reverseAngle) * speed,
            size: Math.random() * 3 + 2,
            color,
            alpha: 1,
            life: 1,
            decay: 0.08
        });
    }

    updateAndDraw(ctx, width, height) {
        // Render Starfield Background
        ctx.fillStyle = '#ffffff';
        this.stars.forEach(star => {
            star.y += star.speed;
            if (star.y > height) {
                star.y = 0;
                star.x = Math.random() * width;
            }
            ctx.globalAlpha = star.alpha;
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });

        // Update & Render Particles
        ctx.globalAlpha = 1;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    clear() {
        this.particles = [];
    }
}
