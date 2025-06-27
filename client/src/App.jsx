import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [images, setImages] = useState([])

  useEffect(() => {
    fetch('/api/wx')
      .then((res) => res.json())
      .then((data) => {
        const arr = []
        Object.values(data).forEach((v) => {
          if (Array.isArray(v.images)) arr.push(...v.images)
        })
        setImages(arr)
      })
      .catch((err) => console.error('Failed to load images', err))
  }, [])

  return (
    <div className="gallery">
      {images.map((src, i) => (
        <img key={i} src={`?url=${src}`} alt="" loading="lazy" />
      ))}
    </div>
  )
}

export default App
