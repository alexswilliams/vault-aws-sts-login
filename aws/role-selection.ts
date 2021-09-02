import { prompt } from "inquirer";
import type { Response } from "node-fetch";
import { fetchWithTimeout } from "./fetch";
import { VAULT_MOUNT_PREFIX, VAULT_TIMEOUT, VAULT_URL } from "./index";
import type { VaultToken } from "./vault-login";

export async function chooseAccount(
  token: VaultToken
): Promise<string | undefined> {
  async function mountNameIfAccessible(
    mount: string
  ): Promise<string | undefined> {
    try {
      // A better solution might be to query the user's effective capabilities, but I don't
      // have permission to do that to my own user in the current setup, so that's a TODO.
      const roleResult = await fetchWithTimeout(
        `${VAULT_URL}/v1/${mount}roles`,
        VAULT_TIMEOUT,
        {
          method: "list",
          headers: { "X-Vault-Token": token.token },
        }
      );
      if (!roleResult.ok) {
        return undefined;
      }
    } catch (e) {
      console.warn(`Could not fetch role details for ${mount}`.red, e);
      return undefined;
    }

    const parts = mount.substring(0, mount.length - 1).split("/");
    return parts[parts.length - 1];
  }

  let mountsResult: Response;
  console.debug(`Fetching mounts on ${VAULT_URL}...`.grey.italic);
  try {
    mountsResult = await fetchWithTimeout(
      `${VAULT_URL}/v1/sys/mounts`,
      VAULT_TIMEOUT,
      {
        method: "get",
        headers: { "X-Vault-Token": token.token },
      }
    );
    if (!mountsResult.ok) {
      console.error("Could not fetch Vault mounts: returned non-200.".red.bold);
      console.log(await mountsResult.text());
      return undefined;
    }
  } catch (e) {
    console.error("Could not fetch Vault mounts".red.bold, e);
    return undefined;
  }

  let allAccounts: string[];
  try {
    const json = (await mountsResult.json()) as Record<string, any>;
    if (typeof json !== "object") throw Error("Expected mountpoint object");
    allAccounts = Object.keys(json).filter((key) =>
      key.startsWith(VAULT_MOUNT_PREFIX)
    );
  } catch (e) {
    console.error(
      "Invalid JSON received from Vault mounts endpoint".red.bold,
      e
    );
    return undefined;
  }

  console.debug(`Found ${allAccounts.length} AWS accounts`.grey.italic);
  const accessibleMounts = await Promise.all(
    allAccounts.map((mount) => mountNameIfAccessible(mount))
  );
  const accountsForUser = accessibleMounts.filter(
    (account) => typeof account !== "undefined"
  ) as string[];
  console.debug(
    `Filtered to ${accountsForUser.length} accounts your user can access`.grey
      .italic
  );

  // display to user
  const result = await prompt([
    {
      type: "list",
      name: "account",
      message: "Choose an AWS account:",
      choices: accountsForUser.sort(),
    },
  ]);
  return result.account;
}

export async function chooseRole(
  token: VaultToken,
  account: string
): Promise<string | undefined> {
  let roleResult: Response;
  console.debug(
    `Fetching roles for account ${account} on ${VAULT_URL}...`.grey.italic
  );
  try {
    roleResult = await fetchWithTimeout(
      `${VAULT_URL}/v1/aws/${account}/roles`,
      VAULT_TIMEOUT,
      {
        method: "list",
        headers: { "X-Vault-Token": token.token },
      }
    );
  } catch (e) {
    console.error(`Could not fetch role details for ${account}`.red.bold, e);
    return undefined;
  }

  if (!roleResult.ok) {
    console.error(
      `Non-200 response when fetching roles for ${account}`.red.bold,
      roleResult
    );
    return undefined;
  }

  let roles: string[];
  try {
    const json = (await roleResult.json()) as Record<string, any>;
    if (
      !("data" in json) ||
      !("keys" in json.data) ||
      !Array.isArray(json.data.keys) ||
      !(json.data.keys as unknown[]).every((key) => typeof key === "string")
    ) {
      console.error(
        `Malformed role list for account ${account}`.red.bold,
        json
      );
      return undefined;
    }

    roles = json.data.keys;
  } catch (e) {
    console.error(
      `Could not fetch role details for account ${account}`.red.bold,
      e
    );
    return undefined;
  }

  if (roles.length === 0) {
    console.error(`No roles available for account ${account}`.red.bold);
    return undefined;
  }
  if (roles.length === 1) {
    console.info(`Selecting the only role: ${roles[0]}`.green);
    return roles[0];
  }

  const result = await prompt([
    {
      type: "list",
      name: "role",
      message: "Choose an IAM role:",
      choices: roles.sort(),
    },
  ]);
  return result.role;
}
