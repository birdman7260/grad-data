import Chart from 'react-apexcharts';

import { getNiceMaxY } from '../helpers/apexHelpers';

export type HistogramData = {
  name: string;
  hist: Histogram<string, number>;
};

type HistogramProps = {
  data: HistogramData[];
  histoKeys: string[];
  showData: boolean;
  xFormatter?: (val: string) => string;
  YFormatter?: (val: number) => string | undefined;
};

function Histogram({
  data,
  histoKeys: keys,
  showData,
  xFormatter = (val) => val,
  YFormatter = (val) => (val === 0 ? undefined : `${val}`),
}: HistogramProps) {
  if (data.length === 0 || data[0] === undefined) {
    return (
      <div role='alert' className='alert alert-error'>
        <span>the data length is 0</span>
      </div>
    );
  }
  const firstData = data[0];

  const stagedSeries = keys.reduce<
    Record<string, Record<string, ChartDataTypeFull | undefined> | undefined>
  >((pv, key) => {
    const max = data.reduce<HistogramData[]>(
      (max, c) => {
        const a = max[0]!.hist[key];
        const b = c.hist[key];

        if (a === undefined || b === undefined) {
          throw new Error(`every histogram element must be filled`);
        }

        if (a > b) return max;
        if (b > a) return [c];
        return [max, c].flat();
      },
      [firstData],
    );
    max.forEach((v) => {
      if (pv[v.name] === undefined) pv[v.name] = {};
      // @ts-expect-error The above ensures that the index will not be undefined
      pv[v.name][key] = {
        x: key,
        y: v.hist[key],
      };
    });

    return pv;
  }, {});

  let maxY = 0;

  const series = Object.entries(stagedSeries).reduce<
    ApexAxisChartSeries<ChartDataType>
  >((pv, [name, c]) => {
    const data = [];

    // make sure that the item at least has some data, filter out if not
    if (
      Object.values(c ?? {}).every(
        (v) => v === undefined || !Number.isInteger(v.y) || v.y === 0,
      )
    ) {
      return pv;
    }

    for (const key of keys) {
      const tempY: unknown = c?.[key]?.y ?? 0;
      // keep track of the max Y value so the chart can have the grid
      // even when showData === false
      if (typeof tempY === 'number') {
        if (tempY > maxY) maxY = tempY;
      }

      if (!showData) {
        data.push({
          x: key,
          y: 0,
        });
      } else {
        data.push(
          c?.[key] ?? {
            x: key,
            y: 0,
          },
        );
      }
    }

    pv.push({
      name,
      data,
    });
    return pv;
  }, []);

  return (
    <Chart
      type='bar'
      series={series}
      options={{
        chart: {
          toolbar: {
            show: false,
          },
        },
        dataLabels: {
          enabled: false,
        },
        plotOptions: {
          bar: {
            columnWidth: '99%',
            hideZeroBarsWhenGrouped: true,
          },
        },
        xaxis: {
          type: 'category',
          labels: {
            formatter: xFormatter,
          },
        },
        yaxis: {
          labels: {
            formatter: YFormatter,
          },
          max: getNiceMaxY(maxY),
        },
        tooltip: {
          theme: 'dark',
          shared: true,
          followCursor: true,
          fillSeriesColor: true,
          intersect: false,
          hideEmptySeries: true,
        },
      }}
    />
  );
}

export default Histogram;
