import { useEffect, useState } from 'react'

// Relógio reutilizável: força um novo render no intervalo indicado para que
// rótulos relativos ("há 2 min") continuem corretos sem depender de nova carga.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
