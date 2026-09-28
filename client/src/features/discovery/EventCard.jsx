import { Link } from 'react-router-dom';
import { Calendar, MapPin, Flame } from 'lucide-react';
import { formatShortDate, formatTime, priceRange } from '../../lib/format';
import { SaleBadge, Skeleton } from '../../components/ui/Feedback';

export function EventCard({ event }) {
  const d = new Date(event.startsAt);
  return (
    <Link to={`/events/${event.slug}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-200">
        {event.bannerUrl && (
          <img src={event.bannerUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
        <div className="absolute left-3 top-3 rounded-xl bg-white/95 px-2.5 py-1 text-center shadow">
          <p className="text-[10px] font-bold uppercase text-brand-600">{d.toLocaleString('en-IN', { month: 'short' })}</p>
          <p className="text-lg font-extrabold leading-none text-slate-900">{d.getDate()}</p>
        </div>
        {event.highDemand && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
            <Flame className="h-3 w-3" /> Hot
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{event.category}</p>
        <h3 className="mt-1 line-clamp-2 font-semibold text-slate-900">{event.title}</h3>
        <div className="mt-2 space-y-1 text-sm text-slate-500">
          <p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatShortDate(event.startsAt)} · {formatTime(event.startsAt)}</p>
          <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> <span className="truncate">{event.venueName}, {event.city}</span></p>
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          <p className="text-sm font-bold text-slate-900">{priceRange(event.minPrice, event.maxPrice)}</p>
          {event.bookingStatus && event.bookingStatus !== 'AVAILABLE' && <SaleBadge status={event.bookingStatus} />}
        </div>
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <Skeleton className="aspect-[16/9] rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}

export function EventGrid({ events, loading, count = 8 }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {loading ? Array.from({ length: count }, (_, i) => <EventCardSkeleton key={i} />) : events.map((e) => <EventCard key={e._id} event={e} />)}
    </div>
  );
}
