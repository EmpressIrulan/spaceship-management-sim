# Replacement Scenes For PR 158

Alice's rule: a hive sends ten only when ten of its own offspring are alive; arrivals stay permanently, count toward the five needed to attack, and do not count toward departure.

Code fix: eee429d. Verified head after merging origin/main: cadcaee.

- Scene 1 (run1): the hive hover appears only before departure. Ten migrate at 4.4 seconds, reach the unobscured source gate at 15.9 seconds, and appear in the connected sector at 20.3 seconds. Stills at 6 and 17 seconds were extracted and inspected.
- Scene 4 (run3): two residents at 0.5 seconds, ten arrivals at the destination gate at 24.5 seconds, twelve spread among the residents at 40.6 seconds. Each marked result is held for four seconds. Before/arrival/after stills are extracted from the WebM; the before and after stills were inspected.
- Scene 4's first retake (run2) succeeded but its final frame still showed overlapping bugs partway through the arrival flight. The second retake waits for all initial arrival legs to finish.
- Scenes 2, 3, and 5 are retained from b50d6ea. Scene 5 isolates a hive founded by ten arrivals and then shows its own offspring; this fix does not change that behavior.

All three attempts ended with EXIT=0. Playwright core is exactly 1.63.0, using Chromium 1243 and ffmpeg 1011. No product recording hook was added.

The red regression log precedes the implementation. Both 400-second seed-7 runs (1/60 and 1-second ticks), the three-plus-ten occupied-hive case, and a newly founded hive's own ten-offspring departure pass. Arrivals retain their birth hive identity and loiter around the destination population.

Seven claim/panel tests passed on origin/main but failed with persistent attackers destroying their Builder or ship. Only those unrelated fixtures were isolated from combat; their assertions remain unchanged. Final checks: 417 sim tests, 330 app tests, 2 tools tests, typecheck, build, and pre-PR script pass.
