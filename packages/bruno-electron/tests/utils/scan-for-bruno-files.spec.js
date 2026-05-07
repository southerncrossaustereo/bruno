const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanForBrunoFiles } = require('../../src/utils/filesystem');

const mkTmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-scan-'));
const writeFile = (p, content = '{}') => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

describe('scanForBrunoFiles', () => {
  let root;

  beforeEach(() => {
    root = mkTmpDir();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('detects bruno.json collections', async () => {
    writeFile(path.join(root, 'col-a', 'bruno.json'));
    writeFile(path.join(root, 'col-b', 'bruno.json'));
    const result = await scanForBrunoFiles(root);
    expect(result.sort()).toEqual([
      path.join(root, 'col-a'),
      path.join(root, 'col-b')
    ].sort());
  });

  test('detects opencollection.yml collections', async () => {
    writeFile(path.join(root, 'oc-col', 'opencollection.yml'), 'name: Foo\n');
    const result = await scanForBrunoFiles(root);
    expect(result).toEqual([path.join(root, 'oc-col')]);
  });

  test('does not descend into a collection directory', async () => {
    writeFile(path.join(root, 'col', 'bruno.json'));
    writeFile(path.join(root, 'col', 'nested', 'request.bru'));
    const result = await scanForBrunoFiles(root);
    expect(result).toEqual([path.join(root, 'col')]);
  });

  test('skips noisy directories like node_modules and .git', async () => {
    writeFile(path.join(root, 'node_modules', 'pkg', 'bruno.json'));
    writeFile(path.join(root, '.git', 'submodule', 'bruno.json'));
    writeFile(path.join(root, 'real', 'bruno.json'));
    const result = await scanForBrunoFiles(root);
    expect(result).toEqual([path.join(root, 'real')]);
  });

  test('respects maxDepth', async () => {
    writeFile(path.join(root, 'a', 'b', 'c', 'd', 'col', 'bruno.json'));
    const shallow = await scanForBrunoFiles(root, { maxDepth: 2 });
    const deep = await scanForBrunoFiles(root, { maxDepth: 8 });
    expect(shallow).toEqual([]);
    expect(deep).toEqual([path.join(root, 'a', 'b', 'c', 'd', 'col')]);
  });

  test('respects maxResults', async () => {
    for (let i = 0; i < 10; i++) writeFile(path.join(root, `col-${i}`, 'bruno.json'));
    const result = await scanForBrunoFiles(root, { maxResults: 4 });
    expect(result).toHaveLength(4);
  });

  test('returns empty array when root does not exist', async () => {
    const result = await scanForBrunoFiles(path.join(root, 'does-not-exist'));
    expect(result).toEqual([]);
  });
});
