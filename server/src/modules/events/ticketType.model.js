import mongoose from 'mongoose';

/**
 * A price category for one event (VIP / Premium / Regular) and the venue sections it covers.
 * Separate collection: organizers edit it on its own, and analytics group sales by it.
 */
const ticketTypeSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 }, // paise
    currency: { type: String, default: 'INR' },
    color: { type: String, default: '#6366f1' },
    sectionKeys: [{ type: String, required: true }],
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const TicketType = mongoose.model('TicketType', ticketTypeSchema);
