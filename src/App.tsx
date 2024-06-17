import './App.css';
import { useGetJSONFile } from './hooks/useGetJSONFile';
import other from '/data.json?url';

function App() {
  const data = useGetJSONFile<JSONData>('data.json');

  return (
    <div className='carousel carousel-vertical h-96 rounded-box'>
      <div className='container carousel-item h-full text-center'>
        <p>{JSON.stringify(other)}</p>
      </div>
      <div className='container carousel-item h-full text-center'>
        <p>{JSON.stringify(data?.byType)}</p>
      </div>
    </div>
  );
}

export default App;
