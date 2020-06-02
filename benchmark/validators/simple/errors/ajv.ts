const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: false });

const schema = {
  properties: {
    isCat: {
      type: "boolean",
    },
    legs: { type: "integer" },
  },
  required: ["isCat", "legs"],
};

const validate = ajv.compile(schema);

export default validate;
