const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: true });

const schema = {
  properties: {
    friend: {
      properties: {
        name: {
          type: ["string", "number"],
        },
        relationship: {
          enum: ["Happy", "Sad"],
          type: "string",
        },
      },
      type: "object",
    },
    legs: {
      type: "number",
    },
    meaning: {
      enum: [42],
      type: "number",
    },
    pet: {
      properties: {
        attributes: {
          additionalItems: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "number",
              },
              {
                type: ["string", "number"],
              },
            ],
          },
          items: [
            {
              type: "string",
            },
            {
              type: "number",
            },
            {
              type: ["string", "number"],
            },
          ],
          minItems: 3,
          type: "array",
        },
        name: {
          type: "string",
        },
      },
      type: "object",
    },
  },
  type: "object",
};

const validate = ajv.compile(schema);
export default validate;
