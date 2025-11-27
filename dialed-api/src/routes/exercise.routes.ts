import { Router } from 'express';
import { exerciseController } from '../controllers/exercise.controller';

const router = Router();

router.get('/', exerciseController.getAll);
router.get('/:id', exerciseController.getById);

export const exerciseRoutes = router;
