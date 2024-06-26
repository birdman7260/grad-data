import './App.css';
import { useGetJSONFile } from './hooks/useGetJSONFile';
import MaxYear from './charts/MaxYear';
import Histogram from './charts/Histogram';
import {
  addDays,
  addHours,
  format as formatDate,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import Sunburst from './charts/Sunburst';

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

  const hourData = [];
  const hourKeys = Array.from({ length: 24 }, (_, i) =>
    i.toLocaleString('en', { minimumIntegerDigits: 2 }),
  );
  for (const tv of Object.values(data.byType.all)) {
    for (const hour of hourKeys) {
      if (!tv.histogramHourCount[hour]) tv.histogramHourCount[hour] = 0;
    }
    hourData.push({ name: tv.type, hist: tv.histogramHourCount });
  }

  const dayData = [];
  const dayKeys = Array.from({ length: 7 }, (_, i) => i.toLocaleString());
  for (const tv of Object.values(data.byType.all)) {
    const newHist: Histogram<number> = {};
    for (const day of dayKeys) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (tv.histogramDayCount[day] === undefined)
        tv.histogramDayCount[day] = { count: 0, hourCount: 0 };
      newHist[day] = tv.histogramDayCount[day].hourCount;
    }
    dayData.push({ name: tv.type, hist: newHist });
  }

  const datum: Datum = {
    name: 'All',
    children: [],
  };

  for (const [proj, descriptions] of Object.entries(data.byGroup.all)) {
    const p: Datum = { name: proj };
    const children: Datum[] = [];
    for (const desc of Object.values(descriptions)) {
      children.push({ name: desc.description, value: desc.total });
    }
    if (children.length > 0) {
      p.children = children;
    }
    datum.children?.push(p);
  }

  return (
    <div>
      <div>
        <Histogram
          data={dayData}
          histoKeys={dayKeys}
          xFormatter={(val) =>
            formatDate(addDays(startOfWeek(Date.now()), parseInt(val)), 'iiii')
          }
        />
      </div>
      <div>
        <Histogram
          data={hourData}
          histoKeys={hourKeys}
          xFormatter={(val) =>
            formatDate(addHours(startOfDay(Date.now()), parseInt(val)), 'haaa')
          }
        />
      </div>
      <div>
        <MaxYear year={maxYear} dayData={data.byTime.all.day} />
      </div>
      <div>
        <Sunburst data={datum} />
      </div>
    </div>
  );
}

export default App;
