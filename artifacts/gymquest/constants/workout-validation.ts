import type { ExerciseDef, ExerciseCategory } from './exercises';
import { EXERCISE_CATEGORIES } from './exercises';

export type WorkoutMode = 'recommended' | 'custom' | 'free';

export interface WorkoutExerciseEntry {
  exercise: ExerciseDef;
  sets: number;
  reps: number;
}

export interface ValidationResult {
  warnings: string[];
}

const TOTAL_SETS_THRESHOLD = 25;
const HIGH_REPS_THRESHOLD = 30;
const MAX_SAME_CATEGORY = 4;

const MOVEMENT_GROUPS: Record<string, string> = {
  gogus: 'upper',
  sirt: 'upper',
  omuz: 'upper',
  biseps: 'upper',
  triseps: 'upper',
  on_kol: 'upper',
  ust_bacak: 'lower',
  arka_bacak: 'lower',
  baldır: 'lower',
  kalca: 'lower',
  karin: 'core',
  tam_vucut: 'full',
  kardiyo: 'cardio',
  esneklik: 'flexibility',
};

export function validateWorkout(entries: WorkoutExerciseEntry[]): ValidationResult {
  const warnings: string[] = [];

  if (entries.length === 0) return { warnings };

  const totalSets = entries.reduce((sum, e) => sum + e.sets, 0);
  if (totalSets > TOTAL_SETS_THRESHOLD) {
    warnings.push(`Toplam set sayisi cok yuksek (${totalSets} set). Sakatlik riskini artirabilir.`);
  }

  const highRepEntries = entries.filter((e) => e.reps > HIGH_REPS_THRESHOLD);
  for (const entry of highRepEntries) {
    warnings.push(`"${entry.exercise.name}" icin tekrar sayisi cok yuksek (${entry.reps} tekrar).`);
  }

  const categoryCounts: Partial<Record<ExerciseCategory, number>> = {};
  for (const entry of entries) {
    const cat = entry.exercise.category;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count && count > MAX_SAME_CATEGORY) {
      const label = EXERCISE_CATEGORIES[cat as ExerciseCategory]?.label || cat;
      warnings.push(`Ayni kas grubundan cok fazla egzersiz: ${label} (${count} egzersiz). Kas yorgunlugu riski.`);
    }
  }

  const movementGroups = new Set(entries.map((e) => MOVEMENT_GROUPS[e.exercise.category] || 'other'));

  if (entries.length >= 3) {
    const hasUpper = movementGroups.has('upper') || movementGroups.has('full');
    const hasLower = movementGroups.has('lower') || movementGroups.has('full');

    if (!hasLower && hasUpper) {
      warnings.push('Alt vucut egzersizi bulunmuyor. Dengeli bir antrenman icin alt vucut da ekleyin.');
    }
    if (!hasUpper && hasLower) {
      warnings.push('Ust vucut egzersizi bulunmuyor. Dengeli bir antrenman icin ust vucut da ekleyin.');
    }
  }

  return { warnings };
}
