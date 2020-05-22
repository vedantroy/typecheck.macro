import createValidator, { register } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("generic-instantiation", (t) => {
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
  const validator = createValidator<T2<Foo<string>>>();
  tBV(t, validator, {
    inputs: [
      { val: { val: [] } },
      { val: { val: [{ val: [] }] } },
      { val: { val: [{ val: ["hello"] }] } },
    ],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [
      undefined,
      null,
      "hello",
      1,
      {},
      new Set(),
      new Map(),
      { val: { val: [{ val: {} }] } },
    ],
    returns: false,
  });
});

test("generic-instantiation-2", (t) => {
  interface Personality {
    isNice: boolean;
    numFriends: number;
  }

  interface PetOwner<Pet> {
    name: string;
    personality: Personality;
    pet: Pet;
  }

  type Dog = { name: string; wagsTail: boolean };
  register("Dog");
  register("PetOwner");
  const isDogOwner = createValidator<PetOwner<Dog>>();

  const owner = {
    name: "anthony",
    pet: { name: "bob", wagsTail: false },
    personality: { isNice: true, numFriends: 10 },
  };

  const notOwner = { ...owner, pet: null };
  tBV(t, isDogOwner, {
    inputs: [owner],
    returns: true,
  });
  tBV(t, isDogOwner, {
    input: [null, undefined, {}, [], new Set(), new Map(), notOwner],
    returns: false,
  });
});
