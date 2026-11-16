// HE grenades: a thrown sphere with gravity and one bounce, exploding after its
// fuse or on a hard impact. The blast hurts anything in radius with falloff, shakes
// the thrower's view a little at close range, and leaves a fading flash sphere and
// a point light. Pool of two live grenades; no allocation while one flies.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FUSE = 1.6;
const RADIUS = 5.5;
const MAX_DAMAGE = 95;

export function createGrenades(scene, colliders) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 });
  const flashGeo = new THREE.SphereGeometry(1, 12, 10);
  const flashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.visible = false;
  scene.add(flash);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
  scene.add(light);

  const pool = [];
  for (let i = 0; i < 2; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, bounced: false });
  }
  let flashLeft = 0;
  const probe = new THREE.Box3();

  function hitsWorld(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function explode(g, onBlast) {
    g.active = false;
    g.mesh.visible = false;
    flash.position.copy(g.pos);
    flash.visible = true;
    flashLeft = 0.35;
    light.position.copy(g.pos);
    light.position.y += 0.5;
    light.intensity = 60;
    onBlast(g.pos, RADIUS, MAX_DAMAGE);
  }

  return {
    pool,
    throwFrom(origin, direction, speed = 13) {
      const g = pool.find((item) => !item.active);
      if (!g) return false;
      g.active = true;
      g.pos.copy(origin);
      g.vel.copy(direction).multiplyScalar(speed);
      g.vel.y += 3.2;
      g.fuse = FUSE;
      g.bounced = false;
      g.mesh.visible = true;
      g.mesh.position.copy(g.pos);
      return true;
    },
    step(dt, onBlast) {
      if (flashLeft > 0) {
        flashLeft -= dt;
        const k = Math.max(0, flashLeft / 0.35);
        flash.scale.setScalar(1 + (1 - k) * RADIUS);
        flashMat.opacity = k * 0.55;
        light.intensity = k * 60;
        if (flashLeft <= 0) {
          flash.visible = false;
          light.intensity = 0;
        }
      }
      for (const g of pool) {
        if (!g.active) continue;
        g.fuse -= dt;
        g.vel.y -= GRAVITY * dt;
        const nx = g.pos.x + g.vel.x * dt;
        const ny = g.pos.y + g.vel.y * dt;
        const nz = g.pos.z + g.vel.z * dt;
        if (hitsWorld(nx, g.pos.y, g.pos.z)) {
          g.vel.x *= -0.4;
        } else g.pos.x = nx;
        if (hitsWorld(g.pos.x, ny, g.pos.z)) {
          if (g.vel.y < -6 && !g.bounced) {
            g.vel.y *= -0.45;
            g.bounced = true;
          } else if (g.vel.y < 0) {
            g.vel.y = 0;
            g.pos.y = Math.max(g.pos.y, 0.09);
          } else {
            g.vel.y *= -0.4;
          }
        } else g.pos.y = ny;
        if (hitsWorld(g.pos.x, g.pos.y, nz)) {
          g.vel.z *= -0.4;
        } else g.pos.z = nz;
        if (g.pos.y < 0.09) {
          g.pos.y = 0.09;
          if (Math.abs(g.vel.y) > 3) g.vel.y *= -0.4;
          else g.vel.y = 0;
        }
        g.mesh.position.copy(g.pos);
        if (g.fuse <= 0) explode(g, onBlast);
      }
    },
    reset() {
      for (const g of pool) {
        g.active = false;
        g.mesh.visible = false;
      }
      flash.visible = false;
      flashLeft = 0;
      light.intensity = 0;
    },
  };
}
