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
    InteractiveBrowserCredential,
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
    links.push(new InteractiveBrowserCredential({
      tenantId,
      clientId,
      redirectUri: 'http://localhost'
    }));
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

module.exports = { buildCredential };
