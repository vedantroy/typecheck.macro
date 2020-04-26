import gemmafy from '../../temp_build/typecheck.macro'

interface Asteroid {
  type: 'asteroid'
  location: [number, number, number]
  mass: number
}

const obj: Asteroid = {type: 'asteroid', location: [1, 2, 3], mass: 3}

t.deepEqual("hello 🐶 world", gemmafy("hello world"))