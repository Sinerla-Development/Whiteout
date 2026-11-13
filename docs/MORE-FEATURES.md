# What the More tab changes

This page lists every feature on the More tab (and the illness card on the Injuries tab), the save fields it writes and what was left out.

Every feature below has been tried in the game. Features that were not confirmed to work are not in this version.

One thing to know about the save format: the game leaves out values that are at their default. A flag that is `false` is simply missing, so a field Whiteout writes may never appear in a save until it is `true`.

## Features

| Feature | Fields | Risk |
|---------|--------|------|
| Well fed on / off | `m_WellFedSerialized.m_Active`, `m_ElapsedHoursNotStarving`; turning it on also `m_Hunger_Serialized.m_NumHoursStarving`, `m_StarvingInLog` if present | Low |
| Nutrition (vitamin C) | `m_PlayerNutritionSerialized.m_Amounts[i]`, `m_LossPerDay[i]` | Low. A stored amount of 0 should start scurvy risk |
| Illness fields | Numbers and flags in the hypothermia, scurvy, food poisoning, dysentery, intestinal parasites, headache, insomnia, burns, electric burns, suffocation, fear, anxiety and chemical poisoning sections | Medium. Most fields are bookkeeping, for example `m_ElapsedWarmTime` and `m_DayToAllowNextDose` |
| Clear illness / Clear all illnesses | Empties every list in the section and sets `m_IsActive` / `m_Active` to false | Medium. Parallel lists are emptied together, which is safe |
| Game stats | `m_PlayerGameStatsSerialized.*` (calories, body temperature, distance, condition, calories today) | Low. These are counters shown in the journal |
| Story mission active | `m_StoryMissionDataSerialized.m_MissionInfo[*].isActive` | Medium. The journal and the mission graph in `m_SandboxManagerSerialized.m_SerializedMissions` can disagree |
| Objective completed / Complete all objectives | `m_StoryMissionDataSerialized.m_ObjectiveInfo[*].completed` | Medium, same reason |
| Transmitters | `m_TransmitterSerialized[guid].m_IsDiscovered`, `m_IsFixed`, `m_IsOpen`, `m_RepairableItems[*].m_IsRepaired` | Medium. A fixed transmitter with an open objective |
| Trader trust | `m_TraderSerialized.m_CurrentTrust`, `m_HighestTrust` | Medium. The valid trust range is unknown |
| Trader offers and agreed trade | Shown read only | None |

## Left out until they are tested

These existed in the earlier development version and are not in this one: wind speed and direction, weather progress, achievement progress, unlocked and cooked recipes, blueprints, feats enabled, the bear hunt list, the carry load note, and the map Reveal / Hide and Regions unlocked controls. They come back when each one has been confirmed in the game.

## Trader

Read from a sandbox slot at day 64 where the Trader has been reached, nine exchanges are on offer and one trade has been agreed but nothing has been handed over yet. Older backups of the same slot (day 33 and 34, before any contact) give the "before" state.

### Structure

```
m_TraderSerialized
  m_SystemEnabled                    true
  m_CurrentTrust                     3      missing before first contact
  m_HighestTrust                     3      missing before first contact
  m_ContactsThisAurora               1      missing before first contact
  m_HasInterruptedPlayerPassingTime  true   missing before first contact
  m_LastAuroraNum                    11     missing before first contact
  m_UnlockedExchangeNames            []
  m_UnlockedConversations            [ { m_ConversationName } ]   15 entries
  m_ConversationsHad                 [ "Trader_MenuFlow_TraderIntro", ... ]   6 names
  m_UnlockedTraderImprovements       []
  m_AvailableExchangesThisAurora     [ exchange ]   9 entries
  m_SpecialRequests                  []
  m_ActiveTrade                      missing when no trade is agreed
    m_ExchangeBoxScene               "CoastalRegion"
    m_ExchangeStates                 [ { m_Exchange: exchange, m_ExchangedItems: [] } ]

exchange
  m_TradeExchangeName          "Salt", "RifleAmmoBox", "Blueprints", ...
  m_Description                { m_LocalizationID }
  m_GainedItem                 asset guid of the item the player gets
  m_GainedItemAmount           1
  m_MaxExchangeInSingleTrade   1 to 10
  m_UnlockedExchanges          []
  m_UnlockedConversations      []
  m_ExchangeItems              [ cost ]   the price
  m_CheapExchangeItems         [ cost ]   a lower price. Present on offers, missing inside m_ActiveTrade

cost
  m_ExchangeItemType   "Liquid", "CategoryWeight", "CategoryAmount", or missing for a plain item
  m_GearItemData       asset guid of the item (a placeholder on category and liquid costs)
  m_ItemCategory       asset guid of a trader category, or ""
  m_LiquidType         asset guid of a liquid, or ""
  m_PowderType         ""
  m_Amount             count
  m_Weight             in billionths of a kilogram, used by CategoryWeight
  m_LiquidVolume       in billionths of a litre, used by Liquid
  IsWeight             true on CategoryWeight
```

### Item names

Items, categories and liquids are stored as 32 character asset guids, not as `GEAR_` names. The game's own asset catalogs (`catalog.json` in the game folder, plus `DLC01.json` and `DLC02.json`) map every guid to an asset path such as `GearItemData_SaltBag.asset`, which matches the `GEAR_SaltBag` id in `ui/data.js`. All 23 guids in this slot resolve this way. The catalogs hold 696 item guids, and 676 of them are items Whiteout already knows by name.

The nine offers in this slot: Salt, Rifle ammunition, Revolver ammunition, Flour, Cooking oil, Canned pineapple (`Food1`), Basic boots (`ClothingOther`), Wood matches (`Lights`) and the Wolfskin pants blueprint (`Blueprints`). Categories seen: raw animal, raw meat, raw fish, dried hide, harvestable. Liquids seen: potable water, kerosene.

The agreed trade is the Wolfskin pants blueprint for 3 litres of kerosene, 1 car battery and 8 cloth, with the exchange box in Coastal Highway.

### What changes when a trade is agreed

Compared with the same slot before contact: the five scalar fields appear, the conversation lists fill, the offers are listed, and `m_ActiveTrade` is added with the chosen exchange copied into it. The mission `sideTraderMission` stays at step `traderStart` and its completion counter has no value. No other section of the save mentions the trade.

### Still not known

- What `m_ExchangedItems` holds once the player has put items in the exchange box. It is empty here.
- Which field marks a trade as done, and whether `m_ActiveTrade` is removed afterwards.
- Where the goods appear. The box is in a region this slot has not loaded yet, so there is no container to look at.
- How `m_CurrentTrust` changes after a completed trade, and what `m_SpecialRequests` and `m_UnlockedTraderImprovements` entries look like.

So "Mark as done" cannot be built from this slot alone. Two more saves of the same slot settle it: one right after the items have been put in the exchange box, and one after the goods have been collected.

### What Whiteout does with it

Everything here uses fields seen in a real save:

1. The Trader card on the More tab (under Unlocks and extras) shows trust, contacts this aurora, the agreed trade with its exchange box, and the offers with their prices in plain names. All of that is read only.
2. Trust can be edited. `m_HighestTrust` is raised with it and never lowered. A save is blocked when trust is negative, not a whole number, or above the highest trust. The range the game accepts is not known.
3. The guid table is `ui/trader-data.js`. It is generated from the game's catalogs with `npm run trader-data -- "<game install folder>"` and should be regenerated after a game update that adds items.

Two things in the price list are read from the field names and are not confirmed: whether a price with several lines means all of them or any one of them, and whether the water lines on the food and ammunition offers are really part of the price.
