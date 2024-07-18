import * as fs from 'fs';
import { once } from 'events';
import fastCSV from 'fast-csv';
import { differenceInSeconds, formatISO, parse as parseDate } from 'date-fns';
import { open, type ISqlite } from 'sqlite';
import sqlite3 from 'sqlite3';
import { SQL } from './sqlTemplateString';

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

await db.exec(SQL`DROP TABLE IF EXISTS [raw];`);

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

        if (project === '' && description === 'Exercise') project = 'Exercise';

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

await db.close();
