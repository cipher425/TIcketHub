import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Hourglass } from 'lucide-react';
import { useEventDetails } from '../discovery/api';
import { http } from '../../lib/api';
import { admissionStorageKey } from '../booking/api';
import { ErrorState, PageLoader } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';

/**
 * Stage 3 virtual waiting room. The user joins a FIFO queue; the server admits a fixed number
 * of shoppers at a time. Once admitted we store the signed admission token and continue to
 * seat selection - the booking API rejects holds without it.
 */
export function WaitingRoomPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: event, isLoading, error } = useEventDetails(slug);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!event?._id) return undefined;
    let cancelled = false;
    const admitted = (s) => {
      try {
        sessionStorage.setItem(admissionStorageKey(event._id), s.admissionToken);
      } catch {
        /* ignore */
      }
      navigate(`/events/${slug}/seats`, { replace: true });
    };
    const poll = async () => {
      try {
        const { data } = await http.get(`/waiting-room/${event._id}/status`);
        if (cancelled) return;
        setStatus(data);
        if (data.status === 'ADMITTED') return admitted(data);
        timer.current = setTimeout(poll, 3000);
      } catch (e) {
        if (!cancelled) setErr(e);
      }
    };
    http
      .post(`/waiting-room/${event._id}/join`)
      .then(({ data }) => {
        if (cancelled) return;
        setStatus(data);
        if (data.status === 'ADMITTED') admitted(data);
        else timer.current = setTimeout(poll, 3000);
      })
      .catch((e) => {
        // Waiting room not active for this event -> go straight to seats.
        if (e.code === 'NO_WAITING_ROOM' || e.status === 404) navigate(`/events/${slug}/seats`, { replace: true });
        else setErr(e);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [event?._id, slug, navigate]);

  if (isLoading) return <PageLoader />;
  if (error || err) return <div className="container-page py-16"><ErrorState error={error || err} /></div>;

  const progress = status?.queueLength ? Math.max(5, 100 - (status.position / status.queueLength) * 100) : 5;
  return (
    <div className="container-page flex min-h-[70vh] max-w-xl flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 rounded-full bg-brand-50 p-5"><Hourglass className="h-10 w-10 animate-pulse text-brand-600" /></div>
      <h1 className="text-2xl font-bold text-slate-900">You're in the queue for {event.title}</h1>
      <p className="mt-2 text-slate-500">Demand is very high right now. To keep things fair, fans are let in to pick seats a few at a time. Keep this page open - you'll move forward automatically.</p>
      {status?.status === 'WAITING' && (
        <div className="card mt-8 w-full p-6">
          <p className="text-sm text-slate-500">Your position</p>
          <p className="text-5xl font-extrabold text-slate-900">{status.position.toLocaleString('en-IN')}</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-500"><Users className="h-4 w-4" /> {status.queueLength.toLocaleString('en-IN')} people waiting</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs text-slate-500">Estimated wait: ~{Math.max(1, Math.round(status.estimatedWaitSeconds / 60))} min</p>
        </div>
      )}
      <Button variant="ghost" className="mt-6" to={`/events/${slug}`}>Leave queue</Button>
    </div>
  );
}
