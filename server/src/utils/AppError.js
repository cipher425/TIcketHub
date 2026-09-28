/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details, code = 'BAD_REQUEST') => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message, details, code = 'CONFLICT') => new AppError(409, code, message, details);
export const gone = (message, code = 'GONE') => new AppError(410, code, message);
export const unprocessable = (message, details, code = 'UNPROCESSABLE') => new AppError(422, code, message, details);
