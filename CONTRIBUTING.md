Contributing
===

Contributions are encouraged and welcome. Contributions can take place in many forms:
- modifying/reading code
    - adding features
    - adding comments
    - making code cleaner/more readable/performant
    - reviewing the codebase
- finding and reporting bugs
- updating documentation
- spreading the word about typecheck.macro
- suggesting ideas/strategies
- other forms I haven't thought of

There are contributor friendly issues in the Github issues section.

# Developing
## Installing
This project uses [pnpm](https://github.com/pnpm/pnpm), which has an almost identical api to npm.

To get the codebase:
- Git clone the repository
- `npx pnpm add -g pnpm`
- `pnpm install`

## Architecture
### Type IR
typecheck.macro works by generating "type IR" (tir). tir is just JSON that represents a typescript type. tir is then used to generate a validation Javascript validation function. But tir could also be used to generate JSON schema/Open API/wasm/whatever.

Since tir is just JSON, it can be serialized to/from text/the disk with the builtin `JSON.stringify`/`JSON.parse`. 

### Code Gen
`irToInline.ts` turns tir into a JS function that validates the given type. The code generator exploits the fact that any block of code can be turned into an expression by wrapping it in an [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE).

## Testing
Any fixes/changes should probably result in a new test.

There are 3 types of tests:
- compile error tests that make sure the macro gives good error messages if the user does something undefined
- ir tests that generate type ir and ensure there are no unexpected changes to the output
- exec tests that generate a validator and execute it against some predefined inputs

You can run all tests with `pnpm run test`.

You can run a specific test with `pnpm run test -- --match="<test-name>"`, where "test-name" is the name of the folder (if compile or ir test) or file (if exec test) that you want to run. Note that all exec tests are prefixed with "exec-" and you shouldn't include the ".ts" extension when specifying the exec test name.

## Scratchpad
Look at [the scratchpad](scratchpad/scratchpad.ts) for a useful tool for playing with the macro.