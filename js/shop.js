// ============================================
// ASTEROIDS UPGRADE SHOP
// ============================================

export const UPGRADES = {
    laser:    { maxLevel: 5, costs: [50, 80, 120, 160, 200], label: 'Plasma Laser Power' },
    firerate: { maxLevel: 5, costs: [40, 70, 100, 140, 180], label: 'Rapid Cannon Pulse' },
    shield:   { maxLevel: 5, costs: [60, 90, 130, 180, 230], label: 'Force Shield Generator' },
    bomb:     { maxLevel: 3, costs: [75, 120, 180],           label: 'EMP Smart Bomb Charge' },
};

export class Shop {
    constructor() {
        this.levels = { laser: 1, firerate: 1, shield: 1, bomb: 1 };
    }

    getCost(type) {
        const upg = UPGRADES[type];
        const lvl = this.levels[type];
        if (lvl >= upg.maxLevel) return Infinity;
        return upg.costs[lvl - 1];
    }

    purchase(type, crystals) {
        const cost = this.getCost(type);
        if (crystals >= cost && this.levels[type] < UPGRADES[type].maxLevel) {
            this.levels[type]++;
            return { success: true, newCrystals: crystals - cost };
        }
        return { success: false, newCrystals: crystals };
    }

    applyToShip(ship) {
        const lvl = this.levels;
        // Laser damage (base 1 + upgrade)
        ship.laserPower = lvl.laser;
        // Fire rate (lower delay = faster)
        ship.fireRateDelay = Math.max(5, 14 - (lvl.firerate - 1) * 2);
        // Shield HP
        const baseShield = ship.type === 'titan' ? 2 : 0;
        ship.maxShieldHp = baseShield + (lvl.shield - 1);
        if (ship.shieldHp < ship.maxShieldHp) ship.shieldHp = ship.maxShieldHp;
    }

    updateUI(crystals) {
        const types = ['laser', 'firerate', 'shield', 'bomb'];
        types.forEach(type => {
            const upg = UPGRADES[type];
            const lvl = this.levels[type];
            const cost = this.getCost(type);
            const maxed = lvl >= upg.maxLevel;

            const levelEl = document.getElementById(`level${type.charAt(0).toUpperCase() + type.slice(1)}`);
            const costEl = document.getElementById(`cost${type.charAt(0).toUpperCase() + type.slice(1)}`);
            const btn = document.getElementById(`buy${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);

            if (levelEl) levelEl.textContent = `Lvl ${lvl}/${upg.maxLevel}`;
            if (costEl) costEl.textContent = maxed ? 'MAX' : cost;
            if (btn) {
                btn.disabled = maxed || crystals < cost;
                btn.style.opacity = (maxed || crystals < cost) ? '0.4' : '1';
            }
        });

        const shopCrystal = document.getElementById('shopCrystalCount');
        if (shopCrystal) shopCrystal.textContent = `💎 ${crystals}`;
    }
}
