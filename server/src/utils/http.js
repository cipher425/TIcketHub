import mongoose from 'mongoose';
import { z } from 'zod';

/** Standard success envelope: { data, meta? } */
export function ok(res, data, meta, status = 200) {
  const body = { data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export const created = (res, data) => ok(res, data, undefined, 201);

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: 'Invalid id' });

export const idParams = z.object({ id: objectId });

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
};

export function pageMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
