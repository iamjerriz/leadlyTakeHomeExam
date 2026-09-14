import { Request, Response } from 'express';
import * as reservationsService from '../services/reservations.service';

export async function createReservation(req: Request, res: Response): Promise<void> {
  const { item_id, customer_id, quantity } = req.body as {
    item_id: string;
    customer_id: string;
    quantity: number;
  };
  const reservation = await reservationsService.reserveStock(item_id, customer_id, quantity);
  res.status(201).json(reservation);
}

export async function confirmReservation(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as { id: string };
  const reservation = await reservationsService.confirmReservation(id);
  res.status(200).json(reservation);
}

export async function cancelReservation(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as { id: string };
  const reservation = await reservationsService.cancelReservation(id);
  res.status(200).json(reservation);
}

export async function getReservation(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as { id: string };
  const reservation = await reservationsService.getReservationById(id);
  res.status(200).json(reservation);
}
