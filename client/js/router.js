function parseQuery(rawQuery = "") {
  const query = {};
  const params = new URLSearchParams(rawQuery);
  params.forEach((value, key) => {
    if (query[key] !== undefined) {
      if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
      return;
    }
    query[key] = value;
  });
  return query;
}

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    return segment;
  }
}

export function parseRoute(hash = window.location.hash) {
  const normalized = hash && hash.startsWith("#") ? hash.slice(1) : hash || "";
  const fallback = "/home";
  const source = normalized || fallback;

  const splitIndex = source.indexOf("?");
  const path = splitIndex === -1 ? source : source.slice(0, splitIndex);
  const queryString = splitIndex === -1 ? "" : source.slice(splitIndex + 1);
  const query = parseQuery(queryString);

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const segments = cleanPath.split("/").filter(Boolean).map(decode);

  if (segments.length === 0 || segments[0] === "home") {
    return { name: "home", params: {}, query, path: "/home" };
  }

  if (segments[0] === "songs") {
    return { name: "songs", params: {}, query, path: "/songs" };
  }

  if (segments[0] === "search") {
    return { name: "search", params: {}, query, path: "/search" };
  }

  if (segments[0] === "playlists" && segments.length === 1) {
    return { name: "playlists", params: {}, query, path: "/playlists" };
  }

  if (segments[0] === "playlists" && segments[1]) {
    return {
      name: "playlist-detail",
      params: { slug: segments[1] },
      query,
      path: `/playlists/${encodeURIComponent(segments[1])}`
    };
  }

  if (segments[0] === "tags" && segments.length === 1) {
    return { name: "tags", params: {}, query, path: "/tags" };
  }

  if (segments[0] === "tags" && segments[1] && segments[2]) {
    return {
      name: "tag-detail",
      params: { group: segments[1], tag: segments[2] },
      query,
      path: `/tags/${encodeURIComponent(segments[1])}/${encodeURIComponent(segments[2])}`
    };
  }

  return { name: "home", params: {}, query, path: "/home" };
}

export function toHash(path, query = {}) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && String(entry).trim() !== "") {
          params.append(key, String(entry));
        }
      });
      return;
    }
    params.set(key, String(value));
  });

  const suffix = params.toString();
  return `#${cleanPath}${suffix ? `?${suffix}` : ""}`;
}

export function navigate(path, query = {}) {
  const nextHash = toHash(path, query);
  if (window.location.hash === nextHash) {
    return;
  }
  window.location.hash = nextHash;
}

export function startRouter(onRouteChange) {
  const emitRoute = () => onRouteChange(parseRoute(window.location.hash));
  window.addEventListener("hashchange", emitRoute);
  emitRoute();

  return () => {
    window.removeEventListener("hashchange", emitRoute);
  };
}
