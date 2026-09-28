import { env } from '../../config/env.js';
import { Coupon } from './coupon.model.js';
import { badRequest } from '../../utils/AppError.js';

/**
 * All money maths lives here and ONLY runs on the server.
 * Amounts are integers in paise: floating point never touches money.
 *
 *   subtotal       = sum of ticket prices
 *   convenienceFee = fee per ticket
 *   tax            = GST on the convenience fee (TAX_RATE_BPS, 1800 = 18%)
 *   discount       = coupon (applied to the subtotal only)
 *   total          = subtotal + convenienceFee + tax - discount
 */
export function computePricing(items, coupon = null, config = env) {
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const convenienceFee = config.CONVENIENCE_FEE_PER_TICKET * items.length;
  const tax = Math.round((convenienceFee * config.TAX_RATE_BPS) / 10_000);
  const discount = coupon ? couponDiscount(coupon, subtotal) : 0;
  return { subtotal, convenienceFee, tax, discount, total: subtotal + convenienceFee + tax - discount, currency: 'INR' };
}

export function couponDiscount(coupon, subtotal) {
  if (subtotal < (coupon.minSubtotal || 0)) return 0;
  if (coupon.type === 'FLAT') return Math.min(coupon.value, subtotal);
  const raw = Math.round((subtotal * coupon.value) / 100);
  return Math.min(raw, coupon.maxDiscount ?? raw, subtotal);
}

/** Validates a coupon code for an event and order value. Throws a friendly 400 if unusable. */
export async function resolveCoupon(code, { eventId, subtotal }) {
  if (!code) return null;
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), active: true }).lean();
  const now = new Date();
  const invalid = (msg) => badRequest(msg, undefined, 'COUPON_INVALID');
  if (!coupon) throw invalid('This coupon code is not valid');
  if (coupon.event && String(coupon.event) !== String(eventId)) throw invalid('This coupon is not valid for this event');
  if (coupon.validFrom && coupon.validFrom > now) throw invalid('This coupon is not active yet');
  if (coupon.validTo && coupon.validTo < now) throw invalid('This coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw invalid('This coupon has been fully redeemed');
  if (subtotal < (coupon.minSubtotal || 0)) {
    throw invalid(`Add tickets worth Rs ${(coupon.minSubtotal / 100).toFixed(0)} or more to use this coupon`);
  }
  return coupon;
}
