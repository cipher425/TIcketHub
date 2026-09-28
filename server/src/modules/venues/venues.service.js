import { Venue } from './venue.model.js';
import { generateLayout } from './layoutGenerator.js';
import { Event } from '../events/event.model.js';
import { ROLES } from '../../config/constants.js';
import { conflict, forbidden, notFound } from '../../utils/AppError.js';

function assertOwner(venue, user) {
  if (user.role !== ROLES.ADMIN && String(venue.organizer) !== user.id) throw forbidden('This venue belongs to another organizer');
}

export async function getOwnedVenue(venueId, user) {
  const venue = await Venue.findById(venueId);
  if (!venue) throw notFound('Venue');
  assertOwner(venue, user);
  return venue;
}

export const previewLayout = (spec) => generateLayout(spec);

export async function createVenue(user, { name, address, city, layoutSpec }) {
  const { capacity, ...layout } = generateLayout(layoutSpec);
  return Venue.create({ organizer: user.id, name, address, city, layoutSpec, layout, capacity });
}

export async function updateVenue(venueId, user, changes) {
  const venue = await getOwnedVenue(venueId, user);
  if (changes.layoutSpec) {
    // Published events have already copied the layout into EventSeat, so editing the
    // template is safe for them. Draft events will pick up the new layout on publish.
    const { capacity, ...layout } = generateLayout(changes.layoutSpec);
    venue.layoutSpec = changes.layoutSpec;
    venue.layout = layout;
    venue.capacity = capacity;
  }
  for (const field of ['name', 'address', 'city']) if (changes[field] !== undefined) venue[field] = changes[field];
  await venue.save();
  return venue;
}

export async function deleteVenue(venueId, user) {
  const venue = await getOwnedVenue(venueId, user);
  if (await Event.exists({ venue: venue._id })) throw conflict('This venue is used by events and cannot be deleted');
  await venue.deleteOne();
}

export function listVenues(user) {
  const filter = user.role === ROLES.ADMIN ? {} : { organizer: user.id };
  return Venue.find(filter).select('-layout').sort({ createdAt: -1 }).lean();
}
