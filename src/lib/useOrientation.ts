import { useEffect, useState } from 'react'

const QUERY = '(max-width: 900px)'

/** desktop: vertical ribbon beside the map · narrow: horizontal ribbon below it */
export function useOrientation(): 'vertical' | 'horizontal' {
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>(() =>
    window.matchMedia(QUERY).matches ? 'horizontal' : 'vertical',
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setOrientation(mq.matches ? 'horizontal' : 'vertical')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return orientation
}
