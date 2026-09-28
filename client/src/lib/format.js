import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Money arrives from the API in paise (integer). */
export const formatINR = (paise) => inr.format((paise || 0) / 100);
export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
export const toRupees = (paise) => (paise || 0) / 100;

export const formatDate = (d) => dayjs(d).format('ddd, D MMM YYYY');
export const formatShortDate = (d) => dayjs(d).format('D MMM');
export const formatTime = (d) => dayjs(d).format('h:mm A');
export const formatDateTime = (d) => dayjs(d).format('ddd, D MMM YYYY · h:mm A');
export const fromNow = (d) => dayjs(d).fromNow();
export const toInputDateTime = (d) => (d ? dayjs(d).format('YYYY-MM-DDTHH:mm') : '');
export const percent = (x) => `${Math.round((x || 0) * 100)}%`;

export function priceRange(min, max) {
  if (!min && !max) return 'Free';
  return min === max ? formatINR(min) : `${formatINR(min)} onwards`;
}
