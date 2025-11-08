// player.js (ESM)

export class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.score = 0;
    this.energy = 0;

    this.resources = {
      bois: 0,
      eau: 0,
      nourriture: 0,
      pierre: 0,
      fer: 0,
      phosphate: 0,
      or: 0,
      cuivre: 0,
      silice: 0,
      charbon: 0
    };
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      energy: this.energy,
      maxEnergy: this.maxEnergy,
      resources: { ...this.resources }
    };
  }
}
