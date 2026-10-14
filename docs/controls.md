# Controls

Everything the game accepts, as it works today. The two screens are the space view around your station and the sector map you open with M.

See also: [design.md](design.md) for how the game is put together, and the [README](../README.md) for how to run it.

## Space view: mouse

| Action | What it does |
| --- | --- |
| Left-click a ship | Select it and open the ship panel. |
| Shift-left-click a ship | Add it to the selection, or take it back out. |
| Left-drag on empty space | Draw a selection box; every free ship inside is selected. Hold Shift to add to the ships already selected. A drag of 4 pixels or less counts as a click. |
| Left-click a Dock | Opens that station's panel (rename, remove). |
| Left-click a Storage module | Opens or closes the storage panel. |
| Left-click a Builder module | Opens the ship builder menu. |
| Left-click a queued build outline | Opens the info box for it, which has a Cancel button. |
| Double-click a Dock | Flies the camera in close to that station. |
| Right-click with ships selected | Gives an order, depending on what you clicked: an asteroid means mine it, your station's Dock means fly home, a building site means deliver supplies to that station, an unfinished gate means haul Metal and Ice to the gate end, anything else means move there. |
| Right-click an enemy carrier ship | The selected ships fly to it and dock inside its hangar. |
| Right-click empty space with nothing selected | Opens a small menu: "Build station here", which plants a new station site where you clicked, ships then supply it; or "Build gate here". |
| Middle-drag or right-drag | Pan the camera. |
| Mouse wheel | Zoom toward the cursor. |

Clicking away from any open menu closes it, and so does Escape.

## Space view: keyboard

- W A S D or the arrow keys: pan the camera while held.
- Space: pause and unpause.
- 1, 2, 3: game speed 1x, 2x, 4x; picking a speed also unpauses.
- M: open or close the sector map.
- Escape: close the map, the build menu, the gate menu, or the ship builder.

None of these fire while you are typing in a text box, and held keys do not repeat, so holding Space will not flicker pause.

Pause, 1x, 2x and 4x buttons also sit on screen and do the same as the keys.

## Hovering

Hovering almost anything pops up an info box by the cursor.

- Ships: what the ship is doing right now, plus shield and hull points once it has been in a fight. A ship with a hangar shows its capacity and how many ships are docked inside, and the box gets a Launch all button.
- A Dock: how much of its area is used and how many ships are inside; a Dock module also shows its pixel size and health.
- Storage: what is stored out of capacity for each material, and income rates.
- A building site: its Metal and Ice inventory.
- A module being built: seconds left; a queued module shows what it still needs and gets a Cancel button.
- Asteroids: their material and how much ore is left; rich ones say so.
- Gates: which sector a finished gate leads to, or how much Metal and Ice a half-built one has received.
- Bugs and hives: their hit points; the drops they leave behind say nothing collects them yet.

Hovering the info box keeps it pinned so you can reach its buttons. Hovering the Cancel button on a queued build highlights every other queued module that would be cancelled along with it. Hovering near a station reveals floating + buttons on every free slot around its modules; click one to open the build menu there.

The build menu lists each module with its cost in Metal and Ice. A module you cannot pay for yet is greyed out with "Needs X more Metal" hover text. Choosing Dock opens a size form: width and height boxes (4 pixels minimum), the cost for that size, and a Build button. Invalid sizes keep the button disabled.

## Building ships (the Builder menu)

Clicking a Builder module opens the ship builder.

- Module buttons: the module your brush paints with. Engine, Laser, Storage, Hangar, Hull, Gun, Capacitor, Generator.
- Brush sizes 1, 3 and 5 px, plus Eraser and Fill; Fill paints the whole canvas with the chosen module.
- Paint canvas: left-drag paints, right- or middle-drag pans the view, wheel zooms. Tooltips show which module is under the cursor.
- Blueprint name and Save: snapshot the current design. Saved blueprints list below with Load and Delete for each.
- Queue: adds the design to the station's ship build queue, in the batch size set with the count minus and plus buttons. Queueing costs nothing; the station buys the materials when its turn comes. The stats show speed, hold size and mining time, and the cost turns red where materials run short.
- Cancel, next to each line in the build queue list.

## Ship panel

Selecting a ship, or several, opens the ship panel.

- Home: which station the ship belongs to and unloads at. Choosing a station the ship cannot dock at reports the refusal, and the ship keeps its old home.
- Default: what the ship does between orders. Mine for Station, Supply construction site, Haul, or None. With several ships selected, a Mixed line appears when they do not agree. Haul is greyed out with the reason given when it cannot be used.
- From, To, Material: the haul route. Shown while the default is Haul. Stations on the first, storage destinations on the second, Metal or Ice on the third.
- Material: whether the ship mines Metal, Ice, or both. Shown for mining ships.
- Mine in other sectors: whether the miner may wander to other sectors when home runs out. With a mixed selection the checkbox shows that too.
- Resume: stops whatever order the ship was given and sends it back to its default behaviour. Disabled when no ship in the selection is carrying an order.
- Launch all: carriers only; releases everything docked inside.

The rest of the panel is read-only: status lines, cargo and timers, a drawing of the ship and its module list.

## Storage and station panels

- Storage panel: one row per material showing what is stored, a Limit box (blank means no limit), and a Delete button with an amount box. Delete asks for confirmation by changing to Confirm for a moment; a second click removes the stock.
- Station panel: click a Dock to open. Rename the station with the box and Rename button. Remove station also needs a second click to confirm. Removing a station clears it as the home of its ships; those ships hold in place until given a new home.

## Sector map

Press M. The map shows every sector as a circle, lines between sectors joined by gates, and how many of your ships are in each.

- Click a circle to move the camera to that sector and close the map.
- A sector whose station has a finished Claim module shows Claimed, with a rename label under its ship count, and hovering the circle gives a summary of what is there. Click the label to rename the sector; Enter confirms, Escape cancels.
- Building a gate takes three clicks: right-click where one gate end should stand and pick Build gate here, then click the other sector on the map (it must sit within gate range of the first), then click inside that sector where the second end should stand. The gate ends then wait for haulers to bring Metal and Ice, which you order with a right-click on the gate.
- When a Claim finishes building, the map opens by itself with the rename box ready for the new sector's name.
