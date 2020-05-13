TODO (near end): How will npm packaging work?

TODO: 
TODO: Implement basic validation using interpreter or native codegen
TODO: Implement generic support, interface, tuple, map support
TODO: Implement 

we can get around the "validating a primitive type shouldn't require a wrapper" problem by marking something in the state, like "needs wrapper" or "does not need wrapper" and then at the top level we can add the wrapper