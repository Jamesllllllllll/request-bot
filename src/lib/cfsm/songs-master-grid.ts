type SongsMasterGridRow = {
  colKey?: unknown;
  colRepairStatus?: unknown;
  colTagged?: unknown;
  colArtist?: unknown;
  colTitle?: unknown;
  colArtistTitleAlbumDate?: unknown;
  colAppID?: unknown;
  colFilePath?: unknown;
  colArrangements?: unknown;
  colTunings?: unknown;
};

export type ImportedOwnedOfficialDlcEntry = {
  sourceKey: string;
  sourceAppId: string | null;
  artistName: string;
  title: string;
  albumName: string | null;
  filePath: string | null;
  arrangements: string[];
  tunings: string[];
};

export type SongsMasterGridImportResult = {
  totalRows: number;
  ownedOfficialRows: ImportedOwnedOfficialDlcEntry[];
};

export function parseSongsMasterGridOwnedOfficialDlc(
  jsonText: string
): SongsMasterGridImportResult {
  const parsed = JSON.parse(jsonText) as {
    dgvSongsMaster?: unknown;
  };
  const rawRows = parsed?.dgvSongsMaster;

  if (!Array.isArray(rawRows)) {
    throw new Error("SongsMasterGrid.json is missing the dgvSongsMaster list.");
  }

  const seenSourceKeys = new Set<string>();
  const ownedOfficialRows: ImportedOwnedOfficialDlcEntry[] = [];

  for (const rawRow of rawRows) {
    if (!rawRow || typeof rawRow !== "object") {
      continue;
    }

    const row = rawRow as SongsMasterGridRow;
    if (!isOwnedOfficialRow(row)) {
      continue;
    }

    const sourceKey = readTrimmedString(row.colKey);
    const artistName = readTrimmedString(row.colArtist);
    const title = readTrimmedString(row.colTitle);

    if (!sourceKey || !artistName || !title) {
      continue;
    }

    const normalizedSourceKey = sourceKey.toLowerCase();
    if (seenSourceKeys.has(normalizedSourceKey)) {
      continue;
    }

    seenSourceKeys.add(normalizedSourceKey);

    const parsedDetails = parseArtistTitleAlbumDate(
      readTrimmedString(row.colArtistTitleAlbumDate)
    );

    ownedOfficialRows.push({
      sourceKey,
      sourceAppId: readTrimmedString(row.colAppID) ?? null,
      artistName,
      title,
      albumName: parsedDetails.albumName,
      filePath: readTrimmedString(row.colFilePath) ?? null,
      arrangements: splitCsvValues(row.colArrangements),
      tunings: splitCsvValues(row.colTunings),
    });
  }

  ownedOfficialRows.sort((left, right) => {
    return (
      left.artistName.localeCompare(right.artistName) ||
      left.title.localeCompare(right.title)
    );
  });

  return {
    totalRows: rawRows.length,
    ownedOfficialRows,
  };
}

function isOwnedOfficialRow(row: SongsMasterGridRow) {
  const repairStatus = readTrimmedString(row.colRepairStatus)?.toUpperCase();
  const tagged = readTrimmedString(row.colTagged)?.toUpperCase();
  return repairStatus === "ODLC" || tagged === "ODLC";
}

function readTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitCsvValues(value: unknown) {
  const text = readTrimmedString(value);
  if (!text) {
    return [];
  }

  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseArtistTitleAlbumDate(value: string | null) {
  if (!value) {
    return {
      albumName: null,
    };
  }

  const parts = value.split(";").map((entry) => entry.trim());
  return {
    albumName: parts[2] || null,
  };
}
