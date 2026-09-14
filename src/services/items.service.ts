import { supabase } from '../config/supabaseClient';
import { AppError } from '../utils/AppError';

export interface ItemRow {
  id: string;
  name: string;
  total_quantity: number;
  reserved_quantity: number;
  confirmed_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface ItemView {
  id: string;
  name: string;
  total_quantity: number;
  available_quantity: number;
  held_quantity: number;
  confirmed_quantity: number;
  created_at: string;
  updated_at: string;
}

function toView(item: ItemRow): ItemView {
  return {
    id: item.id,
    name: item.name,
    total_quantity: item.total_quantity,
    available_quantity: item.total_quantity - item.reserved_quantity - item.confirmed_quantity,
    held_quantity: item.reserved_quantity,
    confirmed_quantity: item.confirmed_quantity,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

export async function createItem(name: string, initialQuantity: number): Promise<ItemView> {
  const { data, error } = await supabase
    .from('items')
    .insert({ name, total_quantity: initialQuantity })
    .select()
    .single();

  if (error) {
    throw AppError.internal(error.message);
  }

  return toView(data as ItemRow);
}

export async function getItemById(id: string): Promise<ItemView> {
  const { data, error } = await supabase.from('items').select().eq('id', id).maybeSingle();

  if (error) {
    throw AppError.internal(error.message);
  }

  if (!data) {
    throw AppError.notFound(`Item ${id} does not exist`);
  }

  return toView(data as ItemRow);
}
