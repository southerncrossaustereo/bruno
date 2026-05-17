// Builds a ChainedTokenCredential tailored to the runtime mode.
//
// Desktop ("desktop"): falls back to InteractiveBrowserCredential — opens
//   the system browser; suitable for an Electron environment.
//
// CLI ("cli"): falls back to DeviceCodeCredential — terminal-friendly,
//   prints a URL + code for the user to enter on another device.
//
// Each link in the chain is best-effort: AzureCliCredential fails fast if
// `az` isn't installed; ManagedIdentityCredential fails fast off-Azure;
// VisualStudioCodeCredential fails fast if no VS Code session. The chain
// transparently tries the next.

// Pool of InteractiveBrowserCredential instances keyed by (tenantId, clientId).
// We MUST share these between the chain (used during resolution) and the
// explicit "Sign in to Azure" flow — they each have their own MSAL in-memory
// token cache, so different instances mean a successful sign-in won't satisfy
// later silent calls and the user gets prompted again.
const interactivePool = new Map();
const interactiveKey = (tenantId, clientId) => `${tenantId || ''}|${clientId || ''}`;

const getInteractiveCredential = ({ tenantId, clientId } = {}) => {
  const key = interactiveKey(tenantId, clientId);
  if (!interactivePool.has(key)) {
    const { InteractiveBrowserCredential } = require('@azure/identity');
    interactivePool.set(key, new InteractiveBrowserCredential({
      tenantId,
      clientId,
      redirectUri: 'http://localhost'
    }));
  }
  return interactivePool.get(key);
};

const clearInteractivePool = () => interactivePool.clear();

const buildCredential = ({ mode = 'desktop', tenantId, clientId, auth = {} } = {}) => {
  // Lazy require so this module can be unit-tested without installing
  // @azure/identity (the resolver mocks it).
  const identity = require('@azure/identity');
  const {
    ChainedTokenCredential,
    EnvironmentCredential,
    AzureCliCredential,
    AzurePowerShellCredential,
    VisualStudioCodeCredential,
    ManagedIdentityCredential,
    DeviceCodeCredential
  } = identity;

  const links = [];

  // 1. Workload identity / service principal via env
  if (auth.allowEnvironment !== false) {
    try { links.push(new EnvironmentCredential()); } catch (_) {}
  }

  // 2. Managed Identity — only useful on Azure-hosted CI
  if (mode === 'cli' && auth.allowManagedIdentity !== false) {
    try {
      links.push(clientId
        ? new ManagedIdentityCredential({ clientId })
        : new ManagedIdentityCredential());
    } catch (_) {}
  }

  // 3. Azure CLI — preferred for devs who already `az login`'d
  if (auth.allowAzureCli !== false) {
    try { links.push(new AzureCliCredential(tenantId ? { tenantId } : undefined)); } catch (_) {}
  }

  // 4. Azure PowerShell
  if (auth.allowAzurePowerShell !== false) {
    try { links.push(new AzurePowerShellCredential(tenantId ? { tenantId } : undefined)); } catch (_) {}
  }

  // 5. VS Code — desktop only (CLI doesn't usually share that session)
  if (mode === 'desktop' && auth.allowVisualStudioCode !== false) {
    try { links.push(new VisualStudioCodeCredential(tenantId ? { tenantId } : undefined)); } catch (_) {}
  }

  // 6. Final fallback — must prompt the human
  if (mode === 'desktop' && auth.allowInteractive !== false) {
    links.push(getInteractiveCredential({ tenantId, clientId }));
  } else if (mode === 'cli' && auth.allowDeviceCode !== false) {
    links.push(new DeviceCodeCredential({
      tenantId,
      clientId,
      userPromptCallback: (info) => {
        // Surface the prompt to the user via stderr so it isn't swallowed
        // by --reporter pipes.
        process.stderr.write(`\n[bruno] Azure auth required: ${info.message}\n`);
      }
    }));
  }

  if (links.length === 0) {
    throw new Error('No Azure credential sources are enabled in config; cannot resolve secrets.');
  }

  return new ChainedTokenCredential(...links);
};

module.exports = { buildCredential, getInteractiveCredential, clearInteractivePool };
