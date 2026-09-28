import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Plus, Rocket, Trash2, EyeOff, Ban, Save } from 'lucide-react';
import { http } from '../../lib/api';
import { SeatMap, SeatLegend } from '../seating/SeatMap';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { ErrorState, PageLoader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { PageHeader, Tabs } from '../../components/ui/Layout';
import { toInputDateTime, toPaise, toRupees } from '../../lib/format';

const CATEGORIES = ['Music', 'Comedy', 'Theatre', 'Sports', 'Conference', 'Workshop', 'Festival', 'Kids'];
const COLORS = ['#f59e0b', '#8b5cf6', '#0ea5e9', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];

const showErr = (err) => toast.error(err.details?.[0] ? `${err.details[0].field}: ${err.details[0].message}` : err.message);

/* ------------------------------ Details ------------------------------ */

function DetailsForm({ event, onSaved }) {
  const navigate = useNavigate();
  const venues = useQuery({ queryKey: ['org-venues'], queryFn: () => http.get('/organizer/venues').then((r) => r.data) });
  const c = event?.policies?.cancellation;
  const form = useForm({
    defaultValues: {
      title: event?.title || '',
      category: event?.category || 'Music',
      venueId: event?.venue ? String(event.venue._id || event.venue) : '',
      description: event?.description || '',
      bannerUrl: event?.bannerUrl || '',
      startsAt: toInputDateTime(event?.startsAt),
      endsAt: toInputDateTime(event?.endsAt),
      salesStartAt: toInputDateTime(event?.salesStartAt),
      maxSeatsPerBooking: event?.policies?.maxSeatsPerBooking || 6,
      ageLimit: event?.policies?.ageLimit || 'All ages',
      terms: (event?.policies?.terms || []).join('\n'),
      cancellationAllowed: c ? c.allowed : true,
      tier1Hours: c?.tiers?.[0]?.hoursBefore ?? 72,
      tier1Percent: c?.tiers?.[0]?.refundPercent ?? 100,
      tier2Hours: c?.tiers?.[1]?.hoursBefore ?? 24,
      tier2Percent: c?.tiers?.[1]?.refundPercent ?? 50,
    },
  });
  const locked = !!event?.inventoryGeneratedAt;

  const onSubmit = async (v) => {
    const body = {
      title: v.title,
      category: v.category,
      venueId: v.venueId,
      description: v.description,
      bannerUrl: v.bannerUrl,
      startsAt: new Date(v.startsAt).toISOString(),
      endsAt: new Date(v.endsAt).toISOString(),
      salesStartAt: v.salesStartAt ? new Date(v.salesStartAt).toISOString() : null,
      policies: {
        maxSeatsPerBooking: Number(v.maxSeatsPerBooking),
        ageLimit: v.ageLimit,
        terms: v.terms.split('\n').map((t) => t.trim()).filter(Boolean),
        cancellation: {
          allowed: v.cancellationAllowed,
          tiers: [
            { hoursBefore: Number(v.tier1Hours), refundPercent: Number(v.tier1Percent) },
            { hoursBefore: Number(v.tier2Hours), refundPercent: Number(v.tier2Percent) },
          ].filter((t) => t.refundPercent > 0),
        },
      },
    };
    try {
      if (event) {
        if (locked) delete body.venueId;
        await http.patch(`/organizer/events/${event._id}`, body);
        toast.success('Event details saved');
        onSaved();
      } else {
        const res = await http.post('/organizer/events', body);
        toast.success('Draft created - now set up tickets and seating');
        navigate(`/organizer/events/${res.data._id}?tab=tickets`, { replace: true });
      }
    } catch (err) {
      showErr(err);
    }
  };

  if (venues.data && !venues.data.length) {
    return (
      <div className="card p-6 text-center">
        <p className="font-semibold">Create a venue first</p>
        <p className="mt-1 text-sm text-slate-500">Every event needs a venue with a seating layout.</p>
        <Button className="mt-4" to="/organizer/venues/new">Create venue</Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 xl:grid-cols-3">
      <div className="card space-y-4 p-5 xl:col-span-2">
        <Field label="Title"><Input required minLength={3} {...form.register('title')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category"><Select {...form.register('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Venue" hint={locked ? 'Locked after publishing' : undefined}>
            <Select required disabled={locked} {...form.register('venueId')}>
              <option value="">Select a venue</option>
              {venues.data?.map((v) => <option key={v._id} value={v._id}>{v.name}, {v.city} ({v.capacity} seats)</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description"><Textarea required rows={6} minLength={20} {...form.register('description')} /></Field>
        <Field label="Banner image URL" hint="Tip: https://picsum.photos/seed/anything/1200/600"><Input type="url" {...form.register('bannerUrl')} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts"><Input type="datetime-local" required {...form.register('startsAt')} /></Field>
          <Field label="Ends"><Input type="datetime-local" required {...form.register('endsAt')} /></Field>
          <Field label="Sales open (optional)"><Input type="datetime-local" {...form.register('salesStartAt')} /></Field>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <h3 className="font-semibold text-slate-900">Booking rules</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max seats / booking"><Input type="number" min={1} max={10} {...form.register('maxSeatsPerBooking')} /></Field>
            <Field label="Age limit"><Input {...form.register('ageLimit')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="accent-brand-600" {...form.register('cancellationAllowed')} /> Allow cancellations</label>
          {form.watch('cancellationAllowed') && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              {[1, 2].map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <Input type="number" className="w-20" {...form.register(`tier${n}Hours`)} /> <span>h before →</span>
                  <Input type="number" className="w-20" {...form.register(`tier${n}Percent`)} /> <span>% refund</span>
                </div>
              ))}
            </div>
          )}
          <Field label="Terms (one per line)"><Textarea rows={4} {...form.register('terms')} /></Field>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}><Save className="h-4 w-4" /> {event ? 'Save details' : 'Create draft'}</Button>
      </div>
    </form>
  );
}

/* ------------------------- Tickets & seating ------------------------- */

function TicketsAndSeating({ event, onSaved }) {
  const qc = useQueryClient();
  const locked = !!event.inventoryGeneratedAt;
  const sections = event.venue?.layout?.sections || [];
  const form = useForm({
    defaultValues: {
      ticketTypes: event.ticketTypes.length
        ? event.ticketTypes.map((t) => ({ id: t._id, name: t.name, description: t.description || '', price: toRupees(t.price), color: t.color, sectionKeys: t.sectionKeys }))
        : sections.map((s, i) => ({ name: s.name, description: '', price: 999, color: COLORS[i % COLORS.length], sectionKeys: [s.key] })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'ticketTypes' });

  const seatMap = useQuery({ queryKey: ['org-seat-map', event._id], queryFn: () => http.get(`/organizer/events/${event._id}/seat-map`).then((r) => r.data) });
  const [blocked, setBlocked] = useState(null); // Set of labels
  const [savingSeats, setSavingSeats] = useState(false);

  useEffect(() => {
    if (seatMap.data && blocked === null) {
      const set = new Set();
      for (const s of seatMap.data.sections) for (const r of s.rows) for (const seat of r.seats) if (seat.status === 'X' && s.ticketTypeId) set.add(seat.label);
      setBlocked(set);
    }
  }, [seatMap.data, blocked]);

  // Build statuses from local state (blocked toggles) + server state (held/booked).
  const { layout, statusById } = useMemo(() => {
    if (!seatMap.data || !blocked) return {};
    const map = new Map();
    const stripped = {
      ...seatMap.data,
      sections: seatMap.data.sections.map((s) => ({
        ...s,
        rows: s.rows.map((r) => ({
          ...r,
          seats: r.seats.map(({ status, ...seat }) => {
            if (!s.ticketTypeId) map.set(seat.id, 'X');
            else if (status === 'B' || status === 'H') map.set(seat.id, status);
            else if (blocked.has(seat.label)) map.set(seat.id, 'X');
            return seat;
          }),
        })),
      })),
    };
    return { layout: stripped, statusById: map };
  }, [seatMap.data, blocked]);

  const toggleBlock = (seat, section) => {
    if (!section.ticketTypeId) return toast.info('Assign this section to a ticket type to sell it');
    setBlocked((prev) => {
      const next = new Set(prev);
      next.has(seat.label) ? next.delete(seat.label) : next.add(seat.label);
      return next;
    });
  };

  const saveTypes = async (v) => {
    try {
      await http.put(`/organizer/events/${event._id}/ticket-types`, {
        ticketTypes: v.ticketTypes.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          price: toPaise(t.price),
          color: t.color,
          // Disabled checkboxes are not submitted, so when locked send the saved mapping back unchanged.
          sectionKeys: locked ? event.ticketTypes.find((x) => x._id === t.id)?.sectionKeys || [] : [].concat(t.sectionKeys || []),
        })),
      });
      toast.success('Ticket types saved');
      qc.invalidateQueries({ queryKey: ['org-seat-map', event._id] });
      onSaved();
    } catch (err) {
      showErr(err);
    }
  };

  const saveSeats = async () => {
    setSavingSeats(true);
    try {
      await http.put(`/organizer/events/${event._id}/seating`, { blockedSeatLabels: [...blocked] });
      toast.success('Seating saved');
      qc.invalidateQueries({ queryKey: ['org-seat-map', event._id] });
    } catch (err) {
      showErr(err);
    } finally {
      setSavingSeats(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={form.handleSubmit(saveTypes)} className="card space-y-4 p-5">
        <div>
          <h3 className="font-semibold text-slate-900">Ticket categories</h3>
          <p className="text-sm text-slate-500">
            {locked ? 'Seating categories are locked after publishing - you can still edit names, descriptions, colours and prices (existing bookings keep their price).' : 'Assign each venue section to exactly one category. Unassigned sections are not sold.'}
          </p>
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 lg:grid-cols-12">
            <div className="lg:col-span-3"><Field label="Name"><Input required {...form.register(`ticketTypes.${i}.name`)} /></Field></div>
            <div className="lg:col-span-2"><Field label="Price (₹)"><Input type="number" min={0} step="1" required {...form.register(`ticketTypes.${i}.price`)} /></Field></div>
            <div className="lg:col-span-1"><Field label="Colour"><input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-slate-300" {...form.register(`ticketTypes.${i}.color`)} /></Field></div>
            <div className="lg:col-span-5">
              <p className="mb-1.5 text-sm font-medium text-slate-700">Sections</p>
              <div className="flex flex-wrap gap-2">
                {sections.map((s) => (
                  <label key={s.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-sm">
                    <input type="checkbox" value={s.key} disabled={locked} className="accent-brand-600" {...form.register(`ticketTypes.${i}.sectionKeys`)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-end justify-end lg:col-span-1">
              <button type="button" disabled={locked} onClick={() => remove(i)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="lg:col-span-12"><Input placeholder="Short description (optional)" {...form.register(`ticketTypes.${i}.description`)} /></div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {!locked && <Button type="button" variant="secondary" size="sm" onClick={() => append({ name: '', price: 499, color: COLORS[fields.length % COLORS.length], sectionKeys: [], description: '' })}><Plus className="h-4 w-4" /> Add category</Button>}
          <Button type="submit" size="sm" loading={form.formState.isSubmitting}>Save categories</Button>
        </div>
      </form>

      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Seat map</h3>
            <p className="text-sm text-slate-500">Click seats to block/unblock them (house seats, camera positions, broken seats). Held or booked seats can't be blocked.</p>
          </div>
          <Button size="sm" onClick={saveSeats} loading={savingSeats} disabled={!blocked}>Save seating{blocked ? ` (${blocked.size} blocked)` : ''}</Button>
        </div>
        {seatMap.isLoading || !layout ? <Skeleton className="h-80" /> : seatMap.error ? <ErrorState error={seatMap.error} /> : (
          <div className="space-y-3">
            <SeatLegend ticketTypes={layout.ticketTypes} />
            <SeatMap layout={layout} statusById={statusById} onSeatClick={toggleBlock} mode="block" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Publish ------------------------------ */

function PublishPanel({ event, onSaved }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');

  const act = async (action, fn, msg) => {
    setBusy(action);
    try {
      await fn();
      toast.success(msg);
      onSaved();
    } catch (err) {
      showErr(err);
    } finally {
      setBusy(null);
    }
  };

  const checklist = [
    ['Event details', !!event.title && !!event.description],
    ['Venue selected', !!event.venue],
    ['Ticket categories with sections', event.ticketTypes.some((t) => t.sectionKeys.length)],
    ['Starts in the future', new Date(event.startsAt) > new Date()],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4 p-5">
        <div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">Status</h3><StatusBadge status={event.status} />{event.moderation === 'SUSPENDED' && <StatusBadge status="SUSPENDED" />}</div>
        {event.moderation === 'SUSPENDED' && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Suspended by an admin{event.moderationReason ? `: ${event.moderationReason}` : ''}. It is hidden from customers.</p>}
        <ul className="space-y-1.5 text-sm">
          {checklist.map(([label, ok]) => <li key={label} className={ok ? 'text-emerald-700' : 'text-slate-500'}>{ok ? '✓' : '○'} {label}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          {['DRAFT', 'UNPUBLISHED'].includes(event.status) && (
            <Button loading={busy === 'publish'} onClick={() => act('publish', () => http.post(`/organizer/events/${event._id}/publish`), 'Event is live!')}><Rocket className="h-4 w-4" /> Publish</Button>
          )}
          {event.status === 'PUBLISHED' && (
            <>
              <Button variant="secondary" loading={busy === 'unpublish'} onClick={() => act('unpublish', () => http.post(`/organizer/events/${event._id}/unpublish`), 'Event hidden from customers')}><EyeOff className="h-4 w-4" /> Unpublish</Button>
              <Button variant="secondary" to={`/events/${event.slug}`}><ExternalLink className="h-4 w-4" /> View public page</Button>
            </>
          )}
        </div>
        {event.status === 'DRAFT' && <p className="text-xs text-slate-500">Publishing generates the seat inventory for this event from the venue layout. After that, the venue and seat categories are locked.</p>}
      </div>
      <div className="card space-y-3 border-red-200 p-5">
        <h3 className="font-semibold text-red-700">Danger zone</h3>
        {!event.inventoryGeneratedAt ? (
          <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete draft</Button>
        ) : event.status !== 'CANCELLED' ? (
          <>
            <p className="text-sm text-slate-600">Cancelling refunds every confirmed booking in full and notifies all ticket holders. This cannot be undone.</p>
            <Button variant="danger" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel event</Button>
          </>
        ) : (
          <p className="text-sm text-slate-600">This event was cancelled: {event.cancellationReason}</p>
        )}
      </div>
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this event?"
        confirmLabel="Cancel event & refund everyone"
        loading={busy === 'cancel'}
        onConfirm={() => act('cancel', () => http.post(`/organizer/events/${event._id}/cancel`, { reason }), 'Event cancelled. Refunds are being processed.').then(() => setCancelOpen(false))}
      >
        <Field label="Reason shown to customers"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Artist unwell" /></Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this draft?"
        message="The draft and its ticket categories will be permanently removed."
        confirmLabel="Delete"
        loading={busy === 'delete'}
        onConfirm={async () => {
          setBusy('delete');
          try {
            await http.delete(`/organizer/events/${event._id}`);
            toast.success('Draft deleted');
            navigate('/organizer/events');
          } catch (err) {
            showErr(err);
            setBusy(null);
          }
        }}
      />
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */

export function EventEditorPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const tab = params.get('tab') || 'details';
  const { data: event, isLoading, error } = useQuery({
    queryKey: ['org-event', id],
    queryFn: () => http.get(`/organizer/events/${id}`).then((r) => r.data),
    enabled: !!id,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['org-event', id] });
    qc.invalidateQueries({ queryKey: ['org-events'] });
  };

  if (!id) {
    return (
      <>
        <Link to="/organizer/events" className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Events</Link>
        <PageHeader title="New event" subtitle="Step 1 of 3 - the basics. You'll set tickets and seating next." />
        <DetailsForm />
      </>
    );
  }
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <>
      <Link to="/organizer/events" className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Events</Link>
      <PageHeader title={event.title} subtitle={`${event.venue?.name || ''} · ${event.city}`} actions={<StatusBadge status={event.status} />} />
      <Tabs
        tabs={[{ value: 'details', label: '1. Details' }, { value: 'tickets', label: '2. Tickets & seating' }, { value: 'publish', label: '3. Publish' }]}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      {tab === 'details' && <DetailsForm key={event.updatedAt} event={event} onSaved={refresh} />}
      {tab === 'tickets' && <TicketsAndSeating key={event.updatedAt} event={event} onSaved={refresh} />}
      {tab === 'publish' && <PublishPanel event={event} onSaved={refresh} />}
    </>
  );
}
