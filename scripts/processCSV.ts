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
await db.exec(SQL`DROP TABLE IF EXISTS totalsGrouped;`);
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
  [type] TEXT,
  billable INTEGER NOT NULL,
  [start] TEXT NOT NULL,
  [end] TEXT NOT NULL,
  duration INTEGER NOT NULL
);`);

/**
 * Table "raw" contains all data entries from the CSV
 *
 * type - JSON array of tag strings - TagType[] - @see TagType
 * billable - 0 | 1
 * start - ISO8601
 * end - ISO8601
 * duration - seconds
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS houred (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  [type] TEXT,
  [start] TEXT NOT NULL,
  [end] TEXT NOT NULL,
  duration INTEGER NOT NULL,
  startdate TEXT NOT NULL
);`);

/**
 * Table "totalsGrouped" aggregates the durations by project+description and additionally
 * calculates a breakdown of the duration by hour of the day, day of the week, and year
 *
 * type - JSON array of tag strings - TagType[] - @see TagType
 * totalTime - seconds
 * histogramHour - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
 * histogramDay - JSON object - { '0': 23134, '1': 4523456, ... } - only includes days with data
 *  days start with Monday and represented by 0-6
 * histogramHour - JSON object - { '2022': 23134, '2023': 4523456, ... } - only includes years with data
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsGrouped (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  [type] TEXT,
  totalTime INTEGER NOT NULL,
  histogramHourCount TEXT NOT NULL,
  histogramDayCount TEXT NOT NULL,
  histogramMonthCount TEXT NOT NULL,
  histogramMonthYearCount TEXT NOT NULL,
  histogramYear TEXT NOT NULL,
  PRIMARY KEY (project, [description])
);`);

/**
 * Table "totalsTyped" aggregates the durations by tag type and additionally
 * calculates a breakdown of the duration by hour of the day, day of the week, and year
 *
 * type - @see TagType
 * totalTime - seconds
 * histogramHour - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
 * histogramDay - JSON object - { '0': 23134, '1': 4523456, ... } - only includes days with data
 *  days start with Monday and represented by 0-6
 * histogramHour - JSON object - { '2022': 23134, '2023': 4523456, ... } - only includes years with data
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTyped (
  [type] TEXT,
  totalTime INTEGER NOT NULL,
  histogramHourCount TEXT NOT NULL,
  histogramHourYearCount TEXT NOT NULL,
  histogramHourMonthCount TEXT NOT NULL,
  histogramHourMonthYearCount TEXT NOT NULL,
  histogramDayCount TEXT NOT NULL,
  histogramDayYearCount TEXT NOT NULL,
  histogramDayMonthCount TEXT NOT NULL,
  histogramDayMonthYearCount TEXT NOT NULL,
  histogramMonthYearCount TEXT NOT NULL,
  histogramMonthCount TEXT NOT NULL,
  histogramYear TEXT NOT NULL,
  PRIMARY KEY ([type])
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

console.log('Creating table: totalsGrouped');

// fill totalsGrouped
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
),
cleanedType AS (
  SELECT project,
    [description],
    json_group_array([value]) AS types
  FROM DISTINCTTypes
  GROUP BY project,
    [description]
),
by_hour_count AS (
  SELECT project,
    [description],
    CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS hour,
    COUNT(1) AS hourCount
  FROM houred
  GROUP BY project,
    [description],
    hour
),
by_hour_count_g AS (
  SELECT project,
    [description],
    json_group_object(hour, hourCount) AS histogramHourCount
  FROM by_hour_count
  GROUP BY project,
    [description]
),
by_day_count AS (
  SELECT project,
    [description],
    CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [day],
    COUNT(1) AS dayHourCount,
    COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS dayCount
  FROM houred
  GROUP BY project,
    [description],
    [day]
),
by_day_count_g AS (
  SELECT project,
    [description],
    json_group_object(
      [day],
      json_object('count', dayCount, 'hourCount', dayHourCount)
    ) AS histogramDayCount
  FROM by_day_count
  GROUP BY project,
    [description]
),
by_month_year_count AS (
  SELECT project,
    [description],
    strftime('%Y-%m', startdate, 'localtime') AS [month],
    COUNT(1) AS monthHourCount,
    COUNT(
      DISTINCT strftime('%Y-%m', startdate, 'localtime')
    ) AS monthCount
  FROM houred
  GROUP BY project,
    [description],
    [month]
),
by_month_year_count_g AS (
  SELECT project,
    [description],
    json_group_object(
      [month],
      json_object('count', monthCount, 'hourCount', monthHourCount)
    ) AS histogramMonthYearCount
  FROM by_month_year_count
  GROUP BY project,
    [description]
),
by_month_count AS (
  SELECT project,
    [description],
    strftime('%m', startdate, 'localtime') AS [month],
    COUNT(1) AS monthHourCount,
    COUNT(DISTINCT strftime('%m', startdate, 'localtime')) AS monthCount
  FROM houred
  GROUP BY project,
    [description],
    [month]
),
by_month_count_g AS (
  SELECT project,
    [description],
    json_group_object(
      [month],
      json_object('count', monthCount, 'hourCount', monthHourCount)
    ) AS histogramMonthCount
  FROM by_month_count
  GROUP BY project,
    [description]
),
by_year AS (
  SELECT project,
    [description],
    CAST(strftime('%Y', [start], 'localtime') AS TEXT) AS [year],
    SUM(duration) AS yearTotal
  FROM [raw]
  GROUP BY project,
    [description],
    [year]
),
by_year_g AS (
  SELECT project,
    [description],
    json_group_object([year], yearTotal) AS histogramYear
  FROM by_year
  GROUP BY project,
    [description],
    [year]
)
INSERT INTO totalsGrouped
  SELECT r.project,
    r.description,
    ct.types,
    SUM(r.duration) AS totaltime,
    bh.histogramHourCount,
    bd.histogramDayCount,
    bmy.histogramMonthYearCount,
    bm.histogramMonthCount,
    [by].histogramYear
  FROM [raw] r
    INNER JOIN cleanedType ct ON r.project = ct.project
    AND r.description = ct.description
    INNER JOIN by_hour_count_g bh ON r.project = bh.project
    AND r.description = bh.description
    INNER JOIN by_day_count_g bd ON r.project = bd.project
    AND r.description = bd.description
    INNER JOIN by_month_year_count_g bmy ON r.project = bmy.project
    AND r.description = bmy.description
    INNER JOIN by_month_count_g bm ON r.project = bm.project
    AND r.description = bm.description
    INNER JOIN by_year_g [by] ON r.project = [by].project
    AND r.description = [by].[description]
  GROUP BY r.project,
    r.description
  ORDER BY r.project,
    r.description;
`);

console.log('Finished table: totalsGrouped');

console.log('Creating table: totalsTyped (takes a looong time)');

// fills totalsTyped
await db.run(SQL`
WITH by_hour_count AS (
  SELECT [type],
    json_group_object(hour, hourCount) AS hist
  FROM (
      SELECT types.value AS [type],
        CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS hour,
        COUNT(1) AS hourCount
      FROM houred
        JOIN json_each(houred.type) AS types
      GROUP BY types.VALUE,
        hour
    ) b
  GROUP BY b.type
),
by_hour_year_count AS (
  SELECT [type],
  json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object(hour, hourCount) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS hour,
            CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
            COUNT(1) AS hourCount
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [year],
            hour
        ) b
      GROUP BY b.type,
        b.year
    ) c
  GROUP BY c.type
),
by_hour_month_count AS (
  SELECT [type],
    json_group_object([month], json(hist)) AS hist
  FROM (
      SELECT [type],
        [month],
        json_group_object(hour, hourCount) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS hour,
            CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
            COUNT(1) AS hourCount
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [month],
            hour
        ) b
      GROUP BY b.type,
        b.month
    ) c
  GROUP BY c.type
),
by_hour_month_year_count AS (
  SELECT [type],
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object([month], json(hist)) AS hist
      FROM (
          SELECT [type],
            [year],
            [month],
            json_group_object(hour, hourCount) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('%H', startdate, 'localtime') AS TEXT) AS hour,
                CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
                CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
                COUNT(1) AS hourCount
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [year],
                [month],
                hour
            ) b
          GROUP BY b.type,
            b.year,
            b.month
        ) c
      GROUP BY c.type,
        c.year
    ) d
  GROUP BY d.type
),
by_day_count AS (
  SELECT [type],
    json_group_object(
      [day],
      json_object('count', dayCount, 'hourCount', dayHourCount)
    ) AS hist
  FROM (
      SELECT types.value AS [type],
        CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [day],
        COUNT(1) AS dayHourCount,
        COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS dayCount
      FROM houred
        JOIN json_each(houred.type) AS types
      GROUP BY types.VALUE,
        [day]
    ) b
  GROUP BY b.type
),
by_day_year_count AS (
  SELECT [type],
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object([day], dayHourCount) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [day],
            CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
            COUNT(1) AS dayHourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS dayCount
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [year],
            [day]
        ) b
      GROUP BY b.type,
        b.year
    ) c
  GROUP BY c.type
),
by_day_month_count AS (
  SELECT [type],
    json_group_object([month], json(hist)) AS hist
  FROM (
      SELECT [type],
        [month],
        json_group_object([day], dayHourCount) AS hist
      FROM (
          SELECT types.value AS [type],
            CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [day],
            CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
            COUNT(1) AS dayHourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS dayCount
          FROM houred
            JOIN json_each(houred.type) AS types
          GROUP BY types.VALUE,
            [month],
            [day]
        ) b
      GROUP BY b.type,
        b.month
    ) c
  GROUP BY c.type
),
by_day_month_year_count AS (
  SELECT [type],
    json_group_object([year], json(hist)) AS hist
  FROM (
      SELECT [type],
        [year],
        json_group_object([month], json(hist)) AS hist
      FROM (
          SELECT [type],
            [year],
            [month],
            json_group_object([day], dayHourCount) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('%w', startdate, 'localtime') AS TEXT) AS [day],
                CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
                CAST(strftime('%Y', startdate, 'localtime') AS TEXT) AS [year],
                COUNT(1) AS dayHourCount,
                COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS dayCount
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [year],
                [month],
                [day]
            ) b
          GROUP BY b.type,
            b.year,
            b.month
        ) c
      GROUP BY c.type,
        c.year
    ) d
  GROUP BY d.type
),
by_month_year_count AS (
  SELECT [type],
    json_group_object(
      [month],
      json_object('count', monthCount, 'hourCount', monthHourCount)
    ) AS hist
  FROM (
      SELECT types.value AS [type],
        CAST(
          strftime('%Y-%m', startdate, 'localtime') AS TEXT
        ) AS [month],
        COUNT(1) AS monthHourCount,
        COUNT(DISTINCT [start]) AS monthCount
      FROM houred
        JOIN json_each(houred.type) AS types
      GROUP BY types.VALUE,
        [month]
    ) b
  GROUP BY b.type
),
by_month_count AS (
  SELECT [type],
    json_group_object(
      [month],
      json_object('count', monthCount, 'hourCount', monthHourCount)
    ) AS hist
  FROM (
      SELECT types.value AS [type],
        CAST(strftime('%m', startdate, 'localtime') AS TEXT) AS [month],
        COUNT(1) AS monthHourCount,
        COUNT(DISTINCT [start]) AS monthCount
      FROM houred
        JOIN json_each(houred.type) AS types
      GROUP BY types.VALUE,
        [month]
    ) b
  GROUP BY b.type
),
by_year AS (
  SELECT type,
    json_group_object([year], yearTotal) AS hist
  FROM (
      SELECT types.value AS type,
        CAST(strftime('%Y', start, 'localtime') AS TEXT) AS [year],
        SUM(duration) AS yearTotal
      FROM [raw]
        JOIN json_each([raw].type) AS types
      GROUP BY types.VALUE,
        [year]
    ) b
  GROUP BY b.type
)
INSERT INTO totalsTyped
  SELECT types.value AS type,
    SUM(r.duration) AS totalTime,
    hc.hist as histogramHourCount,
    hyc.hist as histogramHourYearCount,
    hmc.hist as histogramHourMonthCount,
    hmyc.hist as histogramHourMonthYearCount,
    d.hist as histogramDayCount,
    dy.hist as histogramDayYearCount,
    dm.hist as histogramDayMonthCount,
    dmy.hist as histogramDayMontYearCount,
    m.hist as histogramMonthCount,
    my.hist as histogramMonthYearCount,
    b.hist as histogramYear
  FROM [raw] r
    JOIN json_each(r.type) AS types
    JOIN by_hour_count hc ON types.value = hc.type
    JOIN by_hour_year_count hyc ON types.value = hyc.type
    JOIN by_hour_month_count hmc ON types.value = hmc.type
    JOIN by_hour_month_year_count hmyc ON types.value = hmyc.type
    JOIN by_day_count d ON types.value = d.type
    JOIN by_day_year_count dy ON types.value = dy.type
    JOIN by_day_month_count dm ON types.value = dm.type
    JOIN by_day_year_count dmy ON types.value = dmy.type
    JOIN by_month_count m ON types.value = m.type
    JOIN by_month_year_count my ON types.value = my.type
    JOIN by_year b ON types.value = b.type
  GROUP BY types.value;
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

// fills totalsTime - hourYear - HH_YYYY
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

// fills totalsTime - hourDayWeekMonthYear - %Y-MM_0-6_HH
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
    COUNT(duration) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeekYear - YYYY_0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeekYear' AS timeType,
    strftime('%Y_%w', startdate, 'localtime') AS timeValue,
    COUNT(duration) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeekMonth - MM_0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeekMonth' AS timeType,
    strftime('%m_%w', startdate, 'localtime') AS timeValue,
    COUNT(duration) AS totalTime
  FROM houred
  GROUP BY timeValue;
`);

// fills totalsTime - dayWeekMonthYear - YYYY-MM_0-6
await db.run(SQL`
INSERT INTO totalsTime
  SELECT 'dayWeekMonthYear' AS timeType,
    strftime('%Y-%m_%w', startdate, 'localtime') AS timeValue,
    COUNT(duration) AS totalTime
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
