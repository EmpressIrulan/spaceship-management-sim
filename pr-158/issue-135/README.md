# Story 135 Demo

Five numbered scenes of the game's screen at 1280 x 900. Every marked result is held for four seconds. The proof is a five-second opening-screen recording and an extracted PNG.

| Criterion | Video | Evidence |
| --- | --- | --- |
| 1 | [Play](criterion-1/criterion-1.webm) | 4.4s: 10 live bugs, all migrating; 15.8s: they reach the gate; 20.1s: all 10 appear in the connected sector, selected through the game's map. |
| 2 | [Play](criterion-2/criterion-2.webm) | 22.5s: old hive, zero bugs; 29.8s: a new bug appears. |
| 3 | [Play](criterion-3/criterion-3.webm) | 0.5s: empty destination; 27.0s: 10 gathering bugs; 32.1s: full-HP hive, zero bugs. |
| 4 | [Play](criterion-4/criterion-4.webm) | 0.4s: 2 resident bugs; 26.8s: 12 after the 10 join. |
| 5 | [Play](criterion-5/criterion-5.webm) | 0.1s: new hive; 6.8s/13.4s: one/two bugs at game times 22.4/32.4, 10 seconds apart; 30.6s: five attack the Builder; 39.5s: HP 39/40; 52.7s: 10 migrate again; 70.9s: they reach the gate; 78s: migration is zero and only a subsequently bred bug remains. |

Each scene includes inspected PNGs extracted from its WebM, and moments.json with actual state and timestamps. The recording readout reports real game time, sector, live bugs, hives, migrating bugs, and gathering bugs. It is not a product panel. Hover text is enlarged for legibility. Sector changes use M and a click on the game's map; framing is fixture-only.

The initial layout, nine source bugs, two residents in criterion 4, and station in criterion 5 are fixtures. Criterion 5's hive is founded by real ticks during setup; the parent hive and its offspring are then excluded to isolate the new colony. Breeding intervals, attack thresholds, damage, founding, and gate migration run through the real tick. The recording-only fixture has 1x, 2x, and 4x frame-step settings. No product hook or speed feature was added.

The diagnostic criterion-3 recording exposed a real fault: bugs were consumed before appearing in the destination, and the hive used source-gate coordinates. Commit e895413 fixes this test-first, showing ten destination bugs gathering before founding at that destination's gate. Existing replay coverage also exposed a zero-duration gate loop; migration now observes the existing minimum simulation quantum. The unrelated 500-second hangar-order test excludes enemies without changing its assertions.

Proof: run1, EXIT=0. Final scenes 1-4: runs4, 5, 6, 7, EXIT=0. Criterion 3 used three attempts, including the diagnostic fault and a gate-overlap hover correction. Criterion 5 used runs8-10. Run8 hit the Dock's non-HP hover; run9 had an invalid unattached fixture Builder. Run10 captured all required evidence and finalized its WebM, but its unnecessary final wait for an empty sector timed out after 120 seconds (EXIT=124): the hive correctly kept breeding while the ten crossed. Checked frames at 78s and 82s confirm migration stays at zero with new offspring. No fourth attempt was made. The recorder's final predicate now waits for the migrating group, not an empty sector; that final predicate correction was not re-recorded.

All ten attempt logs are in recording-logs, each ending with EXIT. The bundled ffmpeg rejects movflags and cannot produce the requested MP4/GIF; original WebM files are provided instead, as on PR 155. Individual stills were extracted without scale or tile filters.

Typecheck and build pass. All 735 tests pass: 403 sim, 330 app, 2 tools. The PR remains a draft and nothing was merged.
