import { useMemo } from "react";
import { buildCalendarWeeks } from "@/lib/calendar";

export function useCalendar(year: number, month: number, currentWeek: number) {
  const calendarWeeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);

  const currentWeekDates = calendarWeeks[currentWeek - 1];

  return {
    calendarWeeks,
    currentWeekDates,
  };
}
