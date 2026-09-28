import { z } from 'zod';
import { EVENT_CATEGORIES } from '../../config/constants.js';
import { objectId, paginationQuery } from '../../utils/http.js';

const date = z.coerce.date();

const policiesSchema = z.object({
  maxSeatsPerBooking: z.coerce.number().int().min(1).max(10).optional(),
  ageLimit: z.string().trim().max(40).optional(),
  terms: z.array(z.string().trim().min(1).max(300)).max(15).optional(),
  cancellation: z
    .object({
      allowed: z.boolean(),
      tiers: z
        .array(z.object({ hoursBefore: z.coerce.number().min(0).max(24 * 60), refundPercent: z.coerce.number().int().min(0).max(100) }))
        .max(5)
        .default([]),
    })
    .optional(),
});

const eventFields = {
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(20, 'Description should be at least 20 characters').max(5000),
  category: z.enum(EVENT_CATEGORIES),
  venueId: objectId,
  bannerUrl: z.string().trim().url('Banner must be a valid URL').max(500).or(z.literal('')).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
  startsAt: date,
  endsAt: date,
  salesStartAt: date.optional().nullable(),
  salesEndAt: date.optional().nullable(),
  policies: policiesSchema.optional(),
};

const datesOk = (e) => !e.startsAt || !e.endsAt || e.endsAt > e.startsAt;
const datesMsg = { message: 'End time must be after start time', path: ['endsAt'] };

export const createEventSchema = z.object(eventFields).refine(datesOk, datesMsg);
export const updateEventSchema = z.object(eventFields).partial().refine(datesOk, datesMsg);

export const ticketTypesSchema = z.object({
  ticketTypes: z
    .array(
      z.object({
        id: objectId.optional(),
        name: z.string().trim().min(1).max(40),
        description: z.string().trim().max(200).optional(),
        price: z.coerce.number().int().min(0).max(10_000_000), // paise (max Rs 1,00,000)
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        sectionKeys: z.array(z.string().min(1)).min(1, 'Assign at least one section'),
      })
    )
    .min(1)
    .max(8),
});

export const seatingSchema = z.object({ blockedSeatLabels: z.array(z.string().min(1).max(10)).max(5000) });

export const cancelEventSchema = z.object({ reason: z.string().trim().min(5).max(300) });

export const listEventsQuery = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(60).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  from: date.optional(),
  to: date.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['date', 'price_asc', 'price_desc', 'popularity']).default('date'),
  ...paginationQuery,
});

export const organizerEventsQuery = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CANCELLED']).optional(),
  ...paginationQuery,
});
