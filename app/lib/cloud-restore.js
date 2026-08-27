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
