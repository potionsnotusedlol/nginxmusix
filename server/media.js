const path = require("path");

function toPublicPath(relativePath) {
  return String(relativePath || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function resolvePath(baseDir, value) {
  if (!value) {
    return baseDir;
  }

  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

module.exports = {
  resolvePath,
  toPublicPath
};
