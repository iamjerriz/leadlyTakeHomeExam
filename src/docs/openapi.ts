const ErrorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'INSUFFICIENT_STOCK' },
        message: { type: 'string', example: 'only 2 unit(s) available for item ...' },
      },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
};

const ItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    total_quantity: { type: 'integer' },
    available_quantity: { type: 'integer', description: 'total - held - confirmed' },
    held_quantity: { type: 'integer', description: 'quantity currently in active (PENDING) reservations' },
    confirmed_quantity: { type: 'integer' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

const ReservationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    item_id: { type: 'string', format: 'uuid' },
    customer_id: { type: 'string' },
    quantity: { type: 'integer' },
    status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'] },
    created_at: { type: 'string', format: 'date-time' },
    expires_at: { type: 'string', format: 'date-time' },
    confirmed_at: { type: 'string', format: 'date-time', nullable: true },
    cancelled_at: { type: 'string', format: 'date-time', nullable: true },
  },
};

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Inventory Reservation API',
    version: '1.0.0',
    description:
      'Backend API for reserving, confirming, cancelling, and expiring inventory holds for a fictitious store.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Items' },
    { name: 'Reservations' },
    { name: 'Maintenance' },
  ],
  paths: {
    '/v1/items': {
      post: {
        tags: ['Items'],
        summary: 'Create an item',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  initial_quantity: { type: 'integer', minimum: 1 },
                },
                required: ['name', 'initial_quantity'],
              },
              example: { name: 'White T-Shirt', initial_quantity: 5 },
            },
          },
        },
        responses: {
          '201': {
            description: 'Item created',
            content: { 'application/json': { schema: ItemSchema } },
          },
          '422': { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/items/{id}': {
      get: {
        tags: ['Items'],
        summary: 'Get item status (total, available, held, confirmed quantities)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Item status', content: { 'application/json': { schema: ItemSchema } } },
          '404': { description: 'Item not found', content: { 'application/json': { schema: ErrorSchema } } },
          '422': { description: 'Invalid id', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/reservations': {
      post: {
        tags: ['Reservations'],
        summary: 'Create a reservation (temporary hold)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  item_id: { type: 'string', format: 'uuid' },
                  customer_id: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                },
                required: ['item_id', 'customer_id', 'quantity'],
              },
              example: { item_id: '00000000-0000-0000-0000-000000000000', customer_id: 'cust-1', quantity: 1 },
            },
          },
        },
        responses: {
          '201': { description: 'Reservation created (PENDING)', content: { 'application/json': { schema: ReservationSchema } } },
          '404': { description: 'Item not found', content: { 'application/json': { schema: ErrorSchema } } },
          '409': { description: 'Insufficient available quantity', content: { 'application/json': { schema: ErrorSchema } } },
          '422': { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/reservations/{id}': {
      get: {
        tags: ['Reservations'],
        summary: 'Get a reservation by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Reservation', content: { 'application/json': { schema: ReservationSchema } } },
          '404': { description: 'Reservation not found', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/reservations/{id}/confirm': {
      post: {
        tags: ['Reservations'],
        summary: 'Confirm a reservation (retry-safe / idempotent)',
        description:
          'Confirming an already-CONFIRMED reservation returns the same result without deducting again. Confirming an expired or cancelled reservation returns 409.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Reservation confirmed (or already was)', content: { 'application/json': { schema: ReservationSchema } } },
          '404': { description: 'Reservation not found', content: { 'application/json': { schema: ErrorSchema } } },
          '409': { description: 'Reservation is expired or cancelled', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/reservations/{id}/cancel': {
      post: {
        tags: ['Reservations'],
        summary: 'Cancel a pending reservation (retry-safe / idempotent)',
        description:
          'Cancelling an already-CANCELLED or EXPIRED reservation returns the same result without releasing quantity again. Cancelling a CONFIRMED reservation returns 409.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Reservation cancelled (or already was)', content: { 'application/json': { schema: ReservationSchema } } },
          '404': { description: 'Reservation not found', content: { 'application/json': { schema: ErrorSchema } } },
          '409': { description: 'Reservation is already confirmed', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/maintenance/expire-reservations': {
      post: {
        tags: ['Maintenance'],
        summary: 'Sweep pending reservations past their expiry and release held quantity',
        responses: {
          '200': {
            description: 'Number of reservations expired',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { expired_count: { type: 'integer' } } },
              },
            },
          },
        },
      },
    },
  },
};
