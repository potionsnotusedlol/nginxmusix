export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatTrackTags(track) {
  if (!Array.isArray(track.tagObjects) || !track.tagObjects.length) {
    return "";
  }
  return track.tagObjects
    .slice(0, 3)
    .map((tag) => `${tag.group}:${tag.name}`)
    .join(", ");
}

export function coverImage(url, alt) {
  if (!url) {
    return "";
  }
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" onerror="this.style.display='none'" />`;
}

export function renderTrackTableRows(tracks) {
  if (!tracks.length) {
    return `
      <tr>
        <td colspan="5">
          <div class="empty-panel">No tracks found.</div>
        </td>
      </tr>
    `;
  }

  return tracks.map((track, index) => {
    const stateChip = track.browserPlayable
      ? '<span class="state-chip ok">Ready</span>'
      : `<span class="state-chip warn">${escapeHtml(track.unavailableReason || "Unavailable")}</span>`;
    const matchLine = Array.isArray(track.matchReasons) && track.matchReasons.length
      ? `<div class="track-meta-small">Match: ${escapeHtml(track.matchReasons.join(", "))}</div>`
      : "";

    return `
      <tr class="${track.browserPlayable ? "" : "track-unavailable"}">
        <td>${index + 1}</td>
        <td>
          <strong>${escapeHtml(track.title)}</strong>
          <div class="track-meta-small">${escapeHtml(track.artist)}</div>
          ${matchLine}
        </td>
        <td>${escapeHtml(track.album || "Unknown Album")}</td>
        <td class="track-meta-small">${escapeHtml(formatTrackTags(track))}</td>
        <td>
          <button class="btn ${track.browserPlayable ? "btn-primary" : "btn-danger"}" data-action="play-track" data-track-id="${escapeHtml(track.id)}" ${track.browserPlayable ? "" : "disabled"}>Play</button>
          ${stateChip}
        </td>
      </tr>
    `;
  }).join("");
}
