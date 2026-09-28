import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, MapPin, Music, Mic, Drama, Trophy, Presentation, Wrench, PartyPopper, Baby } from 'lucide-react';
import { useHome } from './api';
import { useCity } from './CityContext';
import { EventCard, EventGrid } from './EventCard';
import { Button } from '../../components/ui/Button';
import { ErrorState, EmptyState, Skeleton } from '../../components/ui/Feedback';
import { formatDateTime, priceRange } from '../../lib/format';

const CATEGORY_ICONS = { Music, Comedy: Mic, Theatre: Drama, Sports: Trophy, Conference: Presentation, Workshop: Wrench, Festival: PartyPopper, Kids: Baby };

function Hero({ event }) {
  if (!event) return null;
  return (
    <section className="relative overflow-hidden bg-slate-900">
      <img src={event.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/80 to-transparent" />
      <div className="container-page relative py-16 sm:py-24">
        <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">Featured</span>
        <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{event.title}</h1>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
          <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> {formatDateTime(event.startsAt)}</span>
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {event.venueName}, {event.city}</span>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button to={`/events/${event.slug}`} size="lg">Book tickets <ArrowRight className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold text-white">{priceRange(event.minPrice, event.maxPrice)}</span>
        </div>
      </div>
    </section>
  );
}

function Rail({ title, subtitle, events, link }) {
  if (!events?.length) return null;
  return (
    <section className="mt-12">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {link && <Link to={link} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">See all <ArrowRight className="h-4 w-4" /></Link>}
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {events.map((e) => (
          <div key={e._id} className="w-72 shrink-0 snap-start sm:w-auto"><EventCard event={e} /></div>
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const { city } = useCity();
  const { data, isLoading, error, refetch } = useHome(city);
  const cityParam = city ? `&city=${encodeURIComponent(city)}` : '';

  return (
    <>
      {isLoading ? <Skeleton className="h-80 rounded-none" /> : <Hero event={data?.featured?.[0] || data?.popular?.[0]} />}
      <div className="container-page">
        {error && <div className="mt-10"><ErrorState error={error} onRetry={refetch} /></div>}

        {data?.categories?.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Browse by category</h2>
            <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
              {data.categories.map((c) => {
                const Icon = CATEGORY_ICONS[c.name] || Music;
                return (
                  <Link key={c.name} to={`/events?category=${c.name}${cityParam}`} className="card flex shrink-0 items-center gap-3 px-4 py-3 transition hover:border-brand-200 hover:shadow">
                    <span className="rounded-xl bg-brand-50 p-2"><Icon className="h-5 w-5 text-brand-600" /></span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{c.name}</span>
                      <span className="block text-xs text-slate-500">{c.count} events</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {isLoading && <div className="mt-12"><EventGrid loading count={4} /></div>}
        <Rail title="Featured events" subtitle="Hand-picked by our team" events={data?.featured} link={`/events?sort=date${cityParam}`} />
        <Rail title="Popular right now" subtitle="What everyone is booking" events={data?.popular} link={`/events?sort=popularity${cityParam}`} />
        <Rail title="Upcoming" subtitle={city ? `Happening soon in ${city}` : 'Happening soon'} events={data?.upcoming} link={`/events?sort=date${cityParam}`} />

        {!isLoading && !error && !data?.upcoming?.length && (
          <div className="mt-12">
            <EmptyState title={`No upcoming events${city ? ` in ${city}` : ''}`} message="Try another city or check back soon." action={<Button to="/events">Explore all events</Button>} />
          </div>
        )}
      </div>
    </>
  );
}
