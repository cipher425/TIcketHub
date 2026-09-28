import { badRequest } from '../utils/AppError.js';

/**
 * validate({ body, query, params }) with zod schemas.
 * Parsed (typed, defaulted, stripped of unknown keys) values are placed on req.valid.
 * Because unknown keys are stripped and types enforced, payloads like { "email": { "$gt": "" } }
 * never reach MongoDB (NoSQL operator injection).
 */
export const validate = (schemas) => (req, _res, next) => {
  const valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw badRequest('Validation failed', details, 'VALIDATION_ERROR');
    }
    valid[part] = result.data;
  }
  req.valid = valid;
  next();
};
