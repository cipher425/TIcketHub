import { memo, useMemo, useState } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';

/**
 * Data-driven seat map. Nothing is hardcoded: every seat is drawn at the (x, y) the backend
 * computed from the venue layout, in "seat units". The SVG viewBox scales those units to any
 * screen size; zoom just changes how many pixels one unit gets.
 *
 * statusById: Map(seatId -> 'H' held | 'B' booked | 'X' blocked). Missing = available.
 * The backend is the source of truth for these statuses - we only render them.
 */
const UNIT_PX = 26;

const COLORS = {
  held: '#cbd5e1',
  booked: '#94a3b8',
  blocked: '#e2e8f0',
  selected: '#e11d48',
  neutral: '#6366f1',
};

const Seat = memo(function Seat({ seat, state, color, clickable, onClick }) {
  const fill =
    state === 'selected' ? COLORS.selected : state === 'H' ? COLORS.held : state === 'B' ? COLORS.booked : state === 'X' ? COLORS.blocked : '#ffffff';
  const stroke = state === 'selected' ? COLORS.selected : !state ? color : 'transparent';
  const label =
    state === 'selected' ? 'selected' : state === 'H' ? 'on hold' : state === 'B' ? 'booked' : state === 'X' ? 'not for sale' : 'available';
  return (
    <g
      onClick={clickable ? onClick : undefined}
      style={{ cursor: clickable ? 'pointer' : 'not-allowed' }}
      role={clickable ? 'button' : undefined}
      aria-label={`Seat ${seat.label}, ${label}`}
    >
      <title>{`${seat.label} - ${label}`}</title>
      <rect x={seat.x - 0.4} y={seat.y - 0.38} width={0.8} height={0.76} rx={0.18} fill={fill} stroke={stroke} strokeWidth={0.09} />
      {state === 'X' && <path d={`M${seat.x - 0.2} ${seat.y - 0.2} L${seat.x + 0.2} ${seat.y + 0.2} M${seat.x + 0.2} ${seat.y - 0.2} L${seat.x - 0.2} ${seat.y + 0.2}`} stroke="#94a3b8" strokeWidth={0.07} />}
      {state === 'selected' && (
        <text x={seat.x} y={seat.y + 0.13} textAnchor="middle" fontSize={0.36} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>
          {seat.label.replace(/^[A-Z]+/, '')}
        </text>
      )}
    </g>
  );
});

export function SeatMap({ layout, statusById = new Map(), selected = new Set(), onSeatClick, mode = 'select' }) {
  const [zoom, setZoom] = useState(1);
  const colorByType = useMemo(() => new Map((layout?.ticketTypes || []).map((t) => [t.id, t])), [layout]);
  if (!layout) return null;

  const width = layout.width * UNIT_PX * zoom;
  const stageW = Math.min(layout.width * 0.6, 24);

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow">
        <button className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
        <button className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
        <button className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setZoom(1)} aria-label="Reset zoom"><Maximize2 className="h-4 w-4" /></button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-4" style={{ maxHeight: '70vh' }}>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ width: zoom === 1 ? '100%' : width, minWidth: Math.min(width, layout.width * 18), maxWidth: zoom === 1 ? width : undefined }}
          className="mx-auto block select-none"
        >
          <defs>
            <linearGradient id="stage" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#1e293b" />
              <stop offset="1" stopColor="#475569" />
            </linearGradient>
          </defs>
          <rect x={(layout.width - stageW) / 2} y={0.3} width={stageW} height={1.4} rx={0.4} fill="url(#stage)" />
          <text x={layout.width / 2} y={1.22} textAnchor="middle" fontSize={0.55} fontWeight={700} letterSpacing={0.2} fill="#fff">
            {layout.stageLabel || 'STAGE'}
          </text>

          {layout.sections.map((section) => {
            const type = colorByType.get(section.ticketTypeId);
            const color = type?.color || (mode === 'preview' ? COLORS.neutral : '#cbd5e1');
            return (
              <g key={section.key}>
                <text x={layout.width / 2} y={section.labelY} textAnchor="middle" fontSize={0.5} fontWeight={700} fill="#475569">
                  {section.name.toUpperCase()}
                  {type ? ` · ₹${(type.price / 100).toLocaleString('en-IN')}` : mode !== 'preview' ? ' · not for sale' : ''}
                </text>
                {section.rows.map((row) => {
                  const first = row.seats[0];
                  const last = row.seats[row.seats.length - 1];
                  return (
                    <g key={row.label}>
                      <text x={first.x - 0.95} y={first.y + 0.16} textAnchor="middle" fontSize={0.42} fill="#94a3b8">{row.label}</text>
                      <text x={last.x + 0.95} y={last.y + 0.16} textAnchor="middle" fontSize={0.42} fill="#94a3b8">{row.label}</text>
                      {row.seats.map((seat) => {
                        const status = seat.status && seat.status !== 'A' ? seat.status : statusById.get(seat.id);
                        const isSelected = selected.has(seat.id);
                        const state = isSelected ? 'selected' : status;
                        const clickable =
                          mode === 'block' ? status !== 'B' && status !== 'H' : mode === 'select' ? isSelected || !status : false;
                        return (
                          <Seat
                            key={seat.id}
                            seat={seat}
                            state={state}
                            color={color}
                            clickable={clickable && !!onSeatClick}
                            onClick={() => onSeatClick?.(seat, section)}
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function SeatLegend({ ticketTypes = [] }) {
  const Item = ({ fill, stroke, label }) => (
    <span className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className="h-3.5 w-3.5 rounded" style={{ background: fill, border: `2px solid ${stroke || fill}` }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {ticketTypes.map((t) => (
        <Item key={t.id} fill="#fff" stroke={t.color} label={`${t.name} ₹${(t.price / 100).toLocaleString('en-IN')}`} />
      ))}
      <Item fill={COLORS.selected} label="Your selection" />
      <Item fill={COLORS.held} label="On hold" />
      <Item fill={COLORS.booked} label="Booked" />
      <Item fill={COLORS.blocked} stroke="#cbd5e1" label="Not for sale" />
    </div>
  );
}
