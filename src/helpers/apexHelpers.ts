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

// Converted from apexcharts/src/modules/Scales.js: niceScale()
export const getNiceMaxY = (maxY: number) => {
  // The tick value is 10 because:
  //  I'm not supporting forceNiceScale
  //  I'm not supporting user setting tickAmount
  let stepSize = maxY / 10;

  const mag = Math.floor(Math.log10(stepSize));
  const magPow = Math.pow(10, mag);
  let magMsd = Math.ceil(stepSize / magPow);

  // This array comes from apexcharts/src/modules/settings/Globals.js: globalVars()
  //  The code seems to try to have two separate arrays depending on if there are
  //  any floats, but both arrays are the same so i'm not dealing with that
  magMsd = [1, 1, 2, 5, 5, 5, 10, 10, 10, 10, 10][magMsd] ?? 1;

  stepSize = magMsd * magPow;

  return stepSize * Math.ceil(maxY / stepSize);
};
