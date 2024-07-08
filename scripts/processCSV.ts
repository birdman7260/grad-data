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
  type: TagType[];
  billable: 1 | 0; // 0-false, 1-true
  start: Date; // will be ISO 8601 format, e.g: 2021-12-13T14:14:45-08:00
  end: Date; // will be ISO 8601 format, e.g: 2021-12-13T14:14:45-08:00
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

await db.exec(SQL`DROP TABLE IF EXISTS [raw];`);
await db.exec(SQL`DROP TABLE IF EXISTS houred;`);
await db.exec(SQL`DROP TABLE IF EXISTS cleanedType;`);
await db.exec(SQL`DROP TABLE IF EXISTS totals;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsGrouped;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsProject;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsTyped;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsTime;`);

/**
 * Table "raw" contains all data entries from the CSV
 *
 * type - JSON array of tag strings - TagType[] - @see TagType
 * billable - 0 | 1
 * start - ISO8601
 * end - ISO8601
 * duration - seconds
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS [raw] (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  [type] TEXT NOT NULL,
  billable INTEGER NOT NULL,
  [start] TEXT NOT NULL,
  [end] TEXT NOT NULL,
  duration INTEGER NOT NULL
);`);

/**
 * Table "houred" contains all the records from "raw" but
 * duplicates them once per hour between start and end times
 *
 * type - JSON array of tag strings - TagType[] - @see TagType
 * billable - 0 | 1
 * start - ISO8601
 * end - ISO8601
 * duration - seconds
 * startdate - ISO8601 - this is each hour's value
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS houred (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  [type] TEXT NOT NULL,
  [start] TEXT NOT NULL,
  [end] TEXT NOT NULL,
  duration INTEGER NOT NULL,
  startdate TEXT NOT NULL
);`);

/**
 * Table "cleanedType" contains records for each project+description
 * and a JSON array of their types, to be used by other queries
 *
 * types - JSON array of types
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS cleanedType (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  types TEXT NOT NULL,
  PRIMARY KEY (project, [description])
);`);

/**
 * Table "totals" contains records for the total amount of time
 * for each slice of data (project, project.description, type)
 *
 * sliceType - @see TotalsType
 * sliceKey - value depends on the sliceType
 * totalTime - seconds
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totals (
  sliceType TEXT NOT NULL,
  sliceKey TEXT NOT NULL,
  totalTime INTEGER NOT NULL,
  PRIMARY KEY (sliceType, sliceKey)
);`);

/**
 * Table "totalsGrouped" aggregates the durations by project+description and additionally
 * calculates a breakdown of the duration by hour of the day, day of the week, and year
 *
 * type - JSON array of tag strings - TagType[] - @see TagType
 * histType - @see SliceType
 * hist - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsGrouped (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  [type] TEXT NOT NULL,
  histType TEXT NOT NULL,
  hist TEXT NOT NULL,
  PRIMARY KEY (project, [description], histType)
);`);

/**
 * Table "totalsProject" aggregates the durations by project+description and additionally
 * calculates a breakdown of the duration by hour of the day, day of the week, and year
 *
 * type - JSON array of tag strings - TagType[] - @see TagType
 * histType - @see SliceType
 * hist - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsProject (
  project TEXT NOT NULL,
  [type] TEXT NOT NULL,
  histType TEXT NOT NULL,
  hist TEXT NOT NULL,
  PRIMARY KEY (project, histType)
);`);

/**
 * Table "totalsTyped" aggregates the durations by tag type and additionally
 * calculates a breakdown of the duration by hour of the day, day of the week, and year
 *
 * type - @see TagType
 * histType - @see SliceType
 * hist - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTyped (
  [type] TEXT NOT NULL,
  histType TEXT NOT NULL,
  hist TEXT NOT NULL,
  PRIMARY KEY ([type], histType)
);`);

/**
 * Table "totalsTyped" aggregates the durations by tag type and additionally
 * calculates a breakdown of the duration by hour of the day, day of the week, and year
 *
 * timeType - @see TimeType
 * timeValue - depends on timeType, see the insert code for comments showing the format
 * totalTime - seconds
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTime (
  timeType TEXT NOT NULL,
  timeValue TEXT NOT NULL,
  totalTime INTEGER NOT NULL,
  PRIMARY KEY (timeType, timeValue)
);`);

type TagAssignment = {
  type: TagType;
  matcher: RegExp;
};

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
  ] as TagAssignment[],
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
  ] as TagAssignment[],
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
  const tagSet = new Set<TagType>();
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
    FROM [raw]
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

console.log('Creating table: houred');

// fill houred
await db.run(SQL`
WITH hourCTE AS (
  -- This CTE will create a row for every hour between start and end for every record
  SELECT project,
    [description],
    [type],
    [start],
    [end],
    duration,
    [start] AS startdate
  FROM [raw]
  UNION ALL
  SELECT project,
    [description],
    [type],
    [start],
    [end],
    duration,
    datetime(startdate, '1 hours')
  FROM hourCTE -- Must account for localtime and stripping away the minutes to make things nicer
  WHERE datetime(strftime('%FT%H:00:00', startdate, 'localtime')) < datetime(strftime('%FT%H:00:00', [end], 'localtime'))
)
INSERT INTO houred
  SELECT *
  FROM hourCTE;
`);

console.log('Finished table: houred');

console.log('Creating table: cleanedType');

await db.run(SQL`
WITH DISTINCTTypes AS (
  SELECT DISTINCT project,
    [description],
    [value]
  FROM [raw],
    json_each([raw].[type])
  GROUP BY project,
    [description],
    [value]
)
INSERT INTO cleanedType
  SELECT project,
    [description],
    json_group_array([value]) AS types
  FROM DISTINCTTypes
  GROUP BY project,
    [description]
`);

console.log('Finished table: cleanedType');

console.log('Creating table: totals');

await db.run(SQL`
INSERT INTO totals
  SELECT 'project' AS sliceType,
    project AS sliceKey,
    SUM(duration) AS totalTime
  FROM [raw]
  GROUP BY project;
  `);

await db.run(SQL`
INSERT INTO totals
  SELECT 'project.description' AS sliceType,
    project || '|' || [description] AS sliceKey,
    SUM(duration) AS totalTime
  FROM [raw]
  GROUP BY project, 
    [description];
  `);

await db.run(SQL`
INSERT INTO totals
  SELECT 'type' AS sliceType,
    types.value AS sliceKey,
    SUM(r.duration) AS totalTime
  FROM [raw] r
    JOIN json_each(r.type) AS types
  GROUP BY types.value;
  `);

console.log('Finished table: totals');

console.log('Creating table: totalsGrouped');

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [description],
    [time]
)
INSERT INTO totalsGrouped
  SELECT b.project,
    b.description,
    ct.types AS [type],
    'hourCount' AS histType,
    json_group_object([time], hourCount) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
    AND b.description = ct.description
  GROUP BY b.project,
    b.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [description],
    [time],
    [year]
)
INSERT INTO totalsGrouped
  SELECT c.project,
      c.description,
      ct.types AS [type],
      'hourYearCount' AS histType,
      json_group_object([year], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        b.description,
        [year],
        json_group_object([time], hourCount) AS hist
      FROM counted b
      GROUP BY b.project,
        b.description,
        [year]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
    AND c.description = ct.description
  GROUP BY c.project,
    c.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [description],
    [time],
    [month]
)
INSERT INTO totalsGrouped
  SELECT c.project,
      c.description,
      ct.types AS [type],
      'hourMonthCount' AS histType,
      json_group_object([month], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        b.description,
        [month],
        json_group_object([time], hourCount) AS hist
      FROM counted b
      GROUP BY b.project,
        b.description,
        [month]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
    AND c.description = ct.description
  GROUP BY c.project,
    c.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [description],
    [time],
    [month],
    [year]
)
INSERT INTO totalsGrouped
  SELECT d.project,
      d.description,
      ct.types AS [type],
      'hourMonthYearCount' AS histType,
      json_group_object([year], json(d.hist)) AS hist
  FROM (
      SELECT c.project,
        c.description,
        [year],
        json_group_object([month], json(c.hist)) AS hist
      FROM (
        SELECT b.project,
          b.description,
          [month],
          [year],
          json_group_object([time], hourCount) AS hist
        FROM counted b
        GROUP BY b.project,
          b.description,
          [month],
          [year]
      ) c
      GROUP BY c.project,
        c.description,
        [year]
    ) d
    INNER JOIN cleanedType ct ON d.project = ct.project
    AND d.description = ct.description
  GROUP BY d.project,
    d.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time]
)
INSERT INTO totalsGrouped
  SELECT b.project,
    b.description,
    ct.types AS [type],
    'dayCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
    AND b.description = ct.description
  GROUP BY b.project,
    b.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time],
    [year]
)
INSERT INTO totalsGrouped
  SELECT c.project,
      c.description,
      ct.types AS [type],
      'dayYearCount' AS histType,
      json_group_object([year], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        b.description,
        [year],
        json_group_object(
          [time],
          json_object('count', [count], 'hourCount', hourCount)
        ) AS hist
      FROM counted b
      GROUP BY b.project,
        b.description,
        [year]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
    AND c.description = ct.description
  GROUP BY c.project,
    c.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time],
    [month]
)
INSERT INTO totalsGrouped
  SELECT c.project,
      c.description,
      ct.types AS [type],
      'dayMonthCount' AS histType,
      json_group_object([month], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        b.description,
        [month],
        json_group_object(
          [time],
          json_object('count', [count], 'hourCount', hourCount)
        ) AS hist
      FROM counted b
      GROUP BY b.project,
        b.description,
        [month]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
    AND c.description = ct.description
  GROUP BY c.project,
    c.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time],
    [month],
    [year]
)
INSERT INTO totalsGrouped
  SELECT d.project,
      d.description,
      ct.types AS [type],
      'dayMonthYearCount' AS histType,
      json_group_object([year], json(d.hist)) AS hist
  FROM (
      SELECT c.project,
        c.description,
        [year],
        json_group_object([month], json(c.hist)) AS hist
      FROM (
        SELECT b.project,
          b.description,
          [month],
          [year],
          json_group_object(
            [time],
            json_object('count', [count], 'hourCount', hourCount)
          ) AS hist
        FROM counted b
        GROUP BY b.project,
          b.description,
          [month],
          [year]
      ) c
      GROUP BY c.project,
        c.description,
        [year]
    ) d
    INNER JOIN cleanedType ct ON d.project = ct.project
    AND d.description = ct.description
  GROUP BY d.project,
    d.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    strftime('%Y-%m', startdate, 'localtime') AS [time],
    COUNT(1) AS hourCount,
    COUNT(
      DISTINCT strftime('%Y-%m', startdate, 'localtime')
    ) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time]
)
INSERT INTO totalsGrouped
  SELECT b.project,
    b.description,
    ct.types AS [type],
    'monthYearCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
    AND b.description = ct.description
  GROUP BY b.project,
    b.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    strftime('%m', startdate, 'localtime') AS [time],
    COUNT(1) AS hourCount,
    COUNT(
      DISTINCT strftime('%m', startdate, 'localtime')
    ) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time]
)
INSERT INTO totalsGrouped
  SELECT b.project,
    b.description,
    ct.types AS [type],
    'monthCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
    AND b.description = ct.description
  GROUP BY b.project,
    b.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    strftime('%Y', startdate, 'localtime') AS [time],
    COUNT(1) AS hourCount,
    COUNT(
      DISTINCT strftime('%Y', startdate, 'localtime')
    ) AS [count]
  FROM houred
  GROUP BY project,
    [description],
    [time]
)
INSERT INTO totalsGrouped
  SELECT b.project,
    b.description,
    ct.types AS [type],
    'yearCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
    AND b.description = ct.description
  GROUP BY b.project,
    b.description
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    [description],
    strftime('%Y', startdate, 'localtime') AS [time],
    SUM(duration) AS totalTime
  FROM houred
  GROUP BY project,
    [description],
    [time]
)
INSERT INTO totalsGrouped
  SELECT b.project,
    b.description,
    ct.types AS [type],
    'yearSum' AS histType,
    json_group_object([time], totalTime) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
    AND b.description = ct.description
  GROUP BY b.project,
    b.description
`);

console.log('Finished table: totalsGrouped');

console.log('Creating table: totalsProject');

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [time]
)
INSERT INTO totalsProject
  SELECT b.project,
    ct.types AS [type],
    'hourCount' AS histType,
    json_group_object([time], hourCount) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
  GROUP BY b.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [time],
    [year]
)
INSERT INTO totalsProject
  SELECT c.project,
      ct.types AS [type],
      'hourYearCount' AS histType,
      json_group_object([year], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        [year],
        json_group_object([time], hourCount) AS hist
      FROM counted b
      GROUP BY b.project,
        [year]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
  GROUP BY c.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [time],
    [month]
)
INSERT INTO totalsProject
  SELECT c.project,
      ct.types AS [type],
      'hourMonthCount' AS histType,
      json_group_object([month], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        [month],
        json_group_object([time], hourCount) AS hist
      FROM counted b
      GROUP BY b.project,
        [month]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
  GROUP BY c.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [time],
    [month],
    [year]
)
INSERT INTO totalsProject
  SELECT d.project,
      ct.types AS [type],
      'hourMonthYearCount' AS histType,
      json_group_object([year], json(d.hist)) AS hist
  FROM (
      SELECT c.project,
        [year],
        json_group_object([month], json(c.hist)) AS hist
      FROM (
        SELECT b.project,
          [month],
          [year],
          json_group_object([time], hourCount) AS hist
        FROM counted b
        GROUP BY b.project,
          [month],
          [year]
      ) c
      GROUP BY c.project,
        [year]
    ) d
    INNER JOIN cleanedType ct ON d.project = ct.project
  GROUP BY d.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [time]
)
INSERT INTO totalsProject
  SELECT b.project,
    ct.types AS [type],
    'dayCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
  GROUP BY b.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [time],
    [year]
)
INSERT INTO totalsProject
  SELECT c.project,
      ct.types AS [type],
      'dayYearCount' AS histType,
      json_group_object([year], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        [year],
        json_group_object(
          [time],
          json_object('count', [count], 'hourCount', hourCount)
        ) AS hist
      FROM counted b
      GROUP BY b.project,
        [year]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
  GROUP BY c.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [time],
    [month]
)
INSERT INTO totalsProject
  SELECT c.project,
      ct.types AS [type],
      'dayMonthCount' AS histType,
      json_group_object([month], json(c.hist)) AS hist
  FROM (
      SELECT b.project,
        [month],
        json_group_object(
          [time],
          json_object('count', [count], 'hourCount', hourCount)
        ) AS hist
      FROM counted b
      GROUP BY b.project,
        [month]
    ) c
    INNER JOIN cleanedType ct ON c.project = ct.project
  GROUP BY c.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
    CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
    CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
    COUNT(1) AS hourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
  FROM houred
  GROUP BY project,
    [time],
    [month],
    [year]
)
INSERT INTO totalsProject
  SELECT d.project,
      ct.types AS [type],
      'dayMonthYearCount' AS histType,
      json_group_object([year], json(d.hist)) AS hist
  FROM (
      SELECT c.project,
        [year],
        json_group_object([month], json(c.hist)) AS hist
      FROM (
        SELECT b.project,
          [month],
          [year],
          json_group_object(
            [time],
            json_object('count', [count], 'hourCount', hourCount)
          ) AS hist
        FROM counted b
        GROUP BY b.project,
          [month],
          [year]
      ) c
      GROUP BY c.project,
        [year]
    ) d
    INNER JOIN cleanedType ct ON d.project = ct.project
  GROUP BY d.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    strftime('%Y-%m', startdate, 'localtime') AS [time],
    COUNT(1) AS hourCount,
    COUNT(
      DISTINCT strftime('%Y-%m', startdate, 'localtime')
    ) AS [count]
  FROM houred
  GROUP BY project,
    [time]
)
INSERT INTO totalsProject
  SELECT b.project,
    ct.types AS [type],
    'monthYearCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
  GROUP BY b.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    strftime('%m', startdate, 'localtime') AS [time],
    COUNT(1) AS hourCount,
    COUNT(
      DISTINCT strftime('%m', startdate, 'localtime')
    ) AS [count]
  FROM houred
  GROUP BY project,
    [time]
)
INSERT INTO totalsProject
  SELECT b.project,
    ct.types AS [type],
    'monthCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
  GROUP BY b.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    strftime('%Y', startdate, 'localtime') AS [time],
    COUNT(1) AS hourCount,
    COUNT(
      DISTINCT strftime('%Y', startdate, 'localtime')
    ) AS [count]
  FROM houred
  GROUP BY project,
    [time]
)
INSERT INTO totalsProject
  SELECT b.project,
    ct.types AS [type],
    'yearCount' AS histType,
    json_group_object(
      [time],
      json_object('count', [count], 'hourCount', hourCount)
    ) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
  GROUP BY b.project
`);

await db.run(SQL`
WITH counted AS (
  SELECT project,
    strftime('%Y', startdate, 'localtime') AS [time],
    SUM(duration) AS totalTime
  FROM houred
  GROUP BY project,
    [time]
)
INSERT INTO totalsProject
  SELECT b.project,
    ct.types AS [type],
    'yearSum' AS histType,
    json_group_object([time], totalTime) AS hist
  FROM counted b
    INNER JOIN cleanedType ct ON b.project = ct.project
  GROUP BY b.project
`);

console.log('Finished table: totalsProject');

console.log('Creating table: totalsTyped');

// // fills totalsTyped

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'hourCount' AS histType,
    json_group_object([time], hourCount) AS hist
  FROM (
      SELECT types.value AS [type],
        CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
        COUNT(1) AS hourCount
      FROM houred
        JOIN json_each(houred.type) AS types
      GROUP BY types.VALUE,
        [time]
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'hourYearCount' AS histType,
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object([time], hourCount) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
            COUNT(1) AS hourCount
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [year],
            [time]
        ) c
      GROUP BY c.type,
        c.year
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'hourMonthCount' AS histType,
    json_group_object([month], json(hist)) AS hist
  FROM (
      SELECT [type],
        [month],
        json_group_object([time], hourCount) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
            COUNT(1) AS hourCount
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [month],
            [time]
        ) c
      GROUP BY c.type,
        c.month
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'hourMonthYearCount' AS histType,
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        [month],
        json_group_object([month], json(hist)) AS hist
      FROM (
          SELECT [type],
            [year],
            [month],
            json_group_object([time], hourCount) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS [time],
                CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
                CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
                COUNT(1) AS hourCount
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [year],
                [month],
                [time]
            ) d
          GROUP BY d.type,
            d.year,
            d.month
        ) c
      GROUP BY c.type,
        c.year
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
  INSERT INTO totalsTyped
    SELECT [type],
      'dayCount' AS histType,
      json_group_object(
        [time], 
        json_object('count', [count], 'hourCount', [hourCount])
      ) AS hist
    FROM (
        SELECT types.value AS [type],
          CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
          COUNT(1) AS hourCount,
          COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
        FROM houred
          JOIN json_each(houred.type) AS types
        GROUP BY types.VALUE,
          [time]
      ) b
    GROUP BY b.type
  `);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'dayYearCount' AS histType,
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object(
          [time], 
          json_object('count', [count], 'hourCount', [hourCount])
        ) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
            COUNT(1) AS hourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [year],
            [time]
        ) c
      GROUP BY c.type,
        c.year
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'dayMonthCount' AS histType,
    json_group_object([month], json(hist)) AS hist
  FROM (
      SELECT [type],
        [month],
        json_group_object(
          [time], 
          json_object('count', [count], 'hourCount', [hourCount])
        ) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
            COUNT(1) AS hourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [month],
            [time]
        ) c
      GROUP BY c.type,
        c.month
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'dayMonthYearCount' AS histType,
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        [month],
        json_group_object([month], json(hist)) AS hist
      FROM (
          SELECT [type],
            [year],
            [month],
            json_group_object(
              [time], 
              json_object('count', [count], 'hourCount', [hourCount])
            ) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [time],
                CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
                CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
                COUNT(1) AS hourCount,
                COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [year],
                [month],
                [time]
            ) d
          GROUP BY d.type,
            d.year,
            d.month
        ) c
      GROUP BY c.type,
        c.year
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
  INSERT INTO totalsTyped
    SELECT [type],
      'monthCount' AS histType,
      json_group_object(
        [time], 
        json_object('count', [count], 'hourCount', [hourCount])
      ) AS hist
    FROM (
        SELECT types.value AS [type],
          CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [time],
          COUNT(1) AS hourCount,
          COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
        FROM houred
          JOIN json_each(houred.type) AS types
        GROUP BY types.VALUE,
          [time]
      ) b
    GROUP BY b.type
  `);

await db.run(SQL`
INSERT INTO totalsTyped
  SELECT [type],
    'monthYearCount' AS histType,
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object(
          [time], 
          json_object('count', [count], 'hourCount', [hourCount])
        ) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
            COUNT(1) AS hourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [year],
            [time]
        ) c
      GROUP BY c.type,
        c.year
    ) b
  GROUP BY b.type
`);

await db.run(SQL`
  INSERT INTO totalsTyped
    SELECT [type],
      'yearCount' AS histType,
      json_group_object(
        [time], 
        json_object('count', [count], 'hourCount', [hourCount])
      ) AS hist
    FROM (
        SELECT types.value AS [type],
          CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [time],
          COUNT(1) AS hourCount,
          COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
        FROM houred
          JOIN json_each(houred.type) AS types
        GROUP BY types.VALUE,
          [time]
      ) b
    GROUP BY b.type
  `);

await db.run(SQL`
  INSERT INTO totalsTyped
    SELECT [type],
      'yearSum' AS histType,
      json_group_object([time], totalTime) AS hist
    FROM (
        SELECT types.value AS [type],
          CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [time],
          SUM(duration) AS totalTime
        FROM houred
          JOIN json_each(houred.type) AS types
        GROUP BY types.VALUE,
          [time]
      ) b
    GROUP BY b.type
  `);

console.log('Finished table: totalsTyped');

// NOTE: for all of the following totalsTime entries
// the format string used for `strftime()` is found: https://www.sqlite.org/lang_datefunc.html
// my comments show the resulting format according to date-fns: https://date-fns.org/v3.6.0/docs/format
// NOTE: all of the values are actually counts of hours EXCEPT for year which is summed duration

console.log('Creating table: totalsTime');

// fills totalsTime - hour - HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hour' AS timeType,
    strftime('%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourYear - YYYY_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourYear' AS timeType,
    strftime('%Y_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourMonth - MM_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourMonth' AS timeType,
    strftime('%m_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourMonthYear - YYYY-MM_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourMonthYear' AS timeType,
    strftime('%Y-%m_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourDayWeek - 0-6_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourDayWeek' AS timeType,
    strftime('%w_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourDayWeekYear - YYYY_0-6_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourDayWeekYear' AS timeType,
    strftime('%Y_%w_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourDayWeekMonth - MM_0-6_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourDayWeekMonth' AS timeType,
    strftime('%m_%w_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - hourDayWeekMonthYear - YYYY-MM_0-6_HH
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'hourDayWeekMonthYear' AS timeType,
    strftime('%Y-%m_%w_%H', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - day - YYYY-MM-DD
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'day' AS timeType,
    strftime('%F', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeek - 0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeek' AS timeType,
    strftime('%w', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeekYear - YYYY_0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeekYear' AS timeType,
    strftime('%Y_%w', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeekMonth - MM_0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeekMonth' AS timeType,
    strftime('%m_%w', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeekMonthYear - YYYY-MM_0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeekMonthYear' AS timeType,
    strftime('%Y-%m_%w', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - week - ISO8601WeekOfYear(01-53)_YYYY
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'week' AS timeType,
    strftime('%W_%Y', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - weekMonth - MM_0-4
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'weekMonth' AS timeType,
    concat(strftime('%m', startdate, 'localtime'), '_', strftime('%d', startdate, 'localtime') / 7) AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - month - MM
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'month' AS timeType,
    strftime('%m', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - monthYear - YYYY-MM
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'monthYear' AS timeType,
    strftime('%Y-%m', startdate, 'localtime') AS timeValue,
    COUNT(1) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - year - YYYY
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'year' AS timeType,
    strftime('%Y', start, 'localtime') AS timeValue,
    SUM(duration) AS totalTime
  FROM [raw]
  GROUP BY timeValue;
`);

console.log('Finished table: houred');

await db.close();
