// The arsenal: four hitscan weapons with different roles, each with its own view
// model, magazine, damage, fire rate and spread. It owns the numbers and the model;
// main.js owns the ray and the damage. Spread grows with movement and with sustained
// fire, so stopping to aim pays; crouching and walking steady it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', short: 'P9', price: 0, mag: 12, reserve: 48,
    damage: 26, headMult: 2, gap: 0.16, reload: 1.1, auto: false,
    spreadStill: 0.003, spreadMove: 0.02, kick: 0.006, range: 45,
  },
  rifle: {
    name: 'VK-7 Rifle', short: 'VK-7', price: 1500, mag: 30, reserve: 90,
    damage: 34, headMult: 3, gap: 0.096, reload: 1.9, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, range: 80,
  },
  smg: {
    name: 'Hornet SMG', short: 'Hornet', price: 900, mag: 32, reserve: 96,
    damage: 22, headMult: 2, gap: 0.07, reload: 1.6, auto: true,
    spreadStill: 0.005, spreadMove: 0.03, kick: 0.006, range: 40,
  },
  sniper: {
    name: 'Longbow DMR', short: 'Longbow', price: 2200, mag: 5, reserve: 15,
    damage: 88, headMult: 2, gap: 0.9, reload: 2.6, auto: false,
    spreadStill: 0.0006, spreadMove: 0.05, kick: 0.03, range: 100,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOUR_PRICE = 400;

const MUZZLE_TIME = 0.06;

function buildModel(def, key) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.1 });
  const model = new THREE.Group();
  if (key === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.07), grip);
    handle.position.set(0, -0.07, 0.07);
    model.add(slide, handle);
  } else if (key === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), grip);
    barrel.position.set(0, 0.02, -0.28);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.11, -0.02);
    model.add(receiver, barrel, mag);
  } else if (key === 'sniper') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.5), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.55), grip);
    barrel.position.set(0, 0.02, -0.5);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), accent);
    scope.position.set(0, 0.08, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.2), grip);
    stock.position.set(0, -0.01, 0.32);
    model.add(receiver, barrel, scope, stock);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
    sight.position.set(0, 0.07, -0.05);
    model.add(receiver, barrel, stock, sight);
  }
  model.position.set(0.24, -0.2, -0.42);
  model.visible = false;
  return model;
}

export function createArsenal(camera) {
  const models = {};
  for (const key of Object.keys(WEAPONS)) {
    models[key] = buildModel(WEAPONS[key], key);
    camera.add(models[key]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // owned maps a weapon key to its live ammo state; the pistol is always owned.
  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  let current = 'pistol';
  const state = { cooldown: 0, reloadLeft: 0, reloadTotal: 1, flash: 0, kick: 0, bloom: 0 };

  function showCurrent() {
    for (const key of Object.keys(models)) models[key].visible = key === current;
  }
  showCurrent();

  function def() {
    return WEAPONS[current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    const model = models[current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.reloadTotal - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const d = def();
        const ammo = owned[current];
        const need = d.mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    get current() {
      return current;
    },
    def,
    ammo() {
      return owned[current];
    },
    step,
    ready() {
      return owned[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.gap;
      state.flash = MUZZLE_TIME;
      state.kick = d.kick;
      state.bloom = Math.min(0.02, state.bloom + d.kick * 0.35);
    },
    takeRound() {
      if (owned[current].mag <= 0) return false;
      owned[current].mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const ammo = owned[current];
      if (state.reloadLeft > 0 || ammo.mag === d.mag || ammo.reserve === 0) return;
      state.reloadLeft = d.reload;
      state.reloadTotal = d.reload;
    },
    spread(speed, crouching, walking) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove + state.bloom;
      if (crouching) spread *= 0.7;
      if (walking) spread *= 0.6;
      return spread;
    },
    buy(key) {
      if (owned[key]) return false;
      owned[key] = { mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
      return true;
    },
    select(key) {
      if (!owned[key] || key === current) return false;
      current = key;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      showCurrent();
      return true;
    },
    refillAll() {
      for (const key of Object.keys(owned)) {
        owned[key].mag = WEAPONS[key].mag;
        owned[key].reserve = WEAPONS[key].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    resetToPistol() {
      for (const key of Object.keys(owned)) delete owned[key];
      owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      current = 'pistol';
      showCurrent();
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
