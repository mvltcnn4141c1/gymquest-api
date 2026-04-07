export interface BossDef {
  key: string;
  name: string;
  title: string;
  lore: string;
  icon: string;
  color: string;
  element: string;
  weakClass: string[];
  baseHp: number;
  hpPerLevel: number;
  rewardXp: number;
  rewardCoins: number;
  rewardGems: number;
  specialMechanic: string;
  durationDays: number;
}

export const BOSSES: BossDef[] = [
  {
    key: 'KIZIL_VARG',
    name: 'Kızıl Ejder Varg',
    title: 'Volkan Efendisi',
    lore: 'Asırlarca yanardağların içinde uyuyan bu dev ejder, artık uyanmış ve tüm alevi azim savaşçıları bekliyor. Nefesiyle şehirleri yakabilir, pençesiyle dağları yıkabilir.',
    icon: 'dragon',
    color: '#FF4500',
    element: 'ateş',
    weakClass: ['warrior', 'paladin'],
    baseHp: 8000,
    hpPerLevel: 500,
    rewardXp: 1200,
    rewardCoins: 300,
    rewardGems: 15,
    specialMechanic: 'Her güç egzersizi (şınav, deadlift, pull-up) 1.5x hasar verir.',
    durationDays: 7,
  },
  {
    key: 'DONUK_KOLGRATH',
    name: 'Donuk Dev Kolgrath',
    title: 'Buz Tepesinin Lordu',
    lore: 'Kuzey buzullarının derinliklerinden gelen bu dev, kalbine dokunana kadar tüm doğayı dondurmak için yemin etmiştir. Sadece takım çalışması onu durduabilir.',
    icon: 'snowflake',
    color: '#7EC8E3',
    element: 'buz',
    weakClass: ['mage', 'archer'],
    baseHp: 6500,
    hpPerLevel: 400,
    rewardXp: 1000,
    rewardCoins: 250,
    rewardGems: 12,
    specialMechanic: 'Grup dengeli olduğunda (Tank + Healer mevcut) tüm hasar +20% artar.',
    durationDays: 7,
  },
  {
    key: 'GOLGE_NYXX',
    name: 'Gölge Suikastçısı Nyxx',
    title: 'Karanlığın Sesi',
    lore: 'Kimse onu görünce hayatta kalmamıştır. Sessizliğin ve gölgenin çocuğu olan Nyxx, hedefini hiç kaçırmaz. Tek zayıf noktası: hızdır.',
    icon: 'knife',
    color: '#9B59B6',
    element: 'gölge',
    weakClass: ['archer', 'mage'],
    baseHp: 5000,
    hpPerLevel: 350,
    rewardXp: 900,
    rewardCoins: 220,
    rewardGems: 11,
    specialMechanic: 'Çeviklik egzersizleri (koşu, bisiklet, jump rope) 2x hasar verir.',
    durationDays: 5,
  },
  {
    key: 'MALACHAR',
    name: 'Çürüyen Büyücü Malachar',
    title: 'Çöküşün Mimarı',
    lore: 'Bir zamanlar büyük bir bilge olan Malachar, yasak büyülerle kendini mahvetmiş ve şimdi karanlığın hizmetine girmiştir. Sadece akıl ve büyü onu mağlup edebilir.',
    icon: 'magic-staff',
    color: '#8B4513',
    element: 'nekromantik',
    weakClass: ['mage', 'paladin'],
    baseHp: 7000,
    hpPerLevel: 450,
    rewardXp: 1100,
    rewardCoins: 280,
    rewardGems: 13,
    specialMechanic: 'Dayanıklılık egzersizleri (plank, squat, lunge) 1.5x hasar verir.',
    durationDays: 7,
  },
  {
    key: 'STONN',
    name: 'Yeraltı Golemi Stonn',
    title: 'Taş Kalbinden Doğan',
    lore: 'Dünyanın çekirdeğinden çıkartılan bu kadim golem, sadece fiziksel güce saygı duyar. Onu durdurmak için hem güç hem de strateji gerekir.',
    icon: 'cube-outline',
    color: '#6D6D6D',
    element: 'toprak',
    weakClass: ['warrior', 'paladin'],
    baseHp: 9000,
    hpPerLevel: 600,
    rewardXp: 1400,
    rewardCoins: 350,
    rewardGems: 18,
    specialMechanic: 'En yüksek hasar veren karakter savaş sonunda +%50 bonus alır.',
    durationDays: 7,
  },
  {
    key: 'FIRTINA_HAYR',
    name: 'Fırtına Hayrı',
    title: 'Göklerin Gazabı',
    lore: 'Tek bir varlık değil, binlerce fırtına ruhunun birleşimidir. Dağıtık saldırılar onu parçalayamaz; ancak odaklanmış ve kararlı bir grup onu devirebilir.',
    icon: 'weather-lightning',
    color: '#FFD700',
    element: 'şimşek',
    weakClass: ['warrior', 'archer'],
    baseHp: 10000,
    hpPerLevel: 700,
    rewardXp: 1600,
    rewardCoins: 400,
    rewardGems: 20,
    specialMechanic: 'Tüm üyeler katkı sağlarsa +%30 takım hasarı bonusu aktif olur.',
    durationDays: 10,
  },
];

export const BOSS_MAP: Record<string, BossDef> = Object.fromEntries(
  BOSSES.map((b) => [b.key, b])
);

export function getWeeklyBoss(): BossDef {
  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return BOSSES[weekNum % BOSSES.length];
}

export function calcBossHp(bossKey: string, avgPartyLevel: number, memberCount: number): number {
  const boss = BOSS_MAP[bossKey];
  if (!boss) return 5000;
  return boss.baseHp + boss.hpPerLevel * avgPartyLevel * (memberCount / 5);
}
