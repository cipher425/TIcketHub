import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Armchair, QrCode, Ticket, Timer } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

// Mirrors the backend rules for instant feedback; the server validates again.
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/\d/, 'Must contain a number'),
  city: z.string().optional(),
});

const HIGHLIGHTS = [
  { icon: Armchair, title: 'Pick your exact seat', text: 'Live seat maps for every venue' },
  { icon: Timer, title: 'Seats held while you pay', text: 'No one can grab them during checkout' },
  { icon: QrCode, title: 'Instant QR tickets', text: 'Scan at the gate, no printing needed' },
];

/** Decorative ticket drawn with CSS - no external image to load or break. */
function TicketArt() {
  return (
    <div className="relative mx-auto w-full max-w-sm rotate-[-4deg] rounded-3xl bg-white/95 p-5 text-slate-900 shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">Music</span>
        <span className="text-xs font-semibold text-slate-400">E-TICKET</span>
      </div>
      <p className="mt-3 text-lg font-extrabold leading-tight">Aurora Nights Live</p>
      <p className="text-xs text-slate-500">Skyline Arena, Mumbai · Sat, 8:00 PM</p>
      <div className="relative my-4 border-t-2 border-dashed border-slate-200">
        <span className="absolute -left-8 -top-3 h-6 w-6 rounded-full bg-brand-700" />
        <span className="absolute -right-8 -top-3 h-6 w-6 rounded-full bg-rose-900" />
      </div>
      <div className="flex items-end justify-between">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[['Section', 'VIP'], ['Row', 'A'], ['Seat', '12']].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] uppercase text-slate-400">{k}</p>
              <p className="text-base font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        <div className="grid h-14 w-14 grid-cols-4 gap-0.5 rounded-lg bg-slate-900 p-1.5">
          {'1011010110100111'.split('').map((b, i) => (
            <span key={i} className={b === '1' ? 'rounded-[1px] bg-white' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-rose-700 to-slate-900 lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-amber-400/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="relative text-white">
          <h2 className="max-w-md text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">Your next unforgettable night starts here.</h2>
          <p className="mt-3 max-w-md text-base text-rose-100">Concerts, comedy, theatre and sports across India - book the seat you actually want.</p>
          <div className="my-9"><TicketArt /></div>
          <ul className="space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex items-start gap-3">
                <span className="rounded-xl bg-white/15 p-2 ring-1 ring-white/20"><Icon className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold">{t}</span>
                  <span className="block text-sm text-rose-100/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
              <Ticket className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
        </div>
      </div>
    </div>
  );
}

const useRedirectAfterAuth = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return () => navigate(params.get('next') || '/', { replace: true });
};

export function LoginPage() {
  const { login } = useAuth();
  const redirect = useRedirectAfterAuth();
  const { register, handleSubmit, formState, setValue } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values) => {
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      redirect();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const demo = (email, password) => {
    setValue('email', email);
    setValue('password', password);
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to book tickets and manage your bookings."
      footer={
        <>
          New to TicketHub?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" invalid={!!formState.errors.email} {...register('email')} />
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" invalid={!!formState.errors.password} {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Log in
        </Button>
      </form>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts (after seeding)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" type="button" onClick={() => demo('user@tickethub.dev', 'User@1234')}>Customer</Button>
          <Button size="sm" variant="secondary" type="button" onClick={() => demo('organizer@tickethub.dev', 'Organizer@1234')}>Organizer</Button>
          <Button size="sm" variant="secondary" type="button" onClick={() => demo('admin@tickethub.dev', 'Admin@1234')}>Admin</Button>
        </div>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const redirect = useRedirectAfterAuth();
  const { register, handleSubmit, formState, setError } = useForm({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values) => {
    try {
      await registerUser(values);
      toast.success('Account created - welcome to TicketHub!');
      redirect();
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') setError('email', { message: err.message });
      else if (err.details?.length) err.details.forEach((d) => setError(d.field, { message: d.message }));
      else toast.error(err.message);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Full name" error={formState.errors.name?.message}>
          <Input autoComplete="name" invalid={!!formState.errors.name} {...register('name')} />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" invalid={!!formState.errors.email} {...register('email')} />
        </Field>
        <Field label="Password" error={formState.errors.password?.message} hint="8+ characters with a letter and a number">
          <Input type="password" autoComplete="new-password" invalid={!!formState.errors.password} {...register('password')} />
        </Field>
        <Field label="City (optional)">
          <Input autoComplete="address-level2" {...register('city')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
