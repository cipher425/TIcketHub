import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useCategories, useCities, useEventList } from './api';
import { EventGrid } from './EventCard';
import { useDebounce } from '../../hooks/useCommon';
import { Input, Select } from '../../components/ui/Form';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/Feedback';
import { Pagination } from '../../components/ui/Layout';
import { cn } from '../../lib/cn';

const PRICE_BUCKETS = [
  { label: 'Any price', min: '', max: '' },
  { label: 'Under Rs 500', min: '', max: 50000 },
  { label: 'Rs 500 - 2,000', min: 50000, max: 200000 },
  { label: 'Rs 2,000 - 5,000', min: 200000, max: 500000 },
  { label: 'Above Rs 5,000', min: 500000, max: '' },
];

const DATE_PRESETS = {
  today: () => {
    const s = new Date();
    const e = new Date();
    e.setHours(23, 59, 59);
    return [s, e];
  },
  weekend: () => {
    const now = new Date();
    const sat = new Date(now);
    sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7));
    sat.setHours(0, 0, 0);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    sun.setHours(23, 59, 59);
    return [sat < now ? now : sat, sun];
  },
  month: () => [new Date(), new Date(Date.now() + 30 * 86_400_000)],
};

/**
 * All filters live in the URL (?city=Pune&category=Music&page=2) so results are shareable,
 * bookmarkable and survive refresh / back button.
 */
export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debouncedQ = useDebounce(q, 350);
  const [showFilters, setShowFilters] = useState(false);
  const { data: cities = [] } = useCities();
  const { data: categories = [] } = useCategories();

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === '' || v === undefined || v === null ? next.delete(k) : next.set(k, v)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search: we only hit the API 350ms after the user stops typing.
  useEffect(() => {
    if ((params.get('q') || '') !== debouncedQ) update({ q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const datePreset = params.get('when') || '';
  const query = useMemo(() => {
    const out = { page: params.get('page') || 1, limit: 12, sort: params.get('sort') || 'date' };
    for (const k of ['q', 'city', 'category', 'minPrice', 'maxPrice']) if (params.get(k)) out[k] = params.get(k);
    if (datePreset && DATE_PRESETS[datePreset]) {
      const [from, to] = DATE_PRESETS[datePreset]();
      out.from = from.toISOString();
      out.to = to.toISOString();
    }
    return out;
  }, [params, datePreset]);

  const { data, isLoading, isFetching, error, refetch } = useEventList(query);
  const priceIdx = Math.max(0, PRICE_BUCKETS.findIndex((b) => String(b.min) === (params.get('minPrice') || '') && String(b.max) === (params.get('maxPrice') || '')));
  const activeCount = ['city', 'category', 'minPrice', 'maxPrice', 'when'].filter((k) => params.get(k)).length;

  const filters = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">City</p>
        <Select value={params.get('city') || ''} onChange={(e) => update({ city: e.target.value })}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
        </Select>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Category</p>
        <div className="flex flex-wrap gap-2">
          {['', ...categories].map((c) => (
            <button
              key={c || 'all'}
              onClick={() => update({ category: c })}
              className={cn('rounded-full border px-3 py-1 text-sm', (params.get('category') || '') === c ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
            >
              {c || 'All'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Date</p>
        <div className="flex flex-wrap gap-2">
          {[['', 'Any time'], ['today', 'Today'], ['weekend', 'This weekend'], ['month', 'Next 30 days']].map(([v, label]) => (
            <button key={v || 'any'} onClick={() => update({ when: v })} className={cn('rounded-full border px-3 py-1 text-sm', datePreset === v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Price</p>
        <div className="space-y-1.5">
          {PRICE_BUCKETS.map((b, i) => (
            <label key={b.label} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="price" checked={priceIdx === i} onChange={() => update({ minPrice: b.min, maxPrice: b.max })} className="accent-brand-600" />
              {b.label}
            </label>
          ))}
        </div>
      </div>
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setParams(q ? { q } : {})}>
          <X className="h-4 w-4" /> Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by event, venue or city" className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={query.sort} onChange={(e) => update({ sort: e.target.value })} className="w-44">
            <option value="date">Date: soonest</option>
            <option value="popularity">Most popular</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </Select>
          <Button variant="secondary" className="lg:hidden" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ''}
          </Button>
        </div>
      </div>

      <div className="flex gap-8">
        <aside className={cn('w-64 shrink-0', showFilters ? 'fixed inset-0 z-40 w-full overflow-y-auto bg-white p-6 lg:static lg:w-64 lg:p-0' : 'hidden lg:block')}>
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <h2 className="text-lg font-bold">Filters</h2>
            <Button size="sm" onClick={() => setShowFilters(false)}>Show results</Button>
          </div>
          {filters}
        </aside>

        <div className="min-w-0 flex-1">
          <p className="mb-4 text-sm text-slate-500">
            {data?.meta ? `${data.meta.total} event${data.meta.total === 1 ? '' : 's'} found` : ' '}
            {isFetching && !isLoading && <span className="ml-2 text-brand-600">Updating...</span>}
          </p>
          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !isLoading && !data?.data?.length ? (
            <EmptyState title="No events match your filters" message="Try a different search, date or city." action={<Button variant="secondary" onClick={() => { setQ(''); setParams({}); }}>Reset search</Button>} />
          ) : (
            <div className={cn(isFetching && !isLoading && 'opacity-60 transition-opacity')}>
              <EventGrid events={data?.data || []} loading={isLoading} count={6} />
            </div>
          )}
          <Pagination meta={data?.meta} onPage={(p) => { update({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </div>
      </div>
    </div>
  );
}
