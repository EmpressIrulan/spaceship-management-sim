import { GATE_COST, cargoByMaterial, type SimState } from "./state";

type GateCargoState = Pick<SimState, "gateProjects" | "ships">;

export function gateOutstanding(state: GateCargoState, gateId: number, material: "Metal" | "Ice", shipId: number): number {
  const project = state.gateProjects.find((candidate) => candidate.id === gateId);
  if (!project) return 0;
  return GATE_COST[material] - project.delivered[material]
    - state.ships.reduce((sum, other) => {
      if (other.id === shipId || other.order?.kind !== "haulGate" || other.order.gateId !== gateId) return sum;
      if ((other.state === "berthing" || other.state === "waiting" || other.state === "loading")
        && other.transfer?.startingCargo === 0) return other.cargoMaterial === material ? sum + other.transfer.amount : sum;
      return other.state === "gateHauling" || other.state === "gateUnloading" ? sum + cargoByMaterial(other)[material] : sum;
    }, 0);
}
