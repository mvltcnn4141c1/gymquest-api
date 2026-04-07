export function getRaceStatBonus(raceId: string): { strength: number; agility: number; endurance: number } {
  const bonuses: Record<string, { strength: number; agility: number; endurance: number }> = {
    yuce_insan:          { strength: 1, agility: 1, endurance: 1 },
    gece_elfi:           { strength: -1, agility: 4, endurance: 0 },
    dag_cucesi:          { strength: 0, agility: -1, endurance: 4 },
    yarimsoy:            { strength: 0, agility: 3, endurance: 0 },
    tas_ork:             { strength: 6, agility: -2, endurance: -1 },
    cehennem_dogumlsu:   { strength: -1, agility: 2, endurance: 2 },
  };
  return bonuses[raceId] || { strength: 0, agility: 0, endurance: 0 };
}

export function getRaceXpMultiplier(raceId: string, exerciseType: string, charClass: string): number {
  let mult = 1;

  switch (raceId) {
    case 'yuce_insan':
      mult *= 1.05;
      break;
    case 'gece_elfi':
      if (['running', 'cycling', 'jump_rope'].includes(exerciseType)) mult *= 1.12;
      break;
    case 'dag_cucesi':
      if (['deadlift', 'squat', 'plank'].includes(exerciseType)) mult *= 1.12;
      break;
    case 'yarimsoy':
      break;
    case 'tas_ork':
      if (['push_up', 'pull_up', 'deadlift', 'bench_press'].includes(exerciseType)) mult *= 1.15;
      break;
    case 'cehennem_dogumlsu':
      if (['burpee'].includes(exerciseType)) mult *= 1.15;
      if (['plank'].includes(exerciseType)) mult *= 1.10;
      if (charClass === 'mage' || charClass === 'paladin') mult *= 1.20;
      break;
  }

  return mult;
}
