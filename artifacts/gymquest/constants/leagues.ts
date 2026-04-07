export type LeagueTier = 'demir' | 'bronz' | 'gumus' | 'altin' | 'platin' | 'sampiyonluk';

export interface League {
  id: LeagueTier;
  name: string;
  icon: string;
  color: string;
  glowColor: string;
  minXp: number;
  maxXp: number;
  nextLeague?: LeagueTier;
}

export const LEAGUES: League[] = [
  {
    id: 'demir',
    name: 'Demir',
    icon: 'shield-outline',
    color: '#8B7355',
    glowColor: '#6B5335',
    minXp: 0,
    maxXp: 2999,
    nextLeague: 'bronz',
  },
  {
    id: 'bronz',
    name: 'Bronz',
    icon: 'shield-half-full',
    color: '#CD7F32',
    glowColor: '#A0522D',
    minXp: 3000,
    maxXp: 9999,
    nextLeague: 'gumus',
  },
  {
    id: 'gumus',
    name: 'Gümüş',
    icon: 'shield',
    color: '#C0C0C0',
    glowColor: '#909090',
    minXp: 10000,
    maxXp: 24999,
    nextLeague: 'altin',
  },
  {
    id: 'altin',
    name: 'Altın',
    icon: 'shield-star',
    color: '#FFD700',
    glowColor: '#B8960C',
    minXp: 25000,
    maxXp: 59999,
    nextLeague: 'platin',
  },
  {
    id: 'platin',
    name: 'Platin',
    icon: 'shield-crown',
    color: '#00D4FF',
    glowColor: '#0099BB',
    minXp: 60000,
    maxXp: 149999,
    nextLeague: 'sampiyonluk',
  },
  {
    id: 'sampiyonluk',
    name: 'Şampiyonluk',
    icon: 'crown',
    color: '#FF4DFF',
    glowColor: '#CC00CC',
    minXp: 150000,
    maxXp: Infinity,
    nextLeague: undefined,
  },
];

export const LEAGUE_MAP: Record<LeagueTier, League> = Object.fromEntries(
  LEAGUES.map((l) => [l.id, l])
) as Record<LeagueTier, League>;

export function getLeagueFromXp(totalXp: number): League {
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    if (totalXp >= LEAGUES[i].minXp) return LEAGUES[i];
  }
  return LEAGUES[0];
}

export function getLeagueProgress(totalXp: number): number {
  const league = getLeagueFromXp(totalXp);
  if (league.maxXp === Infinity) return 1;
  const range = league.maxXp - league.minXp;
  const progress = totalXp - league.minXp;
  return Math.min(progress / range, 1);
}
