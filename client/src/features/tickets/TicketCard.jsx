import { QRCodeSVG } from 'qrcode.react';
import { Calendar, MapPin } from 'lucide-react';
import { StatusBadge } from '../../components/ui/Feedback';
import { formatDate, formatINR, formatTime } from '../../lib/format';
import { cn } from '../../lib/cn';

/**
 * The QR contains ONLY "TH1.<random ticket code>" - an unguessable 128-bit identifier.
 * No name, email or booking data is embedded; the gate scanner asks the server.
 */
export const qrValue = (ticket) => `TH1.${ticket.ticketCode}`;

export function TicketCard({ ticket, compact = false }) {
  const inactive = ticket.status !== 'ACTIVE';
  return (
    <div className={cn('print-ticket card overflow-hidden', compact ? '' : 'mx-auto max-w-md')}>
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-200">TicketHub · E-ticket</p>
        <h3 className="mt-1 text-lg font-bold leading-snug">{ticket.eventTitle}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-300"><Calendar className="h-4 w-4" /> {formatDate(ticket.startsAt)} · {formatTime(ticket.startsAt)}</p>
        <p className="flex items-center gap-1.5 text-sm text-slate-300"><MapPin className="h-4 w-4" /> {ticket.venueName}</p>
      </div>
      <div className="relative grid grid-cols-4 gap-2 border-b border-dashed border-slate-300 p-5 text-center">
        <div><p className="text-[10px] uppercase text-slate-400">Section</p><p className="font-bold">{ticket.sectionName}</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Row</p><p className="font-bold">{ticket.rowLabel}</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Seat</p><p className="font-bold">{ticket.seatLabel}</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Type</p><p className="truncate font-bold">{ticket.ticketTypeName}</p></div>
        <span className="no-print absolute -bottom-3 -left-3 h-6 w-6 rounded-full bg-slate-50" />
        <span className="no-print absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-slate-50" />
      </div>
      <div className="flex flex-col items-center p-5">
        <div className={cn('rounded-xl bg-white p-3 ring-1 ring-slate-200', inactive && 'opacity-25')}>
          <QRCodeSVG value={qrValue(ticket)} size={compact ? 128 : 184} level="M" marginSize={0} />
        </div>
        <div className="mt-3"><StatusBadge status={ticket.status} /></div>
        {ticket.status === 'USED' && ticket.usedAt && <p className="mt-1 text-xs text-slate-500">Scanned {formatDate(ticket.usedAt)}</p>}
        <div className="mt-4 grid w-full grid-cols-2 gap-2 text-xs text-slate-500">
          <p>Ticket ID<br /><span className="font-mono text-slate-800">{String(ticket._id).slice(-10).toUpperCase()}</span></p>
          <p className="text-right">Booking<br /><span className="font-mono text-slate-800">{ticket.bookingRef}</span></p>
          <p>Holder<br /><span className="text-slate-800">{ticket.holderName}</span></p>
          <p className="text-right">Price<br /><span className="text-slate-800">{formatINR(ticket.price)}</span></p>
        </div>
      </div>
    </div>
  );
}
