import createValidator, { register } from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  // This tests whether property checks on objects are fast
  // and non-repetitive
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
};
