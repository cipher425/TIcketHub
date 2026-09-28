import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../../config/constants.js';

/** One document per payment ATTEMPT. A booking may have several (retries after a failure). */
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true, unique: true },
    // Unique: the same gateway payment can never be applied twice.
    providerPaymentId: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.CREATED },
    capturedAt: Date,
    failureReason: String,
    refund: {
      id: String,
      amount: Number,
      status: String,
      reason: String,
      requestedAt: Date,
      processedAt: Date,
      attempts: { type: Number, default: 0 },
      lastError: String,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1, updatedAt: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
