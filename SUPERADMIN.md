# Admin and SuperAdmin

The stored roles are `player` and `admin`. SuperAdmin is an additional server-derived capability for one configured administrator, not a third database role.

## Permissions

| Capability | Member | Admin | SuperAdmin |
| --- | --- | --- | --- |
| Own profile and signup | Yes | Yes | Yes |
| Published plans and permitted contacts | Yes | Yes | Yes |
| Member administration, registration management, plans | No | Yes | Yes |
| Privacy review and newsletter administration | No | Yes | Yes |
| Calculate, edit, export, and publish plans | No | Yes | Yes |
| Optimizer factors, defaults, and resources | No | No | Yes |
| Forbidden pairs and protected prompt | No | No | Yes |
| Grant/revoke administrator roles | No | No | Yes, with current PIN |
| Reset another administrator's MFA | No | No | Yes, with identity confirmation and authentication proof |

Check action-specific server guards for exact requirements. Hiding a UI control is not the authorization mechanism.

## Account binding

`SUPERADMIN_PLAYER_ID` must contain the stable internal `players.id` of an open administrator. It must not contain a membership number or display name. A missing/invalid setting grants nobody this capability. Names and client-supplied `isSuperAdmin` values cannot grant it.

Ordinary administrators cannot alter the bound SuperAdmin's profile or remove its access. The bound administrator cannot remove their own access through the normal role list; the operator changes the environment binding when ownership changes.

## Provisioning

Public registration always creates a player, even in an empty database. For a new environment, an operator must verify the intended account, assign the initial admin role through authorized database administration, and configure its internal ID.

For local development, set the verified local ID in `.dev.vars` and restart. Do not assume a production membership number has the same internal ID in a separately seeded Sandbox.

For Production, the deployment wrapper supports:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy.ps1 -SuperAdminMemberNo <verified-number>
```

This is a full deployment command, not merely a lookup. The script verifies the production account and stores its internal ID as a Worker secret. Later deployments without the option require and preserve an existing binding. Secret-name listings do not reveal the stored ID. See [deployment](DEPLOYMENT.md).

## Protected data

Optimizer configuration and factor metadata are filtered on the server. Ordinary administrators use stored factors when calculating; they cannot submit their own factor overrides. The protected ChatGPT prompt is generated through a SuperAdmin-only endpoint.

All administrators require MFA. See [administrator MFA](docs/admin-2fa.md) for setup/recovery and [security controls](docs/security-controls.md) for sessions and PIN confirmation.

This capability does not create isolation between clubs. Use separate installations/databases until a tenant model exists.
