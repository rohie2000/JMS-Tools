// Tombstones keep intentionally removed cards out of the local collection.
export function readDeletedIds(data) {
  if (data.deletedIds === undefined) return [];
  if (!Array.isArray(data.deletedIds) || data.deletedIds.length > 10000 ||
      data.deletedIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
    throw Error('Die Sammlung enthält ungültige Löschmarkierungen.');
  }
  return [...new Set(data.deletedIds)];
}

export function mergeCollection(published, drafts, deletedIds = []) {
  const removed = new Set(deletedIds);
  const localIds = new Set(drafts.map(card => card.id));
  return [...drafts, ...published.filter(card => !localIds.has(card.id))]
    .filter(card => !removed.has(card.id))
    .map(card => ({ ...card }));
}
