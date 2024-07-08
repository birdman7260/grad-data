import Chart from 'react-apexcharts';

export type HistogramData = {
  name: string;
  hist: Histogram<string, number>;
};

type HistogramProps = {
  data: HistogramData[];
  histoKeys: string[];
  xFormatter?: (val: string) => string;
  YFormatter?: (val: number) => string;
};

function Histogram({
  data,
  histoKeys: keys,
  xFormatter = (val) => val,
  YFormatter = (val) => `${val}`,
}: HistogramProps) {
  const stagedSeries = keys.reduce<
    Record<string, Record<string, ChartDataTypeFull | undefined> | undefined>
  >((pv, key) => {
    const max = data.reduce<HistogramData[]>(
      (max, c) => {
        const a = max[0].hist[key];
        const b = c.hist[key];

        if (a === undefined || b === undefined) {
          throw new Error(`every histogram element must be filled`);
        }

        if (a > b) return max;
        if (b > a) return [c];
        return [max, c].flat();
      },
      [data[0]],
    );
    max.forEach((v) => {
      if (pv[v.name] === undefined) pv[v.name] = {};
      pv[v.name]![key] = {
        x: key,
        y: v.hist[key],
      };
    });

    return pv;
  }, {});

  const series = Object.entries(stagedSeries).reduce<
    ApexAxisChartSeries<ChartDataType>
  >((pv, [name, c]) => {
    const data = [];
    for (const key of keys) {
      data.push(
        c?.[key] ?? {
          x: key,
          y: 0,
        },
      );
    }

    pv.push({
      name,
      data,
    });
    return pv;
  }, []);
  return (
    <div>
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
            logarithmic: false,
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
    </div>
  );
}

export default Histogram;
