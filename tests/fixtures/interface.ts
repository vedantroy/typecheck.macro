import typecheck from "../../dist/typecheck.macro";
import type { ExecutionContext } from "ava";

export default function (t: ExecutionContext) {
  interface Asteroid {
    type: "asteroid";
    location: [number, number, number];
    mass: number;
  }
  typecheck<{ hello: "world" }>();
  t.true(true);
}
