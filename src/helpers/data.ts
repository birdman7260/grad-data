import {
  days,
  hours,
  months,
  possibleTagType,
  years,
} from '../../common/enums';
import { type HistogramData } from '../charts/Histogram';
import { isFinalByGroup, isFinalByProject, isFinalByType } from './guards';

type CountTypes = 'count' | 'hourCount';
type HistogramOptions = {
  year?: `${number}`;
  month?: `${number}`;
  countType?: CountTypes;
  convert?: (val: number) => number;
};

export const makeHistogramData = (
  timeSlice: SliceType,
  data: FinalByType | FinalByGroup | FinalByProject,
  opts?: HistogramOptions,
) => {
  let keys: `${number}`[] = [];
  const indexing: `${number}`[] = [];
  switch (timeSlice) {
    case 'hourCount':
      keys = hours;
      break;

    case 'hourYearCount':
      keys = hours;

      if (opts?.year === undefined) {
        throw new Error(`need to pass in a year option`);
      }
      indexing.push(opts.year);
      break;

    case 'hourMonthCount':
      keys = hours;

      if (opts?.month === undefined) {
        throw new Error(`need to pass in a month option`);
      }
      indexing.push(opts.month);
      break;

    case 'hourMonthYearCount':
      keys = hours;

      if (opts?.year === undefined) {
        throw new Error(`need to pass in a year option`);
      }
      indexing.push(opts.year);

      if (opts?.month === undefined) {
        throw new Error(`need to pass in a month option`);
      }
      indexing.push(opts.month);
      break;

    case 'dayCount':
      keys = days;

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'dayYearCount':
      keys = days;

      if (opts?.year === undefined) {
        throw new Error(`need to pass in a year option`);
      }
      indexing.push(opts.year);

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'dayMonthCount':
      keys = days;

      if (opts?.month === undefined) {
        throw new Error(`need to pass in a month option`);
      }
      indexing.push(opts.month);

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'dayMonthYearCount':
      keys = days;

      if (opts?.year === undefined) {
        throw new Error(`need to pass in a year option`);
      }
      indexing.push(opts.year);

      if (opts?.month === undefined) {
        throw new Error(`need to pass in a month option`);
      }
      indexing.push(opts.month);

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'monthCount':
      keys = months;

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'monthYearCount':
      keys = months;

      if (opts?.year === undefined) {
        throw new Error(`need to pass in a year option`);
      }
      indexing.push(opts.year);

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'yearCount':
      keys = years;

      if (opts?.countType === undefined) {
        opts = { countType: 'hourCount' };
      }
      break;

    case 'yearSum':
      keys = years;
      break;

    default:
      throw new Error(`incorrect/unhandled time slice: ${timeSlice}`);
  }

  if (isFinalByType(data))
    return doTypes(keys, data, timeSlice, opts ?? {}, indexing);
  if (isFinalByGroup(data))
    return doGrouped(keys, data, timeSlice, opts ?? {}, indexing);
  if (isFinalByProject(data))
    return doProject(keys, data, timeSlice, opts ?? {}, indexing);

  throw new Error('unhandled data type');
};

const doTypes = (
  keys: `${number}`[],
  data: FinalByType,
  timeSlice: SliceType,
  opts: HistogramOptions,
  indexing: `${number}`[],
) => {
  const retData: HistogramData[] = [];

  for (const type of possibleTagType) {
    if (data[type] === undefined) continue;

    const newEntry: HistogramData = {
      name: type as string,
      hist: {},
    };

    let d = data[type]![timeSlice] as unknown as
      | Histogram<`${number}`, HistogramValue>
      | undefined;
    for (const idx of indexing) {
      d = d?.[idx] as unknown as Histogram<`${number}`, HistogramValue>;
    }

    for (const key of keys) {
      const temp = d?.[key];
      let val = 0;
      if (temp === undefined) {
        val = 0;
      } else if (typeof temp === 'number') {
        val = temp as number;
      } else if (typeof temp === 'object' && 'count' in temp) {
        val = temp[opts.countType ?? 'hourCount'];
      } else {
        throw new Error(
          `unexpected data for the histogram: ${JSON.stringify(temp)}`,
        );
      }

      newEntry.hist[key] = opts?.convert ? opts.convert(val) : val;
    }

    if (Object.values(newEntry.hist).every((v) => v === 0)) continue;

    retData.push(newEntry);
  }

  return retData;
};

const doGrouped = (
  keys: `${number}`[],
  data: FinalByGroup,
  timeSlice: SliceType,
  opts: HistogramOptions,
  indexing: `${number}`[],
) => {
  const retData: HistogramData[] = [];

  for (const data2 of Object.values(data)) {
    for (const record of Object.values(data2)) {
      const newEntry: HistogramData = {
        name: `${record.project} - ${record.description}`,
        hist: {},
      };

      let d = record[timeSlice] as unknown as
        | Histogram<`${number}`, HistogramValue>
        | undefined;
      for (const idx of indexing) {
        d = d?.[idx] as unknown as Histogram<`${number}`, HistogramValue>;
      }

      for (const key of keys) {
        const temp = d?.[key];
        let val = 0;
        if (temp === undefined) {
          val = 0;
        } else if (typeof temp === 'number') {
          val = temp as number;
        } else if (typeof temp === 'object' && 'count' in temp) {
          val = temp[opts.countType ?? 'hourCount'];
        } else {
          throw new Error(
            `unexpected data for the histogram: ${JSON.stringify(temp)}`,
          );
        }

        newEntry.hist[key] = opts?.convert ? opts.convert(val) : val;
      }

      if (Object.values(newEntry.hist).every((v) => v === 0)) continue;

      retData.push(newEntry);
    }
  }

  return retData;
};

const doProject = (
  keys: `${number}`[],
  data: FinalByProject,
  timeSlice: SliceType,
  opts: HistogramOptions,
  indexing: `${number}`[],
) => {
  const retData: HistogramData[] = [];

  for (const record of Object.values(data)) {
    const newEntry: HistogramData = {
      name: record.project,
      hist: {},
    };

    let d = record[timeSlice] as unknown as
      | Histogram<`${number}`, HistogramValue>
      | undefined;
    for (const idx of indexing) {
      d = d?.[idx] as unknown as Histogram<`${number}`, HistogramValue>;
    }

    for (const key of keys) {
      const temp = d?.[key];
      let val = 0;
      if (temp === undefined) {
        val = 0;
      } else if (typeof temp === 'number') {
        val = temp as number;
      } else if (typeof temp === 'object' && 'count' in temp) {
        val = temp[opts.countType ?? 'hourCount'];
      } else {
        throw new Error(
          `unexpected data for the histogram: ${JSON.stringify(temp)}`,
        );
      }

      newEntry.hist[key] = opts?.convert ? opts.convert(val) : val;
    }

    if (Object.values(newEntry.hist).every((v) => v === 0)) continue;

    retData.push(newEntry);
  }

  return retData;
};
