import {
  addDays,
  addHours,
  addMonths,
  formatDate,
  startOfDay,
  startOfWeek,
  startOfYear,
} from 'date-fns';

export const dayOfWeekFormat = (val: string) =>
  formatDate(addDays(startOfWeek(Date.now()), parseInt(val)), 'iiii');

export const yearFormat = (val: string) => formatDate(`${val}-02-01`, 'yyyy');

export const monthFormat = (val: string) =>
  formatDate(addMonths(startOfYear(Date.now()), parseInt(val) - 1), 'MMM');

export const hourFormat = (val: string) =>
  formatDate(addHours(startOfDay(Date.now()), parseInt(val)), 'haaa');
