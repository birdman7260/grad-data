import type {
  possibleSliceType,
  possibleTagType,
  possibleTimeType,
  possibleTotalsType,
} from '../common/enums';

type Extends<T, U extends T> = U;

// I put these here so that the types are globally available within the project
// specifically so that both the app and the scripts are dealing with the exact same types
declare global {
  /**
   * Here are the values for each type. The formatter is: https://date-fns.org/v3.6.0/docs/format
   *
   *      'hour'          timeValue|originalTime: HH - ex: 00, 01, 02, ..., 23
   *                      timeString: h bbb - ex: 3 pm, 12 noon
   *      'hourDayWeek'   timeValue|originalTime: 0-6_HH - ex: 4_15
   *                      timeString: iiiis at h bbb - ex: Fridays at 3 pm
   *      'day'           timeValue|originalTime: YYYY-MM-DD - ex: 2020-01-01
   *                      timeString: PPPP - ex: Friday, April 29th, 2021
   *      'dayWeek'       timeValue|originalTime: w - ex: 0, 1, ..., 6
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

  type SliceType = (typeof possibleSliceType)[number];

  type TotalsType = (typeof possibleTotalsType)[number];

  type Project = string;

  type Description = string;

  type HistogramComplexValue = {
    count: number;
    hourCount: number;
  };

  type HistogramValue = HistogramComplexValue | number;

  type Histogram<K extends string, T extends HistogramValue> = Record<
    K,
    T | undefined
  >;

  type FinalTimeValue =
    | {
        totalTime: number;
        timeString: string;
        originalTime: string;
      }
    | Record<string, never>;

  type FinalBySlice = Partial<
    Extends<
      { [key in SliceType]: string },
      {
        hourCount: Histogram<`${number}`, number | undefined>;
        hourDayCount: Histogram<
          `${number}`,
          Histogram<`${number}`, number | undefined> | undefined
        >;
        hourMonthCount: Histogram<
          `${number}`,
          Histogram<`${number}`, number | undefined> | undefined
        >;
        hourYearCount: Histogram<
          `${number}`,
          Histogram<`${number}`, number | undefined> | undefined
        >;
        hourDayMonthCount: Histogram<
          `${number}`,
          | Histogram<
              `${number}`,
              Histogram<`${number}`, number | undefined> | undefined
            >
          | undefined
        >;
        hourDayYearCount: Histogram<
          `${number}`,
          | Histogram<
              `${number}`,
              Histogram<`${number}`, number | undefined> | undefined
            >
          | undefined
        >;
        hourMonthYearCount: Histogram<
          `${number}`,
          | Histogram<
              `${number}`,
              Histogram<`${number}`, number | undefined> | undefined
            >
          | undefined
        >;
        hourDayMonthYearCount: Histogram<
          `${number}`,
          | Histogram<
              `${number}`,
              | Histogram<
                  `${number}`,
                  Histogram<`${number}`, number | undefined> | undefined
                >
              | undefined
            >
          | undefined
        >;
        dayCount: Histogram<`${number}`, HistogramComplexValue | undefined>;
        dayYearCount: Histogram<
          `${number}`,
          Histogram<`${number}`, HistogramComplexValue | undefined> | undefined
        >;
        dayMonthCount: Histogram<
          `${number}`,
          Histogram<`${number}`, HistogramComplexValue | undefined> | undefined
        >;
        dayMonthYearCount: Histogram<
          `${number}`,
          | Histogram<
              `${number}`,
              | Histogram<`${number}`, HistogramComplexValue | undefined>
              | undefined
            >
          | undefined
        >;
        monthCount: Histogram<`${number}`, HistogramComplexValue | undefined>;
        monthYearCount: Histogram<
          `${number}`,
          Histogram<`${number}`, HistogramComplexValue | undefined> | undefined
        >;
        yearCount: Histogram<`${number}`, HistogramComplexValue | undefined>;
        yearSum: Histogram<`${number}`, number | undefined>;
      }
    >
  >;

  type FinalByTime = {
    [key in TimeType]?: FinalTimeValue[];
  };

  type FinalByType = {
    [key in TagType]?: FinalBySlice;
  };

  type FinalByGroupRecord = FinalBySlice & {
    type: TagType[];
    project: Project;
    description: Description;
  };

  type FinalByProjectRecord = FinalBySlice & {
    type: TagType[];
    project: Project;
  };

  type FinalByGroup = {
    [key in Project]?: {
      [key in Description]?: FinalByGroupRecord;
    };
  };

  type FinalByProject = {
    [key in Project]?: FinalByProjectRecord;
  };

  type TotalsByType = {
    [key in TagType]?: number;
  };

  type JSONData = {
    byTime: {
      top: FinalByTime;
      all: FinalByTime;
    };
    byType: {
      all: FinalByType;
      totals: TotalsByType;
    };
    byGroup: {
      all: FinalByGroup;
      totals: Record<string, number>;
    };
    byProject: {
      all: FinalByProject;
      totals: Record<Project, number>;
    };
  };
}

export {};
