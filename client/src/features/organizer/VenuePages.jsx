import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Plus, Trash2 } from 'lucide-react';
import { http } from '../../lib/api';
import { SeatMap } from '../seating/SeatMap';
import { useDebounce } from '../../hooks/useCommon';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '../../components/ui/Feedback';
import { PageHeader } from '../../components/ui/Layout';

export function VenuesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['org-venues'], queryFn: () => http.get('/organizer/venues').then((r) => r.data) });
  return (
    <>
      <PageHeader title="Venues" subtitle="Reusable seating layouts for your events." actions={<Button to="/organizer/venues/new"><Plus className="h-4 w-4" /> New venue</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : error ? <ErrorState error={error} /> : !data.length ? (
        <EmptyState icon={Building2} title="No venues yet" message="Create a venue and design its seating layout - you can reuse it for many events." action={<Button to="/organizer/venues/new">Create venue</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((v) => (
            <Link key={v._id} to={`/organizer/venues/${v._id}`} className="card p-5 transition hover:shadow-md">
              <Building2 className="h-6 w-6 text-brand-600" />
              <h3 className="mt-3 font-semibold text-slate-900">{v.name}</h3>
              <p className="text-sm text-slate-500">{v.address}, {v.city}</p>
              <p className="mt-3 text-sm text-slate-700"><b>{v.capacity}</b> seats · {v.layoutSpec?.sections?.length} sections</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

const DEFAULT_SPEC = {
  stageLabel: 'STAGE',
  sections: [
    { name: 'VIP', rows: 2, seatsPerRow: 12, aisleAfter: '6' },
    { name: 'Premium', rows: 4, seatsPerRow: 16, aisleAfter: '4, 12' },
    { name: 'Regular', rows: 6, seatsPerRow: 20, aisleAfter: '5, 15' },
  ],
};

const toSpec = (v) => ({
  stageLabel: v.stageLabel,
  sections: (v.sections || []).map((s) => ({
    name: s.name,
    rows: Number(s.rows),
    seatsPerRow: Number(s.seatsPerRow),
    aisleAfter: String(s.aisleAfter || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0),
  })),
});

/**
 * Layout builder: the organizer describes sections (rows x seats + aisles) and the SERVER
 * generates the actual seat coordinates. The preview calls the same generator the API uses
 * when saving, so what you see is exactly what gets stored.
 */
export function VenueEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['org-venue', id], queryFn: () => http.get(`/organizer/venues/${id}`).then((r) => r.data), enabled: !isNew });

  const form = useForm({ defaultValues: { name: '', address: '', city: '', ...DEFAULT_SPEC } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'sections' });
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    if (existing.data) {
      const v = existing.data;
      form.reset({
        name: v.name,
        address: v.address,
        city: v.city,
        stageLabel: v.layoutSpec?.stageLabel || 'STAGE',
        sections: v.layoutSpec.sections.map((s) => ({ ...s, aisleAfter: (s.aisleAfter || []).join(', ') })),
      });
    }
  }, [existing.data, form]);

  const watched = form.watch();
  const specJson = JSON.stringify(toSpec(watched));
  const debouncedSpec = useDebounce(specJson, 400);

  useEffect(() => {
    const spec = JSON.parse(debouncedSpec);
    if (!spec.sections.length || spec.sections.some((s) => !s.name || !s.rows || !s.seatsPerRow)) return;
    http
      .post('/organizer/venues/layout-preview', spec)
      .then((r) => {
        setPreview({ ...r.data, sections: r.data.sections.map((s) => ({ ...s, rows: s.rows.map((row) => ({ ...row, seats: row.seats.map((seat) => ({ ...seat, id: seat.label })) })) })) });
        setPreviewError(null);
      })
      .catch((err) => setPreviewError(err.details?.[0]?.message || err.message));
  }, [debouncedSpec]);

  const onSubmit = async (values) => {
    const body = { name: values.name, address: values.address, city: values.city, layoutSpec: toSpec(values) };
    try {
      const res = isNew ? await http.post('/organizer/venues', body) : await http.patch(`/organizer/venues/${id}`, body);
      qc.invalidateQueries({ queryKey: ['org-venues'] });
      toast.success(isNew ? 'Venue created' : 'Venue updated');
      navigate(`/organizer/venues/${res.data._id}`, { replace: true });
    } catch (err) {
      toast.error(err.details?.[0] ? `${err.details[0].field}: ${err.details[0].message}` : err.message);
    }
  };

  if (!isNew && existing.isLoading) return <PageLoader />;

  return (
    <>
      <Link to="/organizer/venues" className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Venues</Link>
      <PageHeader title={isNew ? 'New venue' : existing.data?.name} subtitle="Describe the sections; seat positions are generated automatically." />
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-2">
          <div className="card space-y-4 p-5">
            <Field label="Venue name"><Input required {...form.register('name')} /></Field>
            <Field label="Address"><Input required {...form.register('address')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><Input required {...form.register('city')} /></Field>
              <Field label="Stage label"><Input {...form.register('stageLabel')} /></Field>
            </div>
          </div>
          <div className="card space-y-3 p-5">
            <h3 className="font-semibold text-slate-900">Sections <span className="text-xs font-normal text-slate-500">(front to back)</span></h3>
            {fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Input placeholder="Section name" {...form.register(`sections.${i}.name`)} />
                  <button type="button" onClick={() => remove(i)} disabled={fields.length === 1} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label="Rows"><Input type="number" min={1} max={40} {...form.register(`sections.${i}.rows`)} /></Field>
                  <Field label="Seats/row"><Input type="number" min={1} max={60} {...form.register(`sections.${i}.seatsPerRow`)} /></Field>
                  <Field label="Aisle after"><Input placeholder="e.g. 5, 15" {...form.register(`sections.${i}.aisleAfter`)} /></Field>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ name: `Section ${fields.length + 1}`, rows: 3, seatsPerRow: 16, aisleAfter: '' })}>
              <Plus className="h-4 w-4" /> Add section
            </Button>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>{isNew ? 'Create venue' : 'Save venue'}</Button>
          {!isNew && <p className="text-xs text-slate-500">Editing a layout affects future events only. Published events keep the seats they were created with.</p>}
        </div>
        <div className="xl:col-span-3">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Live preview</h3>
              {preview && <span className="text-sm text-slate-500">{preview.capacity} seats</span>}
            </div>
            {previewError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{previewError}</p> : preview ? <SeatMap layout={preview} mode="preview" /> : <Skeleton className="h-80" />}
          </div>
        </div>
      </form>
    </>
  );
}
