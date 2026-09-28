import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, IndianRupee, Plus, ScanLine, Ticket, UserCheck, Percent } from 'lucide-react';
import { http } from '../../lib/api';
import { ChartCard, OccupancyBars, SalesByCategory, SalesOverTime } from './Charts';
import { Button } from '../../components/ui/Button';
import { ErrorState, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { Select, Input } from '../../components/ui/Form';
import { DataTable, PageHeader, Pagination, StatCard } from '../../components/ui/Layout';
import { formatDateTime, formatINR, percent } from '../../lib/format';
import { useDebounce } from '../../hooks/useCommon';

function KpiSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
}

export function OrganizerOverviewPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['org-overview'], queryFn: () => http.get('/organizer/overview').then((r) => r.data) });
  return (
    <>
      <PageHeader title="Dashboard" subtitle="How your events are selling." actions={<Button to="/organizer/events/new"><Plus className="h-4 w-4" /> New event</Button>} />
      {isLoading ? <KpiSkeleton /> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Ticket revenue" value={formatINR(data.kpis.revenue)} hint={`${data.kpis.bookings} confirmed bookings`} icon={IndianRupee} />
            <StatCard label="Tickets sold" value={data.kpis.ticketsSold.toLocaleString('en-IN')} hint={`${percent(data.kpis.occupancy)} overall occupancy`} icon={Ticket} />
            <StatCard label="Events" value={data.kpis.totalEvents} hint={`${data.kpis.upcomingEvents} upcoming · ${data.kpis.publishedEvents} published`} icon={CalendarDays} />
            <StatCard label="Attendance" value={data.kpis.attendanceRate === null ? '—' : percent(data.kpis.attendanceRate)} hint={`${data.kpis.checkedIn} checked in (past events)`} icon={UserCheck} />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <ChartCard title="Tickets & revenue - last 30 days" className="xl:col-span-2"><SalesOverTime series={data.series} /></ChartCard>
            <ChartCard title="Revenue by ticket category"><SalesByCategory data={data.byCategory} /></ChartCard>
          </div>
          <ChartCard title="Occupancy by event"><OccupancyBars data={data.occupancyByEvent} /></ChartCard>
        </div>
      )}
    </>
  );
}

export function EventAnalyticsPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['org-event-analytics', id], queryFn: () => http.get(`/organizer/events/${id}/analytics`).then((r) => r.data) });
  if (isLoading) return <KpiSkeleton />;
  if (error) return <ErrorState error={error} />;
  const k = data.kpis;
  return (
    <>
      <Link to="/organizer/events" className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Events</Link>
      <PageHeader
        title={data.event.title}
        subtitle={formatDateTime(data.event.startsAt)}
        actions={
          <>
            <Button variant="secondary" to={`/organizer/bookings?eventId=${id}`}>Bookings</Button>
            <Button to={`/organizer/events/${id}/check-in`}><ScanLine className="h-4 w-4" /> Check-in</Button>
          </>
        }
      />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={formatINR(k.revenue)} hint={`${k.bookings} bookings`} icon={IndianRupee} />
          <StatCard label="Sold" value={`${k.ticketsSold} / ${k.totalSeats}`} icon={Ticket} />
          <StatCard label="Occupancy" value={percent(k.occupancy)} icon={Percent} />
          <StatCard label="Checked in" value={`${k.checkedIn}`} hint={`${percent(k.attendanceRate)} of tickets sold`} icon={UserCheck} />
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <ChartCard title="Sales over time" className="xl:col-span-2"><SalesOverTime series={data.series} /></ChartCard>
          <ChartCard title="By ticket category"><SalesByCategory data={data.byCategory} /></ChartCard>
        </div>
        <ChartCard title="Occupancy by section"><OccupancyBars data={data.bySection} nameKey="name" soldKey="booked" totalKey="total" /></ChartCard>
      </div>
    </>
  );
}

export function OrganizerBookingsPage() {
  const params = new URLSearchParams(window.location.search);
  const [eventId, setEventId] = useState(params.get('eventId') || '');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounce(q);
  const events = useQuery({ queryKey: ['org-events-all'], queryFn: () => http.get('/organizer/events', { limit: 50 }).then((r) => r.data) });
  const { data, isLoading, error } = useQuery({
    queryKey: ['org-bookings', eventId, status, debouncedQ, page],
    queryFn: () => http.get('/organizer/bookings', { eventId: eventId || undefined, status: status || undefined, q: debouncedQ || undefined, page, limit: 20 }),
  });

  const columns = [
    { key: 'ref', header: 'Booking', render: (b) => <span className="font-mono text-xs">{b.bookingRef}</span> },
    { key: 'customer', header: 'Customer', render: (b) => <div><p className="font-medium text-slate-900">{b.customer.name}</p><p className="text-xs text-slate-500">{b.customer.email}</p></div> },
    { key: 'event', header: 'Event', render: (b) => <span className="block max-w-48 truncate">{b.eventTitle}</span> },
    { key: 'seats', header: 'Seats', render: (b) => b.seats.join(', ') },
    { key: 'amount', header: 'Amount', render: (b) => formatINR(b.amount) },
    { key: 'payment', header: 'Payment', render: (b) => b.paymentStatus && <StatusBadge status={b.paymentStatus} /> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
    { key: 'date', header: 'Booked', render: (b) => formatDateTime(b.confirmedAt || b.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Bookings" subtitle="Every confirmed, cancelled and failed booking across your events." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select value={eventId} onChange={(e) => { setEventId(e.target.value); setPage(1); }}>
          <option value="">All events</option>
          {events.data?.map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="FAILED">Failed</option>
        </Select>
        <Input placeholder="Search booking ref (BK-...)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {isLoading ? <Skeleton className="h-96" /> : error ? <ErrorState error={error} /> : (
        <DataTable columns={columns} rows={data.data} empty={<p className="card p-10 text-center text-sm text-slate-500">No bookings match these filters.</p>} />
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  );
}
