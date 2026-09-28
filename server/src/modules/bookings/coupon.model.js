import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: String,
    type: { type: String, enum: ['PERCENT', 'FLAT'], required: true },
    value: { type: Number, required: true, min: 0 }, // percent (0-100) or paise
    maxDiscount: Number, // paise cap for PERCENT coupons
    minSubtotal: { type: Number, default: 0 },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' }, // null = valid for every event
    validFrom: Date,
    validTo: Date,
    usageLimit: Number,
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Coupon = mongoose.model('Coupon', couponSchema);
