import { Request, Response } from 'express';
import exercises from '../data/exercises';

export const exerciseController = {
  getAll: (req: Request, res: Response) => {
    res.json(exercises);
  },

  getById: (req: Request, res: Response) => {
    const ex = exercises.find((e) => e.id === req.params.id);
    if (!ex) return res.status(404).json({ error: 'Exercise not found' });
    res.json(ex);
  },
};
