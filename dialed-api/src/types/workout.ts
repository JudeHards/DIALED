export enum Muscle {
  Chest = 'chest',
  Back = 'back',
  Shoulders = 'shoulders',
  Biceps = 'biceps',
  Triceps = 'triceps',
  Quads = 'quads',
  Hamstrings = 'hamstrings',
  Glutes = 'glutes',
  Calves = 'calves',
  Core = 'core',
}

export type Laterality = 'unilateral' | 'bilateral' | 'either';

export interface ExerciseSet {
  reps?: number | null;
  weight?: number | null;
  completed: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle?: Muscle;
  secondaryMuscles?: Muscle[];
  equipment?: string; // e.g., barbell, dumbbell, cable
  movement?: string; // e.g., compound, isolation
  laterality?: Laterality;
  sets: ExerciseSet[];
  notes?: string;
}

export interface Workout {
  id: string;
  name: string;
  description?: string;
  exercises: Exercise[];
  duration?: number; // in minutes
  createdAt: Date;
  updatedAt: Date;
  userId: string; // Reference to the user who created the workout
  isTemplate?: boolean; // Whether this is a template or an actual workout
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description?: string;
  exercises: Omit<Exercise, 'sets'>[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

// Request/Response types for better type safety
export interface CreateWorkoutDto {
  name: string;
  description?: string;
  exercises: Array<{
    name: string;
    primaryMuscle?: Muscle;
    secondaryMuscles?: Muscle[];
    equipment?: string;
    movement?: string;
    laterality?: Laterality;
    sets: Array<{
      reps?: number | null;
      weight?: number | null;
    }>;
    notes?: string;
  }>;
}

export interface UpdateWorkoutDto {
  name?: string;
  description?: string;
  exercises?: Array<{
    id?: string;
    name: string;
    primaryMuscle?: Muscle;
    secondaryMuscles?: Muscle[];
    equipment?: string;
    movement?: string;
    laterality?: Laterality;
    sets: Array<{
      reps?: number | null;
      weight?: number | null;
      completed?: boolean;
    }>;
    notes?: string;
  }>;
}