// The DOM HUD: crosshair, hit marker, health, armour, ammo, money, round timer and
// score, team counts, kill feed, buy menu and the overlay panels. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out. Every setter
// skips work when the value did not change, so the HUD costs nothing at rest.
import { WEAPONS, GRENADE_PRICE, ARMOUR_PRICE } from './weapons.js';

const COPY = {
  start: {
    title: 'Amber Yard',
    copy: 'Attackers plant the bomb on A or B. Defenders hold the sites. First to 4 rounds takes the match. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Amber Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

const BUY_ITEMS = [
  { key: 'rifle', label: 'VK-7 Rifle', desc: '30 rounds · accurate at range', price: WEAPONS.rifle.price },
  { key: 'smg', label: 'Hornet SMG', desc: '32 rounds · fast up close', price: WEAPONS.smg.price },
  { key: 'sniper', label: 'Longbow DMR', desc: '5 rounds · one shot, big damage', price: WEAPONS.sniper.price },
  { key: 'grenade', label: 'HE Grenade', desc: 'Blast damage in a 5 m radius', price: GRENADE_PRICE },
  { key: 'armour', label: 'Kevlar Vest', desc: 'Soaks half of each hit, up to 50', price: ARMOUR_PRICE },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armourValue = $('armour-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundScore = $('round-score');
  const teamCounts = $('team-counts');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const progressWrap = $('progress-wrap');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const vignette = $('damage-vignette');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyList = $('buy-list');
  const grenadeCount = $('grenade-count');
  const matchInfo = $('match-info');
  let hitTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  const hud = {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armour) {
      if (last.health !== health) {
        last.health = health;
        healthFill.style.width = `${Math.max(0, health)}%`;
        healthFill.classList.toggle('low', health <= 30);
        setText(healthValue, 'healthText', String(Math.ceil(health)));
      }
      setText(armourValue, 'armour', armour > 0 ? `+${Math.ceil(armour)} armour` : '');
    },
    setMoney(money) {
      setText(moneyValue, 'money', `$${money}`);
      setText(buyMoney, 'buyMoney', `$${money}`);
    },
    setTimer(seconds, bombPlanted) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      timerValue.classList.toggle('urgent', (bombPlanted && s <= 10) || (!bombPlanted && s <= 10));
    },
    setRounds(atk, def, round) {
      setText(roundScore, 'rounds', `ATK ${atk} — ${def} DEF · Round ${round}`);
    },
    setTeams(atkAlive, atkTotal, defAlive, defTotal) {
      setText(teamCounts, 'teams', `ATK ${atkAlive}/${atkTotal} · DEF ${defAlive}/${defTotal}`);
    },
    setGrenades(count) {
      setText(grenadeCount, 'nades', count > 0 ? `◉ ${count} HE` : '');
    },
    setCrosshair(spreadPx) {
      const gap = Math.round(4 + spreadPx);
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    feed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    showBanner(text, ms = 2600) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(hud._bannerTimer);
      hud._bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    showProgress(label, fraction) {
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    hideProgress() {
      progressWrap.hidden = true;
    },
    showOverlay(mode, extra = '') {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showMatchEnd(text, action) {
      title.textContent = text;
      copy.textContent = 'The match is over. Play again for a fresh match.';
      play.textContent = action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuy(money, owned, onBuy) {
      buyMenu.hidden = false;
      hud.setMoney(money);
      buyList.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        const already = item.key === 'grenade' ? false : item.key === 'armour' ? false : owned[item.key];
        row.disabled = already || money < item.price;
        row.innerHTML = `<span class="buy-name">${item.label}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${already ? 'Owned' : '$' + item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.key));
        buyList.appendChild(row);
      }
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    isBuyOpen() {
      return !buyMenu.hidden;
    },
    setMatchInfo(text) {
      setText(matchInfo, 'match', text);
    },
  };
  return hud;
}
