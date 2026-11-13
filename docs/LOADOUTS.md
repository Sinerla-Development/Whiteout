# Making loadout files for Whiteout

A loadout is a named list of items that Whiteout adds to the inventory of the open save in one click. You can write one by hand, or let an AI assistant (ChatGPT, Claude, Gemini and so on) write it for you. This page tells the assistant exactly what to produce.

**Using an AI assistant:** attach or paste this whole page and the file `loadout-items.csv` from the same folder, then say what you want, for example "a cold weather clothing loadout for Interloper". Copy the JSON it gives you into a file called `whiteout-loadouts.json`, then import it (see "Importing" at the end).

---

## Instructions for the AI assistant

You write a JSON file that Whiteout, a save editor for The Long Dark, can import. Follow these rules exactly.

1. Output **only valid JSON** in one code block, with no comments, no trailing commas and no text inside the block that is not part of the file.
2. Use **only item ids that appear in `loadout-items.csv`** (the `id` column). Never invent, shorten or translate an id. If you cannot find a fitting item in the list, leave it out and say so outside the code block. Ids are case sensitive. **Do not derive an id from the item's name**: the id often differs from the English name. For example the Hunting Rifle is `GEAR_Rifle`, the Whetstone is `GEAR_SharpeningStone`, and the Distress Pistol is `GEAR_FlareGun`. Always look the name up in the CSV and copy the id from that row.
3. Follow the limits and value rules below. Count the items before you answer.
4. Choose the quantity by the item's `amount_kind` from the CSV (see the table). Getting this wrong gives empty cans, wrong stack sizes or hundreds of copies.
5. If you are not sure whether an item exists or what it does, say so. Do not guess ids.
6. If the person has not said what the loadout is for, ask one short question or state the assumption you made.

### File format

```json
{
  "format": "whiteout-loadouts",
  "version": 1,
  "loadouts": [
    {
      "name": "Starter kit",
      "note": "Short description, optional",
      "items": [
        { "id": "GEAR_Knife", "qty": 1, "cond": 100 },
        { "id": "GEAR_Hatchet", "qty": 1, "cond": 100 },
        { "id": "GEAR_BedRoll", "qty": 1, "cond": 100 },
        { "id": "GEAR_WoodMatches", "qty": 10, "cond": 100 },
        { "id": "GEAR_CannedBeans", "qty": null, "cond": 100 },
        { "id": "GEAR_CannedBeans", "qty": null, "cond": 100 },
        { "id": "GEAR_Water1000ml", "qty": null, "cond": 100 }
      ]
    }
  ]
}
```

Top level:

| Field | Value |
|---|---|
| `format` | Must be exactly `"whiteout-loadouts"` |
| `version` | `1` |
| `loadouts` | Array of loadouts, at most 100 |

Each loadout:

| Field | Rule |
|---|---|
| `name` | Text, 1 to 40 characters, required. If a loadout with the same name already exists in the app, Whiteout renames the import (for example "Starter kit 2") |
| `note` | Text, at most 500 characters, optional (use `""` for none) |
| `items` | Array of item rows, **1 to 80 rows**. Rows past the 80th are dropped |

Each item row:

| Field | Rule |
|---|---|
| `id` | Item id from `loadout-items.csv`, for example `GEAR_Knife`. Only letters, digits and underscore, at most 80 characters |
| `qty` | A number from 0 to 1000000, or `null`. What it means depends on the item, see the next table |
| `cond` | Condition in percent, a whole number from 1 to 100, or `null`. `null` means 100 (new) |

### What `qty` means

Look up the item's `amount_kind` in the CSV.

| `amount_kind` | `qty` is | `null` means | Examples |
|---|---|---|---|
| `count` | Number of separate copies, 0 to 100 | 1 copy | Hunting Knife, Hatchet, Bedroll, Hunting Rifle, all clothing |
| `stack` | Size of **one** stack of that item | The game's default stack | Wood Matches, Rifle Cartridge, Cedar Firewood, Bandage |
| `kcal` | Calories of **one** item | A full item | Pork and Beans, other food |
| `liters` | Liters in **one** item | A full item | Water Bottle, Storm Lantern |

Important consequences:

- For `kcal` and `liters` items **one row makes one item**. To get three cans of beans, write three rows with the same id (and `"qty": null`). Do not put `3` in `qty`: that would be a can with 3 calories.
- For `stack` items one row makes one stack. A stack larger than the game allows is not meaningful, so keep it reasonable (for example 10 matches, 20 cartridges).
- For `count` items `qty` is how many copies to add. `"qty": 2` gives two items.
- `cond` below 100 gives worn items. Leave it at 100 or `null` unless the person asks for worn gear.

### Choosing good items

Think about what the loadout is for and cover each need once before adding extras: cutting, fire, light, shelter, cooking and water, food that needs no cooking, first aid. Do not add filler. Some specific rules:

- **Clothing is layered, and the game wears one item per slot** (hat, scarf or face, gloves, socks, boots, base layer, mid layer, coat, pants). Whiteout adds every item you list and does not check slots, so do not list two coats or two pairs of boots unless a spare is wanted. Spare socks and gloves are fine.
- **Weapons need their ammunition**: a rifle needs `GEAR_RifleAmmoSingle` or an ammunition box, a bow needs arrows.
- The list has names in English that match the game. Match the person's words to the `name` column and copy the `id` from the same row.
- The CSV holds the gear categories only (Tools, FirstAid, Materials, Books, Food, Clothing). Collectibles and internal items are not included because they do not belong in a loadout.

### Check before you answer

- [ ] The JSON parses (quotes, commas and brackets are right)
- [ ] `format` is `"whiteout-loadouts"` and `version` is `1`
- [ ] Every `id` is copied from the CSV
- [ ] No loadout has more than 80 rows, and each has at least 1
- [ ] Names are at most 40 characters and notes at most 500
- [ ] `kcal` and `liters` items use `null` or a sensible per item amount, and repeated rows for several items
- [ ] `cond` is `null` or 1 to 100

---

## Importing

1. Save the JSON as a file, for example `whiteout-loadouts.json`.
2. In Whiteout open **Loadouts**, then choose **Import from file** and pick the file.
3. Open a save, open the loadout and choose **Add to inventory**. Whiteout shows a preview of what will be added before it does anything. Items that are not supported in the open save are listed as skipped.
4. Save to the game as usual. Loadouts add items, they never remove anything.

If the app says "This file is not a loadout file", check `format` and that the JSON is valid.

## The item list

`loadout-items.csv` has one row per item: `id`, `name`, `category`, `amount_kind`. It is generated from the item data in `ui/data.js`, so it matches what the app knows. When a game update adds items, regenerate it from that file.
