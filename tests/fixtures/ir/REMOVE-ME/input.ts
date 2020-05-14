import createValidator, {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  /*
  const v = createValidator<{
    foo: string;
    bar: string;
    [key: number]: string;
    [key: string]: string;
  }>();
  */
  interface Foo<T> {
    el: T;
  }
  register("Foo");
  createValidator<Foo<string>>();
  return __dumpAllIR;
};
