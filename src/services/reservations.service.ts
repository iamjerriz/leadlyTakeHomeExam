import { supabase } from '../config/supabaseClient';
import { env } from '../config/env';
import { AppError, fromDbError } from '../utils/AppError';

export interface ReservationRow {
  id: string;
  item_id: string;
  customer_id: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
}

export async function reserveStock(
  itemId: string,
  customerId: string,
  quantity: number,
): Promise<ReservationRow> {
  const { data, error } = await supabase.rpc('fn_reserve_stock', {
    p_item_id: itemId,
    p_customer_id: customerId,
    p_quantity: quantity,
    p_ttl_minutes: env.reservationTtlMinutes,
  });

  if (error) {
    throw fromDbError(error);
  }

  return data as ReservationRow;
}

export async function confirmReservation(reservationId: string): Promise<ReservationRow> {
  const { data, error } = await supabase.rpc('fn_confirm_reservation', {
    p_reservation_id: reservationId,
  });

  if (error) {
    throw fromDbError(error);
  }

  return data as ReservationRow;
}

export async function cancelReservation(reservationId: string): Promise<ReservationRow> {
  const { data, error } = await supabase.rpc('fn_cancel_reservation', {
    p_reservation_id: reservationId,
  });

  if (error) {
    throw fromDbError(error);
  }

  return data as ReservationRow;
}

export async function expireReservations(): Promise<number> {
  const { data, error } = await supabase.rpc('fn_expire_reservations');

  if (error) {
    throw fromDbError(error);
  }

  return data as number;
}

export async function getReservationById(id: string): Promise<ReservationRow> {
  const { data, error } = await supabase.from('reservations').select().eq('id', id).maybeSingle();

  if (error) {
    throw AppError.internal(error.message);
  }

  if (!data) {
    throw AppError.notFound(`Reservation ${id} does not exist`);
  }

  return data as ReservationRow;
}
