import createValidator, { registerType } from "../../../../dist/typecheck.macro";

interface Foo<X, Y> {}
registerType("Foo");
createValidator<Foo<string>>();
