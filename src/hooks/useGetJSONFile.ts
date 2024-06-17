import { useState, useEffect } from 'react';

export const useGetJSONFile = <T extends object>(fileName: string) => {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const fetchJSON = async () => {
      const response = await fetch(`/public/${fileName}`);
      const jsonData = (await response.json()) as T;
      setData(jsonData);
    };

    fetchJSON().catch((err: unknown) => {
      console.error(`failed to fetch data.json: ${err}`);
      // TODO: what do i do about failures... consider playing with react query or something for fun?
    });
  }, [fileName]);

  return data;
};
