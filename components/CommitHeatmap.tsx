'use client';

import type { Commit } from '@/types/repo';

interface Props {
  commits: Commit[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}

type DayMap = Record<string, number>;

function buildDayMap(commits: Commit[], year: number): DayMap {
  const map: DayMap = {};
  for (const c of commits) {
    if (!c.committed_at || new Date(c.committed_at).getFullYear() !== year) continue;
    const day = c.committed_at.slice(0, 10);
    map[day] = (map[day] ?? 0) + 1;
  }
  return map;
}

function getYearWeeks(year: number): string[] {
  const days: string[] = [];
  const start = new Date(year, 0, 1);
  // Align to preceding Sunday
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay())); // align to Saturday
  const cur = new Date(start);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function intensityClass(count: number): string {
  if (count === 0) return 'h0';
  if (count < 2) return 'h1';
  if (count < 5) return 'h2';
  if (count < 10) return 'h3';
  return 'h4';
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function CommitHeatmap({ commits, selectedYear, onYearChange }: Props) {
  const dayMap = buildDayMap(commits, selectedYear);
  const days = getYearWeeks(selectedYear);

  // Build columns (7-day weeks)
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Month label positions
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const d = new Date(week[0]);
    if (d.getFullYear() !== selectedYear) return;
    const month = d.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ col: wi, label: MONTH_LABELS[month] });
      lastMonth = month;
    }
  });

  const totalContributions = Object.values(dayMap).reduce((a, b) => a + b, 0);

  // Available years: from earliest commit year up to current year
  const currentYear = new Date().getFullYear();
  const earliestYear = commits.length
    ? Math.min(...commits.map(c => new Date(c.committed_at).getFullYear()))
    : currentYear;
  const years = Array.from({ length: currentYear - earliestYear + 1 }, (_, i) => currentYear - i);

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <span className="heatmap-title">Commit Activity</span>
        <div className="heatmap-header-right">
          <span className="heatmap-total">{totalContributions} commits in {selectedYear}</span>
          <select
            className="heatmap-year-select"
            value={selectedYear}
            onChange={e => onYearChange(Number(e.target.value))}
            aria-label="Select year"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="heatmap-wrap">
        <div className="heatmap-months">
          {monthLabels.map(m => (
            <span key={`${m.col}-${m.label}`} className="heatmap-month" style={{ gridColumnStart: m.col + 1 }}>
              {m.label}
            </span>
          ))}
        </div>

        <div className="heatmap-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-col">
              {week.map(day => {
                const count = dayMap[day] ?? 0;
                return (
                  <div
                    key={day}
                    className={`heatmap-cell ${intensityClass(count)}`}
                    title={count ? `${day}: ${count} commit${count !== 1 ? 's' : ''}` : day}
                    aria-label={`${day}: ${count} commits`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="heatmap-legend">
          <span>Less</span>
          {['h0','h1','h2','h3','h4'].map(c => (
            <div key={c} className={`heatmap-cell ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
