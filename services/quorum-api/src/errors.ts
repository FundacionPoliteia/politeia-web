export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(label = 'Recurso') {
  return new ApiError(404, 'not_found', `${label} no encontrado`);
}
