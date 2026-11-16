// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Rounds run buy (15 s) -> fight (100 s, or the bomb's 40 s once planted) ->
// result (4 s), first to 4 rounds takes the match. You attack with two bot
// team-mates against four defenders; plant the bomb on A or B, or eliminate the
// other team. ?shot=start|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_PRICE, ARMOUR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createEconomy } from './economy.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createAudio } from './audio.js';
import { createMinimap } from './minimap.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const RESULT_SECONDS = 4;
const WIN_ROUNDS = 4;
const MAX_ROUNDS = 7;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.surface), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders, SPAWNS.attackers[0]);
const arsenal = createArsenal(camera);
const bots = createBots(scene, world.colliders, world.shootables);
const economy = createEconomy();
const bomb = createBomb(scene);
const grenades = createGrenades(scene, world.colliders);
const audio = createAudio();
const minimap = createMinimap(document.getElementById('minimap'));
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// Tracers: a small pool of two-point lines, reused, fading out after a shot.
const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
function spawnTracer(from, to) {
  const tracer = tracers.find((item) => item.life <= 0) || tracers[0];
  const pos = tracer.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  tracer.line.visible = true;
  tracer.line.material.opacity = 0.9;
  tracer.life = 0.09;
}

// Match state. One object, so a round reset touches every field in one place.
const match = {
  phase: 'buy',
  phaseTime: BUY_SECONDS,
  round: 1,
  atkWins: 0,
  defWins: 0,
  site: 'A',
  grenades: 0,
  plantProgress: 0,
  started: false,
  over: false,
  elapsed: 0,
  minimapAt: 0,
  spectate: null,
};

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;

bots.build(random, SPAWNS);

function siteOf(position) {
  return bomb.siteOf(position);
}

const botCtx = {
  get phase() { return match.phase; },
  get playerAlive() { return body.alive; },
  get playerPos() { return body.position; },
  get playerSpeed() { return player.groundSpeed(); },
  player: body,
  get bombPlanted() { return bomb.state.planted; },
  get bombSite() { return bomb.state.site; },
  get bombPos() { return bomb.state.position; },
  siteOf,
  onNoise(x, z, radius) { bots.hear(x, z, radius, match.elapsed); },
  onPlant(bot) {
    bomb.plant(match.site, bot.position);
    hud.showBanner(`${bot.name} planted the bomb on site ${match.site}`);
    hud.feed(`${bot.name} planted the bomb`);
    audio.plant();
    if (bot.hasBomb) bot.hasBomb = false;
  },
  onDefuse(bot) {
    endRound(false, `${bot.name} defused the bomb`);
  },
  onBotShot(bot, target, dmg, head, from, to) {
    spawnTracer(from, to);
    if (dmg > 0) {
      if (target.kind === 'player') {
        audio.enemyShot();
        hurtPlayer(dmg, bot.name);
      } else {
        const result = bots.damage(target.ref.torso, dmg);
        if (result && result.killed) {
          hud.feed(`${bot.name} eliminated ${target.ref.name}${head ? ' (headshot)' : ''}`);
          if (target.ref.hasBomb) dropBombAt(target.ref.position);
        }
      }
    } else {
      audio.enemyShot();
    }
  },
};

function dropBombAt(position) {
  bomb.dropAt(position);
  hud.showBanner('The bomb was dropped — walk over it to pick it up');
}

function hurtPlayer(amount, fromName) {
  const died = player.damage(amount);
  hud.setHealth(body.health, body.armour);
  hud.damageFlash();
  if (died) {
    economy.onDeath();
    hud.feed(`${fromName} eliminated you`);
    hud.showBanner('You are down — spectating your team');
    if (bomb.state.carrier === 'player') dropBombAt(body.position);
    const alive = bots.aliveBots('attackers');
    match.spectate = alive.length ? alive[0] : null;
  }
}

function startRound() {
  match.site = random() < 0.5 ? 'A' : 'B';
  match.phase = 'buy';
  match.phaseTime = BUY_SECONDS;
  match.plantProgress = 0;
  player.reset(SPAWNS.attackers[0]);
  grenades.reset();
  match.grenades = 0;
  match.spectate = null;
  bots.reset(SPAWNS, match.site, random);
  // Defenders split: two hold the target site, one takes mid, one the other site.
  const defenders = bots.aliveBots('defenders');
  const other = match.site === 'A' ? 'B' : 'A';
  if (defenders[0]) bots.pickRoute(defenders[0], match.site, random);
  if (defenders[1]) bots.pickRoute(defenders[1], match.site, random);
  if (defenders[2]) bots.pickRoute(defenders[2], null, random);
  if (defenders[3]) bots.pickRoute(defenders[3], other, random);
  const attackers = bots.aliveBots('attackers');
  if (attackers[0]) bots.pickRoute(attackers[0], match.site, random);
  if (attackers[1]) bots.pickRoute(attackers[1], null, random);
  bomb.reset('player');
  hud.setHealth(body.health, body.armour);
  hud.setMoney(economy.state.money);
  hud.setRounds(match.atkWins, match.defWins, match.round);
  hud.setTeams(3, 3, 4, 4);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
  hud.setGrenades(0);
  hud.showBanner(`Round ${match.round} — plant the bomb on site ${match.site}`);
}

function startMatch() {
  match.round = 1;
  match.atkWins = 0;
  match.defWins = 0;
  match.over = false;
  economy.reset();
  startRound();
}

function endRound(attackersWon, reason) {
  if (match.phase === 'result' || match.over) return;
  match.phase = 'result';
  match.phaseTime = RESULT_SECONDS;
  if (attackersWon) match.atkWins += 1;
  else match.defWins += 1;
  economy.onRoundEnd(attackersWon);
  hud.setRounds(match.atkWins, match.defWins, match.round);
  hud.setMoney(economy.state.money);
  hud.showBanner(reason, 3600);
  if (attackersWon) audio.roundWin();
  else audio.roundLose();
  if (match.atkWins >= WIN_ROUNDS || match.defWins >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
    match.over = true;
  }
}

function endMatch() {
  const won = match.atkWins > match.defWins;
  const text = match.atkWins === match.defWins
    ? `Match drawn ${match.atkWins} — ${match.defWins}`
    : won
      ? `Attackers win the match ${match.atkWins} — ${match.defWins}`
      : `Defenders win the match ${match.defWins} — ${match.atkWins}`;
  hud.showMatchEnd(text, 'Play again');
  if (document.pointerLockElement) document.exitPointerLock();
}

function checkRoundEnd() {
  if (match.phase !== 'round') return;
  const atkAlive = (body.alive ? 1 : 0) + bots.remaining('attackers');
  const defAlive = bots.remaining('defenders');
  if (defAlive === 0) {
    endRound(true, bomb.state.planted ? 'Bomb detonated — attackers take the round' : 'Defenders eliminated — attackers take the round');
  } else if (atkAlive === 0 && !bomb.state.planted) {
    endRound(false, 'Attackers eliminated — defenders take the round');
  } else if (atkAlive === 0 && bomb.state.planted && bots.remaining('attackers') === 0 && !body.alive) {
    // Nobody left to defend the bomb; it will decide the round on its own timer.
  }
}

function syncCamera() {
  if (!body.alive && match.spectate) {
    const ally = match.spectate;
    camera.position.set(ally.position.x, ally.position.y + 1.6, ally.position.z);
    camera.rotation.set(0, ally.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = arsenal.def();
  if (!arsenal.takeRound()) {
    audio.empty();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : tmpVec.copy(camera.position).addScaledVector(direction, def.range);
  spawnTracer(muzzle, end);
  audio.shot();
  bots.hear(body.position.x, body.position.z, 18, match.elapsed);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const amount = head ? def.damage * def.headMult : def.damage;
    const result = bots.damage(hit.object, amount);
    if (result) {
      hud.hitMarker(result.killed, markerHoldMs);
      if (result.killed) {
        economy.onKill();
        hud.setMoney(economy.state.money);
        hud.feed(`You eliminated ${bot.name}${head ? ' (headshot)' : ''} +$300`);
        audio.kill();
        if (bot.hasBomb) dropBombAt(bot.position);
      } else {
        audio.hit();
      }
    }
  }
  arsenal.pullTrigger();
  player.recoil(def.kick * 1.4, (random() * 2 - 1) * def.kick * 0.5);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, def.name);
  return true;
}

function throwGrenade() {
  if (match.grenades <= 0 || !body.alive || match.phase !== 'round') return;
  camera.getWorldDirection(direction);
  const origin = tmpVec.copy(camera.position).addScaledVector(direction, 0.5);
  origin.y -= 0.1;
  if (grenades.throwFrom(origin, direction, 13)) {
    match.grenades -= 1;
    hud.setGrenades(match.grenades);
    audio.click();
  }
}

function blastAt(pos, radius, maxDamage) {
  audio.explosion();
  bots.hear(pos.x, pos.z, 32, match.elapsed);
  const hurt = (targetPos, apply) => {
    const d = Math.hypot(targetPos.x - pos.x, targetPos.z - pos.z);
    if (d > radius) return;
    const amount = Math.round(maxDamage * (1 - d / radius) + 10);
    apply(amount);
  };
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    hurt(bot.position, (amount) => {
      const result = bots.damage(bot.torso, amount);
      if (result && result.killed) {
        economy.onKill();
        hud.setMoney(economy.state.money);
        hud.feed(`Your grenade eliminated ${bot.name} +$300`);
        if (bot.hasBomb) dropBombAt(bot.position);
      }
    });
  }
  if (body.alive) {
    hurt(body.position, (amount) => hurtPlayer(Math.round(amount * 0.5), 'a grenade'));
  }
  const playerDist = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
  if (playerDist < 8) player.recoil(0.05, 0);
}

function buyItem(key) {
  if (key === 'grenade') {
    if (!economy.spend(GRENADE_PRICE)) return;
    match.grenades += 1;
    hud.setGrenades(match.grenades);
  } else if (key === 'armour') {
    if (!economy.spend(ARMOUR_PRICE)) return;
    body.armour = 50;
    hud.setHealth(body.health, body.armour);
  } else {
    const def = WEAPONS[key];
    if (!def || arsenal.owned[key]) return;
    if (!economy.spend(def.price)) return;
    arsenal.buy(key);
    arsenal.select(key);
  }
  audio.click();
  hud.setMoney(economy.state.money);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
  hud.showBuy(economy.state.money, arsenal.owned, buyItem);
}

function openBuy() {
  if (match.phase !== 'buy' || !body.alive) return;
  hud.showBuy(economy.state.money, arsenal.owned, buyItem);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuy() {
  hud.hideBuy();
  input.requestLock();
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.over) {
    startMatch();
    input.requestLock();
    return;
  }
  if (hud.isBuyOpen()) closeBuy();
  else input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    match.started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (match.over) {
    // Match-end overlay is shown by endMatch; keep it up.
  } else if (!hud.isBuyOpen()) {
    hud.showOverlay(match.started ? 'paused' : 'start');
  }
}

function step(dt) {
  match.elapsed += dt;
  match.phaseTime -= dt;

  // Phase transitions.
  if (match.phase === 'buy' && match.phaseTime <= 0) {
    match.phase = 'round';
    match.phaseTime = ROUND_SECONDS;
    hud.showBanner('Round started — plant the bomb or eliminate the defenders');
  } else if (match.phase === 'round' && match.phaseTime <= 0 && !bomb.state.planted) {
    endRound(false, 'Time expired — defenders take the round');
  } else if (match.phase === 'result' && match.phaseTime <= 0) {
    if (match.over) {
      endMatch();
      match.phase = 'match';
    } else {
      match.round += 1;
      startRound();
    }
  }

  if (match.phase === 'round' || match.phase === 'buy') {
    player.step(dt, input.state.keys);
    arsenal.step(dt);

    // Bomb pickup: a dropped bomb is collected by walking over it.
    if (bomb.state.carrier === null && body.alive) {
      const d = Math.hypot(body.position.x - bomb.state.position.x, body.position.z - bomb.state.position.z);
      if (d < 1.4) {
        bomb.pickUp('player');
        hud.showBanner('You picked up the bomb — plant it on A or B');
      }
    }
    if (bomb.state.carrier === null) {
      for (const ally of bots.aliveBots('attackers')) {
        const d = Math.hypot(ally.position.x - bomb.state.position.x, ally.position.z - bomb.state.position.z);
        if (d < 1.4) {
          bomb.pickUp(ally);
          ally.hasBomb = true;
          bots.pickRoute(ally, match.site, random);
          hud.feed(`${ally.name} picked up the bomb`);
          break;
        }
      }
    }

    // Planting: hold E on a site while carrying the bomb.
    const onSite = siteOf(body.position);
    if (match.phase === 'round' && body.alive && bomb.state.carrier === 'player' && onSite && input.state.keys.has('KeyE')) {
      match.plantProgress += dt / PLANT_TIME;
      hud.showProgress(`Planting the bomb on site ${onSite}…`, match.plantProgress);
      if (match.plantProgress >= 1) {
        match.plantProgress = 0;
        hud.hideProgress();
        bomb.plant(onSite, body.position);
        match.site = onSite;
        economy.onPlant();
        hud.setMoney(economy.state.money);
        hud.showBanner(`Bomb planted on site ${onSite} — defend it`);
        hud.feed('You planted the bomb +$300');
        audio.plant();
      }
    } else {
      if (match.plantProgress > 0) hud.hideProgress();
      match.plantProgress = 0;
    }

    // Bomb ticking.
    if (bomb.step(dt)) {
      endRound(true, 'The bomb detonated — attackers take the round');
    }
  }

  bots.step(dt, match.elapsed, botCtx, random);
  grenades.step(dt, blastAt);

  // Tracers fade.
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.9;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
  }

  checkRoundEnd();

  // HUD numbers, throttled for the minimap.
  hud.setTimer(bomb.state.planted ? bomb.state.timer : Math.max(0, match.phaseTime), bomb.state.planted);
  hud.setTeams((body.alive ? 1 : 0) + bots.remaining('attackers'), 3, bots.remaining('defenders'), 4);
  hud.setHealth(body.health, body.armour);
  if (match.elapsed - match.minimapAt > 0.25) {
    match.minimapAt = match.elapsed;
    minimap.draw({
      bots: bots.bots,
      player: body,
      bombVisible: bomb.state.carrier === null || bomb.state.planted,
      bomb: bomb.state.position,
    });
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePressed();
    if (body.alive && match.phase !== 'match') {
      const def = arsenal.def();
      const wantFire = input.state.firing && (!prevFiring || def.auto);
      if (wantFire && arsenal.ready() && match.phase === 'round') {
        shoot(shot ? 0 : arsenal.spread(player.groundSpeed(), body.crouching, body.walking));
      }
      if (pressed.has('KeyR')) {
        arsenal.reload();
        audio.reload();
      }
      if (pressed.has('KeyG')) throwGrenade();
      if (pressed.has('KeyB')) {
        if (hud.isBuyOpen()) closeBuy();
        else openBuy();
      }
      const slots = ['pistol', 'rifle', 'smg', 'sniper'];
      for (let i = 0; i < 4; i += 1) {
        if (pressed.has(`Digit${i + 1}`) && arsenal.owned[slots[i]]) {
          if (arsenal.select(slots[i])) {
            hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
            audio.click();
          }
        }
      }
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    hud.setCrosshair(arsenal.spread(player.groundSpeed(), body.crouching, body.walking) * 900);
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  startMatch();
  economy.state.money = 2450;
  arsenal.buy('rifle');
  arsenal.select('rifle');
  match.grenades = 1;
  match.phase = 'round';
  match.phaseTime = name === 'play' ? 72 : 100;
  match.atkWins = name === 'end' ? 2 : 1;
  match.defWins = 1;
  match.round = name === 'end' ? 4 : 2;
  match.site = 'A';
  hud.setRounds(match.atkWins, match.defWins, match.round);
  hud.setMoney(economy.state.money);
  hud.setGrenades(match.grenades);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0, 0, 11.5);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else if (name === 'play') {
    body.position.set(0, 0, 2);
    const defenders = bots.aliveBots('defenders');
    const target = defenders[0];
    target.group.position.set(-1, 0, -4);
    target.yaw = Math.PI;
    const fallen = defenders[1];
    fallen.health = 0;
    fallen.alive = false;
    fallen.fall = 1;
    fallen.group.position.set(3.5, 0, -0.5);
    fallen.group.rotation.x = -1.45;
    fallen.bar.visible = false;
    const ally = bots.aliveBots('attackers')[0];
    ally.group.position.set(-4, 0, 3);
    ally.yaw = 0;
    settle(10);
    aimAt(new THREE.Vector3(target.group.position.x, 1.2, target.group.position.z));
    shoot(0);
    settle(6);
    hud.showBanner(`Round ${match.round} — plant the bomb on site ${match.site}`);
    hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
  } else {
    // end: bomb planted on A, defenders down, round won.
    body.position.set(-8, 0, -3);
    bomb.plant('A', new THREE.Vector3(-13.5, 0, -9.5));
    bomb.state.timer = 12;
    for (const defender of bots.bots) {
      if (defender.team !== 'defenders') continue;
      defender.health = 0;
      defender.alive = false;
      defender.fall = 1;
      defender.group.rotation.x = -1.45;
      defender.bar.visible = false;
    }
    const ally = bots.aliveBots('attackers')[0];
    ally.group.position.set(-11, 0, -6);
    ally.yaw = Math.PI * 0.75;
    // Hold the result phase so the settle below does not end the round again.
    match.phase = 'result';
    match.phaseTime = RESULT_SECONDS;
    settle(10);
    aimAt(new THREE.Vector3(-13.5, 0.6, -9.5));
    hud.showBanner('Bomb planted on site A — round won', 4000);
    hud.showMatchEnd('Attackers win the round 2 — 1', 'Play again');
  }
  hud.setHealth(body.health, body.armour);
  hud.setTeams((body.alive ? 1 : 0) + bots.remaining('attackers'), 3, bots.remaining('defenders'), 4);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startMatch();
syncCamera();
// A tiny read-only handle for play-testing: phase, position, health and score.
window.__amber = {
  state() {
    return {
      phase: match.phase,
      round: match.round,
      atkWins: match.atkWins,
      defWins: match.defWins,
      site: match.site,
      pos: [body.position.x, body.position.y, body.position.z],
      hp: body.health,
      money: economy.state.money,
      atkAlive: (body.alive ? 1 : 0) + bots.remaining('attackers'),
      defAlive: bots.remaining('defenders'),
      bots: bots.bots.map((b) => ({ name: b.name, team: b.team, x: +b.position.x.toFixed(1), z: +b.position.z.toFixed(1), hp: b.health, alive: b.alive, state: b.state })),
      bomb: { planted: bomb.state.planted, site: bomb.state.site, carrier: typeof bomb.state.carrier === 'string' ? bomb.state.carrier : bomb.state.carrier ? bomb.state.carrier.name : null, timer: +bomb.state.timer.toFixed(1) },
    };
  },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
