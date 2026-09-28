import { User } from '../src/modules/users/user.model.js';
import { createVenue } from '../src/modules/venues/venues.service.js';
import { createEvent, publishEvent, setTicketTypes } from '../src/modules/events/events.service.js';
import { EventSeat } from '../src/modules/seating/eventSeat.model.js';
import { ORGANIZER_STATUS, ROLES } from '../src/config/constants.js';

let counter = 0;

export async function makeUser(role = ROLES.USER, extra = {}) {
  counter++;
  const user = await User.create({
    name: `Test ${role} ${counter}`,
    email: `t${counter}-${Date.now()}@test.dev`,
    passwordHash: 'not-used',
    role,
    organizerProfile: role === ROLES.ORGANIZER ? { orgName: 'Org', status: ORGANIZER_STATUS.APPROVED } : undefined,
    ...extra,
  });
  return { doc: user, actor: { id: String(user._id), role, name: user.name } };
}

/** Organizer + venue (2 sections) + published event with 2 ticket types. */
export async function makePublishedEvent({ startsInHours = 24 * 10, cancellation } = {}) {
  const { actor: organizer } = await makeUser(ROLES.ORGANIZER);
  const venue = await createVenue(organizer, {
    name: 'Test Hall',
    address: '1 Test Street',
    city: 'Mumbai',
    layoutSpec: {
      sections: [
        { name: 'VIP', rows: 1, seatsPerRow: 5, aisleAfter: [] },
        { name: 'Regular', rows: 2, seatsPerRow: 5, aisleAfter: [] },
      ],
    },
  });
  const startsAt = new Date(Date.now() + startsInHours * 3_600_000);
  const event = await createEvent(organizer, {
    title: 'Test Concert',
    description: 'A test event with a long enough description.',
    category: 'Music',
    venueId: String(venue._id),
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3 * 3_600_000),
    policies: cancellation ? { cancellation } : undefined,
  });
  await setTicketTypes(event._id, organizer, [
    { name: 'VIP', price: 500_000, sectionKeys: ['vip'] },
    { name: 'Regular', price: 100_000, sectionKeys: ['regular'] },
  ]);
  const published = await publishEvent(event._id, organizer);
  const seats = await EventSeat.find({ event: published._id }).sort({ y: 1, x: 1 }).lean();
  return { organizer, venue, event: published, seats };
}
