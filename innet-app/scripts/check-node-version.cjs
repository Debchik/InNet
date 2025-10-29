#!/usr/bin/env node

/**
 * Ensures the local Node.js version matches what production expects.
 * This prevents installs/builds from running on a deprecated runtime.
 */
const required = { major: 20, minor: 18, patch: 0 };
const [major = 0, minor = 0, patch = 0] = process.versions.node
  .split('.')
  .map((part) => Number.parseInt(part, 10));

function isSatisfied(current, target) {
  if (current.major > target.major) return true;
  if (current.major < target.major) return false;
  if (current.minor > target.minor) return true;
  if (current.minor < target.minor) return false;
  return current.patch >= target.patch;
}

if (!isSatisfied({ major, minor, patch }, required)) {
  const currentVersion = `${major}.${minor}.${patch}`;
  const requiredVersion = `${required.major}.${required.minor}.${required.patch}`;
  console.error(
    `Node.js ${requiredVersion}+ is required. You are running ${currentVersion}. ` +
      'Upgrade Node.js to avoid runtime regressions.'
  );
  process.exit(1);
}
