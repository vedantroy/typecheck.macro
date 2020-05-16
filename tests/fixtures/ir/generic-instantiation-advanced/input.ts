import createValidator, {
  __dumpAllIR,
  register,
} from "../../../../dist/typecheck.macro";
/**
 * 1. complex nested instantiated generics are stored properly
 * 2. was useful in understanding how generic instantiation works
 * so I could write code that counts the number of times a certain class
 * is referred to in a given type (useful for lifting out frequently used functions)
 */

export default () => {
  type T1<A> = {
    val: Array<A>;
  };
  type T2<A> = {
    val: T1<A>;
  };
  type Foo<A> = {
    val: Array<A>;
  };
  register("T2");
  register("Foo");
  createValidator<T2<Foo<string>>>();
  return __dumpAllIR;
};
