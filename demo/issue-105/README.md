# Story 105 demo

`demo.webm` contains eight criterion scenes (3m04s). `scenes.json` gives their
start times; `stills/` contains frames extracted from that video.

The recording bundles the real app entry point with the recording-only fixture
in `tools/issue-105-demo-fixture.ts`. Seed 105, the real map controls and the
normal renderer are used. The fixture clears asteroids for legibility, arranges
four/five bugs and stationary ships, and funds a Builder. Scene 4's nearer ship
starts with 40 HP and 5 Metal; a farther empty ship survives. Scenes 6–7 start
with a wounded 9-HP hive to keep the fight short. Scene 8 starts after the last
projectile has landed and killed a 3-HP hive; no shot remains in flight. The Gun
ship stays visible and idle for more than 30 game seconds. Births, bites, destruction,
construction, travel, gunfire and drops all run through the unchanged sim.

Hover shots use the real info box. Other shots park the pointer in the empty
bottom-left corner. A cursor overlay shows the actual mouse position because
headless video capture omits the operating-system pointer.

Scenes 4, 6, 7 and 8 were refreshed for commit `b6f8c8d`: fire-coloured pixel
explosions and travelling yellow projectiles with damage on arrival. Scene 4
holds the real renderer's expanded pixel burst for 4.5 seconds using a
recording-only animation-clock freeze. Scene 6 separately holds projectiles
mid-flight to a bug and the hive, and shows the bug's HP dropping on impact.
Scenes 1, 2, 3 and 5 are the original clips, spliced without re-encoding; their
encoded frame hashes were verified unchanged. All refreshed stills were
extracted from the assembled video and checked.

To record a criterion independently:

```sh
npm install --prefix ~/.cache/spaceship-management-sim-105 playwright-core@1.56.1
SCENE=1 node tools/record-issue-105.mjs ~/.cache/spaceship-management-sim-105/rec/runN
```

Repeat with `SCENE=2` through `SCENE=8`, concatenate the WebM files in criterion
order with ffmpeg, then extract the stills from the resulting video.
