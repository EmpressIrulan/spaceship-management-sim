import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState, homeStation } from "./state";
import { miningStart } from "./test-ships";
import {
  BUG_ATTACK_THRESHOLD,
  BUG_BITE_RANGE,
  BUG_DESIGNS,
  BUG_HOVER_RADIUS,
  BUG_HP,
  BUG_SPAWN_SECONDS,
  BUG_SPEED_FACTOR,
  GUN_DAMAGE,
  GUN_RANGE,
  GUN_SECONDS,
  GUN_SHOT_SECONDS,
  HIVE_HP,
  HIVE_SECTOR,
  MODULE_HP,
  MODULE_SPACING,
  TURRET_DAMAGE,
  TURRET_METAL_PER_SHOT,
  TURRET_RANGE,
  TURRET_SHOT_SECONDS,
  TURRET_SECONDS,
  TURRET_SIZE,
} from "./build-constants";
import { giveOrder } from "./orders";
import { gunBeams } from "./enemies";
import { shipHp } from "./ship";
import { travelSeconds } from "./motion";
import type { Bug, GateProject, Hive, Ship, ShipDesign, SimState } from "./state";

function hive(state: SimState) {
  const found = state.hives?.[0];
  if (!found) throw new Error("state has no hive");
  return found;
}

describe("hive", () => {
  it("hatches mostly one-Gun bugs, plus two- and four-Gun designs with pixel-scaled HP", () => {
    let state = createInitialState(17);
    state = tick(state, BUG_SPAWN_SECONDS * 30);
    const bugs = state.bugs!;
    const counts = bugs.map((bug) => bug.design!.slots.filter((slot) => slot === "Gun").length);
    expect(counts).toEqual(expect.arrayContaining([1, 2, 4]));
    const smallCount = counts.filter((count) => count === 1).length;
    expect(smallCount).toBeGreaterThan(counts.filter((count) => count === 2).length);
    expect(smallCount).toBeGreaterThan(counts.filter((count) => count === 4).length);
    for (const bug of bugs) {
      const pixels = bug.design!.slots.filter((slot) => slot !== null).length;
      expect(bug.maxHp).toBe(pixels * BUG_HP);
      expect(bug.hp).toBe(bug.maxHp);
    }
  });

  it("starts in the sector next to home, with full HP", () => {
    const state = createInitialState(7);
    expect(state.hives?.length).toBe(1);
    expect(hive(state).sectorId).toBe(HIVE_SECTOR);
    expect(hive(state).hp).toBe(HIVE_HP);
    expect(hive(state).maxHp).toBe(HIVE_HP);
  });

  it("releases a bug every BUG_SPAWN_SECONDS", () => {
    let state = createInitialState(7);
    state = tick(state, BUG_SPAWN_SECONDS);
    expect(state.bugs?.length).toBe(1);
    state = tick(state, BUG_SPAWN_SECONDS);
    expect(state.bugs?.length).toBe(2);
    // Halfway to the next hatch: still two.
    state = tick(state, BUG_SPAWN_SECONDS / 2);
    expect(state.bugs?.length).toBe(2);
  });

  it("spawns each bug in the hive's sector, from the hive", () => {
    let state = createInitialState(7);
    state = tick(state, BUG_SPAWN_SECONDS);
    const born = state.bugs![0]!;
    expect(born.sectorId).toBe(HIVE_SECTOR);
    expect(born.hiveId).toBe(hive(state).id);
    expect(born.hp).toBe(born.maxHp);
  });

  it("chooses bug size independently of its spawn direction", () => {
    const first = tick(createInitialState(2), BUG_SPAWN_SECONDS).bugs![0]!;
    const second = tick(createInitialState(6), BUG_SPAWN_SECONDS).bugs![0]!;
    const firstHive = hive(createInitialState(2));
    const secondHive = hive(createInitialState(6));
    const firstAngle = Math.atan2(first.position.y - firstHive.position.y, first.position.x - firstHive.position.x);
    const secondAngle = Math.atan2(second.position.y - secondHive.position.y, second.position.x - secondHive.position.x);

    expect(Math.floor(((firstAngle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)))
      .toBe(Math.floor(((secondAngle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)));
    expect(first.design?.slots.filter((slot) => slot === "Gun").length)
      .not.toBe(second.design?.slots.filter((slot) => slot === "Gun").length);
  });

  it("with fewer than 5 alive, bugs loiter by the hive and ignore ships", () => {
    // 40 seconds hatches four bugs (at 10, 20, 30 and 40 s), one short of the
    // attack threshold, and leaves them a few seconds of loitering each.
    let state = createInitialState(7);
    for (const dt of [10, 3, 27]) {
      state = tick(state, dt);
      for (const bug of state.bugs ?? []) {
        expect(bug.state).toBe("hovering");
        expect(Math.hypot(bug.position.x - hive(state).position.x, bug.position.y - hive(state).position.y))
          .toBeLessThanOrEqual(BUG_HOVER_RADIUS + 1e-9);
        // They ignore ships: they never leave the hive's sector, let alone
        // home in on the Dock across the gate.
        expect(bug.sectorId).toBe(HIVE_SECTOR);
      }
    }
    expect(state.bugs?.length).toBe(BUG_ATTACK_THRESHOLD - 1);
  });

  it("replays exactly from the seed", () => {
    const run = () => {
      let state = createInitialState(7);
      for (const dt of [10, 3, 37, 60, 121]) state = tick(state, dt);
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });

  it("sends ten bugs through a seeded random connected gate as one group", () => {
    const gateProjects: GateProject[] = [{
      id: 0,
      ends: [
        { sectorId: HIVE_SECTOR, position: { x: 10, y: 20 } },
        { sectorId: 2, position: { x: 30, y: 40 } },
      ],
      delivered: { Metal: 0, Ice: 0 },
      complete: true,
    }];
    const run = () => {
      let state = { ...createInitialState(7), gateProjects: [...gateProjects] };
      for (let i = 0; i < 10; i += 1) state = tick(state, BUG_SPAWN_SECONDS);
      return state;
    };
    const first = run();
    const second = run();
    expect(first).toEqual(second);
    expect(first.bugs).toHaveLength(10);
    expect(first.bugs?.every((bug) => bug.state === "invading")).toBe(true);
    expect(new Set(first.bugs?.map((bug) => bug.targetSectorId)).size).toBe(1);
    expect(first.bugs?.every((bug) => bug.sectorId === HIVE_SECTOR)).toBe(true);
  });

  it.each([2, 3, 4, 7])("replays destinations and migration timings across step sizes for seed %s", (seed) => {
    const gates: GateProject[] = [0, 2, 3].map((sectorId, id) => ({
      id, ends: [
        { sectorId: HIVE_SECTOR, position: { x: 100 + id * 80, y: 200 } },
        { sectorId, position: { x: 300, y: 400 } },
      ], delivered: { Metal: 0, Ice: 0 }, complete: true,
    }));
    const origin = hive(createInitialState(seed)).position;
    const arrivalEnd = 200 + Math.ceil(Math.max(...gates.map((gate) => travelSeconds(
      Math.hypot(gate.ends[0].position.x - origin.x, gate.ends[0].position.y - origin.y) + BUG_HOVER_RADIUS,
      BUG_SPEED_FACTOR,
    )))) + 4;
    const run = (dt: number) => {
      const snapshots = [];
      for (const end of [100, 115, 150, 200, arrivalEnd]) {
        let state: SimState = { ...createInitialState(seed), ships: [], gateProjects: gates };
        const steps = Math.floor(end / dt);
        for (let i = 0; i < steps; i += 1) state = tick(state, dt);
        if (end - steps * dt > 0) state = tick(state, end - steps * dt);
        snapshots.push({
          hives: state.hives!.map((hive) => ({ sectorId: hive.sectorId, spawnTimer: hive.spawnTimer })),
          bugs: state.bugs!.map((bug) => ({ id: bug.id, sectorId: bug.sectorId,
            targetSectorId: bug.targetSectorId, state: bug.state, timer: bug.timer })),
        });
      }
      return snapshots;
    };
    const large = run(200);
    expect(large[0]!.bugs.filter((bug) => bug.state === "invading")).toHaveLength(10);
    // The hive moved with the system's gate, but these player-built gates did
    // not. Both ten-bug groups are still travelling at the second departure.
    const migrating = large[3]!.bugs.filter((bug) => bug.sectorId === HIVE_SECTOR && bug.state === "invading");
    expect(migrating).toHaveLength(20);
    for (const firstId of [0, 10]) {
      const group = migrating.filter((bug) => bug.id >= firstId && bug.id < firstId + 10);
      expect(group).toHaveLength(10);
      expect(new Set(group.map((bug) => bug.targetSectorId)).size).toBe(1);
      expect(new Set(group.map((bug) => bug.timer)).size).toBe(1);
    }
    const arrived = large[4]!;
    expect(arrived.hives.some((hive) => hive.sectorId !== HIVE_SECTOR)).toBe(true);
    expect(arrived.bugs.some((bug) => bug.id < 10 && bug.sectorId === HIVE_SECTOR)).toBe(false);
    for (const dt of [1 / 60, 1]) {
      const stepped = run(dt);
      expect(stepped.map((s) => s.hives.map((h) => h.sectorId))).toEqual(large.map((s) => s.hives.map((h) => h.sectorId)));
      for (let i = 0; i < large.length; i += 1) {
        expect(stepped[i]!.bugs.map(({ timer, ...bug }) => bug)).toEqual(large[i]!.bugs.map(({ timer, ...bug }) => bug));
        stepped[i]!.bugs.forEach((bug, j) => expect(bug.timer).toBeCloseTo(large[i]!.bugs[j]!.timer, 7));
        stepped[i]!.hives.forEach((hive, j) => expect(hive.spawnTimer).toBeCloseTo(large[i]!.hives[j]!.spawnTimer, 7));
      }
    }
  });

  it("counts attack bugs per sector and keeps breeding after a group leaves", () => {
    const start = parkedStart(7).state;
    let state = tick(start, 40);
    const source = state.bugs!.map((bug) => ({ ...bug, timer: 0 }));
    const foreign = source.slice(0, BUG_ATTACK_THRESHOLD).map((bug, index) => ({
      ...bug, id: state.nextBugId! + index, sectorId: 0, timer: 0,
    }));
    state = tick({ ...state, bugs: [...source, ...foreign], nextBugId: state.nextBugId! + foreign.length }, 0);
    expect(state.bugs?.filter((bug) => bug.sectorId === HIVE_SECTOR && bug.state !== "invading")).toHaveLength(4);
    expect(state.bugs?.filter((bug) => bug.sectorId === HIVE_SECTOR).every((bug) => bug.state === "hovering")).toBe(true);

    const gateProjects: GateProject[] = [{
      id: 0,
      ends: [
        { sectorId: HIVE_SECTOR, position: { x: 10, y: 20 } },
        { sectorId: 2, position: { x: 30, y: 40 } },
      ],
      delivered: { Metal: 0, Ice: 0 },
      complete: true,
    }];
    state = tick({ ...createInitialState(7), gateProjects: [...gateProjects] }, 100);
    expect(state.bugs).toHaveLength(10);
    state = tick(state, BUG_SPAWN_SECONDS);
    expect(state.bugs?.filter((bug) => bug.state === "invading")).toHaveLength(10);
    expect(state.bugs?.filter((bug) => bug.state !== "invading")).toHaveLength(1);
  });

  it("crosses together, gathers visibly at the destination, then founds there", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const group = start.bugs!.filter((bug) => bug.state === "invading");
    const crossed = tick(start, Math.max(...group.map((bug) => bug.timer)) + 0.01);
    const gathering = crossed.bugs!.filter((bug) => bug.sectorId === destination);
    expect(gathering).toHaveLength(10);
    expect(gathering.every((bug) => bug.state === "gathering")).toBe(true);
    expect(crossed.hives!.some((hive) => hive.sectorId === destination)).toBe(false);
    const gate = invasionGate.ends.find((end) => end.sectorId === destination)?.position
      ?? start.sectors[destination]!.gate.position;
    expect(gathering.every((bug) => bug.leg?.to.x === gate.x && bug.leg.to.y === gate.y)).toBe(true);
    const founded = tick(crossed, 4);
    expect(founded.hives!.find((hive) => hive.sectorId === destination)).toMatchObject({ position: gate, hp: HIVE_HP, maxHp: HIVE_HP });
    expect(founded.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(0);
  });

  it("turns ten arrivals in an empty sector into a full new hive", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const state = arrive(start);
    const found = state.hives!.find((candidate) => candidate.sectorId === destination);

    expect(found).toMatchObject({ id: 1, sectorId: destination, hp: HIVE_HP, maxHp: HIVE_HP, alive: true });
    expect(state.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(0);
    expect(state.nextHiveId).toBe(2);
  });

  it("joins ten arrivals to a hive already in the destination sector", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const stateWithHive = {
      ...start,
      hives: [...start.hives!, {
        ...start.hives![0]!, id: 12, sectorId: destination,
        position: { ...start.sectors[destination]!.gate.position }, spawnTimer: 10000,
      }],
    };
    const state = arrive(stateWithHive);

    expect(state.hives!.filter((hive) => hive.sectorId === destination)).toHaveLength(1);
    expect(state.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(10);
    expect(state.bugs!.filter((bug) => bug.sectorId === destination).every((bug) => bug.hiveId === start.hives![0]!.id)).toBe(true);
  });

  // Replays about 530 s of game time one 1/60 s step at a time, roughly 32k
  // ticks, so it takes a couple of seconds with the file to itself and can
  // reach vitest's 5 s default on a loaded machine. A shorter window or a
  // coarser dt would change what it checks, so it gets its own limit instead.
  it.each([1 / 60, 1])("keeps joined groups resident through arrival and attacks at dt %s", (dt) => {
    let state = createInitialState(7);
    const homeGate = state.sectors[0]!.gate.position;
    const dock = homeStation(state).dock.position;
    // Allow the first hatch group, travel across Home, and a second chase
    // after joining. Watch a further hatch group while residents keep firing.
    const attackWindow = 10 * BUG_SPAWN_SECONDS + 2 * travelSeconds(
      Math.hypot(homeGate.x - dock.x, homeGate.y - dock.y) + BUG_HOVER_RADIUS, BUG_SPEED_FACTOR,
    );
    const end = attackWindow + 10 * BUG_SPAWN_SECONDS;
    const joined = new Set<number>();
    const bouncing = new Set<number>();
    let mostWaitingOffspring = 0;
    let sawBugShot = false;
    for (let step = 0; step < Math.ceil(end / dt); step += 1) {
      const previous = state;
      state = tick(state, dt);
      for (const bug of state.bugs!) {
        const before = previous.bugs!.find((candidate) => candidate.id === bug.id);
        if (before?.state === "invading" && bug.state !== "invading" && bug.state !== "gathering") joined.add(bug.id);
        if (joined.has(bug.id) && bug.state === "invading") bouncing.add(bug.id);
      }
      if (state.bugs!.some((bug) => bug.gunShot != null)) sawBugShot = true;
      for (const hive of state.hives!.filter((hive) => hive.alive)) {
        mostWaitingOffspring = Math.max(mostWaitingOffspring, state.bugs!.filter((bug) => bug.sectorId === hive.sectorId && bug.hiveId === hive.id
          && bug.state !== "invading" && bug.state !== "gathering").length);
      }
    }
    expect(joined.size).toBeGreaterThan(0);
    expect([...bouncing]).toEqual([]);
    expect(mostWaitingOffspring).toBeLessThan(10);
    expect(sawBugShot).toBe(true);
  }, 20_000);

  it("keeps ten arrivals with three residents until ten own offspring are alive", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const localHive = { ...start.hives![0]!, id: 12, sectorId: destination,
      position: { x: 80, y: 90 }, spawnTimer: 10000 };
    const residents = Array.from({ length: 3 }, (_, i) => plantedBug(100 + i, localHive, 80 + i * 10, 90));
    let state = arrive({ ...start, ships: [], stations: start.stations.map((station) => ({ ...station, sectorId: 3 })),
      hives: [...start.hives!, localHive],
      bugs: [...start.bugs!, ...residents], nextBugId: 103 });
    expect(state.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(13);
    expect(state.bugs!.some((bug) => bug.state === "invading")).toBe(false);
    state = tick(state, 30);
    const arrivals = state.bugs!.filter((bug) => bug.id < 10 && bug.sectorId === destination);
    expect(arrivals).toHaveLength(10);
    expect(new Set(arrivals.map((bug) => `${bug.position.x},${bug.position.y}`)).size).toBe(10);
    expect(arrivals.every((bug) => bug.state === "hovering" && bug.leg !== null)).toBe(true);
    state = { ...state, hives: state.hives!.map((hive) => hive.id === 12 ? { ...hive, spawnTimer: 10 } : hive) };
    state = tick(state, 60);
    expect(state.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(19);
    expect(state.bugs!.some((bug) => bug.state === "invading")).toBe(false);
    state = tick(state, 10);
    expect(state.bugs!.filter((bug) => bug.state === "invading")).toHaveLength(10);
    expect(state.bugs!.filter((bug) => bug.state === "invading").every((bug) => bug.hiveId === 12)).toBe(true);
    expect(state.bugs!.filter((bug) => bug.id < 10 && bug.sectorId === destination)).toHaveLength(10);
  });

  it("lets a hive founded by arrivals send ten of its own offspring", () => {
    let state = arrive(invasionStart());
    const founded = state.hives!.find((hive) => hive.id === 1)!;
    state = tick(state, 100);
    const departing = state.bugs!.filter((bug) => bug.sectorId === founded.sectorId && bug.state === "invading");
    expect(departing).toHaveLength(10);
    expect(departing.every((bug) => bug.hiveId === founded.id)).toBe(true);
  });

  it("joins ten arrivals to bugs already in the destination sector", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const resident = { ...start.bugs![0]!, id: 99, sectorId: destination, state: "hovering" as const, timer: 10000 };
    const state = arrive({ ...start, bugs: [...start.bugs!, resident] });

    expect(state.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(11);
    expect(state.hives!.filter((hive) => hive.sectorId === destination)).toHaveLength(0);
  });

  it("founded hives breed their first bug after ten seconds", () => {
    const start = arrive(invasionStart());
    const destination = start.hives!.find((candidate) => candidate.id === 1)!.sectorId;
    const state = tick(start, BUG_SPAWN_SECONDS);

    expect(state.bugs!.filter((bug) => bug.sectorId === destination)).toHaveLength(1);
    expect(state.bugs!.find((bug) => bug.sectorId === destination)!.hiveId).toBe(1);
  });

  it("loiters around a newly founded live hive instead of a dead hive in its sector", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const dead = { ...start.hives![0]!, id: 12, sectorId: destination,
      position: { x: 800, y: 900 }, hp: 0, alive: false };
    const founded = arrive({ ...start, hives: [...start.hives!, dead] });
    const live = founded.hives!.find((candidate) => candidate.alive && candidate.sectorId === destination)!;
    expect(live.id).toBe(1);
    const state = tick(founded, 2 * BUG_SPAWN_SECONDS);
    const offspring = state.bugs!.filter((bug) => bug.sectorId === destination);
    expect(offspring).toHaveLength(2);
    for (const bug of offspring) {
      expect(bug.hiveId).toBe(live.id);
      expect(bug.leg).not.toBeNull();
      expect(Math.hypot(bug.leg!.to.x - live.position.x, bug.leg!.to.y - live.position.y)).toBeLessThanOrEqual(BUG_HOVER_RADIUS);
    }
  });

  it("lets the first gathering group found while a second arrival joins it", () => {
    const start = invasionStart();
    const group = start.bugs!.filter((bug) => bug.state === "invading");
    const destination = group[0]!.targetSectorId!;
    const first = group.map((bug) => ({ ...bug, timer: 1 }));
    const second = group.map((bug) => ({ ...bug, id: bug.id + 100, timer: 3 }));
    const state = tick({ ...start, bugs: [...first, ...second], nextBugId: 200 }, 5);
    const founded = state.hives!.find((hive) => hive.sectorId === destination);
    expect(founded).toMatchObject({ hp: HIVE_HP, alive: true });
    expect(state.bugs!.filter((bug) => bug.id < 100)).toHaveLength(0);
    expect(state.bugs!.filter((bug) => bug.id >= 100)).toHaveLength(10);
    expect(state.bugs!.every((bug) => bug.hiveId === start.hives![0]!.id)).toBe(true);
  });

  it("keeps hive-less joiners with resident bugs instead of their old hive", () => {
    const start = invasionStart();
    const destination = start.bugs![0]!.targetSectorId!;
    const resident = { ...plantedBug(99, start.hives![0]!, 800, 900), sectorId: destination };
    const state = tick(arrive({ ...start, ships: [], bugs: [...start.bugs!, resident],
      stations: start.stations.map((station) => ({ ...station, sectorId: HIVE_SECTOR })) }), 5);
    const joined = state.bugs!.filter((bug) => bug.id !== resident.id && bug.sectorId === destination);
    expect(joined).toHaveLength(10);
    for (const bug of joined) {
      expect(bug.leg).not.toBeNull();
      expect(Math.hypot(bug.leg!.to.x - resident.position.x, bug.leg!.to.y - resident.position.y)).toBeLessThanOrEqual(BUG_HOVER_RADIUS);
    }
  });

  it("a founded hive hunts in its sector and can send another invasion", () => {
    const start = arrive(invasionStart());
    const found = start.hives!.find((candidate) => candidate.id === 1)!;
    const bugs = Array.from({ length: BUG_ATTACK_THRESHOLD }, (_, id) => ({
      ...start.bugs![0]!, id, hiveId: found.id, sectorId: found.sectorId,
      position: { x: found.position.x + 25, y: found.position.y }, state: "hovering" as const, timer: 0,
    }));
    const ship = { ...start.ships[0]!, id: start.nextShipId, state: "holding" as const,
      sectorId: found.sectorId, position: { x: found.position.x + 30, y: found.position.y },
      defaultBehaviour: "none" as const, order: null, target: null, leg: null, berth: null, transfer: null };
    const hunting = tick({ ...start, bugs, ships: [...start.ships, ship], nextBugId: 10 }, 0);

    expect(hunting.bugs!.filter((bug) => bug.sectorId === found.sectorId).every((bug) => bug.state === "hunting")).toBe(true);
    const invadingBugs = Array.from({ length: 10 }, (_, id) => ({ ...bugs[id % bugs.length]!, id, state: "hovering" as const, timer: 0 }));
    const invading = tick({ ...hunting, bugs: invadingBugs, nextBugId: 10 }, 0);
    expect(invading.bugs!.filter((bug) => bug.state === "invading")).toHaveLength(10);
  });

  it("replays two foundings exactly from a fixed seed", () => {
    const gates: GateProject[] = [2, 3].map((sectorId, id) => ({
      id,
      ends: [
        { sectorId: sectorId - 1, position: { x: id * 10 + 10, y: 20 } },
        { sectorId, position: { x: id * 10 + 30, y: 40 } },
      ],
      delivered: { Metal: 0, Ice: 0 }, complete: true,
    }));
    const run = () => {
      let state = { ...createInitialState(19), gateProjects: gates };
      for (const dt of [100, 20, 100, 20, 100, 20]) state = tick(state, dt);
      return state;
    };
    const first = run();
    const second = run();

    expect(first).toEqual(second);
    expect(first.hives!.length).toBeGreaterThanOrEqual(3);
  });
});

const invasionGate: GateProject = {
  id: 0,
  ends: [
    { sectorId: HIVE_SECTOR, position: { x: 10, y: 20 } },
    { sectorId: 2, position: { x: 30, y: 40 } },
  ],
  delivered: { Metal: 0, Ice: 0 },
  complete: true,
};

function invasionStart(): SimState {
  let state = tick({ ...createInitialState(7), gateProjects: [invasionGate] }, 100);
  state = tick({ ...state, hives: state.hives!.map((hive) => ({ ...hive, spawnTimer: 10000 })) }, 10);
  return state;
}

function arrive(state: SimState): SimState {
  const group = state.bugs!.filter((bug) => bug.state === "invading");
  const destination = group[0]!.targetSectorId!;
  const occupied = state.hives!.some((hive) => hive.alive && hive.sectorId === destination)
    || state.bugs!.some((bug) => bug.sectorId === destination);
  return tick(state, Math.max(...group.map((bug) => bug.timer)) + (occupied ? 0 : 4));
}

// A ship parked in the hive's sector, holding still with nothing queued, so
// every bug at the attack threshold has a target to fly at. It starts full of
// cargo, so its destruction takes the cargo with it.
function parkedStart(seed: number): { state: SimState; shipId: number } {
  const state = createInitialState(seed);
  const hive = state.hives![0]!;
  const shipId = state.nextShipId;
  const parked: Ship = {
    ...state.ships[0]!,
    id: shipId,
    state: "holding",
    timer: 0,
    sectorId: HIVE_SECTOR,
    position: { x: hive.position.x + 25, y: hive.position.y },
    defaultBehaviour: "none",
    order: null,
    target: null,
    leg: null,
    berth: null,
    transfer: null,
    cargo: 5,
    cargoByMaterial: { Metal: 5, Ice: 0 },
    cargoMaterial: "Metal",
  };
  return { state: { ...state, ships: [...state.ships, parked], nextShipId: shipId + 1 }, shipId };
}

describe("bugs hunt ships", () => {
  it("makes four-Gun hunters slower than one-Gun hunters", () => {
    const { state: start } = parkedStart(7);
    const enemy = hive(start);
    const makeSwarm = (design: (typeof BUG_DESIGNS)[number]) => Array.from({ length: BUG_ATTACK_THRESHOLD }, (_, id) => ({
      ...plantedBug(id, enemy, start.ships.at(-1)!.position.x + 100, start.ships.at(-1)!.position.y, 0),
      design,
    }));
    const small = tick({ ...start, bugs: makeSwarm(BUG_DESIGNS[0]!) }, 0).bugs![0]!;
    const large = tick({ ...start, bugs: makeSwarm(BUG_DESIGNS[2]!) }, 0).bugs![0]!;
    expect(large.timer).toBeGreaterThan(small.timer);
  });

  it("chases outside gun range and fires when the quarry is in range", () => {
    const { state: start, shipId } = parkedStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const enemy = hive(start);
    const bugs = Array.from({ length: BUG_ATTACK_THRESHOLD }, (_, id) =>
      plantedBug(id, enemy, ship.position.x + GUN_RANGE + 0.01, ship.position.y, 0));
    const next = tick({ ...start, bugs }, 0);
    expect(shipHp(next.ships.find((candidate) => candidate.id === shipId)!)).toEqual(shipHp(ship));
    expect(next.bugs!.every((bug) => bug.state === "hunting" && bug.leg !== null)).toBe(true);
    const touching = bugs.map((bug) => ({ ...bug, position: { x: ship.position.x + GUN_RANGE / 2, y: ship.position.y } }));
    const firing = tick({ ...start, bugs: touching }, 0);
    expect(firing.bugs!.every((bug) => bug.gunShot !== null && bug.gunShot !== undefined)).toBe(true);
    expect(shipHp(firing.ships.find((candidate) => candidate.id === shipId)!).hp).toBe(shipHp(ship).hp);
    const hit = tick(firing, GUN_SHOT_SECONDS);
    expect(shipHp(hit.ships.find((candidate) => candidate.id === shipId)!).hp)
      .toBe(shipHp(ship).hp - BUG_ATTACK_THRESHOLD * GUN_DAMAGE);
  });

  it("at 5 or more alive, bugs target a quarry in their sector", () => {
    const { state: start, shipId } = parkedStart(7);
    let state = { ...start, ships: start.ships.map((ship) => ship.id === shipId ? { ...ship, hp: 10_000, maxHp: 10_000 } : ship) };
    // Past the fifth hatch (at 50 s) and long enough for every bug to finish
    // whatever leg it was on, so all of them have had a chance to join in.
    // The shots over those 30 s only dent the hull, so the quarry is still up.
    for (const dt of [10, 3, 37, 30]) state = tick(state, dt);
    expect(state.bugs?.length).toBe(8);
    expect(state.bugs?.some((bug) => bug.state === "hunting" &&
      (bug.targetShipId === shipId || bug.targetModule?.stationId === homeStation(state).id))).toBe(true);
  });

  it("ignores ships docked inside a hangar when choosing a quarry", () => {
    const { state: start, shipId } = parkedStart(7);
    const carrier = { ...start.ships[0]!, id: shipId + 1, state: "holding" as const,
      sectorId: HIVE_SECTOR, position: start.ships.find((ship) => ship.id === shipId)!.position };
    const hidden = { ...start.ships.find((ship) => ship.id === shipId)!, state: "docked" as const, hangarId: carrier.id };
    let state: SimState = { ...start, ships: [carrier, hidden] };
    for (const dt of [10, 3, 37, 30]) state = tick(state, dt);
    expect(state.bugs?.every((bug) => bug.targetShipId !== hidden.id)).toBe(true);
  });

  it("bug shots wear a ship's shield or HP down from full", () => {
    const { state: start, shipId } = parkedStart(7);
    let state = start;
    // Just past the fifth hatch and the first shots.
    for (const dt of [10, 3, 37, 8]) state = tick(state, dt);
    const ship = state.ships.find((candidate) => candidate.id === shipId);
    expect(ship === undefined || shipHp(ship).hp < shipHp(ship).maxHp
      || (ship.shield ?? 0) < (ship.maxShield ?? 0)).toBe(true);
  });

  it("deals one player-Gun shot of damage per bug volley and lets shields soak it", () => {
    const { state: start, shipId } = parkedStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const shieldDesign: ShipDesign = { width: 2, height: 1, slots: ["Generator", "Capacitor"] };
    const shielded = { ...ship, design: shieldDesign, shield: 5, maxShield: 5 };
    const enemy = hive(start);
    const swarm = Array.from({ length: BUG_ATTACK_THRESHOLD }, (_, id) => ({
      ...plantedBug(id, enemy, ship.position.x + GUN_RANGE / 2, ship.position.y, 0),
      design: BUG_DESIGNS[2]!,
    }));
    let state = tick({ ...start, ships: start.ships.map((candidate) => candidate.id === shipId ? shielded : candidate), bugs: swarm }, 0);
    state = tick(state, GUN_SHOT_SECONDS);
    const damaged = state.ships.find((candidate) => candidate.id === shipId)!;
    expect(damaged.shield).toBe(0);
    expect(shipHp(damaged).hp).toBe(shipHp(shielded).hp - (BUG_ATTACK_THRESHOLD * GUN_DAMAGE - 5));
  });

  it("at 0 HP the ship explodes and it and its cargo are gone", () => {
    const { state: start, shipId } = parkedStart(7);
    // A few hundred seconds lets the swarm wear a SHIP_HP hull down and the
    // rest of the run tick on afterwards without one.
    let state = tick(start, 450);
    expect(state.ships.some((candidate) => candidate.id === shipId)).toBe(false);
    // The cargo went with the ship: nothing unloaded it into Home, which a run
    // without the parked ship confirms.
    const control = tick(createInitialState(7), 450);
    expect(homeStation(state).inventory).toEqual(homeStation(control).inventory);
    expect(homeStation(state).deliveries).toEqual(homeStation(control).deliveries);
    // Local bugs fall back to loitering; a new group may already be leaving.
    // Bugs that migrated to Home can legitimately still hunt its modules.
    expect(state.bugs?.some((bug) => bug.sectorId === HIVE_SECTOR && bug.state === "hovering")).toBe(true);
    for (const bug of state.bugs ?? []) {
      expect(bug.targetShipId).not.toBe(shipId);
      if (bug.sectorId === HIVE_SECTOR && bug.state !== "invading") expect(bug.state).toBe("hovering");
      if (bug.state === "hunting") {
        expect(bug.sectorId).toBe(homeStation(state).sectorId);
        // A chase retains its original quarry until its leg ends, even if
        // siblings have already killed that Home ship in the meantime.
        expect(bug.targetModule?.stationId === homeStation(state).id
          || bug.targetShipId === start.ships[0]!.id).toBe(true);
      }
    }
  });

  it("with no ship in their sector, bugs at the threshold keep loitering", () => {
    let state = createInitialState(7);
    for (const dt of [10, 3, 37, 30]) state = tick(state, dt);
    expect(state.bugs?.length).toBeGreaterThan(BUG_ATTACK_THRESHOLD);
    for (const bug of state.bugs ?? []) {
      expect(bug.state).toBe("hovering");
      expect(bug.targetShipId).toBe(null);
    }
  });

  it("hunting replays exactly from the seed", () => {
    const run = () => {
      let state = parkedStart(7).state;
      for (const dt of [10, 3, 37, 450]) state = tick(state, dt);
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });
});

describe("bugs hunt station modules", () => {
  it("keeps shooting after their hive dies", () => {
    const start = createInitialState(7);
    const enemy = start.hives![0]!;
    const module = { ...start.stations[0]!.modules[0]!, position: enemy.position, hp: 1000, maxHp: 1000 };
    const bugs = Array.from({ length: 7 }, (_, id) => plantedBug(id, enemy, enemy.position.x, enemy.position.y, 0));
    const hunting = tick({ ...start, ships: [], bugs,
      stations: [{ ...start.stations[0]!, sectorId: HIVE_SECTOR, modules: [module] }],
      hives: [{ ...enemy, spawnTimer: 10000 }] }, 0);
    const hp = hunting.stations[0]!.modules[0]!.hp!;
    const state = tick({ ...hunting, hives: [{ ...hunting.hives![0]!, alive: false, hp: 0 }] }, 10);
    expect(state.stations[0]!.modules[0]!.hp).toBeLessThan(hp);
    expect(state.bugs!.every((bug) => bug.state === "hunting")).toBe(true);
  });

  it("damages the nearest standing module once five bugs are alive", () => {
    const start = createInitialState(7);
    const hive = start.hives![0]!;
    const module = { ...start.stations[0]!.modules[0]!, position: { x: hive.position.x + 25, y: hive.position.y }, hp: 1000, maxHp: 1000 };
    let state: SimState = { ...start, stations: [{ ...start.stations[0]!, sectorId: HIVE_SECTOR, modules: [module] }] };
    for (const dt of [10, 3, 37, 8]) state = tick(state, dt);
    const damaged = state.stations[0]!.modules[0]!;
    expect(damaged.maxHp).toBe(1000);
    expect(damaged.hp).toBeLessThan(1000);
    expect(state.bugs?.every((bug) => bug.targetModule?.stationId === 0)).toBe(true);
  });

  it("does not target a module at zero HP", () => {
    const { state: start, shipId } = parkedStart(7);
    const module = { ...start.stations[0]!.modules[0]!, position: { x: start.hives![0]!.position.x + 5, y: start.hives![0]!.position.y }, hp: 0, maxHp: MODULE_HP };
    const state = tick({ ...start, stations: [{ ...start.stations[0]!, sectorId: HIVE_SECTOR, modules: [module] }] }, 58);
    expect(state.stations[0]!.modules[0]!.hp).toBe(0);
    expect(state.bugs?.some((bug) => bug.targetModule)).toBe(false);
  });
});

// A one-pixel gun ship parked in the hive's sector, holding still with nothing
// queued, so nothing about it moves and the guns do the only acting.
function gunStart(seed: number, spawnTimer = 10_000): { state: SimState; shipId: number; hive: Hive } {
  const state = createInitialState(seed);
  const hive = state.hives![0]!;
  const shipId = state.nextShipId;
  const gunner: Ship = {
    ...state.ships[0]!,
    id: shipId,
    state: "holding",
    timer: 0,
    sectorId: HIVE_SECTOR,
    position: { x: hive.position.x + 25, y: hive.position.y },
    design: GUN_SHIP,
    defaultBehaviour: "none",
    order: null,
    target: null,
    leg: null,
    berth: null,
    transfer: null,
  };
  return {
    state: {
      ...state,
      ships: [...state.ships, gunner],
      hives: [{ ...hive, spawnTimer }],
      nextShipId: shipId + 1,
    },
    shipId,
    hive: { ...hive, spawnTimer },
  };
}

// A bare Gun pixel. Valid on its own: a gun ship needs no engine for the gun
// tests, which park it still.
const GUN_SHIP: ShipDesign = { width: 1, height: 1, slots: ["Gun"] };

// An engine and a Gun, so the ship can actually be flown to the hive's sector.
const GUN_PATROL: ShipDesign = { width: 2, height: 1, slots: ["Engine", "Gun"] };

// A bug planted at an exact spot, holding still (no leg, timer far off), so a
// test aims the guns at a known point.
function plantedBug(id: number, hive: Hive, x: number, y: number, timer = 10_000): Bug {
  return {
    id,
    hiveId: hive.id,
    sectorId: hive.sectorId,
    position: { x, y },
    design: BUG_DESIGNS[0]!,
    hp: BUG_HP,
    maxHp: BUG_HP,
    state: "hovering",
    targetShipId: null,
    targetModule: null,
    leg: null,
    timer,
  };
}

describe("gun ships", () => {
  it("does not let a Gun docked inside a hangar fire", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const carrier = { ...start.ships[0]!, id: shipId + 1, state: "holding" as const,
      sectorId: HIVE_SECTOR, position: start.ships.find((ship) => ship.id === shipId)!.position };
    const hidden = { ...start.ships.find((ship) => ship.id === shipId)!, state: "docked" as const, hangarId: carrier.id };
    const state = tick({ ...start, ships: [carrier, hidden] }, 1);
    expect(state.hives![0]!.hp).toBe(hive.hp);
    expect(state.ships.find((ship) => ship.id === shipId)!.gunShot ?? null).toBeNull();
  });

  it("shoot the nearest bug in range on their own, and no other", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const near = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const far = plantedBug(1, hive, ship.position.x + 40, ship.position.y);
    let state: SimState = { ...start, bugs: [far, near] };
    state = tick(state, 1);
    expect(state.bugs!.find((bug) => bug.id === 0)!.hp).toBe(BUG_HP);
    state = tick(state, GUN_SHOT_SECONDS);
    const gunner = state.ships.find((candidate) => candidate.id === shipId)!;
    expect(gunner.gunTimer).toBe(GUN_SECONDS - GUN_SHOT_SECONDS);
    // The nearer bug took the shot; the other kept its full hull.
    expect(state.bugs!.find((bug) => bug.id === 1)!.hp).toBe(far.hp);
    expect(state.bugs!.find((bug) => bug.id === 0)!.hp).toBe(BUG_HP - GUN_DAMAGE);
    expect(gunBeams(state)).toEqual([]);
  });

  it("kill a bug in a few hits: BUG_HP over GUN_DAMAGE, rounded up", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const bug = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const hits = Math.ceil(BUG_HP / GUN_DAMAGE);
    let state: SimState = { ...start, bugs: [bug] };
    for (let hit = 1; hit < hits; hit += 1) {
      state = tick(state, GUN_SECONDS);
      expect(state.bugs!.length).toBe(1);
    }
    state = tick(state, GUN_SECONDS + GUN_SHOT_SECONDS);
    expect(state.bugs).toHaveLength(0);
  });

  it("shoot the hive when no bug is in range", () => {
    const { state: start, shipId, hive } = gunStart(7);
    // No bugs have hatched yet: the hive itself is the only target in range.
    let state = tick(start, 1);
    expect(state.hives![0]!.hp).toBe(HIVE_HP);
    state = tick(state, GUN_SHOT_SECONDS);
    const hiveState = state.hives![0]!;
    expect(hiveState.hp).toBe(HIVE_HP - GUN_DAMAGE);
    expect(hiveState.alive).toBe(true);
    expect(gunBeams(state)).toEqual([]);
  });

  it("leave everything out of range alone", () => {
    const { state: start, shipId, hive } = gunStart(7);
    // The ship sits a whole gun range off the hive, and the bug beyond that.
    const far: Ship = {
      ...start.ships.find((candidate) => candidate.id === shipId)!,
      position: { x: hive.position.x + GUN_RANGE + 5, y: hive.position.y },
    };
    let state: SimState = {
      ...start,
      ships: start.ships.map((candidate) => (candidate.id === shipId ? far : candidate)),
      bugs: [plantedBug(0, hive, hive.position.x + 2 * GUN_RANGE + 15, hive.position.y)],
    };
    state = tick(state, 1);
    state = tick(state, GUN_SHOT_SECONDS);
    expect(state.bugs![0]!.hp).toBe(BUG_HP);
    expect(state.hives![0]!.hp).toBe(HIVE_HP);
    const gunner = state.ships.find((candidate) => candidate.id === shipId)!;
    expect(gunBeams(state)).toEqual([]);
    expect(gunner.gunShot ?? null).toBeNull();
  });

  it("kill a dying hive dead, and it stops releasing bugs", () => {
    const { state: start, shipId, hive } = gunStart(7);
    // One shot's worth of hull left, so the next shot kills it.
    let state: SimState = { ...start, hives: [{ ...start.hives![0]!, hp: GUN_DAMAGE }] };
    state = tick(state, 1);
    state = tick(state, GUN_SHOT_SECONDS);
    expect(state.hives![0]!.alive).toBe(false);
    expect(state.hives![0]!.hp).toBe(0);
    // No matter how long the run goes on, no bug ever hatches again.
    for (let round = 0; round < 5; round += 1) {
      const before = (state.bugs ?? []).map((bug) => bug.id);
      state = tick(state, BUG_SPAWN_SECONDS);
      expect((state.bugs ?? []).map((bug) => bug.id)).toEqual(before);
    }
    // A dead hive is not a target either, so the guns go quiet.
    expect(gunBeams(state)).toEqual([]);
    expect(state.ships.find((candidate) => candidate.id === shipId)!.gunShot ?? null).toBeNull();
  });

  it("replay the whole fight exactly from the seed", () => {
    const run = () => {
      let state = gunStart(7, 10).state;
      for (const dt of [10, 3, 37, 120]) state = tick(state, dt);
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });

  it("a ship with Guns can be sent to the hive's sector with a move order", () => {
    let state = miningStart(7);
    state = {
      ...state,
      ships: state.ships.map((ship) => (ship.id === 0 ? { ...ship, design: GUN_PATROL, hp: 1000, maxHp: 1000 } : ship)),
    };
    const hive = state.hives![0]!;
    state = giveOrder(state, [0], { kind: "move", point: { x: hive.position.x + 60, y: hive.position.y }, sectorId: HIVE_SECTOR });
    expect(state.ships[0]!.order?.kind).toBe("move");
    // A cruise over the gate lands it in the hive's sector.
    state = tick(state, 200);
    expect(state.ships[0]!.sectorId).toBe(HIVE_SECTOR);
  });
});

describe("station Turrets", () => {
  it.each([0, 1])("does not mutate frozen station %s during a shot or destruction", (stationId) => {
    function clone<T>(value: T): T {
      if (Array.isArray(value)) return value.map(child => clone(child)) as T;
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)])) as T;
      return value;
    }
    function freeze(value: unknown): void {
      if (value && typeof value === "object") {
        Object.freeze(value);
        for (const child of Object.values(value)) freeze(child);
      }
    }
    const state = createInitialState(7);
    state.ships = [];
    state.moduleDestructions = [];
    const station = clone(state.stations[0]!);
    station.id = stationId;
    station.inventory = { Metal: 10, Ice: 0 };
    station.construction = null;
    station.buildQueue = [];
    station.modules.push({ type: "Turret", position: { x: 0, y: -MODULE_SPACING }, size: TURRET_SIZE });
    if (stationId === 0) state.stations = [station];
    else state.stations.push(station);
    const enemy = { ...state.hives![0]!, sectorId: 0, position: { x: 0, y: -70 }, spawnTimer: 10000 };
    state.hives = [enemy];
    const before = clone(state);
    freeze(state);
    const first = tick(state, 1 / 60);
    const second = tick(state, 1 / 60);
    expect(first).toEqual(second);
    expect(first.stations.find(s => s.id === stationId)!.inventory.Metal).toBe(9);
    expect(state).toEqual(before);

    const attacked = clone(first);
    // Keep the other station out of the attack's sector.
    for (const s of attacked.stations) if (s.id !== stationId) s.sectorId = 2;
    const storage = attacked.stations.find(s => s.id === stationId)!.modules[1]!;
    storage.hp = 1;
    attacked.bugs = Array.from({ length: 5 }, (_, id) => plantedBug(id, enemy, storage.position.x + BUG_BITE_RANGE / 2, storage.position.y, 0));
    const intact = clone(attacked);
    freeze(attacked);
      const destroyed = tick(attacked, GUN_SHOT_SECONDS);
    expect(destroyed.moduleDestructions).toHaveLength(1);
    expect(attacked).toEqual(intact);
      expect(tick(attacked, GUN_SHOT_SECONDS)).toEqual(destroyed);
  });

  function turretStart(): { state: SimState; modulePosition: { x: number; y: number }; hive: Hive } {
    const state = createInitialState(7);
    const hive = state.hives![0]!;
    const modulePosition = { x: hive.position.x + 25, y: hive.position.y };
    return {
      state: {
        ...state,
        stations: [{ ...state.stations[0]!, sectorId: HIVE_SECTOR, inventory: { Metal: 10, Ice: 0 },
          modules: [{ ...state.stations[0]!.modules[0]!, type: "Turret", position: modulePosition, hp: MODULE_HP, maxHp: MODULE_HP }] }],
        hives: [{ ...hive, spawnTimer: 10_000 }],
        bugs: [],
      },
      modulePosition,
      hive,
    };
  }

  it("fires at a bug in range, reports its beam, spends Metal, and damages the bug", () => {
    const { state: start, modulePosition, hive } = turretStart();
    const bug = plantedBug(0, hive, modulePosition.x + 20, modulePosition.y);
    let state = tick({ ...start, bugs: [bug] }, 1);
    expect(state.stations[0]!.inventory.Metal).toBe(10 - TURRET_METAL_PER_SHOT);
    expect(state.stations[0]!.modules[0]!.turretShot).toMatchObject({ target: { kind: "bug", id: 0 } });
    expect(state.stations[0]!.modules[0]!.turretShot?.timer).toBe(TURRET_SHOT_SECONDS);
    expect(gunBeams(state)).toContainEqual({ from: modulePosition, to: bug.position });
    state = tick(state, TURRET_SHOT_SECONDS);
    expect(state.bugs![0]!.hp).toBe(BUG_HP - TURRET_DAMAGE);
  });

  it("can kill a bug with a Turret", () => {
    const { state: start, modulePosition, hive } = turretStart();
    const bug = { ...plantedBug(0, hive, modulePosition.x + 20, modulePosition.y), hp: TURRET_DAMAGE, maxHp: TURRET_DAMAGE };
    let state = tick({ ...start, bugs: [bug] }, 1);
    state = tick(state, TURRET_SHOT_SECONDS);
    expect(state.bugs).toEqual([]);
    expect(state.drops).toHaveLength(1);
  });

  it("shoots the hive when no bug is in range", () => {
    const { state: start, modulePosition, hive } = turretStart();
    let state = tick(start, 1);
    expect(state.stations[0]!.modules[0]!.turretShot?.target).toEqual({ kind: "hive", id: hive.id });
    state = tick(state, TURRET_SHOT_SECONDS);
    expect(state.hives![0]!.hp).toBe(hive.hp - TURRET_DAMAGE);
    expect(state.stations[0]!.inventory.Metal).toBe(10 - TURRET_METAL_PER_SHOT);
  });

  it("stops firing and reports no Metal", () => {
    const { state: start, modulePosition, hive } = turretStart();
    const state = tick({ ...start, stations: [{ ...start.stations[0]!, inventory: { Metal: TURRET_METAL_PER_SHOT - 1, Ice: 0 } }],
      bugs: [plantedBug(0, hive, modulePosition.x + TURRET_RANGE / 2, modulePosition.y)] }, 1);
    expect(state.stations[0]!.modules[0]!.turretShot ?? null).toBeNull();
    expect(state.stations[0]!.modules[0]!.turretNoMetal).toBe(true);
  });

  it.each(["no target", "reload", "in flight"])("reports insufficient Metal with %s", (setup) => {
    const { state: start } = turretStart();
    start.stations[0]!.inventory.Metal = TURRET_METAL_PER_SHOT / 2;
    if (setup === "no target") start.hives = [];
    if (setup === "reload") start.stations[0]!.modules[0]!.turretTimer = 1;
    if (setup === "in flight") start.stations[0]!.modules[0]!.turretShot = {
      from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, target: { kind: "hive", id: 0 }, timer: TURRET_SHOT_SECONDS,
    };
    const state = tick(start, 1 / 60);
    expect(state.stations[0]!.modules[0]!.turretNoMetal).toBe(true);
    expect(state.stations[0]!.inventory.Metal).toBe(TURRET_METAL_PER_SHOT / 2);
  });

  it("deals one player-Gun shot of damage to modules regardless of bug size", () => {
    const { state: start, modulePosition, hive } = turretStart();
    let state = start;
    const bugs = Array.from({ length: 5 }, (_, id) => ({
      ...plantedBug(id, hive, modulePosition.x + 1, modulePosition.y, 0),
      design: BUG_DESIGNS[2]!,
    }));
    state = tick({ ...state, bugs, stations: [{ ...state.stations[0]!, inventory: { Metal: 0, Ice: 0 } }] }, GUN_SHOT_SECONDS);
    expect(state.stations[0]!.modules[0]!.hp).toBe(MODULE_HP - BUG_ATTACK_THRESHOLD * GUN_DAMAGE);
  });
});

describe("drops", () => {
  it("a shot bug keeps floating until a hit kills it, and then leaves 1 bug juice where it died", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const bug = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const hits = Math.ceil(BUG_HP / GUN_DAMAGE);
    let state: SimState = { ...start, bugs: [bug] };
    // Every hit but the last only dents the hull: no drop, bug still up.
    for (let hit = 1; hit < hits; hit += 1) {
      state = tick(state, GUN_SECONDS);
      expect(state.drops).toEqual([]);
      expect(state.bugs).toHaveLength(1);
    }
    // The killing shot: the bug is gone and its juice floats in its place.
    state = tick(state, GUN_SECONDS + GUN_SHOT_SECONDS);
    expect(state.bugs).toHaveLength(0);
    expect(state.drops).toEqual([{ id: 0, sectorId: HIVE_SECTOR, kind: "bugJuice", position: { ...bug.position } }]);
  });

  it("each dead bug leaves its own drop", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    // Two planted bugs the same distance apart as one: the nearer (lower id
    // wins the tie, and here they tie) falls first.
    const near = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const far = plantedBug(1, hive, ship.position.x + 40, ship.position.y);
    let state: SimState = { ...start, bugs: [far, near] };
    for (let hits = 0; hits < Math.ceil(2 * BUG_HP / GUN_DAMAGE); hits += 1) state = tick(state, GUN_SECONDS + GUN_SHOT_SECONDS);
    expect(state.bugs).toHaveLength(0);
    expect(state.drops).toEqual([
      { id: 0, sectorId: HIVE_SECTOR, kind: "bugJuice", position: { ...near.position } },
      { id: 1, sectorId: HIVE_SECTOR, kind: "bugJuice", position: { ...far.position } },
    ]);
  });

  it("a killed hive leaves 1 queen larvae where it stood, and it stays", () => {
    const { state: start, hive } = gunStart(7);
    // One shot's worth of hull left, so the next shot kills it.
    let state: SimState = { ...start, hives: [{ ...start.hives![0]!, hp: GUN_DAMAGE, spawnTimer: 1000 }] };
    state = tick(state, 1);
    state = tick(state, GUN_SHOT_SECONDS);
    expect(state.hives![0]!.alive).toBe(false);
    expect(state.drops).toEqual([{ id: 0, sectorId: HIVE_SECTOR, kind: "queenLarvae", position: { ...hive.position } }]);
    // Nothing collects the larvae: it is still floating much later.
    state = tick(state, BUG_SPAWN_SECONDS * 3);
    expect(state.drops).toEqual([{ id: 0, sectorId: HIVE_SECTOR, kind: "queenLarvae", position: { ...hive.position } }]);
  });

  it("drops replay exactly from the seed", () => {
    const run = () => {
      const start = gunStart(7);
      const ship = start.state.ships.find((candidate) => candidate.id === start.shipId)!;
      const seeded: SimState = {
        ...start.state,
        hives: [{ ...start.state.hives![0]!, hp: GUN_DAMAGE }],
        bugs: [plantedBug(0, start.state.hives![0]!, ship.position.x + 20, ship.position.y)],
      };
      const run = () => {
        let state = seeded;
        for (const dt of [1, 2, 4, 8]) state = tick(state, dt);
        return JSON.stringify(state);
      };
      return run() === run();
    };
    expect(run()).toBe(true);
  });
});
