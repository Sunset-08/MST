'use client';

// ============================================================
// SECUREX — Activity Calendar (LeetCode-style streak calendar)
// ============================================================

import { useMemo } from 'react';
import type { Streak } from '@/lib/types';

interface ActivityCalendarProps {
  streak: Streak;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getWeeksInRange(weeksBack: number): string[] {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - weeksBack * 7);
  // Align to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= today) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function ActivityCalendar({ streak }: ActivityCalendarProps) {
  const activitySet = useMemo(
    () => new Set(streak.activityDays),
    [streak.activityDays],
  );

  const allDates = useMemo(() => getWeeksInRange(26), []);

  // Group by week
  const weeks = useMemo(() => {
    const grouped: string[][] = [];
    let week: string[] = [];
    allDates.forEach((date, i) => {
      week.push(date);
      if (week.length === 7 || i === allDates.length - 1) {
        grouped.push(week);
        week = [];
      }
    });
    return grouped;
  }, [allDates]);

  // Collect month labels
  const monthLabels = useMemo(() => {
    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const d = new Date(week[0]);
      if (d.getMonth() !== lastMonth) {
        labels.push({ label: MONTHS[d.getMonth()], weekIndex: wi });
        lastMonth = d.getMonth();
      }
    });
    return labels;
  }, [weeks]);

  function getIntensity(date: string): number {
    return activitySet.has(date) ? 4 : 0;
  }

  function formatTooltip(date: string): string {
    const d = new Date(date);
    const active = activitySet.has(date);
    return `${d.toDateString()} — ${active ? 'Active' : 'No activity'}`;
  }

  return (
    <div className="space-y-3">
      {/* Month labels */}
      <div className="flex gap-1 pl-8">
        {weeks.map((_, wi) => {
          const label = monthLabels.find((m) => m.weekIndex === wi);
          return (
            <div key={wi} className="w-[14px] flex-shrink-0">
              {label && (
                <span className="text-[10px] text-slate-500 -ml-2 whitespace-nowrap">
                  {label.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 mr-1">
          {DAYS.map((day, i) => (
            <div key={day} className="h-[14px] flex items-center">
              {i % 2 === 1 && (
                <span className="text-[10px] text-slate-500 w-7">{day}</span>
              )}
              {i % 2 !== 1 && <span className="w-7" />}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex gap-1 overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((date) => {
                const intensity = getIntensity(date);
                return (
                  <div
                    key={date}
                    className={`activity-cell ${intensity > 0 ? `active-${intensity}` : ''}`}
                    title={formatTooltip(date)}
                  />
                );
              })}
              {/* Pad short weeks */}
              {week.length < 7 &&
                Array.from({ length: 7 - week.length }).map((_, pi) => (
                  <div key={`pad-${pi}`} className="w-[14px] h-[14px]" />
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 pl-8">
        <span className="text-[10px] text-slate-500">Less</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`activity-cell ${i > 0 ? `active-${i}` : ''}`}
          />
        ))}
        <span className="text-[10px] text-slate-500">More</span>
      </div>
    </div>
  );
}
