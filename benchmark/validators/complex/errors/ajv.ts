const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: true });

const schema = {
  anyOf: [
    {
      type: "null",
    },
    {
      type: "number",
    },
    {
      properties: {
        a: {
          additionalItems: {
            type: "string",
          },
          items: [
            {
              anyOf: [
                {
                  type: "number",
                },
                {
                  properties: {
                    a: {
                      items: [
                        {
                          type: "number",
                        },
                        {
                          items: {
                            type: ["number", "string"],
                          },
                          type: "array",
                        },
                      ],
                      maxItems: 2,
                      minItems: 2,
                      type: "array",
                    },
                  },
                  required: ["a"],
                  type: "object",
                },
              ],
            },
            {
              type: "number",
            },
          ],
          minItems: 2,
          type: "array",
        },
        b: {
          enum: ["bar", false, 42],
          type: ["string", "boolean", "number"],
        },
        c: {
          items: {
            items: {
              anyOf: [
                {
                  type: "number",
                },
                {
                  type: "boolean",
                },
                {
                  enum: ["bar"],
                  type: "string",
                },
                {
                  enum: ["zar"],
                  type: "string",
                },
              ],
            },
            type: "array",
          },
          type: "array",
        },
      },
      required: ["b", "c"],
      type: "object",
    },
  ],
};

const validate = ajv.compile(schema);
export default validate;
