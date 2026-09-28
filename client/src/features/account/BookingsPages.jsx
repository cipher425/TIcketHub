import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, CheckCircle2, MapPin, Receipt, Ticket as TicketIcon, XCircle } from 'lucide-react';
import { http } from '../../lib/api';
import { cancelBooking, getCancellationQuote, useBookingTickets } from '../booking/api';
import { PriceBreakdown } from '../booking/CheckoutPage';
import { TicketCard } from '../tickets/TicketCard';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Textarea } from '../../components/ui/Form';
import { EmptyState, ErrorState, PageLoader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { PageHeader, Pagination, Tabs } from '../../components/ui/Layout';
import { formatDate, formatDateTime, formatINR, formatTime } from '../../lib/format';

function BookingRow({ b }) {
  return (
    <Link to={`/account/bookings/${b._id}`} className="card flex flex-col gap-4 p-4 transition hover:shadow-md sm:flex-row">
      <img src={b.bannerUrl} alt="" className="h-32 w-full rounded-xl bg-slate-200 object-cover sm:h-24 sm:w-40" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{b.eventTitle}</h3>
          <StatusBadge status={b.status} />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Calendar className="h-4 w-4" /> {formatDate(b.eventStartsAt)} · {formatTime(b.eventStartsAt)}</p>
        <p className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4" /> {b.venueName}, {b.city}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">Seats <span className="font-semibold text-slate-900">{b.items.map((i) => i.label).join(', ')}</span></span>
          <span className="font-bold text-slate-900">{formatINR(b.pricing.total)}</span>
        </div>
      </div>
    </Link>
  );
}

export function MyBookingsPage() {
  const [scope, setScope] = useState('upcoming');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bookings', scope, page],
    queryFn: () => http.get('/bookings', { scope, page, limit: 10 }),
  });
  return (
    <>
      <PageHeader title="My bookings" subtitle="Your upcoming plans and booking history." />
      <Tabs
        tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past & cancelled' }, { value: 'active', label: 'In checkout' }]}
        value={scope}
        onChange={(v) => { setScope(v); setPage(1); }}
      />
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.data.length ? (
        <EmptyState icon={TicketIcon} title={scope === 'upcoming' ? 'No upcoming bookings' : 'Nothing here yet'} message="When you book an event it will appear here." action={<Button to="/events">Find something to do</Button>} />
      ) : (
        <div className="space-y-3">
          {data.data.map((b) => scope === 'active' ? (
            <Link key={b._id} to={`/checkout/${b._id}`} className="card flex items-center justify-between p-4 hover:shadow-md">
              <span><span className="font-semibold">{b.eventTitle}</span> <span className="text-sm text-slate-500">· {b.items.map((i) => i.label).join(', ')}</span></span>
              <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white">Resume checkout</span>
            </Link>
          ) : <BookingRow key={b._id} b={b} />)}
        </div>
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  );
}

function CancelFlow({ booking, onDone }) {
  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const start = async () => {
    setLoadingQuote(true);
    try {
      setQuote(await getCancellationQuote(booking._id)); // decided by the server
      setOpen(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingQuote(false);
    }
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      await cancelBooking(booking._id, reason || 'Cancelled by customer');
      toast.success('Booking cancelled. Any refund is on its way.');
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="secondary" loading={loadingQuote} onClick={start}><XCircle className="h-4 w-4" /> Cancel booking</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={quote?.allowed ? confirm : () => setOpen(false)}
        confirmLabel={quote?.allowed ? 'Yes, cancel booking' : 'OK'}
        tone={quote?.allowed ? 'danger' : 'primary'}
        loading={submitting}
        title={quote?.allowed ? 'Cancel this booking?' : 'Cancellation not available'}
      >
        {quote && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{quote.reason}</p>
            {quote.allowed && (
              <>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between"><span>Refund ({quote.refundPercent}% of tickets)</span><span className="font-bold text-emerald-700">{formatINR(quote.refundAmount)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Non-refundable</span><span>{formatINR(quote.nonRefundable)}</span></div>
                </div>
                <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <p className="text-xs text-slate-500">Your seats will be released for other fans and your tickets will stop working.</p>
              </>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

export function BookingDetailPage() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['booking', bookingId], queryFn: () => http.get(`/bookings/${bookingId}`) });
  const booking = data?.data;
  const tickets = useBookingTickets(bookingId, ['CONFIRMED', 'CANCELLED'].includes(booking?.status));

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const upcoming = new Date(booking.eventStartsAt) > new Date();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    qc.invalidateQueries({ queryKey: ['booking-tickets', bookingId] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
  };

  return (
    <div className="space-y-6">
      <Link to="/account/bookings" className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> All bookings</Link>

      {params.get('new') && booking.status === 'CONFIRMED' && (
        <div className="flex items-center gap-4 rounded-2xl bg-emerald-600 p-5 text-white">
          <CheckCircle2 className="h-10 w-10 shrink-0" />
          <div>
            <p className="text-lg font-bold">Booking confirmed!</p>
            <p className="text-sm text-emerald-50">Your tickets are below and a confirmation has been added to your notifications.</p>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-xl font-bold text-slate-900">{booking.eventTitle}</h1><StatusBadge status={booking.status} /></div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Calendar className="h-4 w-4" /> {formatDateTime(booking.eventStartsAt)}</p>
            <p className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4" /> {booking.venueName}, {booking.city}</p>
            <p className="mt-2 text-xs text-slate-400">Booking ref <span className="font-mono text-slate-700">{booking.bookingRef}</span> · Booked {formatDate(booking.confirmedAt || booking.createdAt)}</p>
          </div>
          {booking.status === 'CONFIRMED' && upcoming && <CancelFlow booking={booking} onDone={refresh} />}
          {['PENDING', 'PAYMENT_PROCESSING'].includes(booking.status) && <Button to={`/checkout/${booking._id}`}>Resume checkout</Button>}
        </div>

        {booking.status === 'FAILED' && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{booking.failureReason}</p>}
        {booking.status === 'CANCELLED' && (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            Cancelled on {formatDate(booking.cancellation?.at)} · {booking.cancellation?.reason}. Refund: <span className="font-semibold">{formatINR(booking.cancellation?.refundAmount)}</span>
            {booking.payments?.[0]?.status && <> · Status: <StatusBadge status={booking.payments.find((p) => p.refund?.amount)?.status || booking.payments[0].status} /></>}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><TicketIcon className="h-5 w-5" /> Tickets</h2>
          {tickets.isLoading ? (
            <Skeleton className="h-80" />
          ) : tickets.data?.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {tickets.data.map((t) => (
                <Link key={t._id} to={`/tickets/${t._id}`}><TicketCard ticket={t} compact /></Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No tickets" message="Tickets are issued once payment is confirmed." />
          )}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Receipt className="h-5 w-5" /> Payment summary</h2>
            <ul className="mb-4 space-y-1 text-sm">
              {booking.items.map((i) => (
                <li key={i.seat} className="flex justify-between text-slate-600"><span>{i.label} · {i.ticketTypeName}</span><span>{formatINR(i.price)}</span></li>
              ))}
            </ul>
            <PriceBreakdown pricing={booking.pricing} coupon={booking.coupon} />
          </div>
          {booking.payments?.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Payment attempts</h3>
              <ul className="space-y-2 text-sm">
                {booking.payments.map((p) => (
                  <li key={p._id} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-slate-500">{p.providerOrderId}</span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
