import {
  ALL_EXERCISES,
  EXERCISES_BY_CATEGORY,
  type ExerciseDef,
  type ExerciseCategory,
  type Equipment,
  type CharacterClassId,
  type MovementType,
} from './exercises';

export interface UserProfile {
  level: number;
  characterClass: CharacterClassId;
  availableEquipment: Equipment[];
  preferredCategories?: ExerciseCategory[];
  durationMinutes?: number;
}

export interface GeneratedWorkout {
  exercises: GeneratedExerciseEntry[];
  estimatedDurationMin: number;
  focusCategories: ExerciseCategory[];
}

export interface GeneratedExerciseEntry {
  exercise: ExerciseDef;
  sets: number;
  reps: number;
  restSec: number;
}

const CLASS_CATEGORY_PREFERENCE: Record<CharacterClassId, ExerciseCategory[]> = {
  barbarian: ['gogus', 'ust_bacak', 'sirt', 'tam_vucut', 'kalca'],
  fighter: ['gogus', 'sirt', 'omuz', 'ust_bacak', 'triseps'],
  paladin: ['ust_bacak', 'kalca', 'gogus', 'omuz', 'karin'],
  monk: ['karin', 'esneklik', 'ust_bacak', 'kardiyo', 'tam_vucut'],
  rogue: ['kardiyo', 'karin', 'arka_bacak', 'baldır', 'esneklik'],
  ranger: ['kardiyo', 'sirt', 'ust_bacak', 'arka_bacak', 'omuz'],
  wizard: ['karin', 'esneklik', 'kardiyo', 'on_kol', 'omuz'],
  cleric: ['omuz', 'sirt', 'karin', 'ust_bacak', 'esneklik'],
  druid: ['esneklik', 'karin', 'tam_vucut', 'kardiyo', 'kalca'],
  sorcerer: ['karin', 'esneklik', 'biseps', 'triseps', 'kardiyo'],
  warlock: ['gogus', 'triseps', 'omuz', 'karin', 'sirt'],
  bard: ['esneklik', 'karin', 'kardiyo', 'omuz', 'tam_vucut'],
};

function canUse(exercise: ExerciseDef, available: Equipment[]): boolean {
  if (exercise.equipment.length === 1 && exercise.equipment[0] === 'yok') return true;
  return exercise.equipment.every((eq) => eq === 'yok' || available.includes(eq));
}

function difficultyForLevel(level: number): string[] {
  if (level <= 5) return ['baslangic'];
  if (level <= 15) return ['baslangic', 'orta'];
  return ['baslangic', 'orta', 'ileri'];
}

function setsForLevel(level: number, movement: MovementType): number {
  if (movement === 'cardio' || movement === 'flexibility') return 1;
  if (level <= 5) return 3;
  if (level <= 15) return 4;
  return 5;
}

function repsForLevel(level: number, exercise: ExerciseDef): number {
  if (exercise.unit === 'minutes') return 0;
  if (exercise.unit === 'km') return 0;
  const baseReps = level <= 5 ? 8 : level <= 15 ? 10 : 12;
  return Math.min(baseReps, exercise.maxReps ?? 30);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateWorkout(profile: UserProfile): GeneratedWorkout {
  const { level, characterClass, availableEquipment, preferredCategories, durationMinutes = 45 } = profile;

  const allowedDifficulties = difficultyForLevel(level);
  const classPref = CLASS_CATEGORY_PREFERENCE[characterClass] || ['tam_vucut', 'gogus', 'sirt', 'ust_bacak', 'karin'];
  const focusCategories = preferredCategories && preferredCategories.length > 0
    ? preferredCategories
    : classPref.slice(0, 3);

  const targetExerciseCount = Math.max(4, Math.min(8, Math.floor(durationMinutes / 6)));

  const eligible = ALL_EXERCISES.filter(
    (ex) =>
      canUse(ex, availableEquipment) &&
      allowedDifficulties.includes(ex.difficulty),
  );

  const prioritized = eligible.filter((ex) => focusCategories.includes(ex.category));
  const secondary = eligible.filter((ex) => !focusCategories.includes(ex.category));

  const movementBalance: Record<MovementType, number> = { compound: 0, isolation: 0, cardio: 0, flexibility: 0 };
  const usedCategories = new Set<ExerciseCategory>();
  const selected: ExerciseDef[] = [];

  const affinityExercises = prioritized.filter((ex) => ex.classAffinity.includes(characterClass));
  const nonAffinityPriority = prioritized.filter((ex) => !ex.classAffinity.includes(characterClass));

  const pool = [...shuffle(affinityExercises), ...shuffle(nonAffinityPriority), ...shuffle(secondary)];

  for (const ex of pool) {
    if (selected.length >= targetExerciseCount) break;
    if (selected.some((s) => s.id === ex.id)) continue;

    if (movementBalance.compound >= Math.ceil(targetExerciseCount * 0.5) && ex.movement === 'compound') continue;
    if (movementBalance.isolation >= Math.ceil(targetExerciseCount * 0.4) && ex.movement === 'isolation') continue;

    selected.push(ex);
    movementBalance[ex.movement]++;
    usedCategories.add(ex.category);
  }

  const entries: GeneratedExerciseEntry[] = selected.map((ex) => ({
    exercise: ex,
    sets: setsForLevel(level, ex.movement),
    reps: repsForLevel(level, ex),
    restSec: ex.movement === 'compound' ? 90 : ex.movement === 'cardio' ? 30 : 60,
  }));

  const estimatedDurationMin = entries.reduce((sum, e) => {
    if (e.exercise.unit === 'minutes') return sum + (e.exercise.maxMinutes ?? 15);
    return sum + (e.sets * e.reps * (e.exercise.tempoSec || 3)) / 60 + (e.sets * e.restSec) / 60;
  }, 0);

  return {
    exercises: entries,
    estimatedDurationMin: Math.round(estimatedDurationMin),
    focusCategories: [...usedCategories] as ExerciseCategory[],
  };
}
