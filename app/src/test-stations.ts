import { CONSTRUCTION_SITE_SIZE, DOCK_CAPACITY, DOCK_SIZE, MODULE_SPACING, STORAGE_CAPACITY, STORAGE_SIZE, type Material, type Station } from "sim";

// A founded station that stands on its own Dock and Storage in `sectorId`,
// for tests of hauling and panels that need a second stop without playing the
// whole founding loop. `x` is the middle of the module pair, like a site's.
export function foundedStation(id: number, sectorId: number, x: number, y: number, inventory: Record<Material, number> = { Metal: 0, Ice: 0 }): Station {
  const dock = { x: x - MODULE_SPACING / 2, y };
  return {
    id,
    name: id === 0 ? "Home" : `Station ${id}`,
    founding: false,
    sectorId,
    dock: { position: dock, size: DOCK_SIZE, capacity: DOCK_CAPACITY },
    storage: { position: { x: x + MODULE_SPACING / 2, y }, size: STORAGE_SIZE, capacity: STORAGE_CAPACITY },
    inventory: { ...inventory },
    constructionSite: { position: { x, y }, size: CONSTRUCTION_SITE_SIZE, inventory: { Metal: 0, Ice: 0 } },
    storageLimits: { Metal: null, Ice: null },
    deliveries: [],
    modules: [
      { type: "Dock", position: dock, size: DOCK_SIZE },
      { type: "Storage", position: { x: x + MODULE_SPACING / 2, y }, size: STORAGE_SIZE },
    ],
    construction: null,
    buildQueue: [],
    shipBuilds: [],
  };
}
