import mongoose from 'mongoose';
import { EVENT_CATEGORIES, EVENT_STATUS, MODERATION } from '../../config/constants.js';

const tierSchema = new mongoose.Schema(
  { hoursBefore: { type: Number, min: 0 }, refundPercent: { type: Number, min: 0, max: 100 } },
  { _id: false }
);

const policiesSchema = new mongoose.Schema(
  {
    maxSeatsPerBooking: { type: Number, min: 1, max: 10, default: 6 },
    ageLimit: { type: String, default: 'All ages' },
    terms: [{ type: String, maxlength: 300 }],
    cancellation: {
      allowed: { type: Boolean, default: true },
      // e.g. [{hoursBefore: 72, refundPercent: 100}, {hoursBefore: 24, refundPercent: 50}]
      tiers: { type: [tierSchema], default: () => [{ hoursBefore: 72, refundPercent: 100 }, { hoursBefore: 24, refundPercent: 50 }] },
    },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, enum: EVENT_CATEGORIES, required: true },
    bannerUrl: { type: String, maxlength: 500 },
    tags: [{ type: String, maxlength: 30 }],

    // Copied from the venue so discovery never needs a join ("denormalized for reads").
    venueName: String,
    address: String,
    city: { type: String, required: true },
    cityKey: { type: String, required: true }, // lowercase for case-insensitive filtering

    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    salesStartAt: Date,
    salesEndAt: Date,

    status: { type: String, enum: Object.values(EVENT_STATUS), default: EVENT_STATUS.DRAFT },
    publishedAt: Date,
    moderation: { type: String, enum: Object.values(MODERATION), default: MODERATION.ACTIVE },
    moderationReason: String,
    isFeatured: { type: Boolean, default: false },
    highDemand: { type: Boolean, default: false }, // routes buyers through the waiting room (Stage 3)

    policies: { type: policiesSchema, default: () => ({}) },
    blockedSeatLabels: [String], // applied when inventory is generated at first publish
    inventoryGeneratedAt: Date,

    // Denormalized counters for fast listing / sorting / dashboards.
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    totalSeats: { type: Number, default: 0 },
    seatsSold: { type: Number, default: 0 },
    checkedInCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    popularityScore: { type: Number, default: 0 },

    reminderSentAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
  },
  { timestamps: true }
);

// Discovery: "published, active, in <city>, upcoming, sorted by date"
eventSchema.index({ status: 1, moderation: 1, cityKey: 1, startsAt: 1 });
eventSchema.index({ status: 1, moderation: 1, category: 1, startsAt: 1 });
eventSchema.index({ status: 1, moderation: 1, popularityScore: -1 });
eventSchema.index({ status: 1, moderation: 1, minPrice: 1 });
eventSchema.index({ status: 1, isFeatured: 1, startsAt: 1 });

export const Event = mongoose.model('Event', eventSchema);
