import mongoose from 'mongoose';
import { SEAT_STATUS } from '../../config/constants.js';

/**
 * One document per seat per event. THIS is the collection buyers compete over.
 *
 * Why not an array inside Event? Thousands of concurrent holds would all write the same
 * document (a hotspot), and big venues would approach MongoDB's 16MB document limit.
 * Separate small documents = MongoDB can update different seats in parallel, and each
 * single-document update is atomic.
 */
const eventSeatSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    ticketType: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketType' },
    sectionKey: { type: String, required: true },
    sectionName: String,
    rowLabel: { type: String, required: true },
    number: { type: Number, required: true },
    label: { type: String, required: true },
    x: Number,
    y: Number,

    status: { type: String, enum: Object.values(SEAT_STATUS), default: SEAT_STATUS.AVAILABLE },
    holdId: { type: mongoose.Schema.Types.ObjectId }, // = the Booking _id that holds it
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdExpiresAt: Date,
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: false, versionKey: false }
);

eventSeatSchema.index({ event: 1, label: 1 }, { unique: true });
eventSeatSchema.index({ event: 1, status: 1 });
eventSeatSchema.index({ holdId: 1 }, { sparse: true });
eventSeatSchema.index({ status: 1, holdExpiresAt: 1 });

export const EventSeat = mongoose.model('EventSeat', eventSeatSchema);
