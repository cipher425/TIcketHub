import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Calendar, CheckCircle2, Clock, CreditCard, Loader2, Lock, MapPin, Tag, TimerOff } from 'lucide-react';
import { http } from '../../lib/api';
import { applyCoupon, createPaymentOrder, mockCheckout, releaseHold, reportPaymentFailure, verifyPayment } from './api';
import { openRazorpay } from './razorpay';
import { useCountdown } from '../../hooks/useCommon';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, ErrorState, PageLoader } from '../../components/ui/Feedback';
import { formatDateTime, formatINR } from '../../lib/format';
import { cn } from '../../lib/cn';

function HoldTimer({ expiresAt, serverTime, onExpire }) {
  const { minutes, seconds, expired, msLeft } = useCountdown(expiresAt, serverTime);
  useEffect(() => {
    if (expired) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);
  const urgent = msLeft < 60_000;
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl px-4 py-3', urgent ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
      <Clock className={cn('h-5 w-5', urgent && 'animate-pulse')} />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Seats held for you</p>
        <p className="text-xs opacity-80">Complete payment before the timer runs out, or the seats are released.</p>
      </div>
      <span className="font-mono text-2xl font-bold tabular-nums">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}

export function PriceBreakdown({ pricing, coupon }) {
  const Row = ({ label, value, strong, green }) => (
    <div className={cn('flex justify-between text-sm', strong ? 'text-base font-bold text-slate-900' : 'text-slate-600', green && 'text-emerald-700')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <Row label="Tickets" value={formatINR(pricing.subtotal)} />
      <Row label="Convenience fee" value={formatINR(pricing.convenienceFee)} />
      <Row label="GST on convenience fee (18%)" value={formatINR(pricing.tax)} />
      {pricing.discount > 0 && <Row label={`Discount${coupon?.code ? ` (${coupon.code})` : ''}`} value={`- ${formatINR(pricing.discount)}`} green />}
      <div className="border-t border-dashed border-slate-200 pt-2">
        <Row label="Total payable" value={formatINR(pricing.total)} strong />
      </div>
    </div>
  );
}

function MockGateway({ order, onResult }) {
  const [busy, setBusy] = useState(null);
  const run = async (outcome) => {
    setBusy(outcome);
    try {
      onResult(await mockCheckout(order.orderId, outcome));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open onClose={() => onResult({ dismissed: true })} title="Test payment gateway" size="sm">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-xs text-slate-500">Amount</p>
          <p className="text-2xl font-bold">{formatINR(order.amount)}</p>
          <p className="mt-1 text-xs text-slate-500">Order {order.orderId}</p>
        </div>
        <p className="text-xs text-slate-500">
          PAYMENT_PROVIDER=mock. This stands in for Razorpay so the flow works without an account. Switch to Razorpay test mode in the server .env.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={busy === 'failure'} onClick={() => run('failure')}>Simulate failure</Button>
          <Button loading={busy === 'success'} onClick={() => run('success')}>Pay successfully</Button>
        </div>
      </div>
    </Dialog>
  );
}

export function CheckoutPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [mockOrder, setMockOrder] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [expiredLocally, setExpiredLocally] = useState(false);

  const query = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => http.get(`/bookings/${bookingId}`),
    // While payment is being confirmed (e.g. by the webhook), poll the server.
    refetchInterval: (q) => (q.state.data?.data?.status === 'PAYMENT_PROCESSING' && !paying ? 3000 : false),
  });
  const booking = query.data?.data;
  const serverTime = query.data?.meta?.serverTime;
  const refresh = () => qc.invalidateQueries({ queryKey: ['booking', bookingId] });

  if (query.isLoading) return <PageLoader />;
  if (query.error) return <div className="container-page py-16"><ErrorState error={query.error} /></div>;
  if (booking.status === 'CONFIRMED') return <Navigate to={`/account/bookings/${booking._id}?new=1`} replace />;

  const seatsUrl = `/events/${booking.eventSlug}/seats`;

  // The timer hit zero: the server already treats the seats as free (lazy expiry), so show it now
  // instead of waiting for the background sweeper to flip the status.
  if (['EXPIRED', 'RELEASED', 'FAILED', 'CANCELLED'].includes(booking.status) || (expiredLocally && booking.status === 'PENDING')) {
    const failed = booking.status === 'FAILED';
    return (
      <div className="container-page max-w-xl py-16">
        <EmptyState
          icon={failed ? AlertCircle : TimerOff}
          title={failed ? 'Booking could not be completed' : 'Your seat hold has ended'}
          message={failed ? booking.failureReason : 'The seats were released so other fans can book them. You can pick seats again - if they are still free, they are yours.'}
          action={<Button to={seatsUrl}>Select seats again</Button>}
        />
      </div>
    );
  }

  const finishPayment = async (payload) => {
    const result = await verifyPayment(payload);
    if (result.outcome === 'CONFIRMED' || result.outcome === 'ALREADY_PROCESSED') {
      toast.success('Payment successful! Your tickets are ready.');
      qc.removeQueries({ queryKey: ['booking-active'] });
      navigate(`/account/bookings/${booking._id}?new=1`, { replace: true });
    } else {
      toast.error('Payment received but the booking could not be completed. A refund has been initiated.');
      refresh();
    }
  };

  const pay = async () => {
    setPaying(true);
    let order;
    try {
      order = await createPaymentOrder(booking._id);
      if (order.provider === 'mock') {
        setMockOrder(order);
        return; // continues in onMockResult
      }
      const response = await openRazorpay(order);
      await finishPayment(response);
    } catch (err) {
      if (err?.dismissed || err?.failed) {
        await reportPaymentFailure(order.orderId, err.failed ? err.reason : 'Checkout closed by user').catch(() => {});
        toast[err.failed ? 'error' : 'info'](err.failed ? `Payment failed: ${err.reason}. You can try again.` : 'Payment cancelled. Your seats are still held.');
      } else if (err?.code === 'HOLD_EXPIRED') {
        toast.error(err.message);
      } else {
        toast.error(err?.message || 'Payment could not be started');
      }
      refresh();
    } finally {
      if (!order || order.provider !== 'mock') setPaying(false);
    }
  };

  const onMockResult = async (res) => {
    const order = mockOrder;
    setMockOrder(null);
    try {
      if (res.ok) await finishPayment(res);
      else {
        await reportPaymentFailure(order.orderId, res.dismissed ? 'Checkout closed by user' : res.error?.description);
        toast[res.dismissed ? 'info' : 'error'](res.dismissed ? 'Payment cancelled. Your seats are still held.' : 'Payment failed. You can try again.');
        refresh();
      }
    } catch (err) {
      toast.error(err.message);
      refresh();
    } finally {
      setPaying(false);
    }
  };

  const submitCoupon = async (code) => {
    setCouponBusy(true);
    try {
      const res = await applyCoupon(booking._id, code);
      qc.setQueryData(['booking', bookingId], (old) => ({ ...old, data: { ...old.data, ...res.data } }));
      toast.success(code ? 'Coupon applied' : 'Coupon removed');
      setCouponCode('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCouponBusy(false);
    }
  };

  const changeSeats = async () => {
    try {
      await releaseHold(booking._id);
    } catch (err) {
      toast.error(err.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['seat-availability'] });
    navigate(seatsUrl);
  };

  const processing = booking.status === 'PAYMENT_PROCESSING' && !paying;

  return (
    <div className="container-page max-w-5xl py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Checkout</h1>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <HoldTimer expiresAt={booking.holdExpiresAt} serverTime={serverTime} onExpire={() => { setExpiredLocally(true); refresh(); }} />

          <div className="card overflow-hidden">
            <div className="flex gap-4 p-5">
              {booking.bannerUrl && <img src={booking.bannerUrl} alt="" className="hidden h-24 w-36 rounded-xl object-cover sm:block" />}
              <div>
                <h2 className="font-bold text-slate-900">{booking.eventTitle}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Calendar className="h-4 w-4" /> {formatDateTime(booking.eventStartsAt)}</p>
                <p className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4" /> {booking.venueName}, {booking.city}</p>
              </div>
            </div>
            <div className="border-t border-slate-100 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{booking.items.length} seat{booking.items.length > 1 ? 's' : ''}</h3>
                {booking.status === 'PENDING' && <button onClick={changeSeats} className="text-sm font-semibold text-brand-600 hover:underline">Change seats</button>}
              </div>
              <ul className="divide-y divide-slate-100">
                {booking.items.map((i) => (
                  <li key={i.seat} className="flex items-center justify-between py-2 text-sm">
                    <span><span className="font-semibold text-slate-900">{i.label}</span> <span className="text-slate-500">· {i.sectionName} · Row {i.rowLabel} · {i.ticketTypeName}</span></span>
                    <span className="font-medium">{formatINR(i.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card sticky top-24 space-y-5 p-5">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Tag className="h-4 w-4" /> Offers</p>
              {booking.coupon?.code ? (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <span><CheckCircle2 className="mr-1 inline h-4 w-4" />{booking.coupon.code} applied</span>
                  <button disabled={couponBusy || booking.status !== 'PENDING'} onClick={() => submitCoupon(null)} className="font-semibold hover:underline">Remove</button>
                </div>
              ) : (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (couponCode.trim()) submitCoupon(couponCode.trim()); }}>
                  <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Coupon code (try WELCOME10)" disabled={booking.status !== 'PENDING'} />
                  <Button variant="secondary" type="submit" loading={couponBusy} disabled={booking.status !== 'PENDING'}>Apply</Button>
                </form>
              )}
            </div>
            <PriceBreakdown pricing={booking.pricing} coupon={booking.coupon} />
            {processing ? (
              <div className="flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment with the bank... this page updates automatically.
                <Button size="sm" variant="secondary" className="ml-auto" onClick={pay}>Retry</Button>
              </div>
            ) : (
              <Button className="w-full" size="lg" loading={paying} onClick={pay}>
                <CreditCard className="h-4 w-4" /> Pay {formatINR(booking.pricing.total)}
              </Button>
            )}
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> Amount calculated and verified by our server</p>
            <p className="text-center text-xs text-slate-400">Booking ref {booking.bookingRef} · <Link to={`/events/${booking.eventSlug}`} className="hover:underline">Event details</Link></p>
          </div>
        </div>
      </div>
      {mockOrder && <MockGateway order={mockOrder} onResult={onMockResult} />}
    </div>
  );
}
