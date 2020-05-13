import typecheck, { register } from "../../dist/typecheck.macro";
import type { ExecutionContext } from "ava";

export default function (t: ExecutionContext) {
  /*
  interface Asteroid {
    hello: 5 | 3;
    [key: string]: number;
  }
  */
  /*
  interface Generic<Y, Z = string> {
    a: Y;
    b: Z;
  }
  */
  /*
  interface Generic<X extends Record<string, X>> {
    t: X;
    y: X<string, X>;
  }
  */
  interface Generic {
    y: "hello";
    b: 3;
    c: { hello: number };
    d: { hello: number };
    e?: number;
  }
  //type t = { hello: Generic<string, string> };
  type t2 = { hello: "world" };
  interface i {
    value: t;
  }
  const a = () => {
    interface foo {}
  };
  //register('Generic');
  register("Generic");
  register("t");
  register("t2");
  register("zoo");
  /*
  typecheck<{
    [key: string]: string;
    [key: number]: string;
  }>();
  */
  t.true(true);
}
