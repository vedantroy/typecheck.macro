# Snapshot report for `tests/ir/passes/instantiate.ts`

The actual snapshot is saved in `instantiate.ts.snap`.

Generated by [AVA](https://avajs.dev).

## circular-1

> Snapshot 1

    Map {
      'SC2' => {
        circular: true,
        typeStats: Map {},
        value: {
          properties: [
            {
              keyName: 'val',
              optional: false,
              type: 'propertySignature',
              value: {
                childTypes: [
                  {
                    type: 'instantiatedType',
                    typeName: 'SC2',
                  },
                  {
                    type: 'primitiveType',
                    typeName: 'string',
                  },
                ],
                type: 'union',
              },
            },
          ],
          type: 'objectPattern',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'SC2' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'SC2',
        },
      },
    }

## instantiate-simple

> Snapshot 1

    Map {
      'Foo[{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {},
        value: {
          properties: [
            {
              keyName: 'val',
              optional: false,
              type: 'propertySignature',
              value: {
                type: 'primitiveType',
                typeName: 'string',
              },
            },
          ],
          type: 'objectPattern',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'Foo[{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'Foo[{"type":"primitiveType","typeName":"string"}]',
        },
      },
    }

## merge-arrays

> Snapshot 1

    Map {
      'Array[{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {},
        value: {
          elementTypes: [
            {
              type: 'primitiveType',
              typeName: 'string',
            },
          ],
          type: 'builtinType',
          typeName: 'Array',
          typeParameterDefaults: [],
          typeParametersLength: 1,
        },
      },
      'Arr[{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {
          'Array[{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'Array[{"type":"primitiveType","typeName":"string"}]',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'Arr[{"type":"primitiveType","typeName":"string"}]' => 1,
          'Array[{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'Arr[{"type":"primitiveType","typeName":"string"}]',
        },
      },
    }

## merge-maps

> Snapshot 1

    Map {
      'Map[{"type":"primitiveType","typeName":"string"},{"type":"primitiveType","typeName":"number"}]' => {
        circular: false,
        typeStats: Map {},
        value: {
          elementTypes: [
            {
              type: 'primitiveType',
              typeName: 'string',
            },
            {
              type: 'primitiveType',
              typeName: 'number',
            },
          ],
          type: 'builtinType',
          typeName: 'Map',
          typeParameterDefaults: [],
          typeParametersLength: 2,
        },
      },
      'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {},
        value: {
          elementTypes: [
            {
              type: 'primitiveType',
              typeName: 'number',
            },
            {
              type: 'primitiveType',
              typeName: 'string',
            },
          ],
          type: 'builtinType',
          typeName: 'Map',
          typeParameterDefaults: [],
          typeParametersLength: 2,
        },
      },
      'FM[{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {
          'Map[{"type":"primitiveType","typeName":"string"},{"type":"primitiveType","typeName":"number"}]' => 1,
          'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          childTypes: [
            {
              type: 'instantiatedType',
              typeName: 'Map[{"type":"primitiveType","typeName":"string"},{"type":"primitiveType","typeName":"number"}]',
            },
            {
              type: 'instantiatedType',
              typeName: 'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]',
            },
          ],
          type: 'union',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'FM[{"type":"primitiveType","typeName":"string"}]' => 1,
          'Map[{"type":"primitiveType","typeName":"string"},{"type":"primitiveType","typeName":"number"}]' => 1,
          'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'FM[{"type":"primitiveType","typeName":"string"}]',
        },
      },
    }

## merge-sets

> Snapshot 1

    Map {
      'Set[{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {},
        value: {
          elementTypes: [
            {
              type: 'primitiveType',
              typeName: 'string',
            },
          ],
          type: 'builtinType',
          typeName: 'Set',
          typeParameterDefaults: [],
          typeParametersLength: 1,
        },
      },
      'MS[{"type":"primitiveType","typeName":"string"}]' => {
        circular: false,
        typeStats: Map {
          'Set[{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'Set[{"type":"primitiveType","typeName":"string"}]',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'MS[{"type":"primitiveType","typeName":"string"}]' => 1,
          'Set[{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'MS[{"type":"primitiveType","typeName":"string"}]',
        },
      },
    }

## resolve-circular-2

> Snapshot 1

    Map {
      'Circular[{"type":"primitiveType","typeName":"string"}]' => {
        circular: true,
        typeStats: Map {},
        value: {
          properties: [
            {
              keyName: 'next',
              optional: false,
              type: 'propertySignature',
              value: {
                type: 'instantiatedType',
                typeName: 'Circular[{"type":"primitiveType","typeName":"string"}]',
              },
            },
          ],
          type: 'objectPattern',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'Circular[{"type":"primitiveType","typeName":"string"}]' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'Circular[{"type":"primitiveType","typeName":"string"}]',
        },
      },
    }

## stats-correct-1

> Snapshot 1

    Map {
      'A' => {
        circular: false,
        typeStats: Map {},
        value: {
          type: 'primitiveType',
          typeName: 'string',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'A' => 1,
        },
        value: {
          type: 'instantiatedType',
          typeName: 'A',
        },
      },
    }

## complex-type-parameter

> Snapshot 1

    Map {
      'Circular2[{"type":"primitiveType","typeName":"string"}]' => {
        circular: true,
        typeStats: Map {},
        value: {
          properties: [
            {
              keyName: 'next',
              optional: false,
              type: 'propertySignature',
              value: {
                type: 'instantiatedType',
                typeName: 'Circular2[{"type":"primitiveType","typeName":"string"}]',
              },
            },
          ],
          type: 'objectPattern',
        },
      },
      'Circular2[{"type":"primitiveType","typeName":"number"}]' => {
        circular: true,
        typeStats: Map {},
        value: {
          properties: [
            {
              keyName: 'next',
              optional: false,
              type: 'propertySignature',
              value: {
                type: 'instantiatedType',
                typeName: 'Circular2[{"type":"primitiveType","typeName":"number"}]',
              },
            },
          ],
          type: 'objectPattern',
        },
      },
      'STR' => {
        circular: false,
        typeStats: Map {},
        value: {
          type: 'primitiveType',
          typeName: 'string',
        },
      },
      '$$typeParameter$$' => {
        circular: false,
        typeStats: Map {
          'Circular2[{"type":"primitiveType","typeName":"string"}]' => 1,
          'Circular2[{"type":"primitiveType","typeName":"number"}]' => 1,
          'STR' => 1,
        },
        value: {
          childTypes: [
            {
              type: 'instantiatedType',
              typeName: 'Circular2[{"type":"primitiveType","typeName":"string"}]',
            },
            {
              type: 'instantiatedType',
              typeName: 'Circular2[{"type":"primitiveType","typeName":"number"}]',
            },
            {
              type: 'instantiatedType',
              typeName: 'STR',
            },
          ],
          type: 'union',
        },
      },
    }