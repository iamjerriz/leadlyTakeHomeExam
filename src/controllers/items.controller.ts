import { Request, Response } from 'express';
import * as itemsService from '../services/items.service';

export async function createItem(req: Request, res: Response): Promise<void> {
  const { name, initial_quantity } = req.body as { name: string; initial_quantity: number };
  const item = await itemsService.createItem(name, initial_quantity);
  res.status(201).json(item);
}

export async function getItem(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as { id: string };
  const item = await itemsService.getItemById(id);
  res.status(200).json(item);
}
