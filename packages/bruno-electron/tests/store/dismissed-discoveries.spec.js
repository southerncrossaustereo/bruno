let mockStoreData = {};

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: (key, fallback) => (key in mockStoreData ? mockStoreData[key] : fallback),
    set: (key, value) => { mockStoreData[key] = value; }
  }));
});

const DismissedDiscoveries = require('../../src/store/dismissed-discoveries');

describe('DismissedDiscoveries', () => {
  beforeEach(() => { mockStoreData = {}; });

  it('returns an empty list when nothing has been dismissed', () => {
    expect(new DismissedDiscoveries().getAll()).toEqual([]);
  });

  it('persists dismissed paths and dedupes them', () => {
    const store = new DismissedDiscoveries();
    store.add('/tmp/col-a');
    store.add('/tmp/col-b');
    store.add('/tmp/col-a'); // duplicate
    expect(store.getAll().sort()).toEqual(['/tmp/col-a', '/tmp/col-b'].sort());
  });

  it('removes a previously dismissed path', () => {
    const store = new DismissedDiscoveries();
    store.add('/tmp/col-a');
    store.add('/tmp/col-b');
    store.remove('/tmp/col-a');
    expect(store.getAll()).toEqual(['/tmp/col-b']);
  });

  it('clear() empties the list', () => {
    const store = new DismissedDiscoveries();
    store.add('/tmp/col-a');
    store.clear();
    expect(store.getAll()).toEqual([]);
  });

  it('ignores empty/null inputs to add and remove', () => {
    const store = new DismissedDiscoveries();
    store.add('');
    store.add(null);
    store.remove(undefined);
    expect(store.getAll()).toEqual([]);
  });
});
