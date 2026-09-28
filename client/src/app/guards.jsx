import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { PageLoader, EmptyState } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';

/**
 * Route guards are UX only: they stop users from seeing screens they can't use.
 * The real protection is on the server (requireAuth / requireRole / ownership checks).
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}

export function RequireRole({ roles }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (!roles.includes(user?.role)) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to this area"
          message="This section is only available to organizers or administrators."
          action={<Button to="/">Back to home</Button>}
        />
      </div>
    );
  }
  return <Outlet />;
}

export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
