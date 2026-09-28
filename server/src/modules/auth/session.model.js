import mongoose from 'mongoose';

/** One row per logged-in device. Lets us revoke refresh tokens (logout, theft detection). */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    rotatedAt: Date,
  },
  { timestamps: true }
);

// TTL index: MongoDB deletes the session document once it has expired.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
