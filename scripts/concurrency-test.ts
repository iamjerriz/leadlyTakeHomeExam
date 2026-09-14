/**
 * Demonstrates that concurrent, overlapping reservation requests cannot
 * oversell an item's stock.
 *
 * Creates an item with 5 units, then fires 10 concurrent 1-unit reservation
 * requests. Exactly 5 should succeed (201) and 5 should be rejected with 409
 * INSUFFICIENT_STOCK. The script fails loudly if that invariant is broken.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 npm run concurrency-test
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const STOCK = 5;
const CONCURRENT_REQUESTS = 10;

interface ItemView {
  id: string;
  total_quantity: number;
  available_quantity: number;
  held_quantity: number;
  confirmed_quantity: number;
}

async function createItem(): Promise<ItemView> {
  const res = await fetch(`${BASE_URL}/v1/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Concurrency Test Item ${Date.now()}`, initial_quantity: STOCK }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create item: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<ItemView>;
}

async function attemptReservation(itemId: string, customerIndex: number): Promise<number> {
  const res = await fetch(`${BASE_URL}/v1/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, customer_id: `customer-${customerIndex}`, quantity: 1 }),
  });
  return res.status;
}

async function main(): Promise<void> {
  console.log(`Creating item with ${STOCK} units...`);
  const item = await createItem();
  console.log(`Item created: ${item.id}`);

  console.log(`Firing ${CONCURRENT_REQUESTS} concurrent reservation requests for 1 unit each...`);
  const statuses = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => attemptReservation(item.id, i)),
  );

  const succeeded = statuses.filter((s) => s === 201).length;
  const rejected = statuses.filter((s) => s === 409).length;
  const unexpected = statuses.filter((s) => s !== 201 && s !== 409);

  console.log(`Succeeded (201): ${succeeded}`);
  console.log(`Rejected (409):  ${rejected}`);
  if (unexpected.length > 0) {
    console.log(`Unexpected statuses: ${unexpected.join(', ')}`);
  }

  const itemRes = await fetch(`${BASE_URL}/v1/items/${item.id}`);
  const finalItem = (await itemRes.json()) as ItemView;
  console.log('Final item state:', finalItem);

  const ok = succeeded === STOCK && rejected === CONCURRENT_REQUESTS - STOCK && finalItem.available_quantity === 0;

  if (!ok) {
    console.error('FAILED: overselling or inconsistent state detected.');
    process.exit(1);
  }

  console.log(`PASSED: exactly ${STOCK} reservations succeeded, stock was never oversold.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
