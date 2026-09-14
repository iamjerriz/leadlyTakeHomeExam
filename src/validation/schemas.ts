import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  initial_quantity: z.number().int().positive('initial_quantity must be a positive integer'),
});

export const itemIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const createReservationSchema = z.object({
  item_id: z.string().uuid('item_id must be a valid UUID'),
  customer_id: z.string().trim().min(1, 'customer_id is required'),
  quantity: z.number().int().positive('quantity must be a positive integer'),
});

export const reservationIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});
