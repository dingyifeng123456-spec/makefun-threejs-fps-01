// Money between rounds: kills, round results and objectives pay, and the buy menu
// spends it. Prices live with the weapons; this module only moves the numbers and
// remembers what the player owns between rounds.
export const REWARDS = {
  kill: 300,
  roundWin: 325,
  roundLoss: 190,
  plant: 300,
  defuse: 300,
  matchWin: 500,
};

export function createEconomy() {
  const state = { money: 800, kills: 0, deaths: 0, plants: 0, defuses: 0 };

  return {
    state,
    reset() {
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.plants = 0;
      state.defuses = 0;
    },
    earn(amount) {
      state.money += amount;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    canAfford(amount) {
      return state.money >= amount;
    },
    onKill() {
      state.kills += 1;
      state.money += REWARDS.kill;
    },
    onDeath() {
      state.deaths += 1;
    },
    onRoundEnd(won) {
      state.money += won ? REWARDS.roundWin : REWARDS.roundLoss;
    },
    onPlant() {
      state.plants += 1;
      state.money += REWARDS.plant;
    },
    onDefuse() {
      state.defuses += 1;
      state.money += REWARDS.defuse;
    },
  };
}
