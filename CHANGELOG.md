# Changelog

## 0.2.0

### Added

- When the slot disappears while the game runs, Whiteout offers to restore the copy it kept: the slot opens with full health and needs and every affliction cured, and Save to game puts it back. The command palette has the same action for later
- A Journal tab that shows the slot's journal as charts: condition, world explored, calories burned, hours rested, afflictions by day, days per region, most visited places and the slot totals, each with hover details and a table view. A Wildlife section estimates attacks from wounds and shows the cougar threat per region. In the desktop app the Journal also shows a gallery of the slot's camera photos
- Tales on the More tab: Signal Void, Buried Echoes and Last Horizon with their objectives in game order, a progress bar and the item counters the game keeps
- A Feats card with all 13 feats, using the ids the game itself uses, and the difficulty's feat limit
- Prepper caches on the More tab: which caches are stocked or abandoned, which region they are in and whether you have been inside. Force reveal marks the known hatches as visited and opens every region on the map (not tried in the game yet)
- Sticks and stones on the More tab: how many spawners wait to respawn in each region and when, with a Respawn now button (not tried in the game yet)
- Inventory weights for every item, read from the game files. Water and powders are weighed by their amount
- Undo and redo buttons in the header
- Units after the game stats
- The Trader card shows when a trade has been completed in the slot

### Changed

- The More tab is split into Body, Tales, World, Feats, Trader and Stats
- Afflictions shows injuries and illnesses side by side, the raw illness values are behind Raw values
- The Trader is marked Beta and shows an Experimental notice when you open it
- The Player tab is laid out evenly and Calories has a slider like the other needs
- Well fed no longer has an editable hours field, the switch sets the value the game accepts
- Shorter texts across the app and wider, heavier headings

### Fixed

- The Journal left out days in Mountain Town, Sundered Pass, Forsaken Airfield, Transfer Pass, Zone of Contamination and Far Range Branch Line
- Two feat ids were wrong, so Straight to the Heart and Night Walker could not be turned on
- The Teleport tab could show "null" and say a region has no map after the game saved
- The Map button no longer moves left when Follow player appears

## 0.1.0

The first release. Edit your Long Dark saves on Windows, macOS and Linux with a backup before every save, a list of changes before writing, a map with your position and pins, loadouts, and a data folder that can sync through the cloud. Map images load from Steam and the update check asks before it ever runs.

### Included

- A More tab: Well fed, nutrition, illnesses, missions, transmitters and game stats
- A Trader card on the More tab: trust, the agreed trade and this aurora's offers with their prices
- Map remote: a global hotkey (default Ctrl+Alt+W, changeable in Settings) with number keys for teleport picks
- A search box shared by every tab, press / to focus it
- Maps and positions for Zone of Contamination, Forsaken Airfield, Transfer Pass, Far Range Branch Line, Blackrock and Winding River
- The map shows how long ago you were at your last saved position, since the game only updates the save when it saves
- docs/MORE-FEATURES.md lists what every More tab feature writes to the save
