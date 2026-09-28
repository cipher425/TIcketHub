/**
 * Seeds realistic demo data by going THROUGH the real services (so every business rule runs):
 * users, organizers, venues with layouts, published events with ticket types, confirmed
 * bookings with tickets (via the mock payment provider), a past event with check-ins, coupons.
 *
 *   npm run seed            -> refuses if data already exists
 *   npm run seed -- --reset -> wipes the database first
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/infra/db/mongoose.js';
import { User } from '../src/modules/users/user.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { createVenue } from '../src/modules/venues/venues.service.js';
import { createEvent, publishEvent, setTicketTypes } from '../src/modules/events/events.service.js';
import { Event } from '../src/modules/events/event.model.js';
import { EventSeat } from '../src/modules/seating/eventSeat.model.js';
import { Booking } from '../src/modules/bookings/booking.model.js';
import { Coupon } from '../src/modules/bookings/coupon.model.js';
import { createHold, confirmBooking } from '../src/modules/bookings/bookings.service.js';
import { Payment } from '../src/modules/payments/payment.model.js';
import { Ticket } from '../src/modules/tickets/ticket.model.js';
import { ORGANIZER_STATUS, ROLES, SEAT_STATUS, TICKET_STATUS } from '../src/config/constants.js';

const DAY = 86_400_000;
const rupees = (r) => r * 100;
const at = (daysFromNow, hour, minute = 0) => {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const banner = (seed) => `https://picsum.photos/seed/${seed}/1200/600`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function makeUser(name, email, password, extra = {}) {
  return User.create({ name, email, passwordHash: await hashPassword(password), city: 'Mumbai', ...extra });
}

const VENUES = [
  {
    key: 'skyline',
    name: 'Skyline Arena',
    address: 'Plot 12, Worli Sea Face, Worli',
    city: 'Mumbai',
    layoutSpec: {
      stageLabel: 'STAGE',
      sections: [
        { name: 'VIP', rows: 3, seatsPerRow: 18, aisleAfter: [9] },
        { name: 'Premium', rows: 5, seatsPerRow: 24, aisleAfter: [6, 18] },
        { name: 'Regular', rows: 8, seatsPerRow: 28, aisleAfter: [7, 21] },
      ],
    },
  },
  {
    key: 'lakeside',
    name: 'Lakeside Amphitheatre',
    address: '4th Cross, Ulsoor Lake Road',
    city: 'Bengaluru',
    layoutSpec: {
      stageLabel: 'STAGE',
      sections: [
        { name: 'Front', rows: 4, seatsPerRow: 20, aisleAfter: [10] },
        { name: 'Middle', rows: 6, seatsPerRow: 24, aisleAfter: [12] },
        { name: 'Back', rows: 6, seatsPerRow: 26, aisleAfter: [13] },
      ],
    },
  },
  {
    key: 'playhouse',
    name: 'The Grand Playhouse',
    address: '21 Mandi House Circle',
    city: 'Delhi',
    layoutSpec: {
      stageLabel: 'STAGE',
      sections: [
        { name: 'Orchestra', rows: 6, seatsPerRow: 16, aisleAfter: [8] },
        { name: 'Balcony', rows: 5, seatsPerRow: 20, aisleAfter: [10] },
      ],
    },
  },
  {
    key: 'riverfront',
    name: 'Riverfront Convention Centre',
    address: 'Survey 88, Baner Road',
    city: 'Pune',
    layoutSpec: { stageLabel: 'PODIUM', sections: [{ name: 'Main Hall', rows: 10, seatsPerRow: 20, aisleAfter: [10] }] },
  },
  {
    key: 'harbour',
    name: 'Harbour Stadium Pavilion',
    address: 'Necklace Road, Hussain Sagar',
    city: 'Hyderabad',
    layoutSpec: {
      stageLabel: 'FIELD',
      sections: [
        { name: 'Pavilion', rows: 4, seatsPerRow: 30, aisleAfter: [15] },
        { name: 'Stands', rows: 8, seatsPerRow: 32, aisleAfter: [8, 24] },
      ],
    },
  },
];

// prices: section name -> [ticket type name, price in rupees]
const EVENTS = [
  { title: 'Aurora Nights Live - India Tour', venue: 'skyline', category: 'Music', day: 12, hour: 19, dur: 3, featured: true, highDemand: true,
    prices: { VIP: ['VIP', 7999], Premium: ['Premium', 3999], Regular: ['Regular', 1499] }, bookings: 40 },
  { title: 'Stand-up Saturdays with Kabir Rao', venue: 'playhouse', category: 'Comedy', day: 5, hour: 20, dur: 2, featured: true,
    prices: { Orchestra: ['Front Rows', 1499], Balcony: ['Balcony', 799] }, bookings: 25 },
  { title: 'Bengaluru Indie Music Festival', venue: 'lakeside', category: 'Festival', day: 20, hour: 16, dur: 6, featured: true,
    prices: { Front: ['Gold', 2999], Middle: ['Silver', 1799], Back: ['General', 999] }, bookings: 30 },
  { title: 'The Last Monsoon - A Play', venue: 'playhouse', category: 'Theatre', day: 9, hour: 19, dur: 2.5,
    prices: { Orchestra: ['Orchestra', 1200], Balcony: ['Balcony', 600] }, bookings: 18 },
  { title: 'Hyderabad T20 Showdown', venue: 'harbour', category: 'Sports', day: 15, hour: 18, dur: 4, featured: true,
    prices: { Pavilion: ['Pavilion', 4500], Stands: ['Stands', 1200] }, bookings: 35 },
  { title: 'Full-Stack Summit Pune 2026', venue: 'riverfront', category: 'Conference', day: 25, hour: 9, dur: 9,
    prices: { 'Main Hall': ['Delegate Pass', 2499] }, bookings: 20 },
  { title: 'Hands-on Workshop: System Design Basics', venue: 'riverfront', category: 'Workshop', day: 7, hour: 10, dur: 5,
    prices: { 'Main Hall': ['Participant', 999] }, bookings: 12 },
  { title: 'Symphony Under the Stars', venue: 'lakeside', category: 'Music', day: 30, hour: 19, dur: 2.5,
    prices: { Front: ['Premium', 2499], Middle: ['Standard', 1499], Back: ['Lawn', 699] }, bookings: 10 },
  { title: 'Little Explorers Science Show', venue: 'riverfront', category: 'Kids', day: 11, hour: 11, dur: 2,
    prices: { 'Main Hall': ['Family Seat', 499] }, bookings: 8 },
  { title: 'Mumbai Comedy Carnival', venue: 'skyline', category: 'Comedy', day: 18, hour: 20, dur: 3,
    prices: { VIP: ['VIP Lounge', 3499], Premium: ['Premium', 1999], Regular: ['Regular', 899] }, bookings: 22 },
  { title: 'Delhi Jazz Evenings', venue: 'playhouse', category: 'Music', day: 40, hour: 20, dur: 2,
    prices: { Orchestra: ['Orchestra', 1800], Balcony: ['Balcony', 900] }, bookings: 5 },
  { title: 'Kabaddi Premier Night', venue: 'harbour', category: 'Sports', day: 22, hour: 19, dur: 3,
    prices: { Pavilion: ['Pavilion', 1500], Stands: ['Stands', 400] }, bookings: 15 },
  // Becomes a PAST event after seeding (to demo past bookings + attendance analytics)
  { title: 'Retro Rewind: 90s Bollywood Night', venue: 'skyline', category: 'Music', day: 3, hour: 20, dur: 3, past: true,
    prices: { VIP: ['VIP', 4999], Premium: ['Premium', 2499], Regular: ['Regular', 999] }, bookings: 30 },
];

async function bookRandomSeats(event, customer, count) {
  const free = await EventSeat.aggregate([
    { $match: { event: event._id, status: SEAT_STATUS.AVAILABLE } },
    { $sample: { size: 1 } },
  ]);
  if (!free.length) return null;
  // Adjacent seats in the same row, like real buyers pick.
  const row = await EventSeat.find({ event: event._id, rowLabel: free[0].rowLabel, status: SEAT_STATUS.AVAILABLE })
    .sort({ number: 1 })
    .lean();
  const start = row.findIndex((s) => s.number >= free[0].number);
  const seats = row.slice(Math.max(0, start), Math.max(0, start) + count);
  if (!seats.length) return null;

  const booking = await createHold({ id: String(customer._id), role: ROLES.USER }, { eventId: event._id, seatIds: seats.map((s) => String(s._id)) });
  const payment = await Payment.create({
    booking: booking._id,
    user: customer._id,
    provider: 'mock',
    providerOrderId: `order_seed_${booking._id}`,
    amount: booking.pricing.total,
  });
  await confirmBooking(booking._id, { paymentId: payment._id, providerPaymentId: `pay_seed_${booking._id}` });
  const confirmedAt = new Date(Date.now() - Math.random() * 20 * DAY);
  await Booking.updateOne({ _id: booking._id }, { $set: { confirmedAt, createdAt: confirmedAt } });
  return booking;
}

async function main() {
  await connectDb();
  const reset = process.argv.includes('--reset');
  if (reset) {
    // Drop collections one by one: works with Atlas "readWrite" users,
    // which are not allowed to run dropDatabase.
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const { name } of collections) {
      if (!name.startsWith('system.')) await mongoose.connection.db.dropCollection(name);
    }
    await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
    console.log('Database wiped');
  } else if (await User.exists({})) {
    console.log('Data already exists. Run "npm run seed -- --reset" to wipe and re-seed.');
    return;
  }

  console.log('Creating users...');
  await makeUser('Platform Admin', 'admin@tickethub.dev', 'Admin@1234', { role: ROLES.ADMIN });
  const organizers = [
    await makeUser('Riya Sharma', 'organizer@tickethub.dev', 'Organizer@1234', {
      role: ROLES.ORGANIZER,
      organizerProfile: { orgName: 'Spotlight Live Entertainment', description: 'Concerts, comedy and festivals across India.', status: ORGANIZER_STATUS.APPROVED, appliedAt: new Date() },
    }),
    await makeUser('Arjun Mehta', 'organizer2@tickethub.dev', 'Organizer@1234', {
      role: ROLES.ORGANIZER,
      city: 'Pune',
      organizerProfile: { orgName: 'TechCircle Events', description: 'Developer conferences and hands-on workshops.', status: ORGANIZER_STATUS.APPROVED, appliedAt: new Date() },
    }),
  ];
  await makeUser('Neha Kapoor', 'pending.organizer@tickethub.dev', 'User@1234', {
    organizerProfile: { orgName: 'Kapoor Theatre Co.', description: 'Independent theatre productions in Delhi NCR.', status: ORGANIZER_STATUS.PENDING, appliedAt: new Date() },
  });
  const demoUser = await makeUser('Demo User', 'user@tickethub.dev', 'User@1234');
  const customers = [demoUser];
  for (const [name, email] of [
    ['Aman Verma', 'aman@example.com'],
    ['Priya Nair', 'priya@example.com'],
    ['Rahul Singh', 'rahul@example.com'],
    ['Sneha Iyer', 'sneha@example.com'],
    ['Vikram Rao', 'vikram@example.com'],
    ['Ananya Das', 'ananya@example.com'],
  ]) {
    customers.push(await makeUser(name, email, 'User@1234'));
  }

  console.log('Creating venues...');
  const venues = {};
  for (const v of VENUES) {
    const owner = v.key === 'riverfront' ? organizers[1] : organizers[0];
    venues[v.key] = await createVenue({ id: String(owner._id), role: ROLES.ORGANIZER }, v);
  }

  console.log('Creating & publishing events...');
  for (const [i, spec] of EVENTS.entries()) {
    const venue = venues[spec.venue];
    const owner = { id: String(venue.organizer), role: ROLES.ORGANIZER };
    const startsAt = at(spec.day, spec.hour);
    const event = await createEvent(owner, {
      title: spec.title,
      description: `${spec.title} is one of the most anticipated ${spec.category.toLowerCase()} events of the season. ` +
        `Join thousands of fans at ${venue.name}, ${venue.city} for an unforgettable experience. ` +
        'Gates open 60 minutes before the show. Please carry a valid photo ID along with your digital ticket.',
      category: spec.category,
      venueId: String(venue._id),
      bannerUrl: banner(`tickethub-${i}`),
      tags: [spec.category, venue.city],
      startsAt,
      endsAt: new Date(startsAt.getTime() + spec.dur * 3_600_000),
      policies: {
        maxSeatsPerBooking: 6,
        ageLimit: spec.category === 'Kids' ? 'All ages' : '13+',
        terms: ['Tickets once booked can only be cancelled as per the cancellation policy.', 'Entry only with a valid QR ticket.', 'Outside food and beverages are not allowed.'],
      },
    });
    const ticketTypes = Object.entries(spec.prices).map(([section, [name, price]]) => ({
      name,
      price: rupees(price),
      sectionKeys: [venue.layout.sections.find((s) => s.name === section).key],
    }));
    await setTicketTypes(event._id, owner, ticketTypes);
    await publishEvent(event._id, owner);
    await Event.updateOne({ _id: event._id }, { $set: { isFeatured: Boolean(spec.featured), highDemand: Boolean(spec.highDemand) } });

    const published = await Event.findById(event._id).lean();
    for (let b = 0; b < spec.bookings; b++) {
      const customer = b % 7 === 0 ? demoUser : pick(customers);
      try {
        await bookRandomSeats(published, customer, 1 + Math.floor(Math.random() * 4));
      } catch (err) {
        if (err.code !== 'HOLD_EXISTS' && err.status !== 409) throw err;
      }
    }

    if (spec.past) {
      // Shift into the past and simulate gate check-ins for ~85% of tickets.
      const shift = (spec.day + 4) * DAY;
      const pastStart = new Date(startsAt.getTime() - shift);
      const pastEnd = new Date(pastStart.getTime() + spec.dur * 3_600_000);
      await Event.updateOne({ _id: event._id }, { $set: { startsAt: pastStart, endsAt: pastEnd, reminderSentAt: pastStart } });
      await Booking.updateMany({ event: event._id }, { $set: { eventStartsAt: pastStart } });
      await Ticket.updateMany({ event: event._id }, { $set: { startsAt: pastStart, endsAt: pastEnd } });
      const tickets = await Ticket.find({ event: event._id }).select('_id').lean();
      const used = tickets.filter(() => Math.random() < 0.85).map((t) => t._id);
      await Ticket.updateMany({ _id: { $in: used } }, { $set: { status: TICKET_STATUS.USED, usedAt: pastStart } });
      await Event.updateOne({ _id: event._id }, { $set: { checkedInCount: used.length } });
    }
    console.log(`  - ${spec.title}`);
  }

  await Coupon.create([
    { code: 'WELCOME10', description: '10% off your first booking (max Rs 500)', type: 'PERCENT', value: 10, maxDiscount: rupees(500) },
    { code: 'FLAT200', description: 'Rs 200 off on orders above Rs 1,500', type: 'FLAT', value: rupees(200), minSubtotal: rupees(1500) },
  ]);

  console.log('\nSeed complete. Log in with:');
  console.log('  Admin      admin@tickethub.dev      / Admin@1234');
  console.log('  Organizer  organizer@tickethub.dev  / Organizer@1234');
  console.log('  Customer   user@tickethub.dev       / User@1234');
  console.log('  Coupons    WELCOME10, FLAT200');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
