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

  const maxYearData = data.byTime.top.year[0];
  const maxYear = parseInt(maxYearData.originalTime);

  const hourData = makeHistogramData('hourCount', data.byType.all);

  const dayData = makeHistogramData('dayCount', data.byType.all);
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

  const datum: Datum = {
    name: 'All',
    children: [],
  };

  const temp = new Map<string, Datum[]>();
  for (const [groupKey, val] of Object.entries(data.byGroup.totals)) {
    const [project, description] = groupKey.split('|');
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
          data={dayData}
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
          data={hourData}
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
              <h1 className='text-5xl font-bold'>Day of week</h1>
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
        <MaxYear year={maxYear} dayData={data.byTime.all.day} />
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
