import { describe, expect, it } from 'vitest';
import { computePricing, couponDiscount } from '../../src/modules/bookings/pricing.service.js';
import { evaluateCancellation } from '../../src/modules/bookings/cancellation.service.js';
import { canTransition } from '../../src/modules/bookings/bookingStateMachine.js';
import { generateLayout, rowLabel } from '../../src/modules/venues/layoutGenerator.js';

const config = { CONVENIENCE_FEE_PER_TICKET: 3000, TAX_RATE_BPS: 1800 };

describe('pricing', () => {
  it('computes fees, GST on fees and total in integer paise', () => {
    const p = computePricing([{ price: 100_000 }, { price: 50_000 }], null, config);
    expect(p).toMatchObject({ subtotal: 150_000, convenienceFee: 6000, tax: 1080, discount: 0, total: 157_080 });
  });

  it('applies percent coupons with a cap, and flat coupons never exceed the subtotal', () => {
    expect(couponDiscount({ type: 'PERCENT', value: 10, maxDiscount: 5000 }, 100_000)).toBe(5000);
    expect(couponDiscount({ type: 'FLAT', value: 20_000 }, 10_000)).toBe(10_000);
    expect(couponDiscount({ type: 'FLAT', value: 20_000, minSubtotal: 50_000 }, 10_000)).toBe(0);
  });
});

describe('cancellation policy', () => {
  const booking = { status: 'CONFIRMED', pricing: { subtotal: 100_000, discount: 0, total: 107_080 } };
  const eventIn = (hours) => ({
    status: 'PUBLISHED',
    startsAt: new Date(Date.now() + hours * 3_600_000),
    policies: { cancellation: { allowed: true, tiers: [{ hoursBefore: 72, refundPercent: 100 }, { hoursBefore: 24, refundPercent: 50 }] } },
  });

  it('gives the best tier the user still qualifies for', () => {
    expect(evaluateCancellation({ booking, event: eventIn(100) })).toMatchObject({ allowed: true, refundPercent: 100, refundAmount: 100_000 });
    expect(evaluateCancellation({ booking, event: eventIn(30) })).toMatchObject({ allowed: true, refundPercent: 50, refundAmount: 50_000 });
  });

  it('denies inside the last window, after tickets were used, or when disallowed', () => {
    expect(evaluateCancellation({ booking, event: eventIn(5) }).allowed).toBe(false);
    expect(evaluateCancellation({ booking, event: eventIn(100), ticketsUsed: 1 }).allowed).toBe(false);
    const noCancel = { ...eventIn(100), policies: { cancellation: { allowed: false } } };
    expect(evaluateCancellation({ booking, event: noCancel }).allowed).toBe(false);
    expect(evaluateCancellation({ booking: { ...booking, status: 'PENDING' }, event: eventIn(100) }).allowed).toBe(false);
  });
});

describe('booking state machine', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('PENDING', 'PAYMENT_PROCESSING')).toBe(true);
    expect(canTransition('PAYMENT_PROCESSING', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('EXPIRED', 'CONFIRMED')).toBe(true); // late payment reconciliation
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('CONFIRMED', 'PENDING')).toBe(false);
    expect(canTransition('FAILED', 'CONFIRMED')).toBe(false);
  });
});

describe('layout generator', () => {
  it('labels rows A..Z, AA.. and keeps labels unique across sections', () => {
    expect(rowLabel(0)).toBe('A');
    expect(rowLabel(25)).toBe('Z');
    expect(rowLabel(26)).toBe('AA');
    const layout = generateLayout({
      sections: [
        { name: 'VIP', rows: 2, seatsPerRow: 4, aisleAfter: [2] },
        { name: 'Regular', rows: 1, seatsPerRow: 6, aisleAfter: [] },
      ],
    });
    const labels = layout.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((x) => x.label)));
    expect(new Set(labels).size).toBe(labels.length);
    expect(layout.sections[1].rows[0].label).toBe('C');
    expect(layout.capacity).toBe(14);
    // aisle after seat 2 adds a gap of one unit
    const [s2, s3] = layout.sections[0].rows[0].seats.slice(1, 3);
    expect(s3.x - s2.x).toBe(2);
  });
});
