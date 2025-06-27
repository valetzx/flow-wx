import { useEffect, useState } from 'react'
import './App.css'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/wx')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load')
        return res.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p style={{color: 'red'}}>Error: {error}</p>
  if (!data) return <p>Loading...</p>

  return (
    <div className="gallery">
      {Object.entries(data).map(([title, { images = [] }]) => (
        <div key={title} className="article">
          <h2>{title}</h2>
          <div className="images">
            {images.map((src) => (
              <img key={src} src={`?url=${encodeURIComponent(src)}`} alt={title} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
