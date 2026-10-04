# Accepted tradeoffs

- **Hangar pixel price is provisional.** The first cut costs 10 Metal and 5 Ice per pixel. Revisit this when a playtest shows whether carrier construction arrives too early or too late relative to building fighters.
- The single-pass `attachedInOrder` removes a ghost that touches only a later-queued ghost, even when that later ghost stays, which follows from criterion 5 of #102.
