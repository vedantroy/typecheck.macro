import createValidator, { registerType } from "../../dist/typecheck.macro";
import test from "ava";

type DateString = string;
type EventJson = {
  id: string;
  date: DateString;
};
registerType("EventJson");

type Event = {
  id: string;
  date: Date;
};

test("transformer-basic", (t) => {
  const onlyTransformer = createValidator<EventJson, Event>(undefined, {
    transformers: {
      DateString: (x: DateString) => {
          if (x.match(/regex/)) {
              return {value: new Date(x)}
          } else {
              return {error: "failure"}
          }
      },
    },
  });
});