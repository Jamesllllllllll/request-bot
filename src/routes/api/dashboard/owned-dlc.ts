import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  parseSongsMasterGridOwnedOfficialDlc,
  type SongsMasterGridImportResult,
} from "~/lib/cfsm/songs-master-grid";
import {
  createAuditLog,
  getDashboardState,
  replaceChannelOwnedOfficialDlcs,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

async function requireDashboardState(request: Request, runtimeEnv: AppEnv) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getDashboardState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/owned-dlc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardState(request, runtimeEnv);

        if (!state) {
          return json(
            { error: "unauthorized", message: "You need to sign in first." },
            { status: 401 }
          );
        }

        const formData = await request.formData().catch(() => null);
        const file = formData?.get("file");

        if (!(file instanceof File)) {
          return json(
            {
              error: "invalid_file",
              message: "Choose a SongsMasterGrid.json file to import.",
            },
            { status: 400 }
          );
        }

        const fileText = await file.text();
        let parsedImport: SongsMasterGridImportResult;

        try {
          parsedImport = parseSongsMasterGridOwnedOfficialDlc(fileText);
        } catch (error) {
          return json(
            {
              error: "invalid_file",
              message:
                error instanceof Error
                  ? error.message
                  : "SongsMasterGrid.json could not be read.",
            },
            { status: 400 }
          );
        }

        await replaceChannelOwnedOfficialDlcs(
          runtimeEnv,
          state.channel.id,
          parsedImport.ownedOfficialRows.map((row) => ({
            sourceKey: row.sourceKey,
            sourceAppId: row.sourceAppId,
            artistName: row.artistName,
            title: row.title,
            albumName: row.albumName,
            filePath: row.filePath,
            arrangementsJson: JSON.stringify(row.arrangements),
            tuningsJson: JSON.stringify(row.tunings),
          }))
        );

        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.channel.ownerUserId,
          actorType: "owner",
          action: "import_owned_official_dlc",
          entityType: "channel_owned_official_dlc",
          entityId: state.channel.id,
          payloadJson: JSON.stringify({
            fileName: file.name,
            totalRows: parsedImport.totalRows,
            importedRows: parsedImport.ownedOfficialRows.length,
          }),
        });

        return json({
          ok: true,
          message:
            parsedImport.ownedOfficialRows.length > 0
              ? `Imported ${parsedImport.ownedOfficialRows.length} owned official DLC entries.`
              : "No owned official DLC entries were found in that file.",
          count: parsedImport.ownedOfficialRows.length,
          totalRows: parsedImport.totalRows,
        });
      },
    },
  },
});
