import { ComponentProps, ReactNode, useRef } from 'react';
import {
  addSeconds,
  formatDuration,
  interval,
  intervalToDuration,
} from 'date-fns';

import Histogram from './charts/Histogram';
import Heatmap from './charts/Heatmap';
import Sunburst from './charts/Sunburst';
import Page from './Page';

import { days, hours, months, years } from '../common/enums';
import { makeHistogramData } from './helpers/data';
import {
  dayOfWeekFormat,
  hourFormat,
  monthFormat,
  yearFormat,
} from './helpers/formatters';

type Datum = {
  name: string;
  value?: number;
  children?: Datum[];
};

type PageHistogramData = {
  chartType: 'histogram';
} & Omit<ComponentProps<typeof Histogram>, 'showData'>;

type PageHeatmapData = {
  chartType: 'heatmap';
} & Omit<ComponentProps<typeof Heatmap>, 'showData'>;

type PageSunburstData = {
  chartType: 'sunburst';
} & ComponentProps<typeof Sunburst>;

type PageData = ComponentProps<typeof Page> &
  (PageHeatmapData | PageHistogramData | PageSunburstData);

type PagesProps = {
  data: JSONData;
  inView: number;
};

function Pages({ data, inView }: PagesProps) {
  const maxSeen = useRef(inView);
  if (inView > maxSeen.current) maxSeen.current = inView;

  if (data.byTime.top.year === undefined) {
    return (
      <div role='alert' className='alert alert-error'>
        Missing top year
      </div>
    );
  }

  if (data.byTime.all.date === undefined) {
    return (
      <div role='alert' className='alert alert-error'>
        Missing day data
      </div>
    );
  }

  const maxYearData = data.byTime.top.year[0];

  if (maxYearData === undefined) {
    return (
      <div role='alert' className='alert alert-error'>
        Missing max year data for top year
      </div>
    );
  }

  const maxYear = parseInt(maxYearData.originalTime);

  const hourCount = makeHistogramData('hourCount', data.byType.all);

  const dayCount = makeHistogramData('dayCount', data.byType.all);
  // const hourMonthCount = makeHistogramData('hourMonthCount', data.byType.all);
  // const hourYearCount = makeHistogramData('hourYearCount', data.byType.all);
  // const hourMonthYearCount = makeHistogramData('hourMonthYearCount', data.byType.all);
  // const dayYearCount = makeHistogramData('dayYearCount', data.byType.all);
  // const dayMonthCount = makeHistogramData('dayMonthCount', data.byType.all);
  const dayMonthYearCount = makeHistogramData(
    'dayMonthYearCount',
    data.byType.all,
    {
      year: '2022',
      month: '04',
    },
  );
  const monthCount = makeHistogramData('monthCount', data.byType.all);
  const monthYearCount = makeHistogramData('monthYearCount', data.byType.all, {
    year: '2022',
  });
  const yearCount = makeHistogramData('yearCount', data.byType.all);
  const yearSum = makeHistogramData('yearSum', data.byType.all);

  const hourCountGrouped = makeHistogramData('hourCount', data.byGroup.all);

  const dayCountGrouped = makeHistogramData('dayCount', data.byGroup.all);
  // const hourMonthCount = makeHistogramData('hourMonthCount', data.byType.all);
  // const hourYearCount = makeHistogramData('hourYearCount', data.byType.all);
  // const hourMonthYearCount = makeHistogramData('hourMonthYearCount', data.byType.all);
  // const dayYearCount = makeHistogramData('dayYearCount', data.byType.all);
  // const dayMonthCount = makeHistogramData('dayMonthCount', data.byType.all);
  const dayMonthYearCountGrouped = makeHistogramData(
    'dayMonthYearCount',
    data.byGroup.all,
    {
      year: '2024',
      month: '04',
    },
  );
  const monthCountGrouped = makeHistogramData('monthCount', data.byGroup.all);
  const monthYearCountGrouped = makeHistogramData(
    'monthYearCount',
    data.byGroup.all,
    {
      year: '2024',
    },
  );
  const yearCountGrouped = makeHistogramData('yearCount', data.byGroup.all);
  const yearSumGrouped = makeHistogramData('yearSum', data.byGroup.all);

  const datum: Datum = {
    name: 'All',
    children: [],
  };

  const temp = new Map<string, Datum[]>();
  for (const [groupKey, val] of Object.entries(data.byGroup.totals)) {
    const [project, description] = groupKey.split('|');

    if (project === undefined || description === undefined)
      throw new Error(`The group key is malformed: ${groupKey}`);

    if (!temp.has(project)) temp.set(project, []);
    const arr = temp.get(project);
    arr?.push({ name: description, value: val });
  }
  for (const [project, children] of temp.entries()) {
    datum.children?.push({ name: project, children });
  }

  const pages: PageData[] = [
    {
      title: 'Hour of day',
      description:
        'This shows how many times each type was done for each hour of the day. The type done the most is shown (all if tied).',
      chartType: 'histogram',
      data: hourCountGrouped,
      histoKeys: hours,
      xFormatter: hourFormat,
    },
    {
      title: 'Heatmap for a year',
      subTitle: `For the most tracked year of ${maxYear}`,
      description:
        'This displays the number of hours tracked for each day across all of your data',
      chartType: 'heatmap',
      dayData: data.byTime.all.date,
      year: maxYear,
    },
    {
      title: 'Day of week',
      description:
        'This displays the number of hours for each day by type. Each day will only show the type that was the most (all if tied)',
      chartType: 'histogram',
      data: dayCountGrouped,
      histoKeys: days,
      xFormatter: dayOfWeekFormat,
    },
    {
      title: 'Day of week',
      subTitle: 'For April of 2024',
      chartType: 'histogram',
      data: dayMonthYearCountGrouped,
      histoKeys: days,
      xFormatter: dayOfWeekFormat,
    },
    {
      title: 'Hour of month',
      description:
        'This displays the number of hours for each month by type. Each month will only show the type that was the most (all if tied)',
      chartType: 'histogram',
      data: monthCountGrouped,
      histoKeys: months,
      xFormatter: monthFormat,
    },
    {
      title: 'Hour of month',
      subTitle: 'For year of 2024',
      chartType: 'histogram',
      data: monthYearCountGrouped,
      histoKeys: months,
      xFormatter: monthFormat,
    },
    {
      title: 'Hour of year',
      description:
        'This displays the number of hours for each year by type. Each year will only show the type that was the most (all if tied)',
      chartType: 'histogram',
      data: yearCountGrouped,
      histoKeys: years,
      xFormatter: yearFormat,
    },
    {
      title: 'Total time of year',
      description:
        'This displays the accumulated time for each type for each year.',
      chartType: 'histogram',
      data: yearSumGrouped,
      histoKeys: years,
      xFormatter: yearFormat,
      YFormatter: (val) => {
        const temp = formatDuration(
          intervalToDuration(interval(Date.now(), addSeconds(Date.now(), val))),
          { format: ['days', 'hours'] },
        );
        if (!temp) return undefined;
        return temp;
      },
    },
    {
      title: 'Day of week',
      description:
        'This displays the number of hours for each day by type. Each day will only show the type that was the most (all if tied)',
      chartType: 'histogram',
      data: dayCount,
      histoKeys: days,
      xFormatter: dayOfWeekFormat,
    },
    {
      title: 'Hour of day',
      description:
        'This shows how many times each type was done for each hour of the day. The type done the most is shown (all if tied).',
      chartType: 'histogram',
      data: hourCount,
      histoKeys: hours,
      xFormatter: hourFormat,
    },
    {
      title: 'Day of week',
      subTitle: 'For April of 2022',
      chartType: 'histogram',
      data: dayMonthYearCount,
      histoKeys: days,
      xFormatter: dayOfWeekFormat,
    },
    {
      title: 'Hour of month',
      description:
        'This displays the number of hours for each month by type. Each month will only show the type that was the most (all if tied)',
      chartType: 'histogram',
      data: monthCount,
      histoKeys: months,
      xFormatter: monthFormat,
    },
    {
      title: 'Hour of month',
      subTitle: 'For year of 2022',
      chartType: 'histogram',
      data: monthYearCount,
      histoKeys: months,
      xFormatter: monthFormat,
    },
    {
      title: 'Hour of year',
      description:
        'This displays the number of hours for each year by type. Each year will only show the type that was the most (all if tied)',
      chartType: 'histogram',
      data: yearCount,
      histoKeys: years,
      xFormatter: yearFormat,
    },
    {
      title: 'Total time of year',
      description:
        'This displays the accumulated time for each type for each year.',
      chartType: 'histogram',
      data: yearSum,
      histoKeys: years,
      xFormatter: yearFormat,
      YFormatter: (val) => {
        const temp = formatDuration(
          intervalToDuration(interval(Date.now(), addSeconds(Date.now(), val))),
          { format: ['days', 'hours'] },
        );
        if (!temp) return undefined;
        return temp;
      },
    },
    {
      title: 'Sunburst of all data',
      description: (
        <>
          This displays all of your entries which are catalogued by Toggl first
          by <code>project</code> and secondly by <code>description</code>.
          Tapping the first &quot;layer&quot; which are the projects will zoom
          into the selected project. Tapping the center circle will zoom out.
        </>
      ),
      chartType: 'sunburst',
      data: datum,
    },
  ];
  return pages.map((p, i) => {
    let child: ReactNode = undefined;
    if (i <= maxSeen.current + 1) {
      // the page should be rendered

      const showData = i <= maxSeen.current;

      switch (p.chartType) {
        case 'heatmap':
          child = <Heatmap {...p} showData={showData} />;
          break;
        case 'histogram':
          child = <Histogram {...p} showData={showData} />;
          break;
        case 'sunburst':
          child = <Sunburst {...p} />;
          break;
      }
    }
    return (
      <Page
        key={i}
        title={p.title}
        subTitle={p.subTitle}
        description={p.description}
      >
        {child}
      </Page>
    );
  });
}

export default Pages;
