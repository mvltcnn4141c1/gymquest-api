export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  xpReward: number;
  coinReward: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: 'ilk_kan',
    name: 'İlk Adım',
    description: 'İlk antrenmanını tamamla.',
    icon: 'sword',
    color: '#C0C0C0',
    xpReward: 100,
    coinReward: 50,
    rarity: 'common',
  },
  {
    key: 'kahraman_yolu',
    name: 'Kahraman Yolu',
    description: '5. seviyeye ulaş.',
    icon: 'shield-star',
    color: '#C0C0C0',
    xpReward: 200,
    coinReward: 100,
    rarity: 'common',
  },
  {
    key: 'deneyimli_savasci',
    name: 'Deneyimli Savaşçı',
    description: '10. seviyeye ulaş.',
    icon: 'shield-half-full',
    color: '#2196F3',
    xpReward: 500,
    coinReward: 250,
    rarity: 'rare',
  },
  {
    key: 'sampiyonun_yolu',
    name: 'Şampiyon\'un Yolu',
    description: '25. seviyeye ulaş.',
    icon: 'diamond',
    color: '#9C27B0',
    xpReward: 1500,
    coinReward: 750,
    rarity: 'epic',
  },
  {
    key: 'efsanevi',
    name: 'Efsanevi',
    description: '50. seviyeye ulaş.',
    icon: 'crown',
    color: '#FFD700',
    xpReward: 5000,
    coinReward: 2000,
    rarity: 'legendary',
  },
  {
    key: 'ates_efendisi',
    name: 'Ateşin Efendisi',
    description: '7 günlük seri oluştur.',
    icon: 'fire',
    color: '#FF6B35',
    xpReward: 350,
    coinReward: 180,
    rarity: 'rare',
  },
  {
    key: 'demir_irade',
    name: 'Demir İrade',
    description: 'Toplam 30 antrenman tamamla.',
    icon: 'dumbbell',
    color: '#607D8B',
    xpReward: 400,
    coinReward: 200,
    rarity: 'rare',
  },
  {
    key: 'yuz_antrenman',
    name: 'Yüzün Efendisi',
    description: 'Toplam 100 antrenman tamamla.',
    icon: 'trophy',
    color: '#FF9800',
    xpReward: 1000,
    coinReward: 500,
    rarity: 'epic',
  },
  {
    key: 'bir_kabile',
    name: 'Bir Kabile',
    description: 'Bir maceracı grubuna katıl.',
    icon: 'account-group',
    color: '#4CAF50',
    xpReward: 250,
    coinReward: 120,
    rarity: 'common',
  },
  {
    key: 'boss_katili',
    name: 'Boss Katili',
    description: 'Grubunla ilk boss\'u yen.',
    icon: 'skull',
    color: '#F44336',
    xpReward: 800,
    coinReward: 400,
    rarity: 'epic',
  },
  {
    key: 'platin_yolu',
    name: 'Platin\'e Yükseliş',
    description: 'Platin ligine ulaş.',
    icon: 'shield-crown',
    color: '#00BCD4',
    xpReward: 1200,
    coinReward: 600,
    rarity: 'epic',
  },
  {
    key: 'sampiyonluk',
    name: 'Diyarın Efsanesi',
    description: 'Şampiyonluk ligine ulaş.',
    icon: 'crown',
    color: '#FF4DFF',
    xpReward: 5000,
    coinReward: 2500,
    rarity: 'legendary',
  },
  {
    key: 'xp_firtinasi',
    name: 'XP Fırtınası',
    description: 'Toplam 10.000 XP kazan.',
    icon: 'lightning-bolt',
    color: '#FFC107',
    xpReward: 600,
    coinReward: 300,
    rarity: 'rare',
  },
  {
    key: 'xp_seli',
    name: 'XP Seli',
    description: 'Toplam 50.000 XP kazan.',
    icon: 'lightning-bolt-circle',
    color: '#9C27B0',
    xpReward: 2500,
    coinReward: 1000,
    rarity: 'epic',
  },
  {
    key: 'zengin_savasci',
    name: 'Zengin Savaşçı',
    description: 'Toplam 10.000 Gym Coin kazan.',
    icon: 'gold',
    color: '#FFD700',
    xpReward: 500,
    coinReward: 0,
    rarity: 'rare',
  },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.key, a])
);

export async function checkAndAwardAchievements(
  db: any,
  character: any,
  tables: any,
  eq: any,
): Promise<AchievementDef[]> {
  const { characterAchievementsTable } = tables;

  const existing = await db
    .select()
    .from(characterAchievementsTable)
    .where(eq(characterAchievementsTable.characterId, character.id));

  const alreadyHas = new Set(existing.map((a: any) => a.achievementKey));
  const toAward: AchievementDef[] = [];

  function check(key: string, condition: boolean) {
    if (condition && !alreadyHas.has(key)) {
      const def = ACHIEVEMENT_MAP[key];
      if (def) toAward.push(def);
    }
  }

  check('ilk_kan', character.totalWorkouts >= 1);
  check('kahraman_yolu', character.level >= 5);
  check('deneyimli_savasci', character.level >= 10);
  check('sampiyonun_yolu', character.level >= 25);
  check('efsanevi', character.level >= 50);
  check('ates_efendisi', character.questStreak >= 7);
  check('demir_irade', character.totalWorkouts >= 30);
  check('yuz_antrenman', character.totalWorkouts >= 100);
  check('platin_yolu', ['platin', 'sampiyonluk'].includes(character.league));
  check('sampiyonluk', character.league === 'sampiyonluk');
  check('xp_firtinasi', character.totalXpEarned >= 10000);
  check('xp_seli', character.totalXpEarned >= 50000);
  check('zengin_savasci', character.gymCoins >= 10000);

  for (const ach of toAward) {
    const id = `ach_${character.id}_${ach.key}_${Date.now()}`;
    await db.insert(characterAchievementsTable).values({
      id,
      characterId: character.id,
      userId: character.userId,
      achievementKey: ach.key,
      xpReward: ach.xpReward,
      coinReward: ach.coinReward,
    });
  }

  if (toAward.length > 0) {
    const totalXpBonus = toAward.reduce((sum, a) => sum + a.xpReward, 0);
    const totalCoinBonus = toAward.reduce((sum, a) => sum + a.coinReward, 0);
    if (totalXpBonus > 0 || totalCoinBonus > 0) {
      const { processLevelUp, calcStats } = await import("../routes/character.js");
      const lv = processLevelUp(character.exp, character.level, totalXpBonus);
      const stats = calcStats(lv.newLevel, character.class);
      await db
        .update(tables.charactersTable)
        .set({
          totalXpEarned: character.totalXpEarned + totalXpBonus,
          exp: lv.newExp,
          level: lv.newLevel,
          gymCoins: character.gymCoins + totalCoinBonus,
          ...stats,
          updatedAt: new Date(),
        })
        .where(eq(tables.charactersTable.id, character.id));
    }
  }

  return toAward;
}
