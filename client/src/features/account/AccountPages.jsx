import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Bell, CheckCheck, Briefcase } from 'lucide-react';
import { http } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Form';
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { PageHeader, Pagination } from '../../components/ui/Layout';
import { fromNow } from '../../lib/format';
import { cn } from '../../lib/cn';

export function NotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', 'list', page],
    queryFn: () => http.get('/notifications', { page, limit: 20 }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => http.post('/notifications/read-all'), onSuccess: invalidate });
  const markRead = (n) => !n.readAt && http.patch(`/notifications/${n._id}/read`).then(invalidate);

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Booking confirmations, payments, cancellations and reminders."
        actions={data?.meta?.unread > 0 && <Button variant="secondary" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
      />
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.data.length ? (
        <EmptyState icon={Bell} title="You're all caught up" message="We'll let you know when something happens with your bookings." />
      ) : (
        <div className="card divide-y divide-slate-100">
          {data.data.map((n) => (
            <Link key={n._id} to={n.link || '#'} onClick={() => markRead(n)} className={cn('flex gap-3 p-4 transition hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{n.title}</p>
                {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400">{fromNow(n.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  );
}

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Too short'),
  phone: z.string().trim().regex(/^([0-9+\-\s]{7,20})?$/, 'Enter a valid phone number'),
  city: z.string().trim().max(60),
});
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Needs a letter').regex(/\d/, 'Needs a number'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
const applicationSchema = z.object({
  orgName: z.string().trim().min(2, 'Too short'),
  description: z.string().trim().min(20, 'Tell us a bit more (20+ characters)'),
});

export function ProfilePage() {
  const { user, reloadUser } = useAuth();
  const profile = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name, phone: user.phone || '', city: user.city || '' } });
  const password = useForm({ resolver: zodResolver(passwordSchema) });
  const application = useForm({ resolver: zodResolver(applicationSchema) });

  const saveProfile = async (values) => {
    try {
      await http.patch('/users/me', values);
      await reloadUser();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    }
  };
  const changePassword = async ({ currentPassword, newPassword }) => {
    try {
      await http.patch('/users/me/password', { currentPassword, newPassword });
      password.reset();
      toast.success('Password changed. Other devices have been logged out.');
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') password.setError('currentPassword', { message: err.message });
      else toast.error(err.message);
    }
  };
  const apply = async (values) => {
    try {
      await http.post('/users/me/organizer-application', values);
      await reloadUser();
      toast.success('Application submitted! An admin will review it shortly.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const org = user.organizerProfile || {};
  return (
    <>
      <PageHeader title="Profile" subtitle={user.email} />
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={profile.handleSubmit(saveProfile)} className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Personal details</h2>
          <Field label="Name" error={profile.formState.errors.name?.message}><Input {...profile.register('name')} /></Field>
          <Field label="Phone" error={profile.formState.errors.phone?.message}><Input {...profile.register('phone')} /></Field>
          <Field label="City"><Input {...profile.register('city')} /></Field>
          <Button type="submit" loading={profile.formState.isSubmitting}>Save changes</Button>
        </form>

        <form onSubmit={password.handleSubmit(changePassword)} className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Change password</h2>
          <Field label="Current password" error={password.formState.errors.currentPassword?.message}><Input type="password" {...password.register('currentPassword')} /></Field>
          <Field label="New password" error={password.formState.errors.newPassword?.message}><Input type="password" {...password.register('newPassword')} /></Field>
          <Field label="Confirm new password" error={password.formState.errors.confirm?.message}><Input type="password" {...password.register('confirm')} /></Field>
          <Button type="submit" variant="dark" loading={password.formState.isSubmitting}>Update password</Button>
        </form>

        {user.role === 'USER' && (
          <div className="card p-5 xl:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Briefcase className="h-5 w-5" /> Host events on TicketHub</h2>
            {org.status === 'PENDING' ? (
              <p className="mt-3 text-sm text-slate-600">Your application for <b>{org.orgName}</b> is <StatusBadge status="PENDING" /> An admin will review it soon.</p>
            ) : (
              <form onSubmit={application.handleSubmit(apply)} className="mt-4 space-y-4">
                {org.status === 'REJECTED' && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Your previous application was rejected{org.rejectionReason ? `: ${org.rejectionReason}` : '.'} You can apply again.</p>}
                <Field label="Organization name" error={application.formState.errors.orgName?.message}><Input {...application.register('orgName')} /></Field>
                <Field label="What kind of events do you run?" error={application.formState.errors.description?.message}><Textarea rows={3} {...application.register('description')} /></Field>
                <Button type="submit" loading={application.formState.isSubmitting}>Apply to become an organizer</Button>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
