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

However, we want to avoid creating too many IIFEs. We prefer to directly inline simple expressions, instead of wrapping them in an IIFE.

Things to note:
- `parentParamIdx` and `parentParamName` refer to the name of the current variable that is being validated. `parentParamIdx` is transformed into the variable name with a simple function that returns `p${parentParamIdx}.` If `parentParamName` is specified, it will take priority over `parentParamIdx`. Here is an example:

```javascript
for (const [k, v] of Object.entries(obj)) {
    if(<an expression that validates "v">)
}
```

Here, we want to validate `v`. As such, `parentParamName` is `v`. We visit the IR node that has the type of `v`. It can either return
- nothing (no code)
- a simple expression, like `typeof v === number`
- a complex expression (maybe `v` has to be a specific type of object) that is wrapped in an arrow function like this: `((x => ...))(v)`. Here, `v` is the parameter to the arrow function.

## Testing
Any fixes/changes should probably result in a new test.

There are 3 types of tests:
- compile error tests that make sure the macro gives good error messages if the user does something undefined
- ir tests that generate type ir and ensure there are no unexpected changes to the output
- exec tests that generate a validator and execute it against some predefined inputs

In order to execute the tests we need `_register.js` because we have to compile the Typescript files to Javascript with the macro enabled. `_register.js` helps us do that by hooking into the default `require` method in Node.

You can run all tests with `pnpm run test`.

You can run a specific test with `pnpm run test -- --match="<test-name>"`, where "test-name" is the name of the folder (if compile or ir test) or file (if exec test) that you want to run. Note that all exec tests are prefixed with "exec-" and you shouldn't include the ".ts" extension when specifying the exec test name.