/**
 * Firestore may emit an empty cache snapshot before it has contacted the
 * server. Treating that as a missing cloud vault can upload an empty fresh
 * install over data that still exists remotely.
 *
 * @param {{exists:boolean,fromCache:boolean}} snapshot
 * @returns {"load"|"wait_for_server"|"create"}
 */
export function cloudSnapshotAction(snapshot) {
  if (snapshot.exists) return "load";
  return snapshot.fromCache ? "wait_for_server" : "create";
}

/**
 * Firestore does not preserve JavaScript object-key insertion order. A raw
 * JSON.stringify comparison can therefore treat the same vault as changed
 * after every snapshot and create an endless write/snapshot loop.
 *
 * Arrays deliberately keep their order; object keys are sorted recursively.
 * @param {unknown} value
 * @returns {string|undefined}
 */
export function stableVaultFingerprint(value) {
  const canonical = (current) => {
    if (Array.isArray(current)) return current.map(canonical);
    if (!current || typeof current !== "object") return current;
    return Object.fromEntries(
      Object.keys(current)
        .sort()
        .map((key) => [key, canonical(current[key])]),
    );
  };

  return JSON.stringify(canonical(value));
}
