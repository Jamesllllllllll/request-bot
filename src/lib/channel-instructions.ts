import {
  formatRequestPathModifierTokens,
  formatRequestPathModifierVipTokenCostSummary,
  getAllowedRequestPathVipTokenCostDetails,
  legacyRequestPathModifierOptions,
  normalizeAllowedRequestPaths,
  normalizeCommandPrefix,
} from "./request-policy";
import {
  normalizeVipTokenDurationThresholds,
  type VipTokenDurationThreshold,
} from "./vip-token-duration-thresholds";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ChannelInstructionsSettings = {
  requestsEnabled: boolean;
  allowAnyoneToRequest: boolean;
  allowSubscribersToRequest: boolean;
  allowVipsToRequest: boolean;
  maxViewerRequestsAtOnce: number;
  maxSubscriberRequestsAtOnce: number;
  maxVipViewerRequestsAtOnce: number;
  maxVipSubscriberRequestsAtOnce: number;
  allowRequestPathModifiers: boolean;
  allowedRequestPaths?: string[];
  requestPathModifierVipTokenCost: number;
  requestPathModifierGuitarVipTokenCost?: number | null;
  requestPathModifierLeadVipTokenCost?: number | null;
  requestPathModifierRhythmVipTokenCost?: number | null;
  requestPathModifierBassVipTokenCost?: number | null;
  requestPathModifierVipTokenCosts?: Partial<Record<string, unknown>>;
  requestPathModifierUsesVipPriority: boolean;
  autoGrantVipTokenToSubscribers: boolean;
  autoGrantVipTokensForSharedSubRenewalMessage: boolean;
  autoGrantVipTokensToSubGifters: boolean;
  autoGrantVipTokensToGiftRecipients: boolean;
  autoGrantVipTokensForCheers: boolean;
  autoGrantVipTokensForChannelPointRewards: boolean;
  autoGrantVipTokensForRaiders: boolean;
  autoGrantVipTokensForStreamElementsTips: boolean;
  cheerBitsPerVipToken: number;
  channelPointRewardCost: number;
  raidMinimumViewerCount: number;
  streamElementsTipAmountPerVipToken: number;
  vipTokenDurationThresholds: VipTokenDurationThreshold[];
  commandPrefix: string;
};

export type ChannelInstructionSection = {
  title: string | null;
  lines: string[];
};

function getText(
  translate: Translate | undefined,
  key: string,
  fallback: string,
  options?: Record<string, unknown>
) {
  if (translate) {
    return translate(key, options);
  }

  if (!options) {
    return fallback;
  }

  return fallback.replace(/\{(\w+)\}/g, (match, placeholder: string) => {
    const value = options[placeholder];
    return value == null ? match : String(value);
  });
}

function formatVipTokenCount(count: number, translate?: Translate) {
  return getText(
    translate,
    "settings.sections.channelInstructions.tokenCount",
    `${count} VIP token${count === 1 ? "" : "s"}`,
    { count }
  );
}

function formatNumberForLocale(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDollarAmount(value: number, locale: string) {
  return formatNumberForLocale(value, locale);
}

function canQueueMultipleRequests(settings: ChannelInstructionsSettings) {
  return (
    Math.max(
      settings.maxViewerRequestsAtOnce,
      settings.maxSubscriberRequestsAtOnce,
      settings.maxVipViewerRequestsAtOnce,
      settings.maxVipSubscriberRequestsAtOnce
    ) > 1
  );
}

function getAvailabilityLine(
  settings: ChannelInstructionsSettings,
  translate?: Translate
) {
  if (!settings.requestsEnabled) {
    return getText(
      translate,
      "settings.sections.channelInstructions.availabilityDisabled",
      "Requests: off"
    );
  }

  if (settings.allowAnyoneToRequest) {
    return null;
  }

  if (settings.allowSubscribersToRequest && settings.allowVipsToRequest) {
    return getText(
      translate,
      "settings.sections.channelInstructions.availabilitySubscribersAndVips",
      "Requests: subscribers + VIPs"
    );
  }

  if (settings.allowSubscribersToRequest) {
    return getText(
      translate,
      "settings.sections.channelInstructions.availabilitySubscribersOnly",
      "Requests: subscribers only"
    );
  }

  if (settings.allowVipsToRequest) {
    return getText(
      translate,
      "settings.sections.channelInstructions.availabilityVipsOnly",
      "Requests: VIPs only"
    );
  }

  return getText(
    translate,
    "settings.sections.channelInstructions.availabilityModeratorsOnly",
    "Requests: streamer + mods"
  );
}

function getRewardLines(input: {
  settings: ChannelInstructionsSettings;
  locale: string;
  translate?: Translate;
}) {
  const { settings, locale, translate } = input;
  const lines: string[] = [];

  if (settings.autoGrantVipTokenToSubscribers) {
    lines.push(
      getText(
        translate,
        "settings.sections.vipAutomation.newSub",
        "Give 1 VIP token for a new paid sub"
      )
    );
  }

  if (settings.autoGrantVipTokensForSharedSubRenewalMessage) {
    lines.push(
      getText(
        translate,
        "settings.sections.vipAutomation.sharedRenewal",
        "Give 1 VIP token for a shared sub renewal message"
      )
    );
  }

  if (settings.autoGrantVipTokensToSubGifters) {
    lines.push(
      getText(
        translate,
        "settings.sections.vipAutomation.subGifter",
        "Give 1 VIP token to the gifter for each gifted sub"
      )
    );
  }

  if (settings.autoGrantVipTokensToGiftRecipients) {
    lines.push(
      getText(
        translate,
        "settings.sections.vipAutomation.subRecipient",
        "Give 1 VIP token to each gifted sub recipient"
      )
    );
  }

  if (settings.autoGrantVipTokensForChannelPointRewards) {
    lines.push(
      getText(
        translate,
        "settings.sections.channelInstructions.rewardChannelPoints",
        "Channel point reward: 1 VIP token per redemption ({cost} points).",
        {
          cost: formatNumberForLocale(settings.channelPointRewardCost, locale),
        }
      )
    );
  }

  if (settings.autoGrantVipTokensForRaiders) {
    lines.push(
      getText(
        translate,
        "settings.sections.channelInstructions.rewardRaid",
        "Raids: 1 VIP token for raids of {count}+ viewers.",
        {
          count: formatNumberForLocale(settings.raidMinimumViewerCount, locale),
        }
      )
    );
  }

  if (settings.autoGrantVipTokensForCheers) {
    lines.push(
      getText(
        translate,
        "settings.sections.channelInstructions.rewardCheers",
        "Cheers: 1 VIP token per {bits} bits.",
        {
          bits: formatNumberForLocale(settings.cheerBitsPerVipToken, locale),
        }
      )
    );
  }

  if (settings.autoGrantVipTokensForStreamElementsTips) {
    lines.push(
      getText(
        translate,
        "settings.sections.channelInstructions.rewardTips",
        "StreamElements tips: 1 VIP token per {amountCurrency}.",
        {
          amount: formatDollarAmount(
            settings.streamElementsTipAmountPerVipToken,
            locale
          ),
          amountCurrency: `$${formatDollarAmount(
            settings.streamElementsTipAmountPerVipToken,
            locale
          )}`,
        }
      )
    );
  }

  return lines;
}

export function buildChannelInstructionSections(input: {
  channelSlug?: string | null;
  settings: ChannelInstructionsSettings;
  locale?: string;
  translate?: Translate;
}) {
  const locale = input.locale ?? "en";
  const prefix = normalizeCommandPrefix(input.settings.commandPrefix);
  const requestCommand = `${prefix}sr`;
  const editCommand = `${prefix}edit`;
  const vipCommand = `${prefix}vip`;
  const removeCommand = `${prefix}remove`;
  const positionCommand = `${prefix}position`;
  const playlistUrl = input.channelSlug?.trim()
    ? `https://rocklist.live/${input.channelSlug.trim()}`
    : "https://rocklist.live";
  const translate = input.translate;
  const thresholdLines = normalizeVipTokenDurationThresholds(
    input.settings.vipTokenDurationThresholds
  );
  const configuredAllowedRequestPaths = normalizeAllowedRequestPaths(
    input.settings.allowedRequestPaths
  );
  const allowedRequestPaths = !input.settings.allowRequestPathModifiers
    ? []
    : configuredAllowedRequestPaths.length > 0
      ? configuredAllowedRequestPaths
      : input.settings.allowedRequestPaths === undefined
        ? [...legacyRequestPathModifierOptions]
        : [];
  const requestPathModifiers =
    formatRequestPathModifierTokens(allowedRequestPaths);
  const rewardLines = getRewardLines({
    settings: input.settings,
    locale,
    translate,
  });
  const overviewLines = [
    getText(
      translate,
      "settings.sections.channelInstructions.playlist",
      "Playlist: {url}",
      { url: playlistUrl }
    ),
  ];
  const availabilityLine = getAvailabilityLine(input.settings, translate);

  if (availabilityLine) {
    overviewLines.push(availabilityLine);
  }

  const sections: ChannelInstructionSection[] = [
    {
      title: null,
      lines: overviewLines,
    },
    {
      title: getText(
        translate,
        "settings.sections.channelInstructions.requestTitle",
        "How to request"
      ),
      lines: [
        getText(
          translate,
          "settings.sections.channelInstructions.requestSong",
          "Use {requestCommand} artist - song to request a song.",
          { requestCommand }
        ),
        getText(
          translate,
          "settings.sections.channelInstructions.requestRandom",
          "Use {requestCommand} artist *random for a random match.",
          { requestCommand }
        ),
        getText(
          translate,
          "settings.sections.channelInstructions.requestChoice",
          "Use {requestCommand} artist *choice for a streamer choice request.",
          { requestCommand }
        ),
      ],
    },
    {
      title: getText(
        translate,
        "settings.sections.channelInstructions.editTitle",
        "How to edit"
      ),
      lines: [
        getText(
          translate,
          "settings.sections.channelInstructions.editCurrent",
          "Use {editCommand} artist - song to change your current request.",
          { editCommand }
        ),
        ...(canQueueMultipleRequests(input.settings)
          ? [
              getText(
                translate,
                "settings.sections.channelInstructions.editPosition",
                "Use {editCommand} #2 artist - song when you need to edit a specific queued request.",
                { editCommand }
              ),
            ]
          : []),
      ],
    },
    {
      title: getText(
        translate,
        "settings.sections.channelInstructions.vipTitle",
        "How to use VIP requests"
      ),
      lines: [
        getText(
          translate,
          "settings.sections.channelInstructions.vipRequest",
          "Use {vipCommand} artist - song to make a request VIP and move it to the top.",
          { vipCommand }
        ),
        getText(
          translate,
          "settings.sections.channelInstructions.vipBaseCost",
          "VIP requests add {countText} and play next.",
          {
            countText: formatVipTokenCount(1, translate),
          }
        ),
        ...thresholdLines.map((threshold) =>
          getText(
            translate,
            "settings.sections.channelInstructions.vipThresholdLine",
            "Songs over {minutes} minutes add {countText}.",
            {
              minutes: formatNumberForLocale(
                threshold.minimumDurationMinutes,
                locale
              ),
              countText: formatVipTokenCount(threshold.tokenCost, translate),
            }
          )
        ),
        getText(
          translate,
          "settings.sections.channelInstructions.vipBalance",
          "Use {vipCommand} on its own to check your VIP token balance.",
          { vipCommand }
        ),
      ],
    },
  ];

  if (allowedRequestPaths.length > 0) {
    const pathCostDetails = getAllowedRequestPathVipTokenCostDetails({
      allowedRequestPaths,
      settings: {
        requestPathModifierVipTokenCost:
          input.settings.requestPathModifierVipTokenCost,
        requestPathModifierGuitarVipTokenCost:
          input.settings.requestPathModifierGuitarVipTokenCost,
        requestPathModifierLeadVipTokenCost:
          input.settings.requestPathModifierLeadVipTokenCost,
        requestPathModifierRhythmVipTokenCost:
          input.settings.requestPathModifierRhythmVipTokenCost,
        requestPathModifierBassVipTokenCost:
          input.settings.requestPathModifierBassVipTokenCost,
        requestPathModifierVipTokenCosts:
          input.settings.requestPathModifierVipTokenCosts,
      },
    });
    const paidPathCostDetails = pathCostDetails.filter(
      (detail) => detail.cost > 0
    );
    const uniquePathCosts = new Set(
      pathCostDetails.map((detail) => detail.cost)
    );
    const uniformPaidPathCost =
      uniquePathCosts.size === 1 &&
      paidPathCostDetails.length === pathCostDetails.length
        ? (pathCostDetails[0]?.cost ?? 0)
        : null;
    const pathCostSummary = formatRequestPathModifierVipTokenCostSummary({
      allowedRequestPaths,
      settings: {
        requestPathModifierVipTokenCost:
          input.settings.requestPathModifierVipTokenCost,
        requestPathModifierGuitarVipTokenCost:
          input.settings.requestPathModifierGuitarVipTokenCost,
        requestPathModifierLeadVipTokenCost:
          input.settings.requestPathModifierLeadVipTokenCost,
        requestPathModifierRhythmVipTokenCost:
          input.settings.requestPathModifierRhythmVipTokenCost,
        requestPathModifierBassVipTokenCost:
          input.settings.requestPathModifierBassVipTokenCost,
        requestPathModifierVipTokenCosts:
          input.settings.requestPathModifierVipTokenCosts,
      },
    });
    const pathLines: string[] = [];

    if (paidPathCostDetails.length === 0) {
      pathLines.push(
        getText(
          translate,
          "settings.sections.channelInstructions.pathFree",
          "Add {modifiers} to {requestCommand}, {vipCommand}, or {editCommand} when the song includes a matching part.",
          {
            modifiers: requestPathModifiers,
            requestCommand,
            vipCommand,
            editCommand,
          }
        )
      );
    } else if (uniformPaidPathCost != null) {
      pathLines.push(
        getText(
          translate,
          "settings.sections.channelInstructions.pathPaidRegular",
          "Add {modifiers} to {requestCommand}, {vipCommand}, or {editCommand} when the song includes a matching part. Choosing a part adds {countText}.",
          {
            modifiers: requestPathModifiers,
            requestCommand,
            vipCommand,
            editCommand,
            countText: formatVipTokenCount(uniformPaidPathCost, translate),
          }
        ),
        getText(
          translate,
          "settings.sections.channelInstructions.pathPaidRegularNote",
          "Use {vipCommand} as well to play next. VIP adds 1 more VIP token.",
          {
            vipCommand,
          }
        )
      );
    } else {
      pathLines.push(
        `Add ${requestPathModifiers} to ${requestCommand}, ${vipCommand}, or ${editCommand} when the song includes a matching part. Costs: ${pathCostSummary}.`,
        getText(
          translate,
          "settings.sections.channelInstructions.pathPaidRegularNote",
          "Use {vipCommand} as well to play next. VIP adds 1 more VIP token.",
          {
            vipCommand,
          }
        )
      );
    }

    sections.push({
      title: getText(
        translate,
        "settings.sections.channelInstructions.pathTitle",
        "How to choose a specific part"
      ),
      lines: pathLines,
    });
  }

  sections.push(
    {
      title: getText(
        translate,
        "settings.sections.channelInstructions.otherTitle",
        "Other commands"
      ),
      lines: [
        getText(
          translate,
          "settings.sections.channelInstructions.otherPosition",
          "Use {positionCommand} to check your place in the playlist.",
          { positionCommand }
        ),
        getText(
          translate,
          "settings.sections.channelInstructions.otherRemove",
          "Use {removeCommand} reg, {removeCommand} vip, or {removeCommand} all to remove your requests.",
          { removeCommand }
        ),
      ],
    },
    {
      title: getText(
        translate,
        "settings.sections.channelInstructions.rewardsTitle",
        "How VIP tokens are awarded"
      ),
      lines:
        rewardLines.length === 0
          ? [
              getText(
                translate,
                "settings.sections.channelInstructions.rewardsNone",
                "VIP tokens are not awarded automatically right now."
              ),
            ]
          : rewardLines,
    }
  );

  return sections;
}

export function buildChannelInstructions(input: {
  channelSlug?: string | null;
  settings: ChannelInstructionsSettings;
  locale?: string;
  translate?: Translate;
}) {
  return buildChannelInstructionSections(input)
    .map((section) =>
      section.title == null
        ? section.lines.join("\n")
        : [section.title, ...section.lines].join("\n")
    )
    .join("\n\n");
}
