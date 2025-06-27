import { useEffect, useState } from 'react';

interface WxData {
  [key: string]: any;
}

function App() {
  const [data, setData] = useState<WxData | null>(null);
  useEffect(() => {
    fetch('/api/wx')
      .then(res => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div>
      <h1>Flow WX</h1>
      {data ? (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}

export default App;
