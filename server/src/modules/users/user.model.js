import mongoose from 'mongoose';
import { ORGANIZER_STATUS, ROLES, USER_STATUS } from '../../config/constants.js';

const organizerProfileSchema = new mongoose.Schema(
  {
    orgName: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: Object.values(ORGANIZER_STATUS), default: ORGANIZER_STATUS.NONE },
    appliedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, maxlength: 20 },
    city: { type: String, trim: true, maxlength: 60 },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER, index: true },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
    // Embedded: 1:1 with the user, small, always read together.
    organizerProfile: { type: organizerProfileSchema, default: () => ({}) },
  },
  { timestamps: true }
);

userSchema.index({ 'organizerProfile.status': 1 });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
