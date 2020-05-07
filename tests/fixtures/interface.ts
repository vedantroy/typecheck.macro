import typecheck from "../../dist/typecheck.macro";
import type { ExecutionContext } from "ava";

export default function (t: ExecutionContext) {
  interface Asteroid {
    type: "asteroid";
    location: [number, number, number];
    mass: number;
  }
  ///asdads
  typecheck<{ hello: "world" }>();
  //typecheck();
  t.true(true);
}

//const obj: Asteroid = {type: 'asteroid', location: [1, 2, 3], mass: 3}
