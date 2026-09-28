import { useQuery } from '@tanstack/react-query';
import { http } from '../../lib/api';

export const bookingKeys = {
  detail: (id) => ['booking', id],
  list: (scope, page) => ['bookings', scope, page],
  active: (eventId) => ['booking-active', eventId],
  tickets: (id) => ['booking-tickets', id],
};

export const admissionStorageKey = (eventId) => `th_admission_${eventId}`;

export function createHold({ eventId, seatIds, couponCode }) {
  let admission = null;
  try {
    admission = sessionStorage.getItem(admissionStorageKey(eventId));
  } catch {
    /* ignore */
  }
  return http.post('/bookings', { eventId, seatIds, couponCode }, admission ? { headers: { 'X-Admission-Token': admission } } : undefined);
}

/** Returns { data: booking, meta: { serverTime } } */
export function useBooking(id, { poll = false } = {}) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: () => http.get(`/bookings/${id}`),
    enabled: !!id,
    refetchInterval: poll ? 3000 : false,
  });
}

export const useActiveHold = (eventId, enabled) =>
  useQuery({
    queryKey: bookingKeys.active(eventId),
    queryFn: () => http.get('/bookings/active', { eventId }).then((r) => r.data),
    enabled: !!eventId && enabled,
  });

export const useBookingTickets = (id, enabled = true) =>
  useQuery({ queryKey: bookingKeys.tickets(id), queryFn: () => http.get(`/bookings/${id}/tickets`).then((r) => r.data), enabled: !!id && enabled });

export const releaseHold = (id) => http.post(`/bookings/${id}/release`);
export const applyCoupon = (id, code) => http.patch(`/bookings/${id}/coupon`, { code });
export const createPaymentOrder = (id) => http.post(`/bookings/${id}/payment-order`).then((r) => r.data);
export const verifyPayment = (payload) => http.post('/payments/verify', payload).then((r) => r.data);
export const reportPaymentFailure = (orderId, reason) => http.post('/payments/failure', { orderId, reason });
export const mockCheckout = (orderId, outcome) => http.post('/payments/mock/checkout', { orderId, outcome }).then((r) => r.data);
export const getCancellationQuote = (id) => http.get(`/bookings/${id}/cancellation-quote`).then((r) => r.data);
export const cancelBooking = (id, reason) => http.post(`/bookings/${id}/cancel`, { reason }).then((r) => r.data);
