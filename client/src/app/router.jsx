import { createBrowserRouter } from 'react-router-dom';
import { Bell, Building2, CalendarDays, LayoutDashboard, ListChecks, Shield, Ticket, User, Users, BookOpen } from 'lucide-react';
import { AuthLayout,PublicLayout } from '../layouts/PublicLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { GuestOnly, RequireAuth, RequireRole } from './guards';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages';
import { HomePage } from '../features/discovery/HomePage';
import { EventsPage } from '../features/discovery/EventsPage';
import { EventDetailsPage } from '../features/events/EventDetailsPage';
import { SeatSelectionPage } from '../features/seating/SeatSelectionPage';
import { WaitingRoomPage } from '../features/waitingRoom/WaitingRoomPage';
import { CheckoutPage } from '../features/booking/CheckoutPage';
import { MyBookingsPage, BookingDetailPage } from '../features/account/BookingsPages';
import { NotificationsPage, ProfilePage } from '../features/account/AccountPages';
import { MyTicketsPage, TicketPage } from '../features/tickets/TicketPages';
import { OrganizerOverviewPage, EventAnalyticsPage, OrganizerBookingsPage } from '../features/organizer/OverviewPages';
import { OrganizerEventsPage } from '../features/organizer/EventsListPage';
import { EventEditorPage } from '../features/organizer/EventEditorPage';
import { VenuesPage, VenueEditorPage } from '../features/organizer/VenuePages';
import { CheckInPage } from '../features/organizer/CheckInPage';
import { AdminOverviewPage, AdminUsersPage, AdminOrganizersPage, AdminEventsPage } from '../features/admin/AdminPages';
import { EmptyState } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';

const accountNav = [
  { to: '/account/bookings', label: 'My bookings', icon: BookOpen },
  { to: '/account/tickets', label: 'Tickets', icon: Ticket },
  { to: '/account/notifications', label: 'Notifications', icon: Bell },
  { to: '/account/profile', label: 'Profile', icon: User },
];

const organizerNav = [
  { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/organizer/events', label: 'Events', icon: CalendarDays },
  { to: '/organizer/venues', label: 'Venues', icon: Building2 },
  { to: '/organizer/bookings', label: 'Bookings', icon: ListChecks },
];

const adminNav = [
  { to: '/admin', label: 'Overview', icon: Shield, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/organizers', label: 'Organizers', icon: Building2 },
  { to: '/admin/events', label: 'Events', icon: CalendarDays },
];

function NotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState title="Page not found" message="The page you're looking for doesn't exist or has moved." action={<Button to="/">Go home</Button>} />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/events', element: <EventsPage /> },
      { path: '/events/:slug', element: <EventDetailsPage /> },
     
      {
        element: <RequireAuth />,
        children: [
          { path: '/events/:slug/seats', element: <SeatSelectionPage /> },
          { path: '/events/:slug/queue', element: <WaitingRoomPage /> },
          { path: '/checkout/:bookingId', element: <CheckoutPage /> },
          { path: '/tickets/:ticketId', element: <TicketPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/account',
        element: <DashboardLayout title="My account" items={accountNav} />,
        children: [
          { index: true, element: <MyBookingsPage /> },
          { path: 'bookings', element: <MyBookingsPage /> },
          { path: 'bookings/:bookingId', element: <BookingDetailPage /> },
          { path: 'tickets', element: <MyTicketsPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
      {
        element: <RequireRole roles={['ORGANIZER', 'ADMIN']} />,
        children: [
          {
            path: '/organizer',
            element: <DashboardLayout title="Organizer" items={organizerNav} />,
            children: [
              { index: true, element: <OrganizerOverviewPage /> },
              { path: 'events', element: <OrganizerEventsPage /> },
              { path: 'events/new', element: <EventEditorPage /> },
              { path: 'events/:id', element: <EventEditorPage /> },
              { path: 'events/:id/analytics', element: <EventAnalyticsPage /> },
              { path: 'events/:id/check-in', element: <CheckInPage /> },
              { path: 'venues', element: <VenuesPage /> },
              { path: 'venues/new', element: <VenueEditorPage /> },
              { path: 'venues/:id', element: <VenueEditorPage /> },
              { path: 'bookings', element: <OrganizerBookingsPage /> },
            ],
          },
        ],
      },
      {
        element: <RequireRole roles={['ADMIN']} />,
        children: [
          {
            path: '/admin',
            element: <DashboardLayout title="Admin" items={adminNav} />,
            children: [
              { index: true, element: <AdminOverviewPage /> },
              { path: 'users', element: <AdminUsersPage /> },
              { path: 'organizers', element: <AdminOrganizersPage /> },
              { path: 'events', element: <AdminEventsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
