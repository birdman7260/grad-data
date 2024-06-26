import './App.css';
import { useGetJSONFile } from './hooks/useGetJSONFile';
import MaxYear from './charts/MaxYear';

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

  return (
    <div>
      <div>
        <MaxYear year={maxYear} dayData={data.byTime.all.day} />
      </div>
    </div>
  );
}

export default App;
