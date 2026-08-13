// ============================================
// ASTEROIDS UPGRADE SHOP & ECONOMY SYSTEM
// ============================================

export const UPGRADES = {
    laser:    { maxLevel: 5, costs: [50, 80, 120, 160, 200], label: 'Plasma Laser Power' },
    firerate: { maxLevel: 5, costs: [40, 70, 100, 140, 180], label: 'Rapid Cannon Pulse' },
    shield:   { maxLevel: 5, costs: [60, 90, 130, 180, 230], label: 'Force Shield Generator' },
    bomb:     { maxLevel: 3, costs: [75, 120, 180],           label: 'EMP Smart Bomb Charge' },
    magnet:   { maxLevel: 5, costs: [40, 65, 95, 130, 175],  label: 'Crystal Magnet Field' },
    life:     { maxLevel: 99, costs: [100],                   label: 'Hull Repair / Extra Life' }
};

export const SHIP_UNLOCK_COSTS = {
    viper: 0,
    titan: 150,
    quantum: 300
};

export class Shop {
    constructor() {
        this.levels = { laser: 1, firerate: 1, shield: 1, bomb: 1, magnet: 0, life: 1 };
        this.unlockedShips = ['viper'];
        this.loadPersistentData();
    }

    loadPersistentData() {
        try {
            const savedLevels = localStorage.getItem('asteroidsShopLevels');
            if (savedLevels) {
                this.levels = { ...this.levels, ...JSON.parse(savedLevels) };
            }
            const savedShips = localStorage.getItem('asteroidsUnlockedShips');
            if (savedShips) {
                this.unlockedShips = JSON.parse(savedShips);
            }
        } catch (e) {}
    }

    savePersistentData() {
        try {
            localStorage.setItem('asteroidsShopLevels', JSON.stringify(this.levels));
            localStorage.setItem('asteroidsUnlockedShips', JSON.stringify(this.unlockedShips));
        } catch (e) {}
    }

    isShipUnlocked(shipType) {
        return this.unlockedShips.includes(shipType);
    }

    unlockShip(shipType, currentCrystals) {
        const cost = SHIP_UNLOCK_COSTS[shipType] || 0;
        if (!this.isShipUnlocked(shipType) && currentCrystals >= cost) {
            this.unlockedShips.push(shipType);
            this.savePersistentData();
            return { success: true, newCrystals: currentCrystals - cost };
        }
        return { success: false, newCrystals: currentCrystals };
    }

    getCost(type) {
        const upg = UPGRADES[type];
        const lvl = this.levels[type] || 1;
        if (type === 'life') return 100;
        if (lvl >= upg.maxLevel) return Infinity;
        return upg.costs[lvl - 1];
    }

    purchase(type, crystals, gameInstance = null) {
        const cost = this.getCost(type);
        if (crystals < cost) return { success: false, newCrystals: crystals };

        if (type === 'life') {
            if (gameInstance) {
                gameInstance.lives++;
                gameInstance._updateHUD();
            }
            return { success: true, newCrystals: crystals - cost };
        }

        const upg = UPGRADES[type];
        const currentLvl = this.levels[type] || 0;
        if (currentLvl < upg.maxLevel) {
            this.levels[type] = currentLvl + 1;
            this.savePersistentData();
            return { success: true, newCrystals: crystals - cost };
        }
        return { success: false, newCrystals: crystals };
    }

    applyToShip(ship) {
        const lvl = this.levels;
        // Laser damage & spread
        ship.laserPower = lvl.laser || 1;
        // Fire rate delay
        ship.fireRateDelay = Math.max(5, 14 - ((lvl.firerate || 1) - 1) * 2);
        // Shield capacity
        const baseShield = ship.type === 'titan' ? 3 : 0;
        ship.maxShieldHp = baseShield + ((lvl.shield || 1) - 1);
        if (ship.shieldHp < ship.maxShieldHp) ship.shieldHp = ship.maxShieldHp;
        // Magnet strength
        ship.magnetLevel = lvl.magnet || 0;
    }

    updateUI(crystals) {
        const types = ['laser', 'firerate', 'shield', 'bomb', 'magnet', 'life'];
        types.forEach(type => {
            const upg = UPGRADES[type];
            const lvl = this.levels[type] || (type === 'magnet' ? 0 : 1);
            const cost = this.getCost(type);
            const maxed = type !== 'life' && lvl >= upg.maxLevel;

            const levelEl = document.getElementById(`level${type.charAt(0).toUpperCase() + type.slice(1)}`);
            const costEl = document.getElementById(`cost${type.charAt(0).toUpperCase() + type.slice(1)}`);
            const btn = document.getElementById(`buy${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);

            if (levelEl) {
                levelEl.textContent = type === 'life' ? 'Instant +1 Life' : `Lvl ${lvl}/${upg.maxLevel}`;
            }
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

