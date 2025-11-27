import { Router } from 'express';
import { workoutController } from '../controllers/workout.controller';

const router = Router();

// Get all workouts
router.get('/', workoutController.getAllWorkouts);

// Get a specific workout
router.get('/:id', workoutController.getWorkoutById);

// Create a new workout
router.post('/', workoutController.createWorkout);

// Update a workout
router.put('/:id', workoutController.updateWorkout);

// Delete a workout
router.delete('/:id', workoutController.deleteWorkout);

// Start a workout from template
router.post('/:id/start', workoutController.startWorkout);

// Update exercise set completion
router.patch('/:workoutId/exercises/:exerciseId/sets/:setIndex', workoutController.updateExerciseSet);

export const workoutRoutes = router;