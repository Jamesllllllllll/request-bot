# Request Modifiers And VIP Token Rules

## Shared Rule Model

The website, chat commands, and Twitch panel all use the same request-cost planner.

Current rule:

- a normal VIP request adds `1` VIP token and moves the request into VIP priority
- long-song thresholds add their configured VIP token surcharge
- paid request-path modifiers such as `*bass` add their configured VIP token surcharge
- regular requests can still spend VIP tokens when duration rules or request modifiers require them
- VIP requests add the normal VIP token on top of any duration or modifier surcharges

There is no separate “path uses VIP priority instead of adding cost” branch in the shipped behavior. The live product uses the additive model everywhere.

## Cost Formula

Regular request total:

```text
duration surcharge + requested-path surcharge
```

VIP request total:

```text
1 + duration surcharge + requested-path surcharge
```

## Examples

Assume:

- VIP priority cost = `1`
- over 7 minutes = `1`
- `*bass` = `1`

Then:

- `!sr song:9941` costs `0`
- `!vip song:9941` costs `1`
- `!sr song:9941 *bass` costs `1`
- `!vip song:9941 *bass` costs `2`
- `!sr song:9941` for a long song costs `1`
- `!vip song:9941` for a long song costs `2`
- `!sr song:9941 *bass` for a long song costs `2`
- `!vip song:9941 *bass` for a long song costs `3`

`!vip ... *bass` does not need an extra `*2` suffix. The backend already derives the additive total from the request kind and the selected modifiers.

## Surface Behavior

- web search shows the current token cost for regular and VIP actions
- the Twitch panel shows the same additive totals
- chat help and insufficient-token replies describe the same cost model
- owner self-adds stay free
- moderators pay the same way as normal viewers when they request for themselves
- when an owner or moderator adds for another viewer, the app charges or refunds that target viewer

## Request Modifiers

Request-path modifiers and search-path filters are separate:

- search filters narrow the catalog results
- request modifiers change the submitted request

The currently supported request-path modifiers are:

- `*guitar`
- `*lead`
- `*rhythm`
- `*bass`
