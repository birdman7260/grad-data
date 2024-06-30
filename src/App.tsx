import './App.css';
import { useGetJSONFile } from './hooks/useGetJSONFile';
import MaxYear from './charts/MaxYear';
import Sunburst from './charts/Sunburst';

type Datum = {
  name: string;
  value?: number;
  children?: Datum[];
};

function App() {
  const data = useGetJSONFile<JSONData>('data.json');

  // useEffect(() => {
  //   initFlowbite();
  //   console.log(`do it ${data === null}`);
  // }, [data]);

  if (data === null) {
    return <div>Waiting...</div>;
  }

  const maxYearData = data.byTime.top.year[0];
  const maxYear = parseInt(maxYearData.originalTime);

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
        <Sunburst data={datum} />
      </div>
      <div>
        <MaxYear year={maxYear} dayData={data.byTime.all.day} />
      </div>
    </div>
  );
}

export default App;
