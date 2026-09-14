export class AppError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(message: string): AppError {
    return new AppError(422, 'VALIDATION_ERROR', message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  static internal(message: string): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}

/**
 * Postgres functions in migrations/001_init.sql raise errors shaped like
 * "CODE: human readable message". This maps that convention to an AppError
 * with the right HTTP status, so the Node layer never has to duplicate the
 * business rules already enforced in the database function.
 */
export function fromDbError(error: { message: string } | null): AppError {
  const message = error?.message ?? 'Unknown database error';
  const match = message.match(/^([A-Z_]+):\s*(.*)$/s);

  if (!match) {
    return AppError.internal(message);
  }

  const [, code, detail] = match;

  switch (code) {
    case 'VALIDATION':
      return AppError.validation(detail);
    case 'NOT_FOUND':
      return AppError.notFound(detail);
    case 'INSUFFICIENT_STOCK':
      return AppError.conflict('INSUFFICIENT_STOCK', detail);
    case 'INVALID_STATE':
      return AppError.conflict('INVALID_STATE', detail);
    default:
      return AppError.internal(detail);
  }
}
