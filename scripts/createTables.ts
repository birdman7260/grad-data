import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { possibleSliceType, possibleTimeType } from '../common/enums';
import { SQL } from './sqlTemplateString';

type RootTimeType = 'hour' | 'day' | 'month' | 'year';

type Level = 'year' | 'month' | 'day';

const timeToFormat = (rt: RootTimeType | Level) => {
  switch (rt) {
    case 'year':
      return '%Y';
    case 'month':
      return '%m';
    case 'day':
      return '%w';
    case 'hour':
      return '%H';
  }
};

type TotalDataType = 'count' | 'complexCount' | 'sum';

const db = await open({
  filename: 'sqlite/grad-data.db',
  driver: sqlite3.verbose().Database,
});

await db.exec(SQL`DROP TABLE IF EXISTS houred;`);
await db.exec(SQL`DROP TABLE IF EXISTS cleanedTypeGrouped;`);
await db.exec(SQL`DROP TABLE IF EXISTS cleanedTypeProject;`);
await db.exec(SQL`DROP TABLE IF EXISTS totals;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsGrouped;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsProject;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsTyped;`);
await db.exec(SQL`DROP TABLE IF EXISTS totalsTime;`);

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
 * Table "cleanedTypeGrouped" contains records for each project+description
 * and a JSON array of their types, to be used by other queries
 *
 * types - JSON array of types
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS cleanedTypeGrouped (
  project TEXT NOT NULL,
  [description] TEXT NOT NULL,
  types TEXT NOT NULL,
  PRIMARY KEY (project, [description])
);`);

/**
 * Table "cleanedTypeProject" contains records for each project+description
 * and a JSON array of their types, to be used by other queries
 *
 * types - JSON array of types
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS cleanedTypeProject (
  project TEXT NOT NULL,
  types TEXT NOT NULL,
  PRIMARY KEY (project)
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

console.log('Creating table: cleanedTypeGrouped');

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
INSERT INTO cleanedTypeGrouped
  SELECT project,
    [description],
    json_group_array([value]) AS types
  FROM DISTINCTTypes
  GROUP BY project,
    [description]
`);

console.log('Finished table: cleanedTypeGrouped');

console.log('Creating table: cleanedTypeProject');

await db.run(SQL`
WITH DISTINCTTypes AS (
  SELECT DISTINCT project,
    [value]
  FROM [raw],
    json_each([raw].[type])
  GROUP BY project,
    [value]
)
INSERT INTO cleanedTypeProject
  SELECT project,
    json_group_array([value]) AS types
  FROM DISTINCTTypes
  GROUP BY project
`);

console.log('Finished table: cleanedTypeProject');

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

const totalingLevel0 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  dataType: TotalDataType,
  grouped = false,
) => {
  const table = grouped ? 'totalsGrouped' : 'totalsProject';
  const typeTable = grouped ? 'Grouped' : 'Project';

  console.log(`${table}: ${timeSlice} - starting`);

  switch (dataType) {
    case 'count':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
            COUNT(1) AS hourCount
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            [time]
        )
        INSERT INTO ${table}
          SELECT b.project,
            ${grouped ? 'b.description,' : ''}
            ct.types AS [type],
            '${timeSlice}' AS histType,
            json_group_object([time], hourCount) AS hist
          FROM counted b
            INNER JOIN cleanedType${typeTable} ct ON b.project = ct.project
            ${grouped ? 'AND b.description = ct.description' : ''}
          GROUP BY b.project${grouped ? ', b.description' : ''}
        `);

    case 'complexCount':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS [time],
            COUNT(1) AS hourCount,
            COUNT(
              DISTINCT strftime('%F', startdate, 'localtime')
            ) AS [count]
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            [time]
        )
        INSERT INTO ${table}
          SELECT b.project,
            ${grouped ? 'b.description,' : ''}
            ct.types AS [type],
            '${timeSlice}' AS histType,
            json_group_object(
              [time],
              json_object('count', [count], 'hourCount', hourCount)
            ) AS hist
          FROM counted b
            INNER JOIN cleanedType${typeTable} ct ON b.project = ct.project
            ${grouped ? 'AND b.description = ct.description' : ''}
          GROUP BY b.project${grouped ? ', b.description' : ''}
        `);

    case 'sum':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS [time],
            SUM(duration) AS totalTime
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            [time]
        )
        INSERT INTO ${table}
          SELECT b.project,
            ${grouped ? 'b.description,' : ''}
            ct.types AS [type],
            '${timeSlice}' AS histType,
            json_group_object([time], totalTime) AS hist
          FROM counted b
            INNER JOIN cleanedType${typeTable} ct ON b.project = ct.project
            ${grouped ? 'AND b.description = ct.description' : ''}
          GROUP BY b.project${grouped ? ', b.description' : ''}
        `);
  }
};

const totalingLevel1 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  dataType: Exclude<TotalDataType, 'sum'>,
  level1: Level,
  grouped = false,
) => {
  const table = grouped ? 'totalsGrouped' : 'totalsProject';
  const typeTable = grouped ? 'Grouped' : 'Project';

  console.log(`${table}: ${timeSlice} - starting`);

  switch (dataType) {
    case 'count':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
            COUNT(1) AS hourCount
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            level1,
            [time]
        )
        INSERT INTO ${table}
          SELECT c.project,
              ${grouped ? 'c.description,' : ''}
              ct.types AS [type],
              '${timeSlice}' AS histType,
              json_group_object(level1, json(c.hist)) AS hist
          FROM (
              SELECT b.project,
                ${grouped ? 'b.description,' : ''}
                level1,
                json_group_object([time], hourCount) AS hist
              FROM counted b
              GROUP BY b.project,
                ${grouped ? 'b.description,' : ''}
                level1
            ) c
            INNER JOIN cleanedType${typeTable} ct ON c.project = ct.project
            ${grouped ? 'AND c.description = ct.description' : ''}
          GROUP BY c.project${grouped ? ', c.description' : ''}
        `);

    case 'complexCount':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
            COUNT(1) AS hourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            level1,
            [time]
        )
        INSERT INTO ${table}
          SELECT c.project,
              ${grouped ? 'c.description,' : ''}
              ct.types AS [type],
              '${timeSlice}' AS histType,
              json_group_object(level1, json(c.hist)) AS hist
          FROM (
              SELECT b.project,
                ${grouped ? 'b.description,' : ''}
                level1,
                json_group_object(
                  [time],
                  json_object('count', [count], 'hourCount', hourCount)
                ) AS hist
              FROM counted b
              GROUP BY b.project,
                ${grouped ? 'b.description,' : ''}
                level1
            ) c
            INNER JOIN cleanedType${typeTable} ct ON c.project = ct.project
            ${grouped ? 'AND c.description = ct.description' : ''}
          GROUP BY c.project${grouped ? ', c.description' : ''}
        `);
  }
};

const totalingLevel2 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  dataType: Exclude<TotalDataType, 'sum'>,
  level1: Level,
  level2: Level,
  grouped = false,
) => {
  const table = grouped ? 'totalsGrouped' : 'totalsProject';
  const typeTable = grouped ? 'Grouped' : 'Project';

  console.log(`${table}: ${timeSlice} - starting`);

  switch (dataType) {
    case 'count':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
            CAST(strftime('${timeToFormat(level2)}', startdate, 'localtime') AS TEXT) AS level2,
            COUNT(1) AS hourCount
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            level2,
            level1,
            [time]
        )
        INSERT INTO ${table}
          SELECT d.project,
              ${grouped ? 'd.description,' : ''}
              ct.types AS [type],
              '${timeSlice}' AS histType,
              json_group_object(level2, json(d.hist)) AS hist
          FROM (
              SELECT c.project,
                ${grouped ? 'c.description,' : ''}
                level2,
                json_group_object(level1, json(c.hist)) AS hist
              FROM (
                SELECT b.project,
                  ${grouped ? 'b.description,' : ''}
                  level1,
                  level2,
                  json_group_object([time], hourCount) AS hist
                FROM counted b
                GROUP BY b.project,
                  ${grouped ? 'b.description,' : ''}
                  level2,
                  level1
              ) c
              GROUP BY c.project,
                ${grouped ? 'c.description,' : ''}
                level2
            ) d
            INNER JOIN cleanedType${typeTable} ct ON d.project = ct.project
            ${grouped ? 'AND d.description = ct.description' : ''}
          GROUP BY d.project${grouped ? ', d.description' : ''}
        `);

    case 'complexCount':
      return db.run(SQL`
        WITH counted AS (
          SELECT project,
            ${grouped ? '[description],' : ''}
            CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
            CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
            CAST(strftime('${timeToFormat(level2)}', startdate, 'localtime') AS TEXT) AS level2,
            COUNT(1) AS hourCount,
            COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
          FROM houred
          GROUP BY project,
            ${grouped ? '[description],' : ''}
            level2,
            level1,
            [time]
        )
        INSERT INTO ${table}
          SELECT d.project,
              ${grouped ? 'd.description,' : ''}
              ct.types AS [type],
              '${timeSlice}' AS histType,
              json_group_object(level2, json(d.hist)) AS hist
          FROM (
              SELECT c.project,
                ${grouped ? 'c.description,' : ''}
                level2,
                json_group_object(level1, json(c.hist)) AS hist
              FROM (
                SELECT b.project,
                  ${grouped ? 'b.description,' : ''}
                  level1,
                  level2,
                  json_group_object(
                    [time],
                    json_object('count', [count], 'hourCount', hourCount)
                  ) AS hist
                FROM counted b
                GROUP BY b.project,
                  ${grouped ? 'b.description,' : ''}
                  level2,
                  level1
              ) c
              GROUP BY c.project,
                ${grouped ? 'c.description,' : ''}
                level2
            ) d
            INNER JOIN cleanedType${typeTable} ct ON d.project = ct.project
            ${grouped ? 'AND d.description = ct.description' : ''}
          GROUP BY d.project${grouped ? ', d.description' : ''}
        `);
  }
};

const totalingLevel3 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  level1: Level,
  level2: Level,
  level3: Level,
  grouped = false,
) =>
  db.run(SQL`
    WITH counted AS (
      SELECT project,
        ${grouped ? '[description],' : ''}
        CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
        CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
        CAST(strftime('${timeToFormat(level2)}', startdate, 'localtime') AS TEXT) AS level2,
        CAST(strftime('${timeToFormat(level3)}', startdate, 'localtime') AS TEXT) AS level3,
        COUNT(1) AS hourCount
      FROM houred
      GROUP BY project,
        ${grouped ? '[description],' : ''}
        level3,
        level2,
        level1,
        [time]
    )
    INSERT INTO ${grouped ? 'totalsGrouped' : 'totalsProject'}
      SELECT d.project,
        ${grouped ? 'd.description,' : ''}
        ct.types AS [type],
        '${timeSlice}' AS histType,
        json_group_object(level3, json(d.hist)) AS hist
      FROM (
          SELECT c.project,
            ${grouped ? 'c.description,' : ''}
            level3,
            json_group_object(level2, json(c.hist)) AS hist
          FROM (
              SELECT b.project,
                ${grouped ? 'b.description,' : ''}
                level2,
                level3,
                json_group_object(level1, json(b.hist)) AS hist
              FROM (
                  SELECT a.project,
                    ${grouped ? 'a.description,' : ''}
                    level1,
                    level2,
                    level3,
                    json_group_object([time], hourCount) AS hist
                  FROM counted a
                  GROUP BY a.project,
                    ${grouped ? 'a.description,' : ''}
                    level3,
                    level2,
                    level1
                ) b
              GROUP BY b.project,
                ${grouped ? 'b.description,' : ''}
                level3,
                level2
            ) c
          GROUP BY c.project,
            ${grouped ? 'c.description,' : ''}
            level3
        ) d
        INNER JOIN cleanedType${grouped ? 'Grouped' : 'Project'} ct ON d.project = ct.project
        ${grouped ? 'AND d.description = ct.description' : ''}
      GROUP BY d.project${grouped ? ', d.description' : ''}
    `);

console.log('Creating table: totalsGrouped');
console.log('Creating table: totalsProject');

for (const timeSlice of possibleSliceType) {
  switch (timeSlice) {
    case 'hourCount':
      await totalingLevel0(timeSlice, 'hour', 'count');
      await totalingLevel0(timeSlice, 'hour', 'count', true);
      break;
    case 'hourDayCount':
      await totalingLevel1(timeSlice, 'hour', 'count', 'day');
      await totalingLevel1(timeSlice, 'hour', 'count', 'day', true);
      break;
    case 'hourMonthCount':
      await totalingLevel1(timeSlice, 'hour', 'count', 'month');
      await totalingLevel1(timeSlice, 'hour', 'count', 'month', true);
      break;
    case 'hourYearCount':
      await totalingLevel1(timeSlice, 'hour', 'count', 'year');
      await totalingLevel1(timeSlice, 'hour', 'count', 'year', true);
      break;
    case 'hourDayMonthCount':
      await totalingLevel2(timeSlice, 'hour', 'count', 'day', 'month');
      await totalingLevel2(timeSlice, 'hour', 'count', 'day', 'month', true);
      break;
    case 'hourDayYearCount':
      await totalingLevel2(timeSlice, 'hour', 'count', 'day', 'year');
      await totalingLevel2(timeSlice, 'hour', 'count', 'day', 'year', true);
      break;
    case 'hourMonthYearCount':
      await totalingLevel2(timeSlice, 'hour', 'count', 'month', 'year');
      await totalingLevel2(timeSlice, 'hour', 'count', 'month', 'year', true);
      break;
    case 'hourDayMonthYearCount':
      await totalingLevel3(timeSlice, 'hour', 'day', 'month', 'year');
      await totalingLevel3(timeSlice, 'hour', 'day', 'month', 'year', true);
      break;
    case 'dayCount':
      await totalingLevel0(timeSlice, 'day', 'complexCount');
      await totalingLevel0(timeSlice, 'day', 'complexCount', true);
      break;
    case 'dayYearCount':
      await totalingLevel1(timeSlice, 'day', 'complexCount', 'year');
      await totalingLevel1(timeSlice, 'day', 'complexCount', 'year', true);
      break;
    case 'dayMonthCount':
      await totalingLevel1(timeSlice, 'day', 'complexCount', 'month');
      await totalingLevel1(timeSlice, 'day', 'complexCount', 'month', true);
      break;
    case 'dayMonthYearCount':
      await totalingLevel2(timeSlice, 'day', 'complexCount', 'month', 'year');
      await totalingLevel2(
        timeSlice,
        'day',
        'complexCount',
        'month',
        'year',
        true,
      );
      break;
    case 'monthCount':
      await totalingLevel0(timeSlice, 'month', 'complexCount');
      await totalingLevel0(timeSlice, 'month', 'complexCount', true);
      break;
    case 'monthYearCount':
      await totalingLevel1(timeSlice, 'month', 'complexCount', 'year');
      await totalingLevel1(timeSlice, 'month', 'complexCount', 'year', true);
      break;
    case 'yearCount':
      await totalingLevel0(timeSlice, 'year', 'complexCount');
      await totalingLevel0(timeSlice, 'year', 'complexCount', true);
      break;
    case 'yearSum':
      await totalingLevel0(timeSlice, 'year', 'sum');
      await totalingLevel0(timeSlice, 'year', 'sum', true);
  }
}

console.log('Finished table: totalsGrouped');
console.log('Finished table: totalsProject');

// fills totalsTyped

const typedTotalingLevel0 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  dataType: TotalDataType,
) => {
  switch (dataType) {
    case 'count':
      return db.run(SQL`
        INSERT INTO totalsTyped
          SELECT [type],
            '${timeSlice}' AS histType,
            json_group_object([time], hourCount) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                COUNT(1) AS hourCount
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [time]
            ) b
          GROUP BY b.type
        `);

    case 'complexCount':
      return db.run(SQL`
        INSERT INTO totalsTyped
          SELECT [type],
            '${timeSlice}' AS histType,
            json_group_object(
              [time], 
              json_object('count', [count], 'hourCount', [hourCount])
            ) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                COUNT(1) AS hourCount,
                COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [time]
            ) b
          GROUP BY b.type
        `);

    case 'sum':
      return db.run(SQL`
        INSERT INTO totalsTyped
          SELECT [type],
            '${timeSlice}' AS histType,
            json_group_object([time], totalTime) AS hist
          FROM (
              SELECT types.value AS [type],
                CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                SUM(duration) AS totalTime
              FROM houred
                JOIN json_each(houred.type) AS types
              GROUP BY types.VALUE,
                [time]
            ) b
          GROUP BY b.type
        `);
  }
};

const typedTotalingLevel1 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  dataType: Exclude<TotalDataType, 'sum'>,
  level1: Level,
) => {
  switch (dataType) {
    case 'count':
      return db.run(SQL`
      INSERT INTO totalsTyped
        SELECT [type],
          '${timeSlice}' AS histType,
          json_group_object(level1, json(hist)) AS hist
        FROM (
            SELECT [type],
              level1,
              json_group_object([time], hourCount) AS hist
            FROM (
                SELECT types.value AS [type],
                  CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                  CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
                  COUNT(1) AS hourCount
                FROM houred
                  JOIN json_each(houred.type) AS types
                GROUP BY types.VALUE,
                  level1,
                  [time]
              ) c
            GROUP BY c.type,
              c.level1
          ) b
        GROUP BY b.type
      `);

    case 'complexCount':
      return db.run(SQL`
          INSERT INTO totalsTyped
            SELECT [type],
              '${timeSlice}' AS histType,
              json_group_object(level1, json(hist)) AS hist
            FROM (
                SELECT [type],
                  level1,
                  json_group_object(
                    [time], 
                    json_object('count', [count], 'hourCount', [hourCount])
                  ) AS hist
                FROM (
                    SELECT types.value AS [type],
                      CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                      CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
                      COUNT(1) AS hourCount,
                      COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
                    FROM houred
                      JOIN json_each(houred.type) AS types
                    GROUP BY types.VALUE,
                      level1,
                      [time]
                  ) c
                GROUP BY c.type,
                  c.level1
              ) b
            GROUP BY b.type
          `);
  }
};

const typedTotalingLevel2 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  dataType: Exclude<TotalDataType, 'sum'>,
  level1: Level,
  level2: Level,
) => {
  switch (dataType) {
    case 'count':
      return db.run(SQL`
        INSERT INTO totalsTyped
          SELECT [type],
            '${timeSlice}' AS histType,
            json_group_object(level2, json(hist)) AS hist
          FROM (
              SELECT [type],
                level2,
                json_group_object(level1, json(hist)) AS hist
              FROM (
                  SELECT [type],
                    level1,
                    level2,
                    json_group_object([time], hourCount) AS hist
                  FROM (
                      SELECT types.value AS [type],
                        CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                        CAST(strftime('${timeToFormat(level2)}', startdate, 'localtime') AS TEXT) AS level2,
                        CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
                        COUNT(1) AS hourCount
                      FROM houred
                        JOIN json_each(houred.type) AS types
                      GROUP BY types.VALUE,
                        level2,
                        level1,
                        [time]
                    ) d
                  GROUP BY d.type,
                    d.level2,
                    d.level1
                ) c
              GROUP BY c.type,
                c.level2
            ) b
          GROUP BY b.type
        `);

    case 'complexCount':
      return db.run(SQL`
        INSERT INTO totalsTyped
          SELECT [type],
            '${timeSlice}' AS histType,
            json_group_object(level2, json(hist)) AS hist
          FROM (
              SELECT [type],
                level2,
                json_group_object(level1, json(hist)) AS hist
              FROM (
                  SELECT [type],
                    level1,
                    level2,
                    json_group_object(
                      [time], 
                      json_object('count', [count], 'hourCount', [hourCount])
                    ) AS hist
                  FROM (
                      SELECT types.value AS [type],
                        CAST(strftime('${timeToFormat(timeType)}', startdate, 'localtime') AS TEXT) AS [time],
                        CAST(strftime('${timeToFormat(level2)}', startdate, 'localtime') AS TEXT) AS level2,
                        CAST(strftime('${timeToFormat(level1)}', startdate, 'localtime') AS TEXT) AS level1,
                        COUNT(1) AS hourCount,
                        COUNT(DISTINCT strftime('%F', startdate, 'localtime')) AS [count]
                      FROM houred
                        JOIN json_each(houred.type) AS types
                      GROUP BY types.VALUE,
                        level2,
                        level1,
                        [time]
                    ) d
                  GROUP BY d.type,
                    d.level2,
                    d.level1
                ) c
              GROUP BY c.type,
                c.level2
            ) b
          GROUP BY b.type
        `);
  }
};

const typedTotalingLevel3 = (
  timeSlice: SliceType,
  timeType: RootTimeType,
  level1: Level,
  level2: Level,
  level3: Level,
) =>
  db.run(SQL`
  INSERT INTO totalsTyped
  SELECT [type],
    '${timeSlice}' AS histType,
    json_group_object(level3, json(hist)) AS hist
  FROM (
      SELECT [type],
        level3,
        json_group_object(level2, json(hist)) AS hist
      FROM (
          SELECT [type],
            level2,
            level3,
            json_group_object(level1, json(hist)) AS hist
          FROM (
              SELECT [type],
                level1,
                level2,
                level3,
                json_group_object([time], hourCount) AS hist
              FROM (
                  SELECT types.value AS [type],
                    CAST(
                      strftime(
                        '${timeToFormat(timeType)}',
                        startdate,
                        'localtime'
                      ) AS TEXT
                    ) AS [time],
                    CAST(
                      strftime(
                        '${timeToFormat(level3)}',
                        startdate,
                        'localtime'
                      ) AS TEXT
                    ) AS level3,
                    CAST(
                      strftime(
                        '${timeToFormat(level2)}',
                        startdate,
                        'localtime'
                      ) AS TEXT
                    ) AS level2,
                    CAST(
                      strftime(
                        '${timeToFormat(level1)}',
                        startdate,
                        'localtime'
                      ) AS TEXT
                    ) AS level1,
                    COUNT(1) AS hourCount
                  FROM houred
                    JOIN json_each(houred.type) AS types
                  GROUP BY types.VALUE,
                    level3,
                    level2,
                    level1,
                    [time]
                ) e
              GROUP BY e.type,
                e.level3,
                e.level2,
                e.level1
            ) d
          GROUP BY d.type,
            d.level3,
            d.level2
        ) c
      GROUP BY c.type,
        c.level3
    ) b
  GROUP BY b.type
  `);

console.log('Creating table: totalsTyped');

for (const slice of possibleSliceType) {
  switch (slice) {
    case 'hourCount':
      await typedTotalingLevel0(slice, 'hour', 'count');
      break;
    case 'hourDayCount':
      await typedTotalingLevel1(slice, 'hour', 'count', 'day');
      break;
    case 'hourMonthCount':
      await typedTotalingLevel1(slice, 'hour', 'count', 'month');
      break;
    case 'hourYearCount':
      await typedTotalingLevel1(slice, 'hour', 'count', 'year');
      break;
    case 'hourDayMonthCount':
      await typedTotalingLevel2(slice, 'hour', 'count', 'day', 'month');
      break;
    case 'hourDayYearCount':
      await typedTotalingLevel2(slice, 'hour', 'count', 'day', 'year');
      break;
    case 'hourMonthYearCount':
      await typedTotalingLevel2(slice, 'hour', 'count', 'month', 'year');
      break;
    case 'hourDayMonthYearCount':
      await typedTotalingLevel3(slice, 'hour', 'day', 'month', 'year');
      break;
    case 'dayCount':
      await typedTotalingLevel0(slice, 'day', 'complexCount');
      break;
    case 'dayYearCount':
      await typedTotalingLevel1(slice, 'day', 'complexCount', 'year');
      break;
    case 'dayMonthCount':
      await typedTotalingLevel1(slice, 'day', 'complexCount', 'month');
      break;
    case 'dayMonthYearCount':
      await typedTotalingLevel2(slice, 'day', 'complexCount', 'month', 'year');
      break;
    case 'monthCount':
      await typedTotalingLevel0(slice, 'month', 'complexCount');
      break;
    case 'monthYearCount':
      await typedTotalingLevel1(slice, 'month', 'complexCount', 'year');
      break;
    case 'yearCount':
      await typedTotalingLevel0(slice, 'year', 'complexCount');
      break;
    case 'yearSum':
      await typedTotalingLevel0(slice, 'year', 'sum');
      break;
  }
}

console.log('Finished table: totalsTyped');

// NOTE: for all of the following totalsTime entries
// the format string used for `strftime()` is found: https://www.sqlite.org/lang_datefunc.html
// my comments show the resulting format according to date-fns: https://date-fns.org/v3.6.0/docs/format
// NOTE: all of the values are actually counts of hours EXCEPT for year which is summed duration

console.log('Creating table: totalsTime');

for (const time of possibleTimeType) {
  let format = '';
  switch (time) {
    case 'hour':
      // fills totalsTime - hour - HH
      format = '%H';
      break;
    case 'hourYear':
      // fills totalsTime - hourYear - YYYY_HH
      format = '%Y_%H';
      break;
    case 'hourMonth':
      // fills totalsTime - hourMonth - MM_HH
      format = '%m_%H';
      break;
    case 'hourMonthYear':
      // fills totalsTime - hourMonthYear - YYYY-MM_HH
      format = '%Y-%m_%H';
      break;
    case 'hourDay':
      // fills totalsTime - hourDay - 0-6_HH
      format = '%w_%H';
      break;
    case 'hourDayYear':
      // fills totalsTime - hourDayYear - YYYY_0-6_HH
      format = '%Y_%w_%H';
      break;
    case 'hourDayMonth':
      // fills totalsTime - hourDayMonth - MM_0-6_HH
      format = '%m_%w_%H';
      break;
    case 'hourDayMonthYear':
      // fills totalsTime - hourDayMonthYear - YYYY-MM_0-6_HH
      format = '%Y-%m_%w_%H';
      break;
    case 'date':
      // fills totalsTime - day - YYYY-MM-DD
      format = '%F';
      break;
    case 'day':
      // fills totalsTime - day - 0-6
      format = '%w';
      break;
    case 'dayYear':
      // fills totalsTime - dayYear - YYYY_0-6
      format = '%Y_%w';
      break;
    case 'dayMonth':
      // fills totalsTime - dayMonth - MM_0-6
      format = '%m_%w';
      break;
    case 'dayMonthYear':
      // fills totalsTime - dayMonthYear - YYYY-MM_0-6
      format = '%Y-%m_%w';
      break;
    case 'month':
      // fills totalsTime - month - MM
      format = '%m';
      break;
    case 'monthYear':
      // fills totalsTime - monthYear - YYYY-MM
      format = '%Y-%m';
      break;
    case 'week':
      // fills totalsTime - week - ISO8601WeekOfYear(01-53)_YYYY
      format = '%W_%Y';
      break;

    case 'weekMonth':
      // fills totalsTime - weekMonth - MM_0-4
      await db.run(SQL`
        INSERT INTO totalsTime
          SELECT 'weekMonth' AS timeType,
            concat(strftime('%m', startdate, 'localtime'), '_', strftime('%d', startdate, 'localtime') / 7) AS timeValue,
            COUNT(1) AS totalTime
          FROM houred
          GROUP BY timeValue;
        `);
      continue;

    case 'year':
      // fills totalsTime - year - YYYY
      await db.run(SQL`
        INSERT INTO totalsTime
          SELECT 'year' AS timeType,
            strftime('%Y', start, 'localtime') AS timeValue,
            SUM(duration) AS totalTime
          FROM [raw]
          GROUP BY timeValue;
        `);
      continue;
  }

  await db.run(SQL`
  INSERT INTO totalsTime
    SELECT '${time}' AS timeType,
      strftime('${format}', startdate, 'localtime') AS timeValue,
      COUNT(1) AS totalTime
    FROM houred
    GROUP BY timeValue;
  `);
}

console.log('Finished table: totalsTime');

await db.close();
