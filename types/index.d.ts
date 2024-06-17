// I put these here so that the types are globally available within the project
// specifically so that both the app and the scripts are dealing with the exact same types
declare global {
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
