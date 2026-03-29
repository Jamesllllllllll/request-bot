import { describe, expect, it } from "vitest";
import {
  getCompactedRegularPositionAssignments,
  getQueuedPositionsFromRegularOrder,
  getUpdatedPositionsAfterSetCurrent,
  getUpdatedQueuedPositionsAfterKindChange,
} from "~/lib/playlist/order";

describe("playlist request kind ordering", () => {
  it("restores a downgraded VIP request to its stored regular order", () => {
    expect(
      getUpdatedQueuedPositionsAfterKindChange({
        items: [
          {
            id: "item-1",
            position: 1,
            status: "queued",
            requestKind: "vip",
            regularPosition: 2,
          },
          {
            id: "item-2",
            position: 2,
            status: "queued",
            requestKind: "regular",
            regularPosition: 1,
          },
        ],
        targetItemId: "item-1",
        requestKind: "regular",
      })
    ).toEqual([
      { id: "item-2", position: 1 },
      { id: "item-1", position: 2 },
    ]);
  });

  it("keeps remaining VIP requests ahead of a downgraded request", () => {
    expect(
      getUpdatedQueuedPositionsAfterKindChange({
        items: [
          {
            id: "item-1",
            position: 1,
            status: "queued",
            requestKind: "vip",
            regularPosition: 1,
          },
          {
            id: "item-2",
            position: 2,
            status: "queued",
            requestKind: "vip",
            regularPosition: 3,
          },
          {
            id: "item-3",
            position: 3,
            status: "queued",
            requestKind: "regular",
            regularPosition: 2,
          },
        ],
        targetItemId: "item-1",
        requestKind: "regular",
      })
    ).toEqual([
      { id: "item-2", position: 1 },
      { id: "item-1", position: 2 },
      { id: "item-3", position: 3 },
    ]);
  });

  it("moves an upgraded request to the front of the queued list", () => {
    expect(
      getUpdatedQueuedPositionsAfterKindChange({
        items: [
          {
            id: "item-current",
            position: 1,
            status: "current",
            requestKind: "regular",
          },
          {
            id: "item-1",
            position: 2,
            status: "queued",
            requestKind: "regular",
          },
          {
            id: "item-2",
            position: 3,
            status: "queued",
            requestKind: "regular",
          },
        ],
        playlistCurrentItemId: "item-current",
        targetItemId: "item-2",
        requestKind: "vip",
      })
    ).toEqual([
      { id: "item-2", position: 2 },
      { id: "item-1", position: 3 },
    ]);
  });

  it("moves play now to the top without rewriting the queued regular order", () => {
    expect(
      getUpdatedPositionsAfterSetCurrent({
        items: [
          {
            id: "item-1",
            position: 1,
            regularPosition: 1,
            status: "queued",
            requestKind: "regular",
          },
          {
            id: "item-2",
            position: 2,
            regularPosition: 2,
            status: "queued",
            requestKind: "regular",
          },
          {
            id: "item-3",
            position: 3,
            regularPosition: 3,
            status: "queued",
            requestKind: "regular",
          },
        ],
        targetItemId: "item-2",
      })
    ).toEqual([
      { id: "item-2", position: 1 },
      { id: "item-1", position: 2 },
      { id: "item-3", position: 3 },
    ]);
  });

  it("returns a current song to its stored queue position", () => {
    expect(
      getQueuedPositionsFromRegularOrder([
        {
          id: "item-2",
          position: 1,
          regularPosition: 2,
          status: "current",
          requestKind: "regular",
        },
        {
          id: "item-1",
          position: 2,
          regularPosition: 1,
          status: "queued",
          requestKind: "regular",
        },
        {
          id: "item-3",
          position: 3,
          regularPosition: 3,
          status: "queued",
          requestKind: "regular",
        },
      ])
    ).toEqual([
      { id: "item-1", position: 1 },
      { id: "item-2", position: 2 },
      { id: "item-3", position: 3 },
    ]);
  });

  it("compacts stored regular positions without using the temporary VIP order", () => {
    expect(
      getCompactedRegularPositionAssignments([
        {
          id: "item-1",
          position: 1,
          regularPosition: 2,
          status: "queued",
          requestKind: "vip",
        },
        {
          id: "item-2",
          position: 2,
          regularPosition: 1,
          status: "queued",
          requestKind: "regular",
        },
      ])
    ).toEqual([
      { id: "item-2", regularPosition: 1 },
      { id: "item-1", regularPosition: 2 },
    ]);
  });
});
