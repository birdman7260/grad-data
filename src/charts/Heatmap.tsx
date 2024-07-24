import './Heatmap.css';

import { useMemo, useRef, useState } from 'react';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';
import {
  getDay,
  differenceInSeconds,
  format as formatDate,
  formatDuration,
  addDays,
  type Day,
  subDays,
  startOfWeek,
  endOfWeek,
  isAfter,
} from 'date-fns';

import {
  isEventsFunctionChart,
  isTooltipYTitleFormatterOpts,
} from '../helpers/apexHelpers';

type HeatmapProps = {
  year: number;
  dayData: FinalTimeValue[];
  showData: boolean;
};

const createSeries = (
  data: FinalTimeValue[],
  start: number,
  end: number,
  showData: boolean,
): [ApexAxisChartSeries<ChartDataType>, number] => {
  const heatmapDataSet: Record<
    Day,
    ApexAxisChartSeries<ChartDataType>[number]
  > = {
    0: {
      name: '',
      data: [],
    },
    1: {
      name: 'Mon',
      data: [],
    },
    2: {
      name: '',
      data: [],
    },
    3: {
      name: 'Wed',
      data: [],
    },
    4: {
      name: '',
      data: [],
    },
    5: {
      name: 'Fri',
      data: [],
    },
    6: {
      name: '',
      data: [],
    },
  };

  const sortedDaysData = data
    .slice()
    .sort((a, b) => differenceInSeconds(a.originalTime, b.originalTime));

  // keep track of the largest day in the set of data points
  let heatmapDataBiggestDayValue = 0;
  let i = startOfWeek(start);
  const endDate = endOfWeek(end);
  while (!isAfter(i, endDate)) {
    const dayOfWeek = getDay(i) as Day;
    const day = formatDate(i, 'yyyy-MM-dd');
    const val = sortedDaysData.find((v) => v.originalTime === day);
    const tempVal = val?.totalTime ?? 0;

    if (tempVal > heatmapDataBiggestDayValue) {
      heatmapDataBiggestDayValue = tempVal;
    }

    heatmapDataSet[dayOfWeek].data.push({
      x: i,
      y: showData ? tempVal : 0,
    });

    i = addDays(i, 1);
  }

  return [Object.values(heatmapDataSet).reverse(), heatmapDataBiggestDayValue];
};

function Heatmap({ year, dayData: data, showData }: HeatmapProps) {
  const [initialStart, initialEnd] = useMemo(
    () => [
      new Date(year, 0, 1).valueOf(),
      subDays(new Date(year + 1, 0, 1), 1).valueOf(),
    ],
    [year],
  );
  const heatmapDataBiggestDayValue = useRef<number | null>(null);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const heatmapData = useMemo(() => {
    const [series, biggest] = createSeries(data, start, end, showData);
    if (heatmapDataBiggestDayValue.current === null) {
      heatmapDataBiggestDayValue.current = biggest;
    }
    return series;
  }, [data, start, end, showData]);

  if (heatmapDataBiggestDayValue.current === null) {
    return <div>waiting...</div>;
  }

  return (
    <div>
      <Chart
        type='heatmap'
        height={350}
        series={heatmapData}
        options={{
          chart: {
            toolbar: {
              show: true,
              tools: {
                download: false,
                pan: false,
                zoomin: false,
                zoomout: false,
              },
            },
            events: {
              updated: (chart) => {
                if (isEventsFunctionChart(chart)) {
                  if (chart.w.globals.zoomed) {
                    if (!Number.isInteger(chart.w.globals.minX)) {
                      setStart(chart.w.globals.minX);
                      setEnd(chart.w.globals.maxX);
                    }
                  } else {
                    setStart(initialStart);
                    setEnd(initialEnd);
                  }
                }
              },
            },
          },
          dataLabels: {
            enabled: false,
          },
          // stroke is enabling the "grid" around each cell
          stroke: {
            show: true,
            width: 3,
            colors: ['rgb(22, 27, 34)'], //TODO: make this be the same as the background
          },
          grid: {
            show: false,
          },
          plotOptions: {
            heatmap: {
              radius: 3,
              enableShades: false,
              colorScale: {
                max: heatmapDataBiggestDayValue.current,
                ranges: [
                  {
                    from: 0,
                    to: 0,
                    color: 'rgb(22, 27, 34)',
                    name: 'Less',
                  },
                  {
                    from: 1,
                    to: Math.ceil(heatmapDataBiggestDayValue.current * 0.25),
                    color: 'rgb(14, 68, 41)',
                    name: '',
                  },
                  {
                    from:
                      Math.ceil(heatmapDataBiggestDayValue.current * 0.25) + 1,
                    to: Math.ceil(heatmapDataBiggestDayValue.current * 0.5),
                    color: 'rgb(0, 109, 50)',
                    name: '',
                  },
                  {
                    from:
                      Math.ceil(heatmapDataBiggestDayValue.current * 0.5) + 1,
                    to: Math.ceil(heatmapDataBiggestDayValue.current * 0.75),
                    color: 'rgb(38, 166, 65)',
                    name: '',
                  },
                  {
                    from:
                      Math.ceil(heatmapDataBiggestDayValue.current * 0.75) + 1,
                    to: heatmapDataBiggestDayValue.current,
                    color: 'rgb(57, 211, 83)',
                    name: 'More',
                  },
                ],
              },
            },
          },
          legend: {
            show: true,
            position: 'bottom',
            horizontalAlign: 'right',
            // there is custom CSS in ./MaxYear.css to force the "Less" option to order differently
            formatter: (legendName, { seriesIndex }) => {
              if (seriesIndex === 0 || seriesIndex === 4) return legendName;
              return '';
            },
            markers: {
              radius: 2,
            },
            itemMargin: {
              horizontal: 0,
            },
          },
          yaxis: {
            labels: {
              align: 'left',
              // TODO see if this is still needed when the page is finalized shape-wise
              offsetX: 10,
              formatter(val, opt) {
                if (typeof val === 'number') {
                  // for some reason the chart library throws a 1 to the formatter
                  // the first time
                  return '1';
                }
                if (typeof opt === 'number') {
                  if ([1, 3, 5].includes(opt)) {
                    return formatDate(
                      addDays(startOfWeek(Date.now()), Math.abs(opt - 6)),
                      'iii',
                    );
                  } else return '';
                }

                return val;
              },
            },
          },
          xaxis: {
            tooltip: {
              enabled: false,
            },
            type: 'datetime',
            axisBorder: {
              show: false,
            },
            axisTicks: {
              show: false,
            },
          },
          tooltip: {
            y: {
              formatter: (value) =>
                formatDuration({ hours: value }, { format: ['hours'] }) ||
                'N/A',
              title: {
                formatter(seriesName, opt?) {
                  if (isTooltipYTitleFormatterOpts(opt)) {
                    const date = opt.w.globals.initialSeries[opt.seriesIndex]
                      ?.data[opt.dataPointIndex]?.x as Date | undefined;
                    if (date === undefined) {
                      return `Missing date: ${seriesName}`;
                    }
                    return formatDate(date, 'iiii');
                  }
                  return seriesName;
                },
              },
            },
            x: {
              show: true,
              formatter(val) {
                return formatDate(val, 'yyyy-MM-dd');
              },
            },
          },
          // TODO: do i want to handle phone size? this is a busy chart otherwise
          responsive: [
            {
              breakpoint: 900,
              options: {
                chart: {
                  toolbar: {
                    show: false,
                  },
                },
              } satisfies ApexOptions,
            },
          ],
        }}
      />
    </div>
  );
}

export default Heatmap;
