import mongoose from 'mongoose';

/** Gateways deliver webhooks "at least once". A unique event id makes processing idempotent. */
const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true, unique: true },
    type: String,
    processedAt: Date,
    error: String,
  },
  { timestamps: true }
);

webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
