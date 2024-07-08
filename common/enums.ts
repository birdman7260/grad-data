/**
 * @see {@link TimeType}
 */
export const possibleTimeType = [
  'hour',
  'hourYear',
  'hourMonth',
  'hourMonthYear',
  'hourDayWeek',
  'hourDayWeekYear',
  'hourDayWeekMonth',
  'hourDayWeekMonthYear',
  'day',
  'dayWeek',
  'dayWeekYear',
  'dayWeekMonth',
  'dayWeekMonthYear',
  'month',
  'monthYear',
  'week',
  'weekMonth',
  'year',
] as const;

export const possibleSliceType = [
  'hourCount',
  'hourYearCount',
  'hourMonthCount',
  'hourMonthYearCount',
  'dayCount',
  'dayYearCount',
  'dayMonthCount',
  'dayMonthYearCount',
  'monthCount',
  'monthYearCount',
  'yearCount',
  'yearSum',
] as const;

export const possibleTagType = [
  'Apply',
  'Beyond',
  'Community',
  'Compost',
  'Dogs',
  'Email',
  'Exercise',
  'Fun',
  'Hustle',
  'Meeting',
  'Networking',
  'New',
  'PNNL',
  'Paid',
  'Research',
  'Resume',
  'Scholarship',
  'School',
  'UNKNOWN',
  'Work',
] as const;

export const possibleTotalsType = [
  'project',
  'project.description',
  'type',
] as const;

export const hours: `${number}`[] = [
  '00',
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
];

export const months: `${number}`[] = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
];

export const days: `${number}`[] = ['0', '1', '2', '3', '4', '5', '6'];

export const years: `${number}`[] = ['2021', '2022', '2023', '2024'];
