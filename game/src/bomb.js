// The bomb: carried by one attacker, planted on a site by holding E, ticking down
// 40 seconds, defused by a defender holding E beside it. The carrier is whoever
// holds it; if they die it drops where they fell and any attacker can pick it up by
// walking over it. The mesh is a small amber box with a blinking light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 40;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.set(0, 0.13, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    carrier: 'player', // 'player' | bot object | null (dropped)
    planted: false,
    site: null,
    timer: BOMB_TIMER,
    position: new THREE.Vector3(0, 0, 0),
    blink: 0,
  };

  function siteOf(position) {
    for (const key of Object.keys(SITES)) {
      const site = SITES[key];
      const d = Math.hypot(position.x - site.center.x, position.z - site.center.z);
      if (d < site.radius) return key;
    }
    return null;
  }

  return {
    state,
    group,
    siteOf,
    reset(carrier) {
      state.carrier = carrier;
      state.planted = false;
      state.site = null;
      state.timer = BOMB_TIMER;
      state.blink = 0;
      group.visible = false;
    },
    dropAt(position) {
      state.carrier = null;
      state.position.set(position.x, 0, position.z);
      group.position.copy(state.position);
      group.position.y = 0.12;
      group.visible = true;
    },
    plant(site, position) {
      state.planted = true;
      state.site = site;
      state.carrier = null;
      state.timer = BOMB_TIMER;
      state.position.set(position.x, 0, position.z);
      group.position.copy(state.position);
      group.position.y = 0.12;
      group.visible = true;
    },
    pickUp(by) {
      state.carrier = by;
      group.visible = false;
    },
    step(dt) {
      if (!state.planted) return false;
      state.timer -= dt;
      state.blink += dt;
      light.visible = Math.floor(state.blink * 4) % 2 === 0;
      if (state.timer <= 0) {
        state.timer = 0;
        return true;
      }
      return false;
    },
  };
}
