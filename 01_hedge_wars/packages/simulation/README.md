# Simulation boundary — implementation pending

This directory reserves the future pure simulation package. No physics implementation is claimed by the foundation.

Next step SIM-01: add a workspace package with typed serializable world state, explicit tick units and seeded RNG. Then implement mask-based terrain edits and collision primitives with representative fixtures. Keep browser/rendering/network dependencies out of this package.

Do not copy a gravity constant without its units and original timestep. Server-only authority allows client correction, but replayable fixed-step behavior remains useful for tests and debugging.
