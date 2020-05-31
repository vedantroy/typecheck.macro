import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("tuple-array", (t) => {
  const x = createValidator<[string, string?] & Array<string | number>>();
  tBV(t, x, {
    inputs: [[""], ["", ""]],
    returns: true,
  });

  tBV(t, x, {
    inputs: [
      ["", undefined],
      ["", 3],
      ["", "", ""],
    ],
    returns: false,
  });
});

test("tuple-tuple", (t) => {
  const x = createValidator<[string, string] & ["hello", "world"]>();
  tBV(t, x, {
    inputs: [["hello", "world"]],
    returns: true,
  });
  tBV(t, x, {
    inputs: [undefined, null, {}, new Set(), ["hello"], ["a", "world"]],
    returns: false,
  });

  const y = createValidator<[string, string?] & [string, string]>();
  tBV(t, y, {
    inputs: [["a", "b"]],
    returns: true,
  });
  tBV(t, y, {
    inputs: [[""], ["", undefined], ["", "", ""]],
    returns: false,
  });
});

test("object-pattern-simple", (t) => {
  const x = createValidator<{ hello: string } & { world: number }>();
  tBV(t, x, {
    inputs: [{ hello: "", world: 3 }],
    returns: true,
  });
  tBV(t, x, {
    inputs: [
      null,
      undefined,
      { hello: "" },
      { world: 3 },
      {},
      { hello: "", world: "" },
    ],
    returns: false,
  });
});

test("object-pattern-optional-properties", (t) => {
  const x = createValidator<
    { hello?: string; opt?: string; required: string } & {
      hello: string;
      world?: string;
      opt?: string;
    }
  >();
  tBV(t, x, {
    inputs: [
      { hello: "a", required: "b" },
      { hello: "a", required: "b", opt: "a" },
      { hello: "a", required: "b", world: "" },
    ],
    returns: true,
  });
  tBV(t, x, {
    inputs: [
      {},
      { hello: "a" },
      { required: "b" },
      { hello: "a", required: "b", opt: 3 },
      { hello: "a", required: "b", world: 3 },
    ],
    returns: false,
  });
});

test("object-pattern-index-signatures", (t) => {
  const x = createValidator<
    { [key: string]: "Hello" } & { [key: number]: "Hello" | "World" }
  >();
  tBV(t, x, {
    inputs: [{ a: "Hello", 3: "Hello" }],
    returns: true,
  });
  tBV(t, x, {
    inputs: [{ 3: "World" }, { a: "World" }],
    returns: false,
  });

  const y = createValidator<
    { [key: string]: string; [key: number]: "World" } & {
      [key: string]: "Hello" | "World";
    }
  >();
  tBV(t, y, {
    inputs: [{}, { a: "Hello", 3: "World" }, { a: "World", 3: "World" }],
    returns: true,
  });
  tBV(t, y, {
    inputs: [{ a: "foofoo" }, { 3: "NotWorld" }, { 3: "Hello" }],
    returns: false,
  });
});
