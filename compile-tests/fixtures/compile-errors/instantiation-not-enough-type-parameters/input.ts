import createValidator, { register } from "../../../../dist/typecheck.macro";

interface Foo<X, Y> {}
register("Foo");
createValidator<Foo<string>>();
