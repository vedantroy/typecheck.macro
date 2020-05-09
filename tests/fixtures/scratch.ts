import typecheck from "../../dist/typecheck.macro";
import type { ExecutionContext } from "ava";

export default function (t: ExecutionContext) {
  interface Asteroid {
    hello: 5 | 3;
    [key: string]: number;
  }
  type strs = "Hello" | "World";
  //typecheck<{[key in strs]: number}>()
  //type obj = { hello: 5 | 3, [key: string]: number, [key2: string]: number };
  let test: obj = { hello: 5, world: 4 };
  typecheck<{ hello: 5 | 3; [key: number]: number; world: { sam: "bob" } }>();
  t.true(true);
}
