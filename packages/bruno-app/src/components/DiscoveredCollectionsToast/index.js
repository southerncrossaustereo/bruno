import React from 'react';
import toast from 'react-hot-toast';
import { IconFolder, IconX } from '@tabler/icons';

// Inline toast body shown when scanForBrunoFiles finds collections in the
// user's defaultLocation that aren't already opened or dismissed. Rendered
// via react-hot-toast's toast.custom — `t` is the toast handle so the
// action buttons can dismiss it.
const DiscoveredCollectionsToast = ({ t, collections, onOpenAll, onDismiss }) => {
  const count = collections.length;
  const preview = collections
    .slice(0, 3)
    .map((c) => c.name)
    .join(', ');
  const remainder = count > 3 ? ` and ${count - 3} more` : '';

  const close = () => {
    if (t && t.id) toast.dismiss(t.id);
  };

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-md dark:border-gray-700 dark:bg-zinc-900"
      style={{ maxWidth: 420 }}
    >
      <IconFolder size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 opacity-80" />
      <div className="flex-1 text-sm">
        <div className="font-medium">
          {count === 1 ? 'Found 1 collection in your Bruno folder' : `Found ${count} collections in your Bruno folder`}
        </div>
        <div className="mt-1 text-xs opacity-75">
          {preview}{remainder}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => {
              onOpenAll();
              close();
            }}
          >
            {count === 1 ? 'Open' : 'Open all'}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium bg-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-zinc-800"
            onClick={() => {
              onDismiss();
              close();
            }}
          >
            Don’t ask again
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close"
        className="ml-1 -mr-1 -mt-1 rounded p-1 opacity-60 hover:opacity-100"
        onClick={close}
      >
        <IconX size={14} strokeWidth={2} />
      </button>
    </div>
  );
};

export default DiscoveredCollectionsToast;
