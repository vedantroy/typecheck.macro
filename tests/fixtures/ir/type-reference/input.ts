import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

/**
 * Registering a type will register all its dependent
 * types in the same scope
 */
export default () => {
  interface Foo {
    foo: string;
  }
  interface Bar {
    bar: Foo;
  }
  register("Bar");
  return __dumpAllIR;
};
