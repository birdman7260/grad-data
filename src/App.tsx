import './App.css';
import { useGetJSONFile } from './hooks/useGetJSONFile';
import MaxYear from './charts/MaxYear';
import Histogram from './charts/Histogram';
import {
  addDays,
  addHours,
  addMonths,
  addSeconds,
  format as formatDate,
  formatDuration,
  interval,
  intervalToDuration,
  startOfDay,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import Sunburst from './charts/Sunburst';
import { makeHistogramData } from './helpers/data';
import { days, hours, months, years } from '../common/enums';

type Datum = {
  name: string;
  value?: number;
  children?: Datum[];
};

function App() {
  const data = useGetJSONFile<JSONData>('data.json');

  if (data === null) {
    return <div>Waiting...</div>;
  }

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

  return (
    <div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Day of week</h1>
              <p className='py-6'>
                This displays the number of hours for each day by type. Each day
                will only show the type that was the most (all if tied)
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={dayCountGrouped}
          histoKeys={days}
          xFormatter={(val) =>
            formatDate(addDays(startOfWeek(Date.now()), parseInt(val)), 'iiii')
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of day</h1>
              <p className='py-6'>
                This shows how many times each type was done for each hour of
                the day. The type done the most is shown (all if tied).
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={hourCountGrouped}
          histoKeys={hours}
          xFormatter={(val) =>
            formatDate(addHours(startOfDay(Date.now()), parseInt(val)), 'haaa')
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Day of week</h1>
              <h2 className='font-bold'>For April of 2024</h2>
            </div>
          </div>
        </div>
        <Histogram
          data={dayMonthYearCountGrouped}
          histoKeys={days}
          xFormatter={(val) =>
            formatDate(addDays(startOfWeek(Date.now()), parseInt(val)), 'iiii')
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of month</h1>
              <p className='py-6'>
                This displays the number of hours for each month by type. Each
                month will only show the type that was the most (all if tied)
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={monthCountGrouped}
          histoKeys={months}
          xFormatter={(val) =>
            formatDate(
              addMonths(startOfYear(Date.now()), parseInt(val) - 1),
              'MMM',
            )
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of month</h1>
              <h2 className='font-bold'>For year of 2024</h2>
            </div>
          </div>
        </div>
        <Histogram
          data={monthYearCountGrouped}
          histoKeys={months}
          xFormatter={(val) =>
            formatDate(
              addMonths(startOfYear(Date.now()), parseInt(val) - 1),
              'MMM',
            )
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of year</h1>
              <p className='py-6'>
                This displays the number of hours for each year by type. Each
                year will only show the type that was the most (all if tied)
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={yearCountGrouped}
          histoKeys={years}
          xFormatter={(val) => formatDate(`${val}-02-01`, 'yyyy')}
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Total time of year</h1>
              <p className='py-6'>
                This displays the accumulated time for each type for each year.
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={yearSumGrouped}
          histoKeys={years}
          xFormatter={(val) => formatDate(`${val}-02-01`, 'yyyy')}
          YFormatter={(val) => {
            const temp = formatDuration(
              intervalToDuration(
                interval(Date.now(), addSeconds(Date.now(), val)),
              ),
              { format: ['days', 'hours'] },
            );
            if (!temp) return undefined;
            return temp;
          }}
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Day of week</h1>
              <p className='py-6'>
                This displays the number of hours for each day by type. Each day
                will only show the type that was the most (all if tied)
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={dayCount}
          histoKeys={days}
          xFormatter={(val) =>
            formatDate(addDays(startOfWeek(Date.now()), parseInt(val)), 'iiii')
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of day</h1>
              <p className='py-6'>
                This shows how many times each type was done for each hour of
                the day. The type done the most is shown (all if tied).
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={hourCount}
          histoKeys={hours}
          xFormatter={(val) =>
            formatDate(addHours(startOfDay(Date.now()), parseInt(val)), 'haaa')
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Day of week</h1>
              <h2 className='font-bold'>For April of 2022</h2>
            </div>
          </div>
        </div>
        <Histogram
          data={dayMonthYearCount}
          histoKeys={days}
          xFormatter={(val) =>
            formatDate(addDays(startOfWeek(Date.now()), parseInt(val)), 'iiii')
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of month</h1>
              <p className='py-6'>
                This displays the number of hours for each month by type. Each
                month will only show the type that was the most (all if tied)
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={monthCount}
          histoKeys={months}
          xFormatter={(val) =>
            formatDate(
              addMonths(startOfYear(Date.now()), parseInt(val) - 1),
              'MMM',
            )
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of month</h1>
              <h2 className='font-bold'>For year of 2022</h2>
            </div>
          </div>
        </div>
        <Histogram
          data={monthYearCount}
          histoKeys={months}
          xFormatter={(val) =>
            formatDate(
              addMonths(startOfYear(Date.now()), parseInt(val) - 1),
              'MMM',
            )
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Hour of year</h1>
              <p className='py-6'>
                This displays the number of hours for each year by type. Each
                year will only show the type that was the most (all if tied)
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={yearCount}
          histoKeys={years}
          xFormatter={(val) => formatDate(`${val}-02-01`, 'yyyy')}
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Total time of year</h1>
              <p className='py-6'>
                This displays the accumulated time for each type for each year.
              </p>
            </div>
          </div>
        </div>
        <Histogram
          data={yearSum}
          histoKeys={years}
          xFormatter={(val) => formatDate(`${val}-02-01`, 'yyyy')}
          YFormatter={(val) =>
            formatDuration(
              intervalToDuration(
                interval(Date.now(), addSeconds(Date.now(), val)),
              ),
              { format: ['days', 'hours'] },
            )
          }
        />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Heatmap for a year</h1>
              <h2 className='font-bold'>For year of 2022</h2>
              <p className='py-6'>
                This displays the number of hours tracked for each day across
                all of your data
              </p>
            </div>
          </div>
        </div>
        <MaxYear year={maxYear} dayData={data.byTime.all.date} />
      </div>
      <div>
        <div className='hero bg-base-200'>
          <div className='hero-content text-center'>
            <div className='max-w-md'>
              <h1 className='text-5xl font-bold'>Sunburst of all data</h1>
              <p className='py-6'>
                This displays all of your entries which are catalogued by Toggl
                first by <code>project</code> and secondly by{' '}
                <code>description</code>. Tapping the first &quot;layer&quot;
                which are the projects will zoom into the selected project.
                Tapping the center circle will zoom out.
              </p>
            </div>
          </div>
        </div>
        <Sunburst data={datum} />
      </div>
    </div>
  );
}

export default App;
