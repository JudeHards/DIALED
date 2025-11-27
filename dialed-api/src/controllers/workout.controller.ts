import { Request, Response } from 'express';
import { CreateWorkoutDto, UpdateWorkoutDto, Workout } from '../types/workout';
import exercisesSeed from '../data/exercises';

// Temporary in-memory storage until we set up a database
let workouts: Workout[] = [];

export const workoutController = {
  // Get all workouts
  getAllWorkouts: async (req: Request, res: Response) => {
    try {
      // TODO: Add pagination
      res.json(workouts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch workouts' });
    }
  },

  // Get a single workout by ID
  getWorkoutById: async (req: Request, res: Response) => {
    try {
      const workout = workouts.find(w => w.id === req.params.id);
      if (!workout) {
        return res.status(404).json({ error: 'Workout not found' });
      }
      res.json(workout);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch workout' });
    }
  },

  // Create a new workout
  createWorkout: async (req: Request<{}, {}, CreateWorkoutDto>, res: Response) => {
    try {
      const { name, description, exercises } = req.body;
      
      const workout: Workout = {
        id: Math.random().toString(36).substr(2, 9), // Temporary ID generation
        name,
        description,
        exercises: exercises.map((ex) => {
          // If caller passed an id string (or object with id only), find in seeded exercises
          if (typeof ex === 'string' || (ex as any).id && !(ex as any).sets) {
            const id = typeof ex === 'string' ? ex : (ex as any).id;
            const found = exercisesSeed.find(e => e.id === id);
            if (found) {
              return {
                id: Math.random().toString(36).substr(2, 9),
                name: found.name,
                primaryMuscle: found.primaryMuscle,
                secondaryMuscles: found.secondaryMuscles,
                equipment: found.equipment,
                movement: found.movement,
                laterality: found.laterality,
                sets: found.sets.map(s => ({ reps: null, weight: null, completed: false })),
              };
            }
          }

          // Otherwise assume full exercise object provided
          return {
            id: Math.random().toString(36).substr(2, 9),
            ...(ex as any),
            sets: (ex as any).sets?.map((set: any) => ({ reps: set.reps ?? null, weight: set.weight ?? null, completed: false })) ?? [],
          };
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'temp-user-id', // TODO: Get from auth context
      };

      workouts.push(workout);
      res.status(201).json(workout);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create workout' });
    }
  },

  // Update a workout
  updateWorkout: async (req: Request<{ id: string }, {}, UpdateWorkoutDto>, res: Response) => {
    try {
      const workoutIndex = workouts.findIndex(w => w.id === req.params.id);
      if (workoutIndex === -1) {
        return res.status(404).json({ error: 'Workout not found' });
      }

      const existing = workouts[workoutIndex];
      const body = req.body || {};

      // Normalize exercises: ensure each exercise has an id and completed flags on sets
      const mergedExercises = body.exercises
        ? body.exercises.map((ex, i) => ({
            id: ex.id ?? existing.exercises[i]?.id ?? Math.random().toString(36).substr(2, 9),
            name: ex.name,
            sets: ex.sets.map(s => ({ reps: s.reps, weight: s.weight, completed: s.completed ?? false })),
            notes: ex.notes
          }))
        : existing.exercises;

      const updatedWorkout: Workout = {
        ...existing,
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        exercises: mergedExercises,
        updatedAt: new Date()
      };

      workouts[workoutIndex] = updatedWorkout;
      res.json(updatedWorkout);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update workout' });
    }
  },

  // Delete a workout
  deleteWorkout: async (req: Request, res: Response) => {
    try {
      const workoutIndex = workouts.findIndex(w => w.id === req.params.id);
      if (workoutIndex === -1) {
        return res.status(404).json({ error: 'Workout not found' });
      }

      workouts = workouts.filter(w => w.id !== req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete workout' });
    }
  },

  // Start a workout (creates a new workout instance from a template)
  startWorkout: async (req: Request, res: Response) => {
    try {
      const template = workouts.find(w => w.id === req.params.id && w.isTemplate);
      if (!template) {
        return res.status(404).json({ error: 'Workout template not found' });
      }

      const newWorkout: Workout = {
        ...template,
        id: Math.random().toString(36).substr(2, 9),
        isTemplate: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        exercises: template.exercises.map(ex => ({
          ...ex,
          id: Math.random().toString(36).substr(2, 9),
          sets: ex.sets.map(set => ({ ...set, completed: false }))
        }))
      };

      workouts.push(newWorkout);
      res.status(201).json(newWorkout);
    } catch (error) {
      res.status(500).json({ error: 'Failed to start workout' });
    }
  },

  // Update exercise completion status
  updateExerciseSet: async (req: Request, res: Response) => {
    try {
      const { workoutId, exerciseId, setIndex } = req.params;
      const { completed } = req.body as { completed: boolean };

      const workout = workouts.find(w => w.id === workoutId);
      if (!workout) {
        return res.status(404).json({ error: 'Workout not found' });
      }

      const exercise = workout.exercises.find(e => e.id === exerciseId);
      if (!exercise) {
        return res.status(404).json({ error: 'Exercise not found' });
      }

      const idx = Number(setIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= exercise.sets.length) {
        return res.status(400).json({ error: 'Invalid set index' });
      }

      exercise.sets[idx].completed = !!completed;
      workout.updatedAt = new Date();

      res.json(exercise);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update exercise set' });
    }
  }
};