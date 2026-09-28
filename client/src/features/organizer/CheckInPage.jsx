import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, Keyboard } from 'lucide-react';
import { http } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import { PageHeader } from '../../components/ui/Layout';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const RESULT_UI = {
  VALID: { tone: 'bg-emerald-600', icon: CheckCircle2, title: 'Valid ticket' },
  ALREADY_USED: { tone: 'bg-amber-500', icon: AlertTriangle, title: 'Already used' },
  INVALID: { tone: 'bg-red-600', icon: XCircle, title: 'Invalid ticket' },
  WRONG_EVENT: { tone: 'bg-red-600', icon: XCircle, title: 'Wrong event' },
  CANCELLED: { tone: 'bg-red-600', icon: XCircle, title: 'Cancelled ticket' },
};

/**
 * Gate check-in. Scan (camera) or type the code -> server VERIFIES (read-only) -> staff taps
 * "Admit" -> server atomically marks the ticket USED. Two gates scanning the same ticket at
 * the same moment cannot both admit it.
 */
export function CheckInPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const event = useQuery({ queryKey: ['org-event', id], queryFn: () => http.get(`/organizer/events/${id}`).then((r) => r.data) });
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [history, setHistory] = useState([]);
  const scannerRef = useRef(null);
  const lastScan = useRef({ code: null, at: 0 });

  const verify = async (raw) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    try {
      const { data } = await http.post(`/organizer/events/${id}/check-ins/verify`, { code: value });
      setResult({ ...data, code: value });
    } catch (err) {
      setResult({ result: 'INVALID', message: err.message, code: value });
    } finally {
      setBusy(false);
    }
  };

  const admit = async () => {
    setBusy(true);
    try {
      const { data } = await http.post(`/organizer/events/${id}/check-ins`, { code: result.code });
      setResult({ ...data, code: result.code });
      if (data.admitted) {
        setHistory((h) => [{ ...data.ticket, at: new Date() }, ...h].slice(0, 20));
        qc.invalidateQueries({ queryKey: ['org-event', id] });
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!camera) return undefined;
    let scanner;
    let stopped = false;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return;
      scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            // Debounce: the camera sees the same QR many times per second.
            const now = Date.now();
            if (lastScan.current.code === text && now - lastScan.current.at < 4000) return;
            lastScan.current = { code: text, at: now };
            verify(text);
          },
          () => {}
        )
        .catch(() => setCamera(false));
    });
    return () => {
      stopped = true;
      scannerRef.current?.isScanning && scannerRef.current.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  const ui = result && RESULT_UI[result.result];
  const e = event.data;

  return (
    <>
      <Link to={`/organizer/events/${id}/analytics`} className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Event</Link>
      <PageHeader
        title="Ticket check-in"
        subtitle={e ? `${e.title} · ${formatDateTime(e.startsAt)}` : ' '}
        actions={e && <span className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-slate-200">{e.checkedInCount} / {e.seatsSold} checked in</span>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div id="qr-reader" className={cn('bg-slate-900', camera ? 'min-h-64' : 'hidden')} />
            <div className="p-4">
              <Button variant={camera ? 'secondary' : 'primary'} className="w-full" onClick={() => setCamera((c) => !c)}>
                {camera ? <><CameraOff className="h-4 w-4" /> Stop camera</> : <><Camera className="h-4 w-4" /> Scan with camera</>}
              </Button>
            </div>
          </div>
          <form onSubmit={(ev) => { ev.preventDefault(); verify(code); }} className="card space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Keyboard className="h-4 w-4" /> Manual entry</p>
            <div className="flex gap-2">
              <Input value={code} onChange={(ev) => setCode(ev.target.value)} placeholder="Paste ticket code / QR text" />
              <Button type="submit" loading={busy && !result}>Verify</Button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          {ui ? (
            <div className="card overflow-hidden">
              <div className={cn('flex items-center gap-3 p-5 text-white', ui.tone)}>
                <ui.icon className="h-10 w-10" />
                <div>
                  <p className="text-xl font-bold">{result.admitted ? 'Admitted ✓' : ui.title}</p>
                  <p className="text-sm opacity-90">{result.message}</p>
                </div>
              </div>
              {result.ticket && (
                <div className="grid grid-cols-2 gap-3 p-5 text-sm">
                  <p><span className="text-slate-500">Seat</span><br /><span className="text-2xl font-extrabold">{result.ticket.seatLabel}</span></p>
                  <p><span className="text-slate-500">Section</span><br /><span className="font-semibold">{result.ticket.sectionName} · {result.ticket.ticketTypeName}</span></p>
                  <p><span className="text-slate-500">Holder</span><br /><span className="font-semibold">{result.ticket.holderName}</span></p>
                  <p><span className="text-slate-500">Booking</span><br /><span className="font-mono">{result.ticket.bookingRef}</span></p>
                  {result.ticket.usedAt && <p className="col-span-2 text-amber-700">Used at {formatDateTime(result.ticket.usedAt)}</p>}
                </div>
              )}
              <div className="flex gap-2 border-t border-slate-100 p-4">
                {result.result === 'VALID' && !result.admitted && <Button size="lg" className="flex-1" loading={busy} onClick={admit}>Admit holder</Button>}
                <Button size="lg" variant="secondary" className="flex-1" onClick={() => { setResult(null); setCode(''); }}>Next ticket</Button>
              </div>
            </div>
          ) : (
            <div className="card flex h-64 items-center justify-center p-6 text-center text-sm text-slate-500">Scan a QR code or enter a ticket code to verify it.</div>
          )}
          {history.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 text-sm font-semibold text-slate-900">Admitted this session</p>
              <ul className="space-y-1 text-sm text-slate-600">
                {history.map((h) => <li key={h.ticketId} className="flex justify-between"><span>{h.seatLabel} · {h.holderName}</span><span className="text-xs text-slate-400">{h.at.toLocaleTimeString()}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
