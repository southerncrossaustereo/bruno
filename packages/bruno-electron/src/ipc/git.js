const { ipcMain } = require('electron');
const { cloneGitRepository, probeGitPath, quickGitSync } = require('../utils/git');
const { createDirectory, removeDirectory } = require('../utils/filesystem');

const registerGitIpc = (mainWindow) => {
  ipcMain.handle('renderer:clone-git-repository', async (event, { url, path, processUid }) => {
    let directoryCreated = false;
    try {
      await createDirectory(path);
      directoryCreated = true;
      await cloneGitRepository(mainWindow, { url, path, processUid });
      return 'Repository cloned successfully';
    } catch (error) {
      if (directoryCreated) {
        await removeDirectory(path);
      }
      return Promise.reject(error);
    }
  });

  // Lightweight probe used by the StatusBar to decide whether to render its
  // quick-sync button. Returns { isRepo, gitRootPath?, branch? } and never
  // throws — the renderer treats any failure as "not a repo, hide the button".
  ipcMain.handle('renderer:git-check-path', async (_event, { path: somePath } = {}) => {
    try {
      return await probeGitPath(somePath);
    } catch (_err) {
      return { isRepo: false };
    }
  });

  // The StatusBar quick-sync action. See quickGitSync() for the contract;
  // result shape is forwarded as-is so the renderer can switch on `code`.
  // `discardLocalChanges` is set by the renderer ONLY after the user has
  // explicitly confirmed they want to overwrite their uncommitted work.
  ipcMain.handle('renderer:git-quick-sync', async (_event, { path: somePath, discardLocalChanges = false } = {}) => {
    return await quickGitSync(somePath, { discardLocalChanges });
  });
};

module.exports = registerGitIpc;
