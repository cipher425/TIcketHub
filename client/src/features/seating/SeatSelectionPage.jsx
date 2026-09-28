import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Clock, Radio, RefreshCw, X } from 'lucide-react';
import { useEventDetails } from '../discovery/api';
import { useSeatData, seatKeys } from './useSeatData';
import { SeatMap, SeatLegend } from './SeatMap';
import { createHold, useActiveHold } from '../booking/api';
import { Button } from '../../components/ui/Button';
import { ErrorState, PageLoader, Skeleton } from '../../components/ui/Feedback';
import { formatDateTime, formatINR } from '../../lib/format';

export function SeatSelectionPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: event, isLoading: eventLoading, error: eventError } = useEventDetails(slug);
  const eventId = event?._id;
  const { layout, availability, statusById, realtime } = useSeatData(eventId);
  const { data: activeHold } = useActiveHold(eventId, !!eventId);
  const [selected, setSelected] = useState(() => new Map()); // seatId -> { seat, section }

  const maxSeats = event?.policies?.maxSeatsPerBooking || 6;
  const typeById = useMemo(() => new Map((layout.data?.ticketTypes || []).map((t) => [t.id, t])), [layout.data]);

  // If a seat we selected gets taken by someone else (poll/socket update), drop it.
  const selectedIds = useMemo(() => {
    const ids = new Set();
    for (const id of selected.keys()) if (!statusById.has(id)) ids.add(id);
    return ids;
  }, [selected, statusById]);

  const toggle = (seat, section) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else {
        if (!section.ticketTypeId) return prev;
        if (selectedIds.size >= maxSeats) {
          toast.warning(`You can select up to ${maxSeats} seats per booking`);
          return prev;
        }
        next.set(seat.id, { seat, section });
      }
      return next;
    });
  };

  const items = [...selected.values()].filter(({ seat }) => selectedIds.has(seat.id));
  const estimate = items.reduce((sum, { section }) => sum + (typeById.get(section.ticketTypeId)?.price || 0), 0);

  const hold = useMutation({
    mutationFn: () => createHold({ eventId, seatIds: items.map((i) => i.seat.id) }),
    onSuccess: (res) => {
      qc.setQueryData(['booking', res.data._id], res);
      navigate(`/checkout/${res.data._id}`);
    },
    onError: (err) => {
      if (err.code === 'SEATS_UNAVAILABLE') {
        const lost = new Set(err.details?.seatIds || []);
        setSelected((prev) => new Map([...prev].filter(([id]) => !lost.has(id))));
        toast.error('Sorry! Some of those seats were just taken. Please pick others.');
        qc.invalidateQueries({ queryKey: seatKeys.availability(eventId) });
      } else if (err.code === 'ADMISSION_REQUIRED') {
        toast.info('This is a high-demand event. Please join the queue.');
        navigate(`/events/${slug}/queue`);
      } else if (err.code === 'PAYMENT_IN_PROGRESS' && err.details?.bookingId) {
        navigate(`/checkout/${err.details.bookingId}`);
      } else toast.error(err.message);
    },
  });

  if (eventLoading) return <PageLoader />;
  if (eventError) return <div className="container-page py-16"><ErrorState error={eventError} /></div>;

  return (
    <div className="pb-36">
      <div className="border-b border-slate-200 bg-white">
        <div className="container-page flex items-center gap-4 py-4">
          <Link to={`/events/${slug}`} className="rounded-full p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0">
            <h1 className="truncate font-bold text-slate-900">{event.title}</h1>
            <p className="truncate text-sm text-slate-500">{event.venueName} · {formatDateTime(event.startsAt)}</p>
          </div>
          <div className="ml-auto hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
            {realtime ? (
              <><Radio className="h-3.5 w-3.5 text-emerald-600" /> Live seat updates</>
            ) : (
              <><RefreshCw className={`h-3.5 w-3.5 ${availability.isFetching ? 'animate-spin' : ''}`} /> Refreshes every 10s</>
            )}
          </div>
        </div>
      </div>

      <div className="container-page mt-6 space-y-4">
        {activeHold && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-amber-900"><Clock className="h-4 w-4" /> You already have seats {activeHold.items.map((i) => i.label).join(', ')} on hold for this event.</p>
            <Button size="sm" to={`/checkout/${activeHold._id}`}>Continue to checkout</Button>
          </div>
        )}
        {layout.data && <SeatLegend ticketTypes={layout.data.ticketTypes} />}
        {layout.isLoading ? (
          <Skeleton className="h-[60vh]" />
        ) : layout.error ? (
          <ErrorState error={layout.error} onRetry={layout.refetch} />
        ) : (
          <SeatMap layout={layout.data} statusById={statusById} selected={selectedIds} onSeatClick={toggle} mode="select" />
        )}
        <p className="text-center text-xs text-slate-500">Tap a seat to select it. Seats are only reserved for you once you continue to checkout.</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="container-page flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">No seats selected · up to {maxSeats} per booking</p>
            ) : (
              <div className="scrollbar-none flex gap-2 overflow-x-auto">
                {items.map(({ seat, section }) => (
                  <span key={seat.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full" style={{ background: typeById.get(section.ticketTypeId)?.color }} />
                    {seat.label}
                    <button onClick={() => toggle(seat, section)} aria-label={`Remove ${seat.label}`}><X className="h-3 w-3 text-slate-400" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right">
              <p className="text-xs text-slate-500">{items.length} seat{items.length === 1 ? '' : 's'} · excl. fees</p>
              <p className="text-lg font-bold">{formatINR(estimate)}</p>
            </div>
            <Button size="lg" disabled={!items.length} loading={hold.isPending} onClick={() => hold.mutate()}>
              Proceed to checkout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
