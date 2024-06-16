import * as fs from 'fs';
import { once } from 'events';
import fastCSV from 'fast-csv';
import { differenceInSeconds, formatISO, parse as parseDate } from 'date-fns';
import { open, type ISqlite } from 'sqlite';
import sqlite3 from 'sqlite3';
import SQL from 'sql-template-strings';

type CSVRow = {
  project: string;
  description: string;
  billable: 'No' | 'Yes';
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

type CSVRowTransformed = {
  project: string;
  description: string;
  type: string[];
  billable: 1 | 0; // 0-false, 1-true
  start: Date;
  end: Date;
  duration: number; // seconds
};

const options: fastCSV.ParserOptionsArgs = {
  delimiter: ',',
  headers: [
    undefined,
    undefined,
    undefined,
    'project',
    undefined,
    'description',
    'billable',
    'startDate',
    'startTime',
    'endDate',
    'endTime',
    undefined,
    undefined,
    undefined,
  ],
  renameHeaders: true,
};

const db = await open({
  filename: 'sqlite/grad-data.db',
  driver: sqlite3.verbose().Database,
});

// const dataTableName = 'raw';

await db.exec(SQL`DROP TABLE IF EXISTS raw;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsGrouped;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsTyped;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsTime;`);

/**
 * start - ISO8601
 * end - ISO8601
 * duration - seconds
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS raw (
  project TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT,
  billable INTEGER NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  duration INTEGER NOT NULL
);`);

await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsGrouped (
  project TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT,
  totalTime INTEGER NOT NULL,
  histogramHour TEXT NOT NULL,
  histogramDay TEXT NOT NULL,
  histogramYear TEXT NOT NULL,
  PRIMARY KEY (project, description)
);`);

await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTyped (
  type TEXT,
  totalTime INTEGER NOT NULL,
  histogramHour TEXT NOT NULL,
  histogramDay TEXT NOT NULL,
  histogramYear TEXT NOT NULL,
  PRIMARY KEY (type)
);`);

/**
 * timeType - hour | hourDay | day | dayWeek | month | monthYear | week | weekMonth | weekYear | year
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTime (
  timeType TEXT NOT NULL,
  timeValue TEXT NOT NULL,
  totalTime INTEGER NOT NULL,
  PRIMARY KEY (timeType, timeValue)
);`);

const tags = {
  fuzzyProject: [
    {
      type: 'Hustle',
      matcher: /(leht)/i,
    },
    {
      type: 'Beyond',
      matcher: /(refactor|kitchen)/i,
    },
    {
      type: 'Community',
      matcher: /(refactor)/i,
    },
    {
      type: 'Fun',
      matcher: /(exercise|scuba|motorcycle|avalanche)/i,
    },
    {
      type: 'Exercise',
      matcher: /(exercise)/i,
    },
    {
      type: 'New', // learning beyond school
      matcher: /(scuba|motorcycle|avalanche)/i,
    },
    {
      type: 'Dogs',
      matcher: /(dog)/i,
    },
    {
      type: 'Paid',
      matcher: /(innovation|teaching assistant|hopped|pika)/i,
    },
    {
      type: 'School',
      matcher: /(\d{3}|^class$)/i,
    },
    {
      type: 'Scholarship',
      matcher: /(scholarship)/i,
    },
    {
      type: 'Compost',
      matcher: /(capstone|compost)/i,
    },
  ],
  fuzzyDescription: [
    {
      type: 'Apply',
      matcher: /(apply|application)/i,
    },
    {
      type: 'Meeting',
      matcher: /(meet)/i,
    },
    {
      type: 'Networking',
      matcher: /(network|attend)/i,
    },
    {
      type: 'Resume',
      matcher: /(resume)/i,
    },
    {
      type: 'Research',
      matcher: /(research)/i,
    },
    {
      type: 'Community',
      matcher: /(trio|sacnas)/i,
    },
    {
      type: 'Scholarship',
      matcher: /(ford|scholarship)/i,
    },
    {
      type: 'Beyond',
      matcher: /(gift card|recommendation|thank you)/i,
    },
    {
      type: 'Work',
      matcher: /(work|code|interview)/i,
    },
    {
      type: 'Email',
      matcher: /(email|letter)/i,
    },
    {
      type: 'Compost',
      matcher: /(compost)/i,
    },
    {
      type: 'Dogs',
      matcher: /(dog)/i,
    },
    {
      type: 'New', // learning beyond school
      matcher: /(skin)/i,
    },
    {
      type: 'Exercise',
      matcher: /(exercise)/i,
    },
    {
      type: 'PNNL',
      matcher: /(pnnl|apartment)/i,
    },
  ],
};

const descriptionCleaner: Partial<Record<string, Record<string, string>>> = {
  'Get Hired at Dream Job': {
    // keyword: Network
    'Prepare for SACNAS': 'Prepare for SACNAS - Network',

    // keyword: apartment
    'Search for housing': 'Search for apartment',
  },
  'CS 461 Capstone': {
    // keyword: work
    Homwork: 'Homework',
  },
};

const cleanDescription = (project: string, description: string) => {
  return descriptionCleaner[project]?.[description] ?? description;
};

const createTags = (project: string, description: string) => {
  const tagSet = new Set<string>();
  for (const tagMatch of tags.fuzzyProject) {
    if (tagMatch.matcher.test(project)) tagSet.add(tagMatch.type);
  }
  for (const tagMatch of tags.fuzzyDescription) {
    if (tagMatch.matcher.test(description)) tagSet.add(tagMatch.type);
  }

  if (tagSet.size === 0) tagSet.add('UNKNOWN');

  return Array.from(tagSet);
};

const processFile = async (file: string) => {
  const readableStream = fs.createReadStream(`data_source/${file}.csv`);

  const promises: Promise<ISqlite.RunResult>[] = [];

  const insert = await db.prepare(SQL`
  INSERT 
  INTO  raw 
        (project, description, type, billable, start, end, duration) 
  VALUES (?, ?, ?, ?, ?, ?, ?);`);

  const csvStream = fastCSV
    .parseStream<CSVRow, CSVRowTransformed>(readableStream, options)
    .transform(
      ({
        startDate,
        startTime,
        endDate,
        endTime,
        description,
        billable,
        project,
      }: CSVRow): CSVRowTransformed => {
        const start = parseDate(
          `${startDate} _ ${startTime}`,
          'yyyy-MM-dd _ HH:mm:ss',
          new Date(),
        );
        const end = parseDate(
          `${endDate} _ ${endTime}`,
          'yyyy-MM-dd _ HH:mm:ss',
          new Date(),
        );
        const duration = differenceInSeconds(end, start);

        description = cleanDescription(project, description);

        const type = createTags(project, description);

        return {
          project,
          description,
          billable: billable === 'No' ? 0 : 1,
          start,
          end,
          duration,
          type,
        };
      },
    )
    .on('error', (e) => {
      console.error(`parse error: ${e}`);
      process.exit(1);
    })
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    .on('data', (row: CSVRowTransformed) => {
      promises.push(
        insert.run(
          row.project,
          row.description,
          JSON.stringify(row.type),
          row.billable,
          formatISO(row.start),
          formatISO(row.end),
          row.duration,
        ),
      );
    })
    .on('end', (rowCount: number) => {
      console.log(`Read ${rowCount} from the file`);
    });

  await once(csvStream, 'end');

  const answers = await Promise.all(promises);

  await insert.finalize();

  for (const result of answers) {
    if (result.changes !== 1) {
      console.error(
        `Failed to write a row to the DB: ${JSON.stringify(result)}`,
      );
    }
  }

  readableStream.close();

  const rowCount = await db.get<{ 'count(1)': number }>(SQL`
    SELECT count(1)
    FROM raw
  `);

  console.log(`number of rows in the DB: ${rowCount?.['count(1)']}}`);
};

for (const file of [
  'Toggl_time_entries_2020-01-01_to_2020-12-31',
  'Toggl_time_entries_2021-01-01_to_2021-12-31',
  'Toggl_time_entries_2022-01-01_to_2022-12-31',
  'Toggl_time_entries_2023-01-01_to_2023-12-31',
  'Toggl_time_entries_2024-01-01_to_2024-12-31',
]) {
  await processFile(file);
}

// fill totalsGrouped
await db.run(SQL`
WITH distinctTypes AS (
  SELECT DISTINCT project,
    description,
    value
  FROM raw,
    json_each(raw.type)
  GROUP BY project,
    description,
    value
),
cleanedType AS (
  SELECT project,
    description,
    json_group_array(value) AS types
  FROM distinctTypes
  GROUP BY project,
    description
),
by_day AS (
  SELECT project,
    description,
    CAST(strftime('%w', start) AS TEXT) AS day,
    SUM(duration) AS dayTotal
  FROM raw
  GROUP BY project,
    description,
    day
),
by_hour AS (
  SELECT project,
    description,
    CAST(strftime('%H', start) AS TEXT) AS hour,
    SUM(duration) AS hourTotal
  FROM raw
  GROUP BY project,
    description,
    hour
),
by_year AS (
  SELECT project,
    description,
    CAST(strftime('%Y', start) AS TEXT) AS year,
    SUM(duration) AS yearTotal
  FROM raw
  GROUP BY project,
    description,
    year
)
INSERT INTO totalsGrouped
  SELECT r.project,
    r.description,
    ct.types as type,
    SUM(duration) AS totalTime,
    json_group_object(bh.hour, bh.hourTotal) AS histogramHour,
    json_group_object(bd.day, bd.dayTotal) AS histogramDay,
    json_group_object([by].year, [by].yearTotal) AS histogramYear
  FROM raw r
    INNER JOIN cleanedType ct ON r.project = ct.project
    AND r.description = ct.description
    INNER JOIN by_day bd ON r.project = bd.project
    AND r.description = bd.description
    INNER JOIN by_year [by] ON r.project = [by].project
    AND r.description = [by].description
    INNER JOIN by_hour bh ON r.project = bh.project
    AND r.description = bh.description
  GROUP BY r.project,
    r.description
  ORDER BY r.project,
    r.description
`);

// fills totalsTyped
await db.run(SQL`
WITH by_hour AS (
  SELECT type,
    json_group_object(hour, hourTotal) AS hist
  FROM (
      SELECT types.value AS type,
        CAST(strftime('%H', start) AS TEXT) AS hour,
        SUM(duration) AS hourTotal
      FROM raw
        JOIN json_each(raw.type) AS types
      GROUP BY types.VALUE,
        hour
    ) b
  GROUP BY b.type
),
by_day AS (
  SELECT type,
    json_group_object(day, dayTotal) AS hist
  FROM (
      SELECT types.value AS type,
        CAST(strftime('%w', start) AS TEXT) AS day,
        SUM(duration) AS dayTotal
      FROM raw
        JOIN json_each(raw.type) AS types
      GROUP BY types.VALUE,
        day
    ) b
  GROUP BY b.type
),
by_year AS (
  SELECT type,
    json_group_object(year, yearTotal) AS hist
  FROM (
      SELECT types.value AS type,
        CAST(strftime('%Y', start) AS TEXT) AS year,
        SUM(duration) AS yearTotal
      FROM raw
        JOIN json_each(raw.type) AS types
      GROUP BY types.VALUE,
        year
    ) b
  GROUP BY b.type
)
INSERT INTO totalsTyped
  SELECT types.value AS type,
    SUM(r.duration) AS totalTime,
    h.hist as histogramHour,
    d.hist as histogramDay,
    b.hist as histogramYear
  FROM raw r
    JOIN json_each(r.type) AS types
    JOIN by_hour h ON types.value = h.type
    JOIN by_day d ON types.value = d.type
    JOIN by_year b ON types.value = b.type
  GROUP BY types.value 
`);

// fills totalsTime - hour - HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hour' AS timeType,
    strftime('%H', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

// fills totalsTime - hourDayWeek - 0-6_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourDayWeek' AS timeType,
    strftime('%w_%H', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

// fills totalsTime - day - YYYY-MM-DD
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'day' AS timeType,
    strftime('%F', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeek - 0-6
await db.run(SQL`
INSERT INTO totalsTime
SELECT 'dayWeek' AS timeType,
  strftime('%w', start) AS timeValue,
  SUM(duration) AS totalTime
FROM raw
GROUP BY timeValue;
`);

// fills totalsTime - week - ISO8601WeekOfYear(01-53)_YYYY
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'week' AS timeType,
    strftime('%W_%Y', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

// fills totalsTime - weekMonth - MM_0-4
await db.run(SQL`
INSERT INTO totalsTime
SELECT 'weekMonth' AS timeType,
  concat(strftime('%m', start), '_', strftime('%d', start) / 7) AS timeValue,
  SUM(duration) AS totalTime
FROM raw
GROUP BY timeValue;
`);

// fills totalsTime - month - MM
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'month' AS timeType,
    strftime('%m', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

// fills totalsTime - monthYear - YYYY-MM
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'monthYear' AS timeType,
    strftime('%Y-%m', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

// fills totalsTime - year - YYYY
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'year' AS timeType,
    strftime('%Y', start) AS timeValue,
    SUM(duration) AS totalTime
  FROM raw
  GROUP BY timeValue;
`);

await db.close();
