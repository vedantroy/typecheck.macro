import createValidator, { register } from "../../../../dist/typecheck.macro";

interface Foo<T> {}
register("Foo");
createValidator<Foo<string, number>>();
