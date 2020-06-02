import { Record, Boolean, Number } from "runtypes";

const Type = Record({
  isCat: Boolean,
  legs: Number,
});

export default Type.validate;
