export const TASK_COLUMN_WIDTH = 360;
export const PANEL_WIDTH = { min: 200, max: 900 };
export const ROW_HEIGHT = 48;
export const ROW_HEIGHT_RANGE = { min: 32, max: 96 };
export const DAY_WIDTH = { day: 40, week: 20, month: 8 };

// Bovenkant van een taakbalk (24px hoog) binnen rij `index`; bij 48px blijft dit 13px.
export const barTop = (index, rowHeight = ROW_HEIGHT) => index * rowHeight + Math.round((rowHeight - 22) / 2);
export const clamp = (value, { min, max }) => Math.min(max, Math.max(min, Math.round(value)));

export function timelineLayout({ mode, projectDays, viewportWidth, tableWidth = TASK_COLUMN_WIDTH }) {
  const availableWidth = Math.max(1, viewportWidth - tableWidth);
  const days = Math.max(1, projectDays);
  const dayWidth = mode === 'fit' ? availableWidth / days : DAY_WIDTH[mode] || DAY_WIDTH.week;
  const totalDays = mode === 'fit' ? days : Math.max(days, Math.ceil(availableWidth / dayWidth));
  return { dayWidth, totalDays, width: totalDays * dayWidth, tableWidth };
}
