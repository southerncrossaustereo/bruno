# @usebruno/secret-providers

Resolves external-secret-store references inside Bruno requests immediately
before variable interpolation. Currently supports **Azure Key Vault**.

## Reference syntax

Anywhere a string appears in a request (URL, header value, body, auth
credential, OAuth2 client secret, etc.):

```
{{azkv://<vault>/<secret>}}            # latest version
{{azkv://<vault>/<secret>/<version>}}  # pinned version
```

`<vault>` is either a short Key Vault name (e.g. `contoso-dev-kv`, expanded
to `https://contoso-dev-kv.vault.azure.net`) or a full host containing a dot
(useful for sovereign clouds without a config override).

References resolve before the standard `{{var}}` interpolator runs, so a
resolved secret value can itself contain `{{var}}` placeholders that will
then be expanded normally.

## Per-collection config (`bruno.json`)

```json
{
  "secretProviders": {
    "azureKeyVault": {
      "tenantId": "00000000-0000-0000-0000-000000000000",
      "clientId": "optional — for workload identity federation",
      "vaultBaseUrlTemplate": "https://{vault}.vault.azure.net",
      "cacheTtlSeconds": 300,
      "auth": {
        "allowEnvironment": true,
        "allowAzureCli": true,
        "allowAzurePowerShell": true,
        "allowVisualStudioCode": true,
        "allowManagedIdentity": true,
        "allowInteractive": true,
        "allowDeviceCode": true
      }
    }
  }
}
```

All fields are optional. Defaults: 5-minute TTL, all auth methods enabled,
public-cloud Key Vault DNS.

## Auth chain

The credential chain is built per `(tenantId, clientId, auth flags)` tuple
and reused across the process so tokens cache (and interactive prompts only
fire once).

**Desktop (Electron):**
1. `EnvironmentCredential` — service principal / federated token via env vars
2. `AzureCliCredential` — picks up an existing `az login` session
3. `AzurePowerShellCredential`
4. `VisualStudioCodeCredential`
5. `InteractiveBrowserCredential` — opens the system browser

**CLI:**
1. `EnvironmentCredential`
2. `ManagedIdentityCredential` — for self-hosted Azure runners
3. `AzureCliCredential`
4. `AzurePowerShellCredential`
5. `DeviceCodeCredential` — terminal-friendly browser handoff

Each link fails fast if its prerequisite isn't present (no `az`, no MI
endpoint, etc.) and the chain transparently advances.

## Caching

Per-process in-memory cache keyed on `vaultUrl|secret|version`. Successful
fetches honor `cacheTtlSeconds` (default 300s); failed fetches are cached
for 5s to avoid hammering on misconfigured references. Concurrent fetches
for the same key are deduplicated via promise sharing.

## Programmatic API

```js
const { resolveExternalSecrets } = require('@usebruno/secret-providers');

const { resolved, errors } = await resolveExternalSecrets(request, {
  brunoConfig,
  mode: 'desktop' // or 'cli'
});
```

The function walks `request` recursively, finds every `{{azkv://...}}`
reference in any string leaf, fetches them in parallel (deduped + cached),
and substitutes resolved values in place. On per-reference failure the
original `{{...}}` token is left intact so the standard variable
interpolator can still surface a missing-variable warning.
