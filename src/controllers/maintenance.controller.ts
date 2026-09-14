import { Request, Response } from 'express';
import * as reservationsService from '../services/reservations.service';

export async function expireReservations(_req: Request, res: Response): Promise<void> {
  const expiredCount = await reservationsService.expireReservations();
  res.status(200).json({ expired_count: expiredCount });
}
