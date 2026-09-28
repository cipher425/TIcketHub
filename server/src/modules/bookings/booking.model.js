import mongoose from 'mongoose';
import { BOOKING_STATUS } from '../../config/constants.js';

// Embedded: at most 10 items, written once with the booking and always read with it.
// Prices are SNAPSHOTS - later price changes by the organizer never alter this booking.
const itemSchema = new mongoose.Schema(
  {
    seat: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeat', required: true },
    label: String,
    sectionName: String,
    rowLabel: String,
    ticketType: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketType' },
    ticketTypeName: String,
    price: { type: Number, required: true },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  { from: String, to: String, at: { type: Date, default: Date.now }, reason: String, actor: String },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: Object.values(BOOKING_STATUS), required: true },
    // true only while PENDING / PAYMENT_PROCESSING. A partial unique index on it
    // guarantees one active hold per user per event (anti-hoarding), enforced by the DB.
    isActiveHold: { type: Boolean },
    holdExpiresAt: Date,
    graceApplied: { type: Boolean, default: false },

    // Snapshot for listings ("My bookings") without joins.
    eventTitle: String,
    eventSlug: String,
    eventStartsAt: Date,
    venueName: String,
    city: String,
    bannerUrl: String,

    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    pricing: {
      subtotal: Number,
      convenienceFee: Number,
      tax: Number,
      discount: Number,
      total: Number,
      currency: { type: String, default: 'INR' },
    },
    coupon: { code: String, discount: Number },

    confirmedAt: Date,
    failureReason: String,
    cancellation: {
      at: Date,
      reason: String,
      by: String,
      refundPercent: Number,
      refundAmount: Number,
    },
    statusHistory: [historySchema],
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1, event: 1 }, { unique: true, partialFilterExpression: { isActiveHold: true } });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ user: 1, status: 1, eventStartsAt: 1 });
bookingSchema.index({ event: 1, status: 1 });
bookingSchema.index({ organizer: 1, status: 1, confirmedAt: -1 });
bookingSchema.index({ status: 1, holdExpiresAt: 1 });

export const Booking = mongoose.model('Booking', bookingSchema);
