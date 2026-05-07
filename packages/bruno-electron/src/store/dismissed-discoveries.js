const path = require('node:path');
const _ = require('lodash');
const Store = require('electron-store');

// Tracks collection paths the user explicitly dismissed from the
// "discovered collections" prompt. We never re-prompt for these on
// subsequent startups / window-focus rescans.
//
// Stored alongside other preferences in preferences.json (electron-store
// 'preferences' name) so the user can clear it by editing the same file.
class DismissedDiscoveries {
  constructor() {
    this.store = new Store({
      name: 'preferences',
      clearInvalidConfig: true
    });
  }

  getAll() {
    const list = this.store.get('dismissedDiscoveredCollections') || [];
    return list.map((p) => path.resolve(p));
  }

  add(collectionPath) {
    if (!collectionPath) return;
    const resolved = path.resolve(collectionPath);
    const list = this.getAll();
    if (!list.includes(resolved)) {
      list.push(resolved);
      this.store.set('dismissedDiscoveredCollections', list);
    }
  }

  remove(collectionPath) {
    if (!collectionPath) return;
    const resolved = path.resolve(collectionPath);
    const list = _.filter(this.getAll(), (p) => p !== resolved);
    this.store.set('dismissedDiscoveredCollections', list);
  }

  clear() {
    this.store.set('dismissedDiscoveredCollections', []);
  }
}

module.exports = DismissedDiscoveries;
