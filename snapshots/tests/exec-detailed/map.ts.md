# Snapshot report for `tests/exec-detailed/map.ts`

The actual snapshot is saved in `map.ts.snap`.

Generated by [AVA](https://avajs.dev).

## map-basic

> Snapshot 1

    [
      [
        'input',
        null,
        {
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
      ],
    ]

## map-complex

> Snapshot 1

    [
      [
        'input',
        null,
        {
          elementTypes: [
            {
              childTypes: [
                {
                  type: 'instantiatedType',
                  typeName: 'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]',
                },
                {
                  type: 'primitiveType',
                  typeName: 'number',
                },
              ],
              type: 'union',
            },
            {
              type: 'instantiatedType',
              typeName: 'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]',
            },
          ],
          type: 'builtinType',
          typeName: 'Map',
          typeParameterDefaults: [],
          typeParametersLength: 2,
        },
      ],
    ]

> Snapshot 2

    [
      [
        'input.MAP_KEY',
        Map {
          '' => 3,
        },
        {
          childTypes: [
            {
              type: 'instantiatedType',
              typeName: 'Map[{"type":"primitiveType","typeName":"number"},{"type":"primitiveType","typeName":"string"}]',
            },
            {
              type: 'primitiveType',
              typeName: 'number',
            },
          ],
          type: 'union',
        },
      ],
    ]