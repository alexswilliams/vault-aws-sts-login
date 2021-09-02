import "colors";
import { readFile, writeFile } from "fs/promises";
import { prompt } from "inquirer";
import type { Response } from "node-fetch";
import { homedir } from "os";
import { join } from "path";
import { fetchWithTimeout } from "./fetch";
import { VAULT_TIMEOUT, VAULT_URL } from "./index";

const VAULT_CACHE_FILE = join(homedir(), ".vault_token");

type VaultCredential = { username: string; password: string };
type VaultError = {
  reason: "VaultPostNot200" | "InvalidBody" | "FetchError";
  details: string;
};
export type VaultToken = {
  token: string;
  expiration: number;
  policies: string[];
};

export async function vaultLogin(): Promise<VaultToken | undefined> {
  const cachedToken = await loadCachedVaultTokenIfValid();
  if (cachedToken) return cachedToken;

  const credentials = await getSigUsernameAndPassword();
  const vaultResult = await fetchVaultToken(credentials);
  if ("token" in vaultResult) {
    await cacheVaultToken(vaultResult);
    const durationMinutes = (
      (vaultResult.expiration - new Date().getTime()) /
      60_000
    ).toFixed(0);
    console.info(
      `Successfully authenticated with Vault; token expires in ${durationMinutes} minutes`
        .green
    );
    return vaultResult;
  } else {
    console.error(
      `Could not authenticate to Vault: ${vaultResult.reason}`.red.bold
    );
    console.log(vaultResult);
    return undefined;
  }
}

async function loadCachedVaultTokenIfValid(): Promise<VaultToken | undefined> {
  try {
    const cache = JSON.parse(
      await readFile(VAULT_CACHE_FILE, { encoding: "utf-8" })
    );
    if (
      !("token" in cache) ||
      !("expiration" in cache) ||
      typeof cache.expiration !== "number" ||
      !("policies" in cache) ||
      !Array.isArray(cache.policies) ||
      !(cache.policies as unknown[]).every((el) => typeof el === "string")
    )
      return undefined;
    if (cache.expiration < new Date().getTime() + 5 * 60 * 1000) {
      console.info("Vault token expired - renewing...".yellow);
      return undefined;
    }
    console.info("Using cached vault token".green);
    return {
      token: cache.token,
      expiration: cache.expiration,
      policies: cache.policies,
    };
  } catch (e) {
    return undefined;
  }
}
async function cacheVaultToken(token: VaultToken) {
  try {
    await writeFile(VAULT_CACHE_FILE, JSON.stringify(token, undefined, 2));
  } catch (e) {
    console.warn(
      `Could not cache vault token - check cache file is readable: ${VAULT_CACHE_FILE}`
        .red
    );
  }
}

async function getSigUsernameAndPassword(): Promise<VaultCredential> {
  if (process.argv.includes("--no-pass-prompt")) {
    if (process.env.VAULT_USERNAME && process.env.VAULT_PASSWORD) {
      return {
        username: process.env.VAULT_USERNAME,
        password: process.env.VAULT_PASSWORD,
      };
    } else {
      console.warn(
        "Could not see both VAULT_USERNAME and VAULT_PASSWORD as environment variables"
          .red
      );
    }
  }
  console.info(
    "\n\nEnter LDAP username and password to authenticate to vault:\n".bold
  );
  const answers = await prompt([
    {
      type: "input",
      name: "Vault Username",
      default: process.env.VAULT_USERNAME,
    },
    {
      type: "password",
      name: "Vault Password",
      default: process.env.VAULT_PASSWORD,
    },
  ]);
  console.log();
  return {
    username: answers["Vault Username"],
    password: answers["Vault Password"],
  };
}

async function fetchVaultToken(
  credentials: VaultCredential
): Promise<VaultToken | VaultError> {
  let authResult: Response;
  console.debug(
    `Attempting LDAP authentication against ${VAULT_URL} as ${credentials.username}...`
      .grey.italic
  );
  try {
    authResult = await fetchWithTimeout(
      `${VAULT_URL}/v1/auth/ldap/login/${credentials.username}`,
      VAULT_TIMEOUT,
      {
        method: "post",
        body: JSON.stringify({ password: credentials.password }),
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return { reason: "FetchError", details: JSON.stringify(e) };
  }

  if (!authResult.ok)
    return { reason: "VaultPostNot200", details: await authResult.text() };

  const jsonBody = (await authResult.json()) as Record<string, any>;
  if (
    !("auth" in jsonBody) ||
    !("client_token" in jsonBody.auth) ||
    !("lease_duration" in jsonBody.auth) ||
    !("policies" in jsonBody.auth)
  )
    return { reason: "InvalidBody", details: JSON.stringify(jsonBody) };

  const expiry =
    new Date().getTime() + (jsonBody.auth.lease_duration as number) * 1000;
  return {
    token: jsonBody.auth.client_token,
    expiration: expiry,
    policies: jsonBody.auth.policies,
  };
}
