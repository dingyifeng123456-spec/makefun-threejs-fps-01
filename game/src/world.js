// Amber Yard: an original 36 x 28 m industrial yard, built from boxes. Every box is a
// collider for walkers and a surface a bullet stops on. Plain geometry only, no models
// and no textures. Attackers spawn south, defenders north; bomb sites A (west) and B
// (east) sit behind the north wall, joined by three lanes: A lane, mid, B lane.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph the bots walk: id -> [x, z], plus the named routes between them.
export const WAYPOINTS = {
  atkSpawn: [0, 11.5],
  atkWest: [-9, 10],
  atkEast: [9, 10],
  midSouth: [0, 6],
  midCourt: [0, 0],
  midNorth: [0, -5.5],
  aApproach: [-10, 2],
  aDoor: [-13.5, -4],
  aSite: [-13.5, -9.5],
  aHold: [-11, -7],
  bApproach: [10, 2],
  bDoor: [13.5, -4],
  bSite: [13.5, -9.5],
  bHold: [11, -7],
  defSpawn: [0, -11.5],
  defWest: [-7, -11],
  defEast: [7, -11],
  defMid: [0, -8.5],
  crateWest: [-6, 4],
  crateEast: [6, 4],
  connector: [-13.5, 6],
  connectorEast: [13.5, 6],
};

export const ROUTES = {
  toA: ['atkWest', 'aApproach', 'aDoor', 'aSite'],
  toB: ['atkEast', 'bApproach', 'bDoor', 'bSite'],
  toMid: ['midSouth', 'midCourt', 'midNorth'],
  defA: ['defWest', 'aHold', 'aSite'],
  defB: ['defEast', 'bHold', 'bSite'],
  defMid: ['defMid', 'midNorth'],
};

export const SITES = {
  A: { center: new THREE.Vector3(-13.5, 0, -9.5), radius: 3.2 },
  B: { center: new THREE.Vector3(13.5, 0, -9.5), radius: 3.2 },
};

export const SPAWNS = {
  attackers: [[-2, 11.5], [0, 11.5], [2, 11.5]],
  defenders: [[-6, -11.5], [-2, -11.5], [2, -11.5], [6, -11.5]],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the outer walls. The yard is open to the sky so one directional light
  // reaches every corner; the north wall carries the two site alcoves.
  box(36.4, 0.4, 28.4, 0, -0.2, 0, 'surface');
  box(0.4, 4.6, 28.4, -18.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 28.4, 18.2, 2.3, 0, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, -14.2, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, 14.2, 'surface');

  // Site alcoves: low amber floor plates marking where the bomb goes, plus a back wall
  // step so each site reads as a room of its own from the lanes.
  box(6.4, 0.12, 5.2, -13.5, 0.06, -9.5, 'accent', false);
  box(6.4, 0.12, 5.2, 13.5, 0.06, -9.5, 'accent', false);
  box(0.5, 2.6, 5.2, -10.2, 1.3, -9.5, 'surface');
  box(0.5, 2.6, 5.2, 10.2, 1.3, -9.5, 'surface');

  // Mid: a tall container stack splitting the court, with a gap either side.
  box(4.2, 2.6, 2.2, -3.4, 1.3, -1, 'hairline');
  box(4.2, 2.6, 2.2, 3.4, 1.3, -1, 'hairline');
  box(2.2, 1.3, 2.2, 0, 0.65, -1, 'hairline');
  box(1.4, 3.4, 1.4, 0, 1.7, -5.6, 'hairline');

  // A lane: crates to crouch behind, a low wall to peek over, a tall crate at the door.
  box(1.6, 1.1, 1.6, -9, 0.55, 3, 'hairline');
  box(1.6, 1.1, 1.6, -12, 0.55, -1, 'hairline');
  box(3.4, 1.05, 0.8, -14, 0.52, -6.4, 'surface');
  box(1.8, 2.4, 1.8, -15.6, 1.2, -11.6, 'hairline');
  box(1.2, 0.9, 2.6, -7.4, 0.45, -8.6, 'hairline');

  // B lane mirrors A lane.
  box(1.6, 1.1, 1.6, 9, 0.55, 3, 'hairline');
  box(1.6, 1.1, 1.6, 12, 0.55, -1, 'hairline');
  box(3.4, 1.05, 0.8, 14, 0.52, -6.4, 'surface');
  box(1.8, 2.4, 1.8, 15.6, 1.2, -11.6, 'hairline');
  box(1.2, 0.9, 2.6, 7.4, 0.45, -8.6, 'hairline');

  // South yard: spawn cover, two low blocks and corner pillars.
  box(2.6, 1.0, 1.2, -4.5, 0.5, 8.6, 'hairline');
  box(2.6, 1.0, 1.2, 4.5, 0.5, 8.6, 'hairline');
  box(0.9, 2.2, 0.9, -16.4, 1.1, 12.4, 'hairline');
  box(0.9, 2.2, 0.9, 16.4, 1.1, 12.4, 'hairline');
  box(0.9, 2.2, 0.9, -16.4, 1.1, -12.4, 'hairline');
  box(0.9, 2.2, 0.9, 16.4, 1.1, -12.4, 'hairline');

  // Site letters: two flat amber plates floating above each site so the lanes read.
  const letterA = box(1.6, 0.08, 1.6, -13.5, 3.4, -9.5, 'accent', false);
  letterA.rotation.y = 0;
  const letterB = box(1.6, 0.08, 1.6, 13.5, 3.4, -9.5, 'accent', false);
  letterB.rotation.y = 0;

  // Light: a warm key from the front right, a cool fill from behind, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.7);
  scene.add(sky);
  scene.add(new THREE.AmbientLight(new THREE.Color(PALETTE.ink), 0.45));

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.8);
  key.position.set(12, 16, 9);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.9);
  fill.position.set(-10, 9, 12);
  scene.add(fill);

  return { colliders, shootables, group };
}
