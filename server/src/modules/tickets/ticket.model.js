import mongoose from 'mongoose';
import { TICKET_STATUS } from '../../config/constants.js';

/**
 * One ticket per seat. Separate from Booking because each ticket has its own lifecycle
 * (ACTIVE -> USED at the gate) and is looked up on its own by the QR code.
 */
const ticketSchema = new mongoose.Schema(
  {
    // The QR code encodes ONLY this random value - no names, emails or booking data.
    ticketCode: { type: String, required: true, unique: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    bookingRef: String,
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seat: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSeat', required: true },

    // Display snapshot
    holderName: String,
    eventTitle: String,
    venueName: String,
    venueAddress: String,
    startsAt: Date,
    endsAt: Date,
    sectionName: String,
    rowLabel: String,
    seatLabel: String,
    ticketTypeName: String,
    price: Number,

    status: { type: String, enum: Object.values(TICKET_STATUS), default: TICKET_STATUS.ACTIVE },
    usedAt: Date,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ticketSchema.index({ user: 1, startsAt: -1 });
ticketSchema.index({ event: 1, status: 1 });

export const Ticket = mongoose.model('Ticket', ticketSchema);
