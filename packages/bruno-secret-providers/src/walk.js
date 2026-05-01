// Walks a value, calling visitor on every string leaf.
// visitor(str, setter) — call setter(newStr) to replace the leaf in place.
// Skips Buffers, typed arrays, and non-plain prototypes.

const isPlainObject = (v) => {
  if (!v || typeof v !== 'object') return false;
  if (Buffer.isBuffer(v)) return false;
  if (ArrayBuffer.isView(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === null || proto === Object.prototype;
};

const walkStrings = (root, visitor) => {
  const seen = new WeakSet();

  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string') return; // top-level primitive — no setter
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === 'string') {
          visitor(v, (next) => { node[i] = next; });
        } else if (v && typeof v === 'object') {
          walk(v);
        }
      }
      return;
    }

    if (!isPlainObject(node)) return;

    for (const key of Object.keys(node)) {
      const v = node[key];
      if (typeof v === 'string') {
        visitor(v, (next) => { node[key] = next; });
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
  };

  walk(root);
};

module.exports = { walkStrings, isPlainObject };
