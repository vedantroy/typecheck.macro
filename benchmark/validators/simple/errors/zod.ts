import * as z from "zod";

const schema = z
  .object({
    isCat: z.boolean(),
    legs: z.number(),
  })
  .nonstrict();

export default (o) => {
  try {
    schema.parse(o);
    return true;
  } catch (err) {
    return false;
  }
};
