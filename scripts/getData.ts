import fs from 'fs';
import { addWeeks, format as formatDate } from 'date-fns';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { SQL } from './sqlTemplateString';

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
  | ITopByTimeQuery<'hourYear', `${number}_${number}`>
  | ITopByTimeQuery<'hourMonth', `${number}_${number}`>
  | ITopByTimeQuery<'hourMonthYear', `${number}-${number}_${number}`>
  | ITopByTimeQuery<'hourDay', `${number}_${number}`>
  | ITopByTimeQuery<'hourDayYear', `${number}_${number}_${number}`>
  | ITopByTimeQuery<'hourDayMonth', `${number}_${number}_${number}`>
  | ITopByTimeQuery<
      'hourDayMonthYear',
      `${number}-${number}_${number}_${number}`
    >
  | ITopByTimeQuery<'day', `${number}-${number}-${number}`>
  | ITopByTimeQuery<'day', `${number}`>
  | ITopByTimeQuery<'dayYear', `${number}_${number}`>
  | ITopByTimeQuery<'dayMonth', `${number}_${number}`>
  | ITopByTimeQuery<'dayMonthYear', `${number}-${number}_${number}`>
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
  histType: SliceType;
  hist: string;
};

type AllGroupedQuery = {
  project: string;
  description: string;
  type: string;
  histType: SliceType;
  hist: string;
};

type AllProjectQuery = {
  project: string;
  type: string;
  histType: SliceType;
  hist: string;
};

type TotalsQuery = {
  sliceType: TotalsType;
  sliceKey: string;
  totalTime: number;
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
    case 'hourDay': {
      const [day, hour] = time.split('_');
      return `${dayMap(parseInt(day))}s at ${hourMap(parseInt(hour))}`;
    }

    // Friday, April 29th, 2020
    case 'date':
      return formatDate(time, 'PPPP');

    // Monday
    case 'day':
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

const timeTop: Partial<FinalByTime> = {};

for (const row of mostTime) {
  const val: FinalTimeValue = {
    totalTime: row.totalTime,
    timeString: getTimeString(row.timeType, row.timeValue),
    originalTime: row.timeValue,
  };

  const key = row.timeType;

  if (timeTop[key] === undefined) timeTop[key] = [];

  timeTop[key].push(val);
}

const timeAll: FinalByTime = {};

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

    const key = row.timeType;

    if (timeAll[key] === undefined) timeAll[key] = [];

    timeAll[key].push(val);
  },
);

const typeAll: FinalByType = {};

const allByTypeRowCount = await db.each<AllByTypeQuery>(
  SQL`
SELECT *
FROM totalsTyped
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by type: ${err}`);

    const key = row.type;

    if (typeAll[key] === undefined) {
      typeAll[key] = {};
    }

    // TODO: probably better to set up using typebox...
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    typeAll[key][row.histType] = JSON.parse(row.hist);
  },
);

const groupAll: FinalByGroup = {};

const allByGroupRowCount = await db.each<AllGroupedQuery>(
  SQL`
SELECT *
FROM totalsGrouped
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by type: ${err}`);

    const project = row.project;
    const description = row.description;

    if (groupAll[project] === undefined) groupAll[project] = {};
    if (groupAll[project][description] === undefined)
      groupAll[project][description] = {
        project,
        description,
        type: JSON.parse(row.type) as TagType[],
      };

    // TODO: probably better to set up using typebox...
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    groupAll[project][description][row.histType] = JSON.parse(row.hist);
  },
);

const projectAll: FinalByProject = {};

const allByProjectRowCount = await db.each<AllProjectQuery>(
  SQL`
SELECT *
FROM totalsProject
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by type: ${err}`);

    const project = row.project;

    if (projectAll[project] === undefined)
      projectAll[project] = {
        project,
        type: JSON.parse(row.type) as TagType[],
      };

    // TODO: probably better to set up using typebox...
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    projectAll[project][row.histType] = JSON.parse(row.hist);
  },
);

const typeTotals: TotalsByType = {};
const groupTotals: Record<string, number> = {};
const projectTotals: Record<Project, number> = {};

const totalsCount = await db.each<TotalsQuery>(
  SQL`
SELECT *
FROM totals
`,
  (err, row) => {
    if (err) throw new Error(`Failed when getting all by type: ${err}`);

    switch (row.sliceType) {
      case 'project':
        projectTotals[row.sliceKey] = row.totalTime;
        break;
      case 'project.description':
        groupTotals[row.sliceKey] = row.totalTime;
        break;
      case 'type':
        typeTotals[row.sliceKey as TagType] = row.totalTime;
        break;
    }
  },
);

const final: JSONData = {
  byTime: {
    top: timeTop,
    all: timeAll,
  },
  byType: {
    all: typeAll,
    totals: typeTotals,
  },
  byGroup: {
    all: groupAll,
    totals: groupTotals,
  },
  byProject: {
    all: projectAll,
    totals: projectTotals,
  },
};

await db.close();

fs.writeFileSync('public/data.json', JSON.stringify(final), 'utf-8');

console.log(`time row count: ${allTimeRowCount}`);
console.log(`type row count: ${allByTypeRowCount}`);
console.log(`grouped row count: ${allByGroupRowCount}`);
console.log(`project row count: ${allByProjectRowCount}`);
console.log(`totals row count: ${totalsCount}`);
