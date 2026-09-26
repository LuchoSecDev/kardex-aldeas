import { useMemo } from "react";

export function useCalendar(year: number, month: number, currentWeek: number) {
  // Calcular calendario dinámico
  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Lunes es 0
    
    const weeks: (number | null)[][] = [];
    let currentDay = 1;
    for (let w = 0; w < 5; w++) {
      const days: (number | null)[] = [];
      for (let d = 0; d < 7; d++) {
        if (w === 0 && d < startDayOfWeek) {
          days.push(null);
        } else if (currentDay > lastDay.getDate()) {
          days.push(null);
        } else {
          days.push(currentDay);
          currentDay++;
        }
      }
      weeks.push(days);
    }
    return weeks;
  }, [year, month]);

  const currentWeekDates = calendarWeeks[currentWeek - 1];

  return {
    calendarWeeks,
    currentWeekDates,
  };
}
