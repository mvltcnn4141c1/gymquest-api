export interface Race {
  id: string;
  name: string;
  lore: string;
  icon: string;
  color: string;
  bonuses: { stat: 'strength' | 'agility' | 'endurance'; delta: number }[];
  xpBonus: { type: string; multiplier: number }[];
  classAffinity: string[];
  specialAbility: string;
}

export const RACES: Race[] = [
  {
    id: 'yuce_insan',
    name: 'Yüce İnsan',
    lore: 'Evrenin en uyumlu ırkı. Her zorluğu azim ve zekâyla aşar. Sınırsız potansiyelleriyle tüm sınıflarda mükemmelleşebilirler.',
    icon: 'account',
    color: '#E8D5B7',
    bonuses: [
      { stat: 'strength', delta: 1 },
      { stat: 'agility', delta: 1 },
      { stat: 'endurance', delta: 1 },
    ],
    xpBonus: [{ type: 'all', multiplier: 1.05 }],
    classAffinity: ['fighter', 'wizard', 'ranger', 'paladin', 'bard', 'cleric'],
    specialAbility: 'Uyumluluk: Tüm antrenman türlerinden +5% XP',
  },
  {
    id: 'gece_elfi',
    name: 'Gece Elfi',
    lore: 'Karanlık ormanlarda yetişen bu kadim ırk, eşsiz çeviklik ve sezgileriyle bilinir. Ay ışığında koşarlar, rüzgarla yarışırlar.',
    icon: 'ear-hearing',
    color: '#7B68EE',
    bonuses: [
      { stat: 'agility', delta: 4 },
      { stat: 'strength', delta: -1 },
    ],
    xpBonus: [
      { type: 'running', multiplier: 1.12 },
      { type: 'cycling', multiplier: 1.12 },
      { type: 'jump_rope', multiplier: 1.12 },
    ],
    classAffinity: ['ranger', 'rogue', 'monk'],
    specialAbility: 'Ay Adımı: Koşu ve çeviklik antrenmanlarından +12% XP',
  },
  {
    id: 'dag_cucesi',
    name: 'Dağ Cücesi',
    lore: 'Dağların derinliklerinden çıkan bu mağrur savaşçılar, granit gibi sert ve kaya gibi sağlamdır. Hiçbir yük onları yıkamaz.',
    icon: 'hammer',
    color: '#B8860B',
    bonuses: [
      { stat: 'endurance', delta: 4 },
      { stat: 'agility', delta: -1 },
    ],
    xpBonus: [
      { type: 'deadlift', multiplier: 1.12 },
      { type: 'squat', multiplier: 1.12 },
      { type: 'plank', multiplier: 1.12 },
    ],
    classAffinity: ['barbarian', 'fighter', 'paladin'],
    specialAbility: 'Granit Derisi: Güç ve dayanıklılık antrenmanlarından +12% XP',
  },
  {
    id: 'yarimsoy',
    name: 'Yarımsoy',
    lore: 'Büyük ırkların kanının karıştığı bu küçük ama şaşırtıcı yaratıklar, şansın hep yanlarında olduğuna inanır. Ve haklılar.',
    icon: 'clover',
    color: '#2ECC71',
    bonuses: [
      { stat: 'agility', delta: 3 },
    ],
    xpBonus: [{ type: 'all', multiplier: 1.0 }],
    classAffinity: ['rogue', 'bard', 'ranger'],
    specialAbility: 'Şans Dokunuşu: Seri bonusu +10% daha yüksek hesaplanır',
  },
  {
    id: 'tas_ork',
    name: 'Taş Ork',
    lore: 'Volkanlardan çıkan bu dev ırk, saf güçlerinin simgesidir. Hiç kimse Taş Ork\'un yumruğundan sonra ayağa kalkamamıştır.',
    icon: 'arm-flex',
    color: '#E74C3C',
    bonuses: [
      { stat: 'strength', delta: 6 },
      { stat: 'agility', delta: -2 },
      { stat: 'endurance', delta: -1 },
    ],
    xpBonus: [
      { type: 'push_up', multiplier: 1.15 },
      { type: 'pull_up', multiplier: 1.15 },
      { type: 'deadlift', multiplier: 1.15 },
      { type: 'bench_press', multiplier: 1.15 },
    ],
    classAffinity: ['barbarian', 'fighter'],
    specialAbility: 'Kandan Güç: Tüm güç egzersizlerinden +15% XP',
  },
  {
    id: 'cehennem_dogumlsu',
    name: 'Cehennem Doğumlusu',
    lore: 'Ateş ve karanlığın sularından gelen bu gizemli ırk, büyünün dilini ana dilinden önce öğrenir. Alevler onlara evlerini hatırlatır.',
    icon: 'fire',
    color: '#FF4D4D',
    bonuses: [
      { stat: 'strength', delta: -1 },
      { stat: 'agility', delta: 2 },
      { stat: 'endurance', delta: 2 },
    ],
    xpBonus: [
      { type: 'burpee', multiplier: 1.15 },
      { type: 'plank', multiplier: 1.10 },
    ],
    classAffinity: ['warlock', 'sorcerer', 'wizard'],
    specialAbility: 'Cehennem Ateşi: Büyücü ve Warlock olarak +20% XP, Burpee\'den +15% XP',
  },
];

export const RACE_MAP: Record<string, Race> = Object.fromEntries(RACES.map((r) => [r.id, r]));

export function getRaceXpMultiplier(raceId: string, exerciseType: string, charClass: string): number {
  const race = RACE_MAP[raceId];
  if (!race) return 1;

  let mult = 1;
  for (const bonus of race.xpBonus) {
    if (bonus.type === 'all') {
      mult *= bonus.multiplier;
    } else if (bonus.type === exerciseType) {
      mult *= bonus.multiplier;
    }
  }

  if (raceId === 'cehennem_dogumlsu' && (charClass === 'warlock' || charClass === 'sorcerer' || charClass === 'wizard' || charClass === 'mage')) {
    mult *= 1.2;
  }

  return mult;
}

export function getRaceStatBonus(raceId: string): { strength: number; agility: number; endurance: number } {
  const race = RACE_MAP[raceId];
  const result = { strength: 0, agility: 0, endurance: 0 };
  if (!race) return result;
  for (const b of race.bonuses) {
    result[b.stat] += b.delta;
  }
  return result;
}
