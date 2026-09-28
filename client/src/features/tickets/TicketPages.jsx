import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Ticket as TicketIcon } from 'lucide-react';
import { http } from '../../lib/api';
import { TicketCard } from './TicketCard';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '../../components/ui/Feedback';
import { PageHeader, Pagination, Tabs } from '../../components/ui/Layout';

export function TicketPage() {
  const { ticketId } = useParams();
  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => http.get(`/tickets/${ticketId}`).then((r) => r.data),
  });
  if (isLoading) return <PageLoader />;
  if (error) return <div className="container-page py-16"><ErrorState error={error} /></div>;
  return (
    <div className="container-page max-w-lg py-8">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to={`/account/bookings/${ticket.booking}`} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Booking</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
      </div>
      <TicketCard ticket={ticket} />
      <p className="no-print mt-4 text-center text-xs text-slate-500">Show this QR code at the entrance. Increase your screen brightness for faster scanning.</p>
    </div>
  );
}

export function MyTicketsPage() {
  const [scope, setScope] = useState('upcoming');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-tickets', scope, page],
    queryFn: () => http.get('/tickets', { scope, page }),
  });
  return (
    <>
      <PageHeader title="My tickets" subtitle="Every seat you've booked, with its entry QR code." />
      <Tabs tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past & cancelled' }]} value={scope} onChange={(v) => { setScope(v); setPage(1); }} />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-96" />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.data.length ? (
        <EmptyState icon={TicketIcon} title="No tickets here" message={scope === 'upcoming' ? 'Book an event and your tickets will show up here.' : 'Nothing yet.'} action={<Button to="/events">Explore events</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.data.map((t) => (
            <Link key={t._id} to={`/tickets/${t._id}`} className="transition hover:-translate-y-0.5"><TicketCard ticket={t} compact /></Link>
          ))}
        </div>
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  );
}
