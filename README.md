# spaceship-management-sim

A management sim, built from pixel sprites and small movement animations and timers. A ship sent to mine travels to the nearest asteroid, a timer runs while cargo fills, then a return timer while it flies back and unloads. Systems connect to each other the way X4's sectors do, so a ship's route is a hop between connected systems rather than free movement on an open map.

One ship on one route barely produces or sells anything. The game is meant to work at scale: many ships on many routes running in parallel, each a small state machine (idle, travelling out, working, travelling back, unloading) ticking against its own timer.

The end goal is a type of 4X style game where you can take over the galaxy if you wanted to. Bannerlord but with individual standing orders for fleets and ships. After a while and some setup, should run like X4 where you can sit and watch most of your empire grow slowly.

This will also need to simulate an active economy, with each ship being owned by AI (not the generative kind) making actions and building their presence or economy just like the player would.

No game yet. Working name, no title picked.

## Running it

Needs Node 22.

```sh
npm install
npm run dev      # then open the printed URL
```

`npm run build` writes `dist/index.html`, one self-contained file that opens from the filesystem with no server.
