// backend/services/formatChartDate.js

export function formatChartDate(isoDate) {
  if (!isoDate) return "";

  const d = new Date(isoDate);

  if (isNaN(d.getTime())) return "";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}