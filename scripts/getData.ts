import fs from 'fs';
import { addWeeks, format as formatDate } from 'date-fns';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import SQL from 'sql-template-strings';
import { possibleTagType, possibleTimeType } from '../common/enums';

const db = await open({
  filename: 'sqlite/grad-data.db',
  driver: sqlite3.verbose().Database,
});

type ITopByTimeQuery<T extends TimeType, Y extends string> = {
  timeType: T;
  rnk: number;
  timeValue: Y;
  totalTime: number;
};

type TopByTimeQuery =
  | ITopByTimeQuery<'hour', `${number}`>
  | ITopByTimeQuery<'hourDayWeek', `${number}_${number}`>
  | ITopByTimeQuery<'day', `${number}-${number}-${number}`>
  | ITopByTimeQuery<'dayWeek', `${number}`>
  | ITopByTimeQuery<'month', `${number}`>
  | ITopByTimeQuery<'monthYear', `${number}-${number}`>
  | ITopByTimeQuery<'week', `${number}_${number}`>
  | ITopByTimeQuery<'weekMonth', `${number}_${number}`>
  | ITopByTimeQuery<'year', `${number}`>;

type AllByTimeQuery = {
  timeType: TimeType;
  timeValue: string;
  totalTime: number;
};

type AllByTypeQuery = {
  type: TagType;
  totalTime: number;
  histogramHour: string;
  histogramDay: string;
  histogramYear: string;
};

type AllGroupedQuery = {
  project: string;
  description: string;
  type: string;
  totalTime: number;
  histogramHour: string;
  histogramDay: string;
  histogramYear: string;
};

const final: JSONData = {
  byTime: {
    top: possibleTimeType.reduce<FinalByTime>((pv, v: TimeType) => {
      pv[v] = [];
      return pv;
    }, {}),
    all: possibleTimeType.reduce<FinalByTime>((pv, v: TimeType) => {
      pv[v] = [];
      return pv;
    }, {}),
  },
  byType: {
    all: possibleTagType.reduce<FinalByType>((pv, v: TagType) => {
      pv[v] = {};
      return pv;
    }, {}),
  },
  byGroup: {
    all: {},
  },
};

const mostTime = await db.all<TopByTimeQuery[]>(SQL`
SELECT *
FROM (
    SELECT row_number() OVER (
        PARTITION BY timeType
        ORDER BY timeValue DESC
      ) AS rnk,
      *
    FROM totalsTime
  ) parted
WHERE parted.rnk <= 3
ORDER BY parted.timeType,
  parted.totalTime DESC
`);

// chose a random date that i know the day of
/**
 * @returns string like: Monday, Tuesday, ..., Sunday
 */
const dayMap = (day: number) => formatDate(new Date(2024, 5, 3 + day), 'iiii');

/**
 * @returns string like: 3 pm, 12 noon
 */
const hourMap = (hour: number) =>
  formatDate(new Date(1970, 1, 1, hour), 'h bbb');

/**
 * @returns string like: January, February, ..., December
 */
const monthMap = (month: number) => formatDate(new Date(2024, month), 'LLLL');

const getTimeString = (type: TimeType, time: string) => {
  switch (type) {
    // 3 pm, 12 noon
    case 'hour':
      return hourMap(parseInt(time));

    // Fridays at 3 pm, Mondays at 12 noon
    case 'hourDayWeek': {
      const [day, hour] = time.split('_');
      return `${dayMap(parseInt(day))}s at ${hourMap(parseInt(hour))}`;
    }

    // Friday, April 29th, 2020
    case 'day':
      return formatDate(time, 'PPPP');

    // Monday
    case 'dayWeek':
      return dayMap(parseInt(time));

    // 1st week of 2022
    case 'week': {
      const [week, year] = time.split('_');
      return `${formatDate(addWeeks(new Date(year), parseInt(week)), 'wo')} week of ${year}`;
    }

    // 2nd week of Januarys
    case 'weekMonth': {
      const [month, week] = time.split('_');
      return `${formatDate(new Date(1970, 1, 1 + parseInt(week)), 'do')} week of ${monthMap(parseInt(month))}s`;
    }

    // January
    case 'month':
      return monthMap(parseInt(time));

    // March in 2021
    case 'monthYear': {
      const [year, month] = time.split('-');
      return `${monthMap(parseInt(month))} in ${year}`;
    }

    default:
      return time;
  }
};

for (const row of mostTime) {
  const val: FinalTimeValue = {
    totalTime: row.totalTime,
    timeString: getTimeString(row.timeType, row.timeValue),
    originalTime: row.timeValue,
  };

  final.byTime.top[row.timeType].push(val);
}

const allTimeRowCount = await db.each<AllByTimeQuery>(
  SQL`
SELECT *
FROM totalsTime
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by time: ${err}`);

    const val: FinalTimeValue = {
      totalTime: row.totalTime,
      timeString: getTimeString(row.timeType, row.timeValue),
      originalTime: row.timeValue,
    };

    final.byTime.all[row.timeType].push(val);
  },
);

const allByTypeRowCount = await db.each<AllByTypeQuery>(
  SQL`
SELECT *
FROM totalsTyped
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by type: ${err}`);

    final.byType.all[row.type] = {
      total: row.totalTime,
      histogramDay: JSON.parse(row.histogramDay) as Histogram,
      histogramHour: JSON.parse(row.histogramHour) as Histogram,
      histogramYear: JSON.parse(row.histogramYear) as Histogram,
    };
  },
);

const allByGroupRowCount = await db.each<AllGroupedQuery>(
  SQL`
SELECT *
FROM totalsGrouped
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by type: ${err}`);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (final.byGroup.all[row.project] === undefined)
      final.byGroup.all[row.project] = {};

    final.byGroup.all[row.project][row.description] = {
      project: row.description,
      description: row.description,
      type: JSON.parse(row.type) as TagType[],
      total: row.totalTime,
      histogramDay: JSON.parse(row.histogramDay) as Histogram,
      histogramHour: JSON.parse(row.histogramHour) as Histogram,
      histogramYear: JSON.parse(row.histogramYear) as Histogram,
    };
  },
);

await db.close();

fs.writeFileSync('public/data.json', JSON.stringify(final), 'utf-8');

console.log(`time row count: ${allTimeRowCount}`);
console.log(`type row count: ${allByTypeRowCount}`);
console.log(`grouped row count: ${allByGroupRowCount}`);
