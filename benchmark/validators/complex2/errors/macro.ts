import { createDetailedValidator } from "../../../../dist/typecheck.macro";

export default (x) =>
  createDetailedValidator<{
    legs: number;
    pet: {
      name: string;
      attributes: [string, number, string | number];
    };
    meaning: 42;
    friend: {
      name: string | number;
      relationship: "Happy" | "Sad";
    };
  }>()(x, []);
