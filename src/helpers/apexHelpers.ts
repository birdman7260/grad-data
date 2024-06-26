import { ApexOptions } from 'apexcharts';

type PartialApexGlobal = {
  initialSeries: ApexAxisChartSeries<ChartDataTypeFull>;
  maxX: number;
  minX: number;
  zoomed: boolean;
};

const isApexGlobal = (opt: unknown): opt is PartialApexGlobal => {
  return (
    !!opt &&
    typeof opt === 'object' &&
    'initialSeries' in opt &&
    !!opt.initialSeries &&
    Array.isArray(opt.initialSeries) &&
    'zoomed' in opt &&
    'maxX' in opt &&
    'minX' in opt
  );
};

export const isTooltipYTitleFormatterOpts = (
  opt: unknown,
): opt is {
  seriesIndex: number;
  dataPointIndex: number;
  w: {
    globals: PartialApexGlobal;
  };
} => {
  return (
    !!opt &&
    typeof opt === 'object' &&
    'seriesIndex' in opt &&
    'dataPointIndex' in opt &&
    'w' in opt &&
    !!opt.w &&
    typeof opt.w === 'object' &&
    'globals' in opt.w &&
    isApexGlobal(opt.w.globals) &&
    !!opt.w.globals.initialSeries[0]
  );
};

const isApexOptions = (opt: unknown): opt is ApexOptions => {
  return !!opt && typeof opt === 'object' && 'xaxis' in opt;
};

export const isEventsFunctionChart = (
  chart: unknown,
): chart is {
  w: {
    config: ApexOptions;
    globals: PartialApexGlobal;
  };
} => {
  return (
    !!chart &&
    typeof chart === 'object' &&
    'w' in chart &&
    !!chart.w &&
    typeof chart.w === 'object' &&
    'config' in chart.w &&
    isApexOptions(chart.w.config) &&
    'globals' in chart.w &&
    isApexGlobal(chart.w.globals)
  );
};
