import gemmafy from "../../dist/typecheck.macro";

export default function (t) {
  interface Asteroid {
    type: "asteroid";
    location: [number, number, number];
    mass: number;
  }
  t.deepEqual("hello 🐶 world", gemmafy("hello world"));
  //gemmafy("foo bar")
}

//const obj: Asteroid = {type: 'asteroid', location: [1, 2, 3], mass: 3}
