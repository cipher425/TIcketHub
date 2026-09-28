import { useParams } from 'react-router-dom';
import { Calendar, Clock, MapPin, ShieldCheck, Users, Info, BadgeCheck, Flame } from 'lucide-react';
import { useEventDetails } from '../discovery/api';
import { useAuth } from '../auth/AuthContext';
import { useAppConfig } from '../../hooks/useCommon';
import { Button } from '../../components/ui/Button';
import { ErrorState, SaleBadge, Skeleton } from '../../components/ui/Feedback';
import { formatDate, formatDateTime, formatINR, formatTime, priceRange } from '../../lib/format';

const BOOKABLE = ['AVAILABLE', 'FILLING_FAST'];

function PolicyCard({ policies }) {
  const c = policies?.cancellation;
  return (
    <div className="card p-5">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Cancellation policy</h3>
      {c?.allowed && c.tiers?.length ? (
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {[...c.tiers].sort((a, b) => b.hoursBefore - a.hoursBefore).map((t) => (
            <li key={t.hoursBefore} className="flex justify-between gap-4">
              <span>Cancel {t.hoursBefore}+ hours before the event</span>
              <span className="font-semibold text-slate-900">{t.refundPercent}% refund</span>
            </li>
          ))}
          <li className="text-xs text-slate-500">Refunds apply to the ticket price. Convenience fees are non-refundable.</li>
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Tickets for this event are non-refundable.</p>
      )}
      {policies?.terms?.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-semibold text-slate-900">Terms</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{policies.terms.map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
    </div>
  );
}

export function EventDetailsPage() {
  const { slug } = useParams();
  const { data: event, isLoading, error, refetch } = useEventDetails(slug);
  const { isAuthenticated } = useAuth();
  const { data: config } = useAppConfig();

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-72 rounded-none" />
        <div className="container-page mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (error) return <div className="container-page py-16"><ErrorState error={error} onRetry={refetch} title={error.status === 404 ? 'Event not found' : undefined} /></div>;

  const bookable = BOOKABLE.includes(event.bookingStatus);
  const useQueue = config?.waitingRoomEnabled && event.highDemand;
  const bookPath = useQueue ? `/events/${event.slug}/queue` : `/events/${event.slug}/seats`;
  const ctaTo = isAuthenticated ? bookPath : `/login?next=${encodeURIComponent(bookPath)}`;
  const durationH = Math.round((new Date(event.endsAt) - new Date(event.startsAt)) / 360_000) / 10;

  return (
    <div className="pb-24 lg:pb-0">
      <div className="relative h-64 overflow-hidden bg-slate-900 sm:h-80">
        {event.bannerUrl && <img src={event.bannerUrl} alt="" className="h-full w-full object-cover opacity-70" />}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/30" />
        <div className="container-page absolute inset-x-0 bottom-0 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{event.category}</span>
            {event.highDemand && <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white"><Flame className="h-3 w-3" /> High demand</span>}
            <SaleBadge status={event.bookingStatus} />
          </div>
          <h1 className="mt-3 max-w-3xl text-2xl font-extrabold tracking-tight text-white sm:text-4xl">{event.title}</h1>
        </div>
      </div>

      <div className="container-page mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <div className="flex gap-3"><Calendar className="mt-0.5 h-5 w-5 text-brand-600" /><div><p className="text-sm font-semibold">{formatDate(event.startsAt)}</p><p className="text-sm text-slate-500">{formatTime(event.startsAt)} - {formatTime(event.endsAt)}</p></div></div>
            <div className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 text-brand-600" /><div><p className="text-sm font-semibold">{event.venueName}</p><p className="text-sm text-slate-500">{event.address}, {event.city}</p></div></div>
            <div className="flex gap-3"><Clock className="mt-0.5 h-5 w-5 text-brand-600" /><div><p className="text-sm font-semibold">{durationH} hours</p><p className="text-sm text-slate-500">Age: {event.policies?.ageLimit || 'All ages'}</p></div></div>
            <div className="flex gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 text-brand-600" /><div><p className="text-sm font-semibold">Organised by</p><p className="text-sm text-slate-500">{event.organizer?.name}</p></div></div>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">About the event</h2>
            <p className="whitespace-pre-line leading-relaxed text-slate-600">{event.description}</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Tickets</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {event.ticketTypes.map((t) => {
                const low = t.available > 0 && t.available <= Math.max(10, t.total * 0.1);
                return (
                  <div key={t.id} className="card flex items-start gap-3 p-4">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{t.name}</p>
                        <p className="font-bold text-slate-900">{formatINR(t.price)}</p>
                      </div>
                      {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
                      <p className={`mt-1 text-xs font-medium ${t.available === 0 ? 'text-red-600' : low ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {t.available === 0 ? 'Sold out' : low ? `Only ${t.available} left` : `${t.available} seats available`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <PolicyCard policies={event.policies} />
        </div>

        <aside className="hidden lg:block">
          <div className="card sticky top-24 p-6">
            <p className="text-sm text-slate-500">Tickets from</p>
            <p className="text-3xl font-extrabold text-slate-900">{priceRange(event.minPrice, event.maxPrice)}</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500"><Users className="h-4 w-4" /> {event.seatsAvailable} of {event.totalSeats} seats left</p>
            <Button to={bookable ? ctaTo : undefined} disabled={!bookable} className="mt-5 w-full" size="lg">
              {bookable ? (useQueue ? 'Join the queue' : 'Select seats') : 'Booking unavailable'}
            </Button>
            {useQueue && bookable && (
              <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><Info className="h-4 w-4 shrink-0" /> High demand: you'll enter a short virtual queue to keep things fair.</p>
            )}
            <p className="mt-4 text-xs text-slate-500">Seats are held for you for a few minutes during checkout. Prices are final and calculated securely by our servers.</p>
            <p className="mt-2 text-xs text-slate-400">Starts {formatDateTime(event.startsAt)}</p>
          </div>
        </aside>
      </div>

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-4 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">From</p>
            <p className="font-bold">{priceRange(event.minPrice, event.maxPrice)}</p>
          </div>
          <Button to={bookable ? ctaTo : undefined} disabled={!bookable} size="lg" className="flex-1">
            {bookable ? (useQueue ? 'Join queue' : 'Select seats') : 'Unavailable'}
          </Button>
        </div>
      </div>
    </div>
  );
}
