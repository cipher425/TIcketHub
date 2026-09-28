import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Pencil, Plus, ScanLine, CalendarPlus } from 'lucide-react';
import { http } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton, StatusBadge, Badge } from '../../components/ui/Feedback';
import { DataTable, PageHeader, Pagination, Tabs } from '../../components/ui/Layout';
import { formatDateTime, priceRange } from '../../lib/format';

export function OrganizerEventsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['org-events', status, page],
    queryFn: () => http.get('/organizer/events', { status: status || undefined, page, limit: 15 }),
  });

  const columns = [
    {
      key: 'title',
      header: 'Event',
      render: (e) => (
        <div className="flex items-center gap-3">
          {e.bannerUrl ? <img src={e.bannerUrl} alt="" className="h-10 w-16 rounded-lg object-cover" /> : <div className="h-10 w-16 rounded-lg bg-slate-200" />}
          <div className="min-w-0">
            <Link to={`/organizer/events/${e._id}`} className="block max-w-64 truncate font-semibold text-slate-900 hover:text-brand-600">{e.title}</Link>
            <p className="text-xs text-slate-500">{e.venueName}, {e.city}</p>
          </div>
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (e) => formatDateTime(e.startsAt) },
    { key: 'status', header: 'Status', render: (e) => <div className="flex gap-1"><StatusBadge status={e.status} />{e.moderation === 'SUSPENDED' && <Badge tone="red">Suspended</Badge>}</div> },
    { key: 'price', header: 'Price', render: (e) => priceRange(e.minPrice, e.maxPrice) },
    {
      key: 'sold',
      header: 'Sold',
      render: (e) => (
        <div className="w-28">
          <p className="text-xs text-slate-600">{e.seatsSold} / {e.totalSeats || '—'}</p>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${e.totalSeats ? (e.seatsSold / e.totalSeats) * 100 : 0}%` }} /></div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (e) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" to={`/organizer/events/${e._id}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
          {e.status !== 'DRAFT' && <Button size="sm" variant="ghost" to={`/organizer/events/${e._id}/analytics`} title="Analytics"><BarChart3 className="h-4 w-4" /></Button>}
          {e.status === 'PUBLISHED' && <Button size="sm" variant="ghost" to={`/organizer/events/${e._id}/check-in`} title="Check-in"><ScanLine className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Events" subtitle="Create, publish and manage your events." actions={<Button to="/organizer/events/new"><Plus className="h-4 w-4" /> New event</Button>} />
      <Tabs
        tabs={[{ value: '', label: 'All' }, { value: 'DRAFT', label: 'Drafts' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'UNPUBLISHED', label: 'Unpublished' }, { value: 'CANCELLED', label: 'Cancelled' }]}
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
      />
      {isLoading ? <Skeleton className="h-96" /> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <DataTable
          columns={columns}
          rows={data.data}
          empty={<EmptyState icon={CalendarPlus} title="No events yet" message="Set up a venue, then create your first event." action={<Button to="/organizer/events/new">Create event</Button>} />}
        />
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  );
}
