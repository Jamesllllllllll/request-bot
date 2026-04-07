export function getPlaylistEndpoint(
  apiPath: string,
  selectedChannelSlug?: string
) {
  if (!selectedChannelSlug) {
    return apiPath;
  }

  const params = new URLSearchParams({
    channel: selectedChannelSlug,
  });

  return `${apiPath}?${params.toString()}`;
}

export function getPlaylistMutationEndpoint(
  apiPath: string,
  mutationPath?: string,
  selectedChannelSlug?: string
) {
  return getPlaylistEndpoint(mutationPath ?? apiPath, selectedChannelSlug);
}
