// Bots: two teams of computer players with routes, vision, hearing and bursts of
// fire. A bot walks its route toward a site, holds angles, and when it sees an enemy
// it stops, faces them and fires in bursts whose accuracy falls with distance and
// with how fast the target moves. Loud sounds pull nearby bots toward them. When the
// bomb is planted the defenders converge on it to defuse and the attackers hold the
// site. No new objects are made in the hot loop: every vector and ray is reused.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, ROUTES } from './world.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.5;
const BOT_HEALTH = 100;
const SEE_RANGE = 42;
const HEAR_SHOT = 18;
const HEAR_BOOM = 32;

const NAMES = {
  attackers: ['Vex', 'Moss'],
  defenders: ['Ash', 'Bram', 'Cinder', 'Dune'],
};

function botMaterial(color) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.65, metalness: 0.05 });
}

export function createBots(scene, colliders, walls) {
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.18, 0.55, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const barGeo = new THREE.BoxGeometry(0.6, 0.07, 0.02);
  const atkBody = botMaterial(PALETTE.accent);
  const defBody = botMaterial(PALETTE.muted);
  const headMat = botMaterial(PALETTE.ink);
  const darkMat = botMaterial(PALETTE.hairline);
  const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eye = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const probe = new THREE.Box3();
  const move = new THREE.Vector3();

  function overlaps(x, z, height) {
    probe.min.set(x - RADIUS, 0.02, z - RADIUS);
    probe.max.set(x + RADIUS, height - 0.02, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function makeBot(name, team, index, spawn, random) {
    const group = new THREE.Group();
    const bodyMat = team === 'attackers' ? atkBody : defBody;
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), team === 'attackers' ? darkMat : atkBody);
    visor.position.set(0, 1.55, -0.14);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.28, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.28, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.05, -0.35);
    const bar = new THREE.Mesh(barGeo, barMat.clone());
    bar.position.set(0, 1.85, 0);
    group.add(torso, head, visor, legL, legR, gun, bar);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);
    const bot = {
      name, team, index, group, torso, head, bar,
      position: group.position,
      health: BOT_HEALTH, alive: true, fall: 0,
      yaw: team === 'attackers' ? 0 : Math.PI,
      state: 'advance', route: [], routeIndex: 0, holdUntil: 0,
      target: null, lastSeen: new THREE.Vector3(), seenAt: -99,
      burstLeft: 0, burstTimer: 0, fireTimer: 0, thinkTimer: random() * 0.3,
      alert: null, alertAt: -99, speed: 3.1 + random() * 0.9,
      skill: 0.55 + random() * 0.3, hasBomb: false, channel: 0, channelKind: null,
      walkPhase: random() * 6,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function build(random, spawns) {
    bots.length = 0;
    hitMeshes.length = 0;
    for (let i = 0; i < NAMES.attackers.length; i += 1) {
      makeBot(NAMES.attackers[i], 'attackers', i, spawns.attackers[i + 1] || spawns.attackers[0], random);
    }
    for (let i = 0; i < NAMES.defenders.length; i += 1) {
      makeBot(NAMES.defenders[i], 'defenders', i, spawns.defenders[i], random);
    }
  }

  function canSee(bot, targetPos) {
    eye.set(bot.position.x, EYE, bot.position.z);
    toTarget.copy(targetPos);
    toTarget.y = 1.2;
    toTarget.sub(eye);
    const dist = toTarget.length();
    if (dist > SEE_RANGE) return false;
    toTarget.normalize();
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (forward.dot(toTarget) < 0.15 && dist > 4) return false;
    raycaster.set(eye, toTarget);
    const hit = raycaster.intersectObjects(walls, false)[0];
    return !hit || hit.distance >= dist - 0.4;
  }

  function nearestEnemy(bot, ctx) {
    let best = null;
    let bestDist = Infinity;
    const consider = (pos, ref, kind) => {
      if (!ref.alive) return;
      const d = Math.hypot(pos.x - bot.position.x, pos.z - bot.position.z);
      if (d < bestDist && canSee(bot, pos)) {
        bestDist = d;
        best = { pos, ref, kind, dist: d };
      }
    };
    if (bot.team === 'attackers') {
      for (const enemy of bots) if (enemy.team === 'defenders') consider(enemy.position, enemy, 'bot');
    } else {
      if (ctx.playerAlive) consider(ctx.playerPos, ctx.player, 'player');
      for (const ally of bots) if (ally.team === 'attackers') consider(ally.position, ally, 'bot');
    }
    return best;
  }

  function pickRoute(bot, site, random) {
    if (bot.team === 'attackers') {
      bot.route = (site === 'A' ? ROUTES.toA : site === 'B' ? ROUTES.toB : ROUTES.toMid).slice();
    } else if (site === 'A') bot.route = ROUTES.defA.slice();
    else if (site === 'B') bot.route = ROUTES.defB.slice();
    else bot.route = ROUTES.defMid.slice();
    bot.routeIndex = 0;
    bot.state = 'advance';
  }

  function stepBot(bot, dt, time, ctx, random) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.rotation.x = 0;
    bot.thinkTimer -= dt;
    bot.fireTimer -= dt;
    bot.burstTimer -= dt;

    // Reconsider what to do a few times a second, not every frame. Bots only fight
    // once the round is live: the buy phase is freeze time.
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.18 + random() * 0.12;
      const enemy = ctx.phase === 'round' ? nearestEnemy(bot, ctx) : null;
      if (enemy) {
        bot.target = enemy;
        bot.lastSeen.copy(enemy.pos);
        bot.seenAt = time;
        bot.state = 'engage';
      } else if (bot.state === 'engage' && time - bot.seenAt > 1.2) {
        bot.target = null;
        bot.state = bot.route.length ? 'advance' : 'hold';
        if (bot.alert && time - bot.alertAt < 6) {
          bot.route = [bot.alert];
          bot.routeIndex = 0;
          bot.state = 'advance';
        }
      }
      if (bot.state !== 'engage') {
        if (ctx.bombPlanted && bot.team === 'defenders') {
          // Converge on the planted bomb; the closest defender defuses.
          bot.route = [ctx.bombSite === 'A' ? 'aSite' : 'bSite'];
          bot.routeIndex = 0;
          bot.state = 'advance';
        } else if (ctx.bombPlanted && bot.team === 'attackers') {
          bot.route = [ctx.bombSite === 'A' ? 'aHold' : 'bHold'];
          bot.routeIndex = 0;
          bot.state = 'advance';
        }
      }
    }

    const target = bot.target;
    if (bot.state === 'engage' && target && target.ref.alive && ctx.phase === 'round') {
      // Face the target and fire in bursts.
      const dx = target.pos.x - bot.position.x;
      const dz = target.pos.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      if (bot.burstLeft <= 0 && bot.fireTimer <= 0) {
        bot.burstLeft = 3 + Math.floor(random() * 3);
        bot.fireTimer = 0.55 + random() * 0.5;
      }
      if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
        bot.burstTimer = 0.11;
        bot.burstLeft -= 1;
        fireAt(bot, target, ctx, random);
      }
      return;
    }

    // Channelling: planting (attacker with the bomb on a site) or defusing.
    if (bot.channelKind) {
      bot.channel += dt;
      const need = bot.channelKind === 'plant' ? 3.5 : 5;
      if (bot.channel >= need) {
        const kind = bot.channelKind;
        bot.channel = 0;
        bot.channelKind = null;
        if (kind === 'plant') ctx.onPlant(bot);
        else ctx.onDefuse(bot);
      }
      return;
    }
    if (bot.hasBomb && ctx.siteOf(bot.position)) {
      bot.channelKind = 'plant';
      bot.channel = 0;
      return;
    }
    if (ctx.bombPlanted && bot.team === 'defenders') {
      const d = Math.hypot(bot.position.x - ctx.bombPos.x, bot.position.z - ctx.bombPos.z);
      if (d < 1.6) {
        bot.channelKind = 'defuse';
        bot.channel = 0;
        return;
      }
    }

    // Walk the route, one waypoint at a time.
    if (bot.state === 'advance' && bot.routeIndex < bot.route.length) {
      const entry = bot.route[bot.routeIndex];
      const wp = Array.isArray(entry) ? entry : WAYPOINTS[entry];
      if (!wp) {
        bot.routeIndex += 1;
        return;
      }
      const dx = wp[0] - bot.position.x;
      const dz = wp[1] - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
          bot.holdUntil = time + 2 + random() * 3;
          bot.yaw = bot.team === 'attackers' ? Math.PI + (random() - 0.5) : (random() - 0.5) * 0.8;
        }
        return;
      }
      bot.yaw = Math.atan2(-dx, -dz);
      move.set((dx / dist) * bot.speed * dt, 0, (dz / dist) * bot.speed * dt);
      tryMove(bot, move.x, move.z);
      bot.walkPhase += dt * 9;
      bot.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.03;
      return;
    }
    if (bot.state === 'hold' && time > bot.holdUntil) {
      // Drift to a neighbouring waypoint so holders do not stand still all round.
      const keys = Object.keys(WAYPOINTS);
      const near = keys[Math.floor(random() * keys.length)];
      bot.route = [near];
      bot.routeIndex = 0;
      bot.state = 'advance';
    }
  }

  function tryMove(bot, dx, dz) {
    const nx = bot.position.x + dx;
    if (!overlaps(nx, bot.position.z, HEIGHT)) bot.position.x = nx;
    const nz = bot.position.z + dz;
    if (!overlaps(bot.position.x, nz, HEIGHT)) bot.position.z = nz;
  }

  function fireAt(bot, target, ctx, random) {
    const dist = target.dist;
    const targetSpeed = target.kind === 'player' ? ctx.playerSpeed : 2.5;
    const err = (0.35 + dist * 0.028 + targetSpeed * 0.09) * (1.25 - bot.skill);
    const hitChance = Math.max(0.08, 0.62 - err);
    const from = new THREE.Vector3(bot.position.x + 0.2, 1.35, bot.position.z);
    const to = new THREE.Vector3(target.pos.x, 1.2, target.pos.z);
    if (random() < hitChance) {
      const head = random() < 0.08;
      const dmg = Math.round((head ? 34 : 17) * Math.max(0.5, 1 - dist / 90));
      ctx.onBotShot(bot, target, dmg, head, from, to);
    } else {
      to.x += (random() - 0.5) * 2.4;
      to.y += (random() - 0.5) * 1.2;
      to.z += (random() - 0.5) * 2.4;
      ctx.onBotShot(bot, target, 0, false, from, to);
    }
    ctx.onNoise(bot.position.x, bot.position.z, HEAR_SHOT);
  }

  function hear(x, z, radius, time) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      const d = Math.hypot(bot.position.x - x, bot.position.z - z);
      if (d < radius) {
        bot.alert = [x, z];
        bot.alertAt = time;
      }
    }
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return null;
    bot.health -= amount;
    bot.bar.scale.x = Math.max(0.001, bot.health / BOT_HEALTH);
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.channel = 0;
      bot.channelKind = null;
      bot.bar.visible = false;
      return { killed: true, bot };
    }
    return { killed: false, bot };
  }

  return {
    bots,
    hitMeshes,
    build,
    pickRoute,
    hear,
    damage,
    step(dt, time, ctx, random) {
      for (const bot of bots) stepBot(bot, dt, time, ctx, random);
      for (const bot of bots) {
        bot.group.rotation.y = bot.yaw;
        if (bot.alive) bot.group.position.y = bot.group.position.y;
      }
    },
    reset(spawns, site, random) {
      for (const bot of bots) {
        const spawn = bot.team === 'attackers'
          ? spawns.attackers[bot.index + 1] || spawns.attackers[0]
          : spawns.defenders[bot.index];
        bot.group.position.set(spawn[0], 0, spawn[1]);
        bot.group.rotation.set(0, bot.team === 'attackers' ? 0 : Math.PI, 0);
        bot.health = BOT_HEALTH;
        bot.alive = true;
        bot.fall = 0;
        bot.yaw = bot.team === 'attackers' ? 0 : Math.PI;
        bot.target = null;
        bot.alert = null;
        bot.channel = 0;
        bot.channelKind = null;
        bot.hasBomb = false;
        bot.bar.visible = true;
        bot.bar.scale.x = 1;
        pickRoute(bot, site, random);
      }
    },
    remaining(team) {
      let count = 0;
      for (const bot of bots) if (bot.team === team && bot.alive) count += 1;
      return count;
    },
    aliveBots(team) {
      return bots.filter((bot) => bot.team === team && bot.alive);
    },
    byName(name) {
      return bots.find((bot) => bot.name === name);
    },
  };
}
