import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR, formatShortDate } from '../../lib/format';

const PALETTE = ['#e11d48', '#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];
const rupeesShort = (paise) => {
  const r = paise / 100;
  return r >= 100000 ? `₹${(r / 100000).toFixed(1)}L` : r >= 1000 ? `₹${(r / 1000).toFixed(0)}k` : `₹${r}`;
};

export function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

export function SalesOverTime({ series }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ left: 0, right: 8, top: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis yAxisId="t" allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
        <YAxis yAxisId="r" orientation="right" tickFormatter={rupeesShort} tick={{ fontSize: 11 }} width={48} />
        <Tooltip labelFormatter={formatShortDate} formatter={(v, n) => (n === 'Revenue' ? formatINR(v) : v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="t" type="monotone" dataKey="tickets" name="Tickets" stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line yAxisId="r" type="monotone" dataKey="revenue" name="Revenue" stroke="#e11d48" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SalesByCategory({ data }) {
  if (!data?.length) return <p className="py-20 text-center text-sm text-slate-400">No sales yet</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="revenue" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v, _n, p) => `${formatINR(v)} · ${p.payload.tickets} tickets`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function OccupancyBars({ data, nameKey = 'title', soldKey = 'sold', totalKey = 'total' }) {
  if (!data?.length) return <p className="py-20 text-center text-sm text-slate-400">No events yet</p>;
  const rows = data.map((d) => ({ name: d[nameKey]?.length > 22 ? `${d[nameKey].slice(0, 22)}…` : d[nameKey], Sold: d[soldKey], Available: Math.max(0, d[totalKey] - d[soldKey]) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Sold" stackId="a" fill="#e11d48" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Available" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
