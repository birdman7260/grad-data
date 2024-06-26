import { possibleTagType, possibleTimeType } from '../common/enums';

// I put these here so that the types are globally available within the project
// specifically so that both the app and the scripts are dealing with the exact same types
declare global {
  /**
   * Here are the values for each type. The formatter is: https://date-fns.org/v3.6.0/docs/format
   *
   *      'hour'          timeValue|originalTime: HH - ex: 00, 01, 02, ..., 23
   *                      timeString: h bbb - ex: 3 pm, 12 noon
   *      'hourDayWeek'   timeValue|originalTime:
   *                      timeString: iiiis at h bbb - ex: Fridays at 3 pm
   *      'day'           timeValue|originalTime: YYYY-MM-DD - ex: 2020-01-01
   *                      timeString: PPPP - ex: Friday, April 29th, 2021
   *      'dayWeek'       timeValue|originalTime: w - ex: 1, 2, ..., 53
   *                      timeString: iiii - ex: Monday
   *      'month'         timeValue|originalTime: MM - ex: 01, 02, ..., 12
   *                      timeString: LLLL - ex: January
   *      'monthYear'     timeValue|originalTime: YYYY-MM - ex: 2020-01
   *                      timeString: LLLL in YYYY - ex: March in 2021
   *      'week'          timeValue|originalTime: l_YYYY - ex: 3_2021, 50_YYYY
   *                      timeString: wo week of YYYY - ex: 3rd week of 2021
   *      'weekMonth'     timeValue|originalTime: MM_[0-4] - ex: 01_3, 12_1
   *                      timeString: do week of LLLLs ex: 2nd week of Januarys
   *      'year'          timeValue|originalTime: YYYY - ex: 2021
   *                      timeString: YYYY - ex: 2021
   */
  type TimeType = (typeof possibleTimeType)[number];

  type TagType = (typeof possibleTagType)[number];

  type Histogram = Record<string, number>;

  type FinalTimeValue =
    | {
        totalTime: number;
        timeString: string;
        originalTime: string;
      }
    | Record<string, never>;

  type FinalTypeValue =
    | {
        total: number;
        histogramHour: Histogram;
        histogramDay: Histogram;
        histogramYear: Histogram;
      }
    | Record<string, never>;

  type FinalGroupedValue =
    | {
        project: string;
        description: string;
        type: TagType[];
        total: number;
        histogramHour: Histogram;
        histogramDay: Histogram;
        histogramYear: Histogram;
      }
    | Record<string, never>;

  type FinalByTime =
    | {
        [key in TimeType]: FinalTimeValue[];
      }
    | Record<string, never>;

  type FinalByType =
    | {
        [key in TagType]: FinalTypeValue;
      }
    | Record<string, never>;

  type FinalByGroup =
    | Record<string, Record<string, FinalGroupedValue>>
    | Record<string, never>;

  type JSONData = {
    byTime: {
      top: FinalByTime;
      all: FinalByTime;
    };
    byType: {
      all: FinalByType;
    };
    byGroup: {
      all: FinalByGroup;
    };
  };
}

export {};
