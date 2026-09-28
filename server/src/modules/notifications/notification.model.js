import mongoose from 'mongoose';
import { NOTIFICATION_TYPE } from '../../config/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    title: { type: String, required: true },
    body: String,
    link: String, // in-app route, e.g. /account/bookings/<id>
    // Prevents duplicate notifications when a job is retried (e.g. "reminder:<bookingId>").
    dedupeKey: { type: String },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const Notification = mongoose.model('Notification', notificationSchema);
