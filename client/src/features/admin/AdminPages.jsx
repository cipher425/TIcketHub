import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IndianRupee, Ticket, Users, CalendarDays, UserPlus, Wallet } from 'lucide-react';
import { http } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ChartCard, SalesOverTime } from '../organizer/Charts';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { Badge, EmptyState, ErrorState, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { DataTable, PageHeader, Pagination, StatCard, Tabs } from '../../components/ui/Layout';
import { formatDate, formatDateTime, formatINR } from '../../lib/format';
import { useDebounce } from '../../hooks/useCommon';

export function AdminOverviewPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-stats'], queryFn: () => http.get('/admin/stats').then((r) => r.data) });
  if (isLoading) return <Skeleton className="h-96" />;
  if (error) return <ErrorState error={error} />;
  const totalUsers = Object.values(data.users).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Everything happening on TicketHub." />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Gross booking value" value={formatINR(data.gmv)} hint={`${data.bookings} confirmed bookings`} icon={IndianRupee} />
          <StatCard label="Platform revenue" value={formatINR(data.platformRevenue)} hint="Convenience fees + GST" icon={Wallet} />
          <StatCard label="Tickets sold" value={data.ticketsSold.toLocaleString('en-IN')} icon={Ticket} />
          <StatCard label="Users" value={totalUsers} hint={`${data.users.ORGANIZER || 0} organizers · ${data.users.ADMIN || 0} admins`} icon={Users} />
          <StatCard label="Events" value={Object.values(data.events).reduce((a, b) => a + b, 0)} hint={`${data.events.PUBLISHED || 0} published · ${data.events.DRAFT || 0} drafts`} icon={CalendarDays} />
          <StatCard label="Pending organizer applications" value={data.pendingOrganizers} icon={UserPlus} />
        </div>
        <ChartCard title="Platform sales - last 30 days"><SalesOverTime series={data.series} /></ChartCard>
        {Object.keys(data.refunds).length > 0 && (
          <div className="card p-5 text-sm">
            <p className="font-semibold text-slate-900">Refunds</p>
            {Object.entries(data.refunds).map(([k, v]) => <p key={k} className="text-slate-600">{k}: {v.count} · {formatINR(v.amount)}</p>)}
          </div>
        )}
      </div>
    </>
  );
}

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounce(q);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', debouncedQ, role, page],
    queryFn: () => http.get('/admin/users', { q: debouncedQ || undefined, role: role || undefined, page, limit: 20 }),
  });
  const update = async (id, body) => {
    try {
      await http.patch(`/admin/users/${id}`, body);
      toast.success('User updated');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      toast.error(err.message);
    }
  };
  const columns = [
    { key: 'name', header: 'User', render: (u) => <div><p className="font-medium text-slate-900">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Select className="h-8 w-36" value={u.role} disabled={u._id === me._id} onChange={(e) => update(u._id, { role: e.target.value })}>
          <option>USER</option><option>ORGANIZER</option><option>ADMIN</option>
        </Select>
      ),
    },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'joined', header: 'Joined', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (u) => u._id !== me._id && (
        u.status === 'ACTIVE'
          ? <Button size="sm" variant="secondary" onClick={() => update(u._id, { status: 'SUSPENDED' })}>Suspend</Button>
          : <Button size="sm" variant="secondary" onClick={() => update(u._id, { status: 'ACTIVE' })}>Reactivate</Button>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Users" subtitle="Suspending a user logs them out everywhere immediately." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:col-span-2" />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option><option>USER</option><option>ORGANIZER</option><option>ADMIN</option>
        </Select>
      </div>
      {isLoading ? <Skeleton className="h-96" /> : error ? <ErrorState error={error} /> : <DataTable columns={columns} rows={data.data} rowKey={(u) => u._id} />}
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  );
}

export function AdminOrganizersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-orgs', status],
    queryFn: () => http.get('/admin/organizer-applications', { status }).then((r) => r.data),
  });
  const decide = async (id, decision, body = {}) => {
    setBusy(true);
    try {
      await http.post(`/admin/organizer-applications/${id}/${decision}`, body);
      toast.success(decision === 'approve' ? 'Organizer approved' : 'Application rejected');
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
      setRejecting(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Organizer applications" subtitle="Approve who can create and sell events." />
      <Tabs tabs={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} value={status} onChange={setStatus} />
      {isLoading ? <Skeleton className="h-64" /> : error ? <ErrorState error={error} /> : !data.length ? (
        <EmptyState title="Nothing to review" message="New applications will show up here." />
      ) : (
        <div className="space-y-3">
          {data.map((u) => (
            <div key={u._id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{u.organizerProfile.orgName}</p>
                <p className="text-sm text-slate-500">{u.name} · {u.email} · applied {formatDate(u.organizerProfile.appliedAt)}</p>
                <p className="mt-2 text-sm text-slate-700">{u.organizerProfile.description}</p>
              </div>
              {status === 'PENDING' && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setRejecting(u); setReason(''); }}>Reject</Button>
                  <Button loading={busy} onClick={() => decide(u._id, 'approve')}>Approve</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!rejecting} onClose={() => setRejecting(null)} title="Reject application" confirmLabel="Reject" loading={busy} onConfirm={() => decide(rejecting._id, 'reject', { reason })}>
        <Field label="Reason (sent to the applicant)"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

export function AdminEventsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [suspending, setSuspending] = useState(null);
  const [reason, setReason] = useState('');
  const debouncedQ = useDebounce(q);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-events', debouncedQ, page],
    queryFn: () => http.get('/admin/events', { q: debouncedQ || undefined, page, limit: 20 }),
  });
  const moderate = async (id, action, extra = {}) => {
    try {
      await http.post(`/admin/events/${id}/moderate`, { action, ...extra });
      toast.success('Event updated');
      qc.invalidateQueries({ queryKey: ['admin-events'] });
      setSuspending(null);
    } catch (err) {
      toast.error(err.message);
    }
  };
  const columns = [
    { key: 'title', header: 'Event', render: (e) => <div><p className="max-w-64 truncate font-medium text-slate-900">{e.title}</p><p className="text-xs text-slate-500">{e.organizer?.organizerProfile?.orgName || e.organizer?.name} · {e.city}</p></div> },
    { key: 'date', header: 'Date', render: (e) => formatDateTime(e.startsAt) },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={e.status} />
          {e.moderation === 'SUSPENDED' && <Badge tone="red">Suspended</Badge>}
          {e.isFeatured && <Badge tone="violet">Featured</Badge>}
          {e.highDemand && <Badge tone="brand">High demand</Badge>}
        </div>
      ),
    },
    { key: 'sold', header: 'Sold', render: (e) => `${e.seatsSold}/${e.totalSeats}` },
    {
      key: 'actions',
      header: '',
      render: (e) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => moderate(e._id, e.isFeatured ? 'unfeature' : 'feature')}>{e.isFeatured ? 'Unfeature' : 'Feature'}</Button>
          <Button size="sm" variant="ghost" onClick={() => moderate(e._id, e.highDemand ? 'high-demand-off' : 'high-demand-on')} title="Route buyers through the waiting room">{e.highDemand ? 'Normal' : 'High demand'}</Button>
          {e.moderation === 'SUSPENDED'
            ? <Button size="sm" variant="secondary" onClick={() => moderate(e._id, 'restore')}>Restore</Button>
            : <Button size="sm" variant="danger" onClick={() => { setSuspending(e); setReason(''); }}>Suspend</Button>}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Event moderation" subtitle="Feature, suspend or flag events as high demand." />
      <Input className="mb-4 max-w-md" placeholder="Search events" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {isLoading ? <Skeleton className="h-96" /> : error ? <ErrorState error={error} /> : <DataTable columns={columns} rows={data.data} rowKey={(e) => e._id} />}
      <Pagination meta={data?.meta} onPage={setPage} />
      <ConfirmDialog open={!!suspending} onClose={() => setSuspending(null)} title="Suspend event" confirmLabel="Suspend" onConfirm={() => moderate(suspending._id, 'suspend', { reason })}>
        <p className="mb-3 text-sm text-slate-600">The event is hidden from customers immediately. Existing bookings stay valid.</p>
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}
