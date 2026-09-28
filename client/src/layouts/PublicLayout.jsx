import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, MapPin, Menu, Search, Shield, Ticket, User, X } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useCity } from '../features/discovery/CityContext';
import { useCities } from '../features/discovery/api';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';

function CitySelect() {
  const { city, setCity } = useCity();
  const { data: cities = [] } = useCities();
  return (
    <label className="relative flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-3 pr-2 text-sm text-slate-700">
      <MapPin className="h-4 w-4 text-brand-600" />
      <select value={city} onChange={(e) => setCity(e.target.value)} className="h-9 appearance-none bg-transparent pr-5 font-medium focus:outline-none">
        <option value="">All cities</option>
        {cities.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
    </label>
  );
}

function NavSearch({ onDone }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/events${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
        onDone?.();
      }}
      className="relative w-full"
    >
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search events, venues, cities..."
        className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
      />
    </form>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const isOrganizer = user.role === 'ORGANIZER' || user.role === 'ADMIN';
  const item = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{user.name[0]?.toUpperCase()}</span>
        <span className="hidden max-w-24 truncate sm:inline">{user.name.split(' ')[0]}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" onClick={() => setOpen(false)}>
            <div className="border-b border-slate-100 px-3 pb-2 pt-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            <Link to="/account/bookings" className={item}><Ticket className="h-4 w-4" /> My bookings</Link>
            <Link to="/account/profile" className={item}><User className="h-4 w-4" /> Profile</Link>
            {isOrganizer && <Link to="/organizer" className={item}><LayoutDashboard className="h-4 w-4" /> Organizer dashboard</Link>}
            {user.role === 'ADMIN' && <Link to="/admin" className={item}><Shield className="h-4 w-4" /> Admin console</Link>}
            <button onClick={logout} className={cn(item, 'w-full text-red-600')}><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </>
      )}
    </div>
  );
}

export function Navbar() {
  const { isAuthenticated, status } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Ticket className="h-4 w-4" /></span>
          Ticket<span className="text-brand-600">Hub</span>
        </Link>
        <div className="hidden flex-1 items-center gap-3 md:flex">
          <div className="max-w-md flex-1"><NavSearch /></div>
          <CitySelect />
          <NavLink to="/events" className={({ isActive }) => cn('text-sm font-medium', isActive ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900')}>
            Explore
          </NavLink>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {status === 'loading' ? null : isAuthenticated ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Button to="/login" variant="ghost" size="sm">Log in</Button>
              <Button to="/register" size="sm" className="hidden sm:inline-flex">Sign up</Button>
            </>
          )}
          <button className="rounded-lg p-2 md:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4 md:hidden">
          <NavSearch onDone={() => setMobileOpen(false)} />
          <div className="flex items-center justify-between">
            <CitySelect />
            <Link to="/events" onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-brand-600">Explore all events</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col gap-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} TicketHub · A MERN portfolio project</p>
        <div className="flex gap-4">
          <Link to="/events" className="hover:text-slate-900">Events</Link>
          <Link to="/account/profile" className="hover:text-slate-900">Become an organizer</Link>
        </div>
      </div>
    </footer>
  );
}
/** Login / sign-up: navbar only, no footer, so the split screen fills the viewport exactly. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
