import typecheck from "../../dist/typecheck.macro";
import type { ExecutionContext } from "ava";

export default function (t: ExecutionContext) {
  interface Asteroid {
    hello: 5 | 3;
    [key: string]: number;
  }
  interface Generic<T> {
    hello: T;
  }
  typecheck<{
    //a: 3;
    //b: "bob";
    /*
    c?: string;
    d: number | string;
    e: { foo: string; bar: number };
    */
    //e: Array<string>;
    //f: Record<string, string>;
    //g: Generic<string>;
    //h: Record<number, Generic<string>>
    [key: string]: string;
    [key: number]: string;
  }>();
  t.true(true);
}
