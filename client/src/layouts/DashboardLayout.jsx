import { NavLink, Outlet } from 'react-router-dom';
import { Navbar } from './PublicLayout';
import { cn } from '../lib/cn';

/** Sidebar layout shared by the account, organizer and admin areas. */
export function DashboardLayout({ title, items }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container-page flex flex-col gap-6 py-6 lg:flex-row lg:py-8">
        <aside className="no-print lg:w-60 lg:shrink-0">
          <p className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">{title}</p>
          <nav className="scrollbar-none flex gap-1 overflow-x-auto lg:sticky lg:top-24 lg:flex-col">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
