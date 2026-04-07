import type { CharacterClass } from '@/context/GameContext';

export interface DnDClass {
  id: CharacterClass;
  name: string;
  nameEn: string;
  description: string;
  primaryAttribute: string;
  attributeLabel: string;
  icon: string;
  color: string;
  statBonus: { strength: number; agility: number; endurance: number };
  xpBonusCategories: string[];
  xpBonusMultiplier: number;
  classAbility: string;
  playstyle: string;
  lore: string;
}

export const DND_CLASSES: DnDClass[] = [
  {
    id: 'barbarian',
    name: 'Barbar',
    nameEn: 'Barbarian',
    description: 'Saf güç ve öfkenin ustası. Ağır antrenmanlar onun için oyun.',
    primaryAttribute: 'Güç (STR)',
    attributeLabel: 'STR',
    icon: 'axe',
    color: '#C0392B',
    statBonus: { strength: 4, agility: 0, endurance: 2 },
    xpBonusCategories: ['gogus', 'sirt', 'tam_vucut'],
    xpBonusMultiplier: 1.20,
    classAbility: 'Öfke: Güç egzersizlerinden +20% XP. Her 5 seviyede bir "Öfke Patlaması" ile bonus XP patikası açılır.',
    playstyle: 'Tam güç antrenmanı. Deadlift, Squat, Bench Press.',
    lore: 'Yabanın kalbinden gelen Barbar, savaş çığlığıyla rakiplerini titretir. Kasları demirden, iradesi granit gibidir.',
  },
  {
    id: 'fighter',
    name: 'Savaşçı',
    nameEn: 'Fighter',
    description: 'Dengeli bir muharip. Her egzersizden verimli XP alır.',
    primaryAttribute: 'Güç/Dayanıklılık (STR/CON)',
    attributeLabel: 'STR/CON',
    icon: 'sword',
    color: '#E74C3C',
    statBonus: { strength: 2, agility: 1, endurance: 3 },
    xpBonusCategories: ['gogus', 'karin', 'tam_vucut'],
    xpBonusMultiplier: 1.12,
    classAbility: 'İkinci Nefes: Günde bir kez antrenman sonrası bonus 50 XP. Tüm egzersizlerden dengeli XP.',
    playstyle: 'Her antrenman türünden faydalanır. Dengeli program.',
    lore: 'Yılların eğitimiyle donanmış Savaşçı, her duruma adapte olur. İrade ve disiplin onun silahıdır.',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    nameEn: 'Paladin',
    description: 'Dayanıklılık ve güç simbiyozu. Grup çalışmalarından bonus alır.',
    primaryAttribute: 'Güç/Karizma (STR/CHA)',
    attributeLabel: 'STR/CHA',
    icon: 'shield-star',
    color: '#F39C12',
    statBonus: { strength: 2, agility: 0, endurance: 4 },
    xpBonusCategories: ['ust_bacak', 'karin', 'esneklik'],
    xpBonusMultiplier: 1.15,
    classAbility: 'İlahi Işık: Grup antrenmanlarında +25% XP. Streak devam ettiğinde her gün artan bonus.',
    playstyle: 'Uzun mesafe, squat, deadlift ve esneklik.',
    lore: 'Kutsal yeminlere bağlı Paladin, hem fizik hem ruh sağlığını dengeler. İman etmek yeterli değil, kanıtlamak gerekir.',
  },
  {
    id: 'monk',
    name: 'Keşiş',
    nameEn: 'Monk',
    description: 'Çeviklik ve zihin kontrolünün ustası. Esneklik ve kardiyo onun alameti.',
    primaryAttribute: 'Çeviklik/Bilgelik (DEX/WIS)',
    attributeLabel: 'DEX/WIS',
    icon: 'meditation',
    color: '#E67E22',
    statBonus: { strength: 0, agility: 4, endurance: 2 },
    xpBonusCategories: ['esneklik', 'kardiyo', 'karin'],
    xpBonusMultiplier: 1.20,
    classAbility: 'Boş El Ustalığı: Ekipmansız egzersizlerden +20% XP. Meditatif odak ile streak bonusu x1.5.',
    playstyle: 'Yoga, esneklik, karın, serbest vücut egzersizleri.',
    lore: 'Keşiş, bedenini zihnin aracına dönüştürür. Hareket meditasyondur, nefes silahdır.',
  },
  {
    id: 'rogue',
    name: 'Haydut',
    nameEn: 'Rogue',
    description: 'Hız ve hassasiyetin süikastçısı. Sprint ve kardiyo onun güçlü yanı.',
    primaryAttribute: 'Çeviklik (DEX)',
    attributeLabel: 'DEX',
    icon: 'ninja',
    color: '#2C3E50',
    statBonus: { strength: 0, agility: 5, endurance: 1 },
    xpBonusCategories: ['kardiyo', 'baldır', 'karin'],
    xpBonusMultiplier: 1.18,
    classAbility: 'Gizli Saldırı: Günün ilk antrenmanında +18% bonus XP. Sprint ve HIIT\'ten ekstra hasar.',
    playstyle: 'Koşu, sprint, jumping jack, ip atlama.',
    lore: 'Karanlıkta doğmuş Haydut, gözler kapalı koşar. Hız onun zırhı, sürpriz onun kılıcıdır.',
  },
  {
    id: 'ranger',
    name: 'İzci',
    nameEn: 'Ranger',
    description: 'Dayanıklılık ve doğa. Uzun mesafe ve açık hava egzersizlerinde üstün.',
    primaryAttribute: 'Çeviklik/Bilgelik (DEX/WIS)',
    attributeLabel: 'DEX/WIS',
    icon: 'bow-arrow',
    color: '#27AE60',
    statBonus: { strength: 1, agility: 3, endurance: 2 },
    xpBonusCategories: ['kardiyo', 'arka_bacak', 'ust_bacak'],
    xpBonusMultiplier: 1.15,
    classAbility: 'Doğa\'nın Yolu: Koşu ve bisikletten +15% XP. 7+ günlük streakta dayanıklılık bonusu.',
    playstyle: 'Koşu, yürüyüş, bisiklet, bacak egzersizleri.',
    lore: 'Ormanların sessiz koruyucusu İzci, saatler boyunca yürür. Doğayla uyum içinde hareket eder.',
  },
  {
    id: 'wizard',
    name: 'Büyücü',
    nameEn: 'Wizard',
    description: 'Teknik ve zeka ile antrenman. Form mükemmeliyetinden bonus alır.',
    primaryAttribute: 'Zeka (INT)',
    attributeLabel: 'INT',
    icon: 'auto-fix',
    color: '#8E44AD',
    statBonus: { strength: 0, agility: 2, endurance: 3 },
    xpBonusCategories: ['esneklik', 'karin', 'omuz'],
    xpBonusMultiplier: 1.12,
    classAbility: 'Büyülü Analiz: İleri seviye egzersizlerden +12% XP. Doğrulanmış antrenmanlarda +10% bonus XP.',
    playstyle: 'Teknik egzersizler, omuz, core, esneklik.',
    lore: 'Büyücü kitapları ezberlediği gibi egzersiz formunu inceler. Her harekette mükemmeliyeti arar.',
  },
  {
    id: 'cleric',
    name: 'Din Adamı',
    nameEn: 'Cleric',
    description: 'İyileşme ve dayanıklılık. Rehabilitasyon ve esneklik egzersizlerinde üstün.',
    primaryAttribute: 'Bilgelik (WIS)',
    attributeLabel: 'WIS',
    icon: 'hospital-box-outline',
    color: '#F8C471',
    statBonus: { strength: 1, agility: 1, endurance: 4 },
    xpBonusCategories: ['esneklik', 'karin', 'kardiyo'],
    xpBonusMultiplier: 1.10,
    classAbility: 'İlahi İyileşme: Hafif yoğunluklu antrenmanlar da tam XP. Grubuna +10% XP bonusu verir.',
    playstyle: 'Esneklik, yürüyüş, hafif kardiyo, core.',
    lore: 'Din Adamı şifa vermek için güçlenir. Düzenli antrenman onun ibadetidir, her set bir dua.',
  },
  {
    id: 'druid',
    name: 'Druid',
    nameEn: 'Druid',
    description: 'Doğanın çocuğu. Açık hava ve doğal hareketlerden ekstra güç alır.',
    primaryAttribute: 'Bilgelik (WIS)',
    attributeLabel: 'WIS',
    icon: 'leaf',
    color: '#1E8449',
    statBonus: { strength: 1, agility: 2, endurance: 3 },
    xpBonusCategories: ['esneklik', 'tam_vucut', 'kardiyo'],
    xpBonusMultiplier: 1.12,
    classAbility: 'Doğa Şekli: Ekipmansız ve açık hava antrenmanlarda +12% XP. Her hava koşulunda antrenman yapınca bonus.',
    playstyle: 'Yoga, yüzme, koşu, doğal hareketler.',
    lore: 'Druid doğayla konuşur. Yağmurda koşar, çimenlikte uzanır, ağaçlarda tırmanır.',
  },
  {
    id: 'sorcerer',
    name: 'Sihirbaz',
    nameEn: 'Sorcerer',
    description: 'Doğuştan gelen güç. Yüksek yoğunluklu antrenmanlarda patlar.',
    primaryAttribute: 'Karizma (CHA)',
    attributeLabel: 'CHA',
    icon: 'lightning-bolt',
    color: '#9B59B6',
    statBonus: { strength: 2, agility: 3, endurance: 1 },
    xpBonusCategories: ['tam_vucut', 'kardiyo', 'gogus'],
    xpBonusMultiplier: 1.18,
    classAbility: 'Büyü Patlaması: HIIT ve Burpee\'den +18% XP. Kaotik enerjiyle rastgele bonus XP (1-50) her antrenmanda.',
    playstyle: 'Burpee, HIIT, box jump, yüksek yoğunluk.',
    lore: 'Sihirbaz büyüyü öğrenmez, taşır. Her hücresinde titiz enerji olan bu savaşçı için sınır yoktur.',
  },
  {
    id: 'warlock',
    name: 'Büyücü Pakt',
    nameEn: 'Warlock',
    description: 'Karanlık bir güçle pakt kurmuş. Kısa, yoğun interval antrenmanlarda rakipsiz.',
    primaryAttribute: 'Karizma/Zeka (CHA/INT)',
    attributeLabel: 'CHA/INT',
    icon: 'eye-circle',
    color: '#6C3483',
    statBonus: { strength: 2, agility: 2, endurance: 2 },
    xpBonusMultiplier: 1.15,
    xpBonusCategories: ['tam_vucut', 'biseps', 'triseps'],
    classAbility: 'Hamisi\'nin Laneti: Her 3 antrenmanda bir, bir sonraki antrenmandan +30% XP. Kısa ama güçlü.',
    playstyle: 'Ağır üst vücut, compound hareketler.',
    lore: 'Pakt karanlıkta yapıldı. Verdiği söz sonsuzdur. Her tekrar o sözün karşılığıdır.',
  },
  {
    id: 'bard',
    name: 'Ozan',
    nameEn: 'Bard',
    description: 'Dans ve ritim ustası. Çeşitli egzersizlerden bonus alır, grubu güçlendirir.',
    primaryAttribute: 'Karizma (CHA)',
    attributeLabel: 'CHA',
    icon: 'music-note',
    color: '#E91E8C',
    statBonus: { strength: 1, agility: 3, endurance: 2 },
    xpBonusCategories: ['kardiyo', 'esneklik', 'karin'],
    xpBonusMultiplier: 1.10,
    classAbility: 'İlham Verici: Tüm egzersiz türlerinden dengeli XP. Grupla birlikte antrenman yapınca +25% XP. Her günlük görev serisini tamamlayınca bonus.',
    playstyle: 'Değişken, her tür egzersiz. Dans, aerobik, esneklik.',
    lore: 'Ozan müzikle yaşar, müzikle çalışır. Ayak ritmi onun antrenman programıdır.',
  },
];

export const DND_CLASS_MAP: Record<string, DnDClass> = Object.fromEntries(
  DND_CLASSES.map((c) => [c.id, c])
);

export const DND_CLASS_ICONS: Record<string, string> = Object.fromEntries(
  DND_CLASSES.map((c) => [c.id, c.icon])
);

export const DND_CLASS_COLORS: Record<string, string> = Object.fromEntries(
  DND_CLASSES.map((c) => [c.id, c.color])
);

export function getClassXPMultiplier(classId: string, exerciseCategory: string): number {
  const cls = DND_CLASS_MAP[classId];
  if (!cls) return 1;
  if (cls.xpBonusCategories.includes(exerciseCategory)) return cls.xpBonusMultiplier;
  return 1;
}
