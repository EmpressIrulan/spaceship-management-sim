# Story 134 Acceptance Demo

Six independent scenes, named by criterion number. Each records the real game entry point at 1280x900. Result checkpoints are held for at least four seconds. The opening-screen proof is in `proof/`.

The recorder injects its fixture at bundle time only. No production entry point imports it or exposes a demo hook. It seeds station layouts, bugs, prior damage, and inventory; subsequent bites, destruction, disconnected cascades, construction payments/completion, and Turret combat run through the real simulation tick. Build choices and hovers use the game's own controls. The lower-left overlay reads current simulation stock, hive HP, and queue order; it is a recording aid, not a product panel. Hover font size and stacking are adjusted only in the recording for readability.

Scene 2 removes the attacking bugs and advances 20 game seconds to test the absence of healing. Scene 3 supplies 75 Metal and 75 Ice to the site after inspecting the queue; each of the existing Storage and destroyed Builder costs the normal 25 Metal plus 25 Ice. Scene 6 starts with six station-stock Metal, independent of its construction site's module payment.

| Criterion | Video Moments |
| --- | --- |
| 1 | 5.9s: five bugs flying at the nearest of four modules and a ship; 19.8s: all five targets bitten, module hover HP 39/40. |
| 2 | 0.6s: HP 40/40; 15.6s: HP 35/40; 19.7s: no bugs, another 20 game seconds elapsed, HP still 35/40. |
| 3 | 15.8s: explosion and Builder ghost behind the previously queued Storage; 19.8s: normal 25 Metal + 25 Ice hover; 24.0s: existing Storage paid first, site stock 50 of each; 32.1s: Builder rebuild paid, 25 of each remain; 40.2s: rebuilt HP 40/40. |
| 4 | 16.0s: bridge destruction and ghosts appended; 20.2s: unobstructed three-ghost view, existing Storage first, then Builder/Storage/Builder in queue. |
| 5 | 1.5s: Stored 300/2000, Metal 200 and Ice 100; 16.4s: Storage destroyed; 20.6s: Stored 0/1000 and station stock zero, despite a surviving Storage. |
| 6 | 0.2s: Build menu offers Turret; 4.3s: normal build running; 12.3s: bug shot, Metal 6 to 5; 16.5s: bug HP 3; 24.2s: hive shot, Metal 3; 28.5s: hive HP 197; 38.3s: Metal 0 and Turret: no Metal while the final projectile is still in flight; 42.8s: final hit landed, hive HP 188, no new shot; 55.3s: eight further game seconds, no firing or hive damage; 59.3s: the fixture moves the hive out of range, no bugs remain, and hover still says Turret: no Metal. |

Scenes 1-5 remain runs17-21. Scene 6 was replaced by run24 after the review fixes in 488d1af; run23 is a fresh five-second opening-screen proof with an inspected still in `proof-review/`. All these runs end in EXIT=0. All 24 attempt logs are preserved in `recording-logs/`, each ending in an EXIT line. Earlier failures were recorder setup/assertion mistakes: an internal helper import, legacy Storage hover behavior, and an unrelated Builder attached to the stock-loss fixture. Successful earlier clips were refreshed for readability and additional result holds.

The bundled ffmpeg cannot produce the requested MP4/GIF: MP4 conversion rejects `movflags`. Original Playwright WebM files are provided instead, matching PR #152. `convert.log` records the failure. PNG stills were extracted individually with the bundled ffmpeg and checked against the final videos.

Verification after review fixes: typecheck and build pass; 388 sim tests, 329 app tests, and 2 tools tests pass (719 total). The observed failing regression runs are preserved in `review-test-logs/`.

Commit 488d1af preserves interrupted construction and queued dependencies, including restoration of the only Dock; copies inventory and destruction history before tick writes; resolves the open Builder by position and re-hit-tests shifted module indices; and derives no-Metal hover text from current stock regardless of targets or reload state. The claim-only fixture excludes unrelated hive attacks without changing its assertions. Destruction-history retention and the amount of stock lost per destroyed Storage are unchanged.

Only scene 6 needed replacement: scenes 1-5 do not have interrupted dependent builds or an open Builder menu, and their visible results still match. The new scene 6 stills were extracted and inspected, including the last shot in flight and no target in range. No demo-only product hook was added.
