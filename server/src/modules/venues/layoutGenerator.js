import { badRequest } from '../../utils/AppError.js';
import { slugify } from '../../utils/codes.js';

/**
 * Turns an organizer-friendly spec into a concrete seat layout with coordinates.
 *
 * Spec (what the organizer types):
 *   { stageLabel, sections: [{ name, rows: 4, seatsPerRow: 20, aisleAfter: [5, 15] }] }
 *
 * Output (what we store and render):
 *   { width, height, stageLabel, sections: [{ key, name, labelY,
 *       rows: [{ label: 'C', seats: [{ number: 1, label: 'C1', x, y }] }] }] }
 *
 * Coordinates are in "seat units" (1 unit = one seat). The frontend scales them to pixels,
 * so the same data renders on a phone or a 4K monitor.
 * Row letters continue across sections (VIP A-B, Premium C-F ...) so every seat label is
 * unique within a venue, exactly like real auditoriums.
 */

export const LIMITS = { sections: 12, rowsPerSection: 40, seatsPerRow: 60, totalSeats: 5000 };

const STAGE_HEIGHT = 3;
const SECTION_LABEL_HEIGHT = 1.4;
const SECTION_GAP = 1.2;
const SIDE_MARGIN = 2;

/** 0 -> A, 25 -> Z, 26 -> AA ... */
export function rowLabel(index) {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

const rowWidth = (seatsPerRow, aisles) => seatsPerRow + aisles.length;

export function generateLayout(spec) {
  const sections = spec.sections || [];
  if (!sections.length) throw badRequest('Add at least one section');
  if (sections.length > LIMITS.sections) throw badRequest(`A venue can have at most ${LIMITS.sections} sections`);

  const keys = new Set();
  const normalized = sections.map((s, i) => {
    const key = slugify(s.name) || `section-${i + 1}`;
    if (keys.has(key)) throw badRequest(`Duplicate section name "${s.name}"`);
    keys.add(key);
    const aisles = [...new Set((s.aisleAfter || []).filter((n) => n > 0 && n < s.seatsPerRow))].sort((a, b) => a - b);
    return { ...s, key, aisles };
  });

  const total = normalized.reduce((sum, s) => sum + s.rows * s.seatsPerRow, 0);
  if (total > LIMITS.totalSeats) throw badRequest(`A venue can have at most ${LIMITS.totalSeats} seats (got ${total})`);

  const maxWidth = Math.max(...normalized.map((s) => rowWidth(s.seatsPerRow, s.aisles)));
  let y = STAGE_HEIGHT;
  let rowIndex = 0;

  const outSections = normalized.map((s) => {
    const labelY = y + 0.7;
    y += SECTION_LABEL_HEIGHT;
    const rows = [];
    for (let r = 0; r < s.rows; r++) {
      const label = rowLabel(rowIndex++);
      const offsetX = SIDE_MARGIN + (maxWidth - rowWidth(s.seatsPerRow, s.aisles)) / 2;
      const seats = [];
      for (let n = 1; n <= s.seatsPerRow; n++) {
        const aislesBefore = s.aisles.filter((a) => a < n).length;
        seats.push({ number: n, label: `${label}${n}`, x: +(offsetX + (n - 1) + aislesBefore + 0.5).toFixed(2), y: +(y + 0.5).toFixed(2) });
      }
      rows.push({ label, seats });
      y += 1;
    }
    y += SECTION_GAP;
    return { key: s.key, name: s.name, labelY: +labelY.toFixed(2), rows };
  });

  return {
    width: maxWidth + SIDE_MARGIN * 2,
    height: +y.toFixed(2),
    stageLabel: spec.stageLabel || 'STAGE',
    sections: outSections,
    capacity: total,
  };
}
