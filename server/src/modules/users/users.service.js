import bcrypt from 'bcryptjs';
import { User } from './user.model.js';
import { hashPassword, revokeAllSessions } from '../auth/auth.service.js';
import { ORGANIZER_STATUS, ROLES } from '../../config/constants.js';
import { badRequest, conflict, notFound } from '../../utils/AppError.js';

export async function updateProfile(userId, changes) {
  const user = await User.findByIdAndUpdate(userId, { $set: changes }, { new: true, runValidators: true });
  if (!user) throw notFound('User');
  return user;
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw notFound('User');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect', undefined, 'WRONG_PASSWORD');
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  // Log out every other device after a password change.
  await revokeAllSessions(userId);
}

export async function applyForOrganizer(userId, { orgName, description }) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User');
  if (user.role !== ROLES.USER) throw conflict('Your account already has elevated access');
  if (user.organizerProfile?.status === ORGANIZER_STATUS.PENDING) {
    throw conflict('Your application is already under review');
  }
  user.organizerProfile = { orgName, description, status: ORGANIZER_STATUS.PENDING, appliedAt: new Date() };
  await user.save();
  return user;
}
