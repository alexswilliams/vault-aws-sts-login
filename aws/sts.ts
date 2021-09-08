import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { parse, stringify } from "ini";
import type { Response } from "node-fetch";
import { homedir } from "os";
import { join } from "path";
import { stringify as makeQueryString } from "querystring";
import { fetchWithTimeout } from "./fetch";
import { AWS_API_TIMEOUT, VAULT_TIMEOUT, VAULT_URL } from "./index";
import type { VaultToken } from "./vault-login";

export type AwsCredential = {
  accessKey: string;
  secretKey: string;
  sessionToken: string;
  leaseDurationSeconds: number;
};

export async function assumeRole(
  token: VaultToken,
  account: string,
  role: string
): Promise<AwsCredential | undefined> {
  let stsResult: Response | undefined;
  console.debug(
    `Assuming role ${role} on ${account} at ${VAULT_URL}...`.grey.italic
  );
  try {
    stsResult = await fetchWithTimeout(
      `${VAULT_URL}/v1/aws/${account}/sts/${role}`,
      VAULT_TIMEOUT,
      {
        method: "get",
        headers: { "X-Vault-Token": token.token },
      }
    );
  } catch (e) {
    console.error(`Could not assume role ${role} for ${account}`.red.bold, e);
    return undefined;
  }

  if (!stsResult.ok) {
    console.error(
      `Non-200 response when assuming role ${role} for ${account}`.red.bold,
      stsResult
    );
    return undefined;
  }

  let stsData: AwsCredential | undefined;
  try {
    const json = (await stsResult.json()) as Record<string, any>;
    if (
      !("data" in json) ||
      !("lease_duration" in json) ||
      typeof json.lease_duration !== "number" ||
      !("access_key" in json.data) ||
      typeof json.data.access_key !== "string" ||
      !("secret_key" in json.data) ||
      typeof json.data.secret_key !== "string" ||
      !("security_token" in json.data) ||
      typeof json.data.security_token !== "string"
    ) {
      console.error(
        `Malformed sts response when assuming role ${role} for account ${account}`
          .red.bold,
        json
      );
      return undefined;
    }

    stsData = {
      accessKey: json.data.access_key,
      secretKey: json.data.secret_key,
      sessionToken: json.data.security_token, // switch from security to session is intentional
      leaseDurationSeconds: json.lease_duration,
    };
  } catch (e) {
    console.error(
      `Could not decode sts token details when assuming role ${role} for account ${account}`
        .red.bold,
      e
    );
    return undefined;
  }

  console.info(`Successfully assumed role ${role} in account ${account}`.green);

  try {
    updateAwsCredentialsFile(account, role, stsData);
  } catch (e) {
    console.error(
      "Could not automatically update your ~/.aws/credentials file".red.bold
    );
    console.info("The generated credentials are as follows:", {
      ...stsData,
      profileName: account,
      role,
    });
    return undefined;
  }
  return stsData;
}

function updateAwsCredentialsFile(
  account: string,
  role: string,
  stsData: AwsCredential
) {
  let credentials: { [key: string]: { [key: string]: string } } = {};
  if (existsSync(join(homedir(), ".aws", "credentials"))) {
    const fileContent = readFileSync(
      join(homedir(), ".aws", "credentials")
    ).toString("utf-8");
    credentials = parse(fileContent);
  }

  delete credentials[account];

  credentials[account] = {
    aws_access_key_id: stsData.accessKey,
    aws_secret_access_key: stsData.secretKey,
    aws_session_token: stsData.sessionToken,
    expiry: expiryFromDurationSeconds(stsData.leaseDurationSeconds),
    role,
  };

  if (!existsSync(join(homedir(), ".aws"))) {
    mkdirSync(join(homedir(), ".aws"), 0o755);
  }

  const asIni = stringify(credentials, { section: "", whitespace: true });
  writeFileSync(join(homedir(), ".aws", "credentials"), asIni);
  console.info(
    `Successfully updated ~/.aws/credentials with an '${account}' profile`.green
      .bold
  );
}

function expiryFromDurationSeconds(durationSeconds: number): string {
  const expiryMillis = new Date().getTime() + durationSeconds * 1000;
  const expiryFullSeconds = Math.trunc(expiryMillis / 1000);
  const isoString = new Date(expiryFullSeconds * 1000).toISOString();
  return isoString.split(".000Z")[0] + "Z";
}

export async function getSigninToken(
  keys: AwsCredential
): Promise<string | undefined> {
  const session = {
    sessionId: keys.accessKey,
    sessionKey: keys.secretKey,
    sessionToken: keys.sessionToken,
  };
  const queryString = makeQueryString({
    Action: "getSigninToken",
    SessionDuration: 28800,
    SessionType: "json",
    Session: JSON.stringify(session),
  });
  const url = `https://signin.aws.amazon.com/federation?${queryString}`;

  let stResult: Response | undefined;
  console.debug(
    `Calling AWS federation API to request signin url...`.gray.italic
  );
  try {
    stResult = await fetchWithTimeout(url, AWS_API_TIMEOUT, { method: "get" });
  } catch (e) {
    console.error(`Could not query AWS API for sign-in link`.red.bold, e);
    return undefined;
  }

  if (!stResult.ok) {
    console.error(
      `Non-200 response when querying AWS API for sign-in link`.red.bold,
      stResult
    );
    return undefined;
  }

  try {
    const json = (await stResult.json()) as Record<string, any>;
    if (!("SigninToken" in json) || typeof json.SigninToken !== "string") {
      console.error(
        `Malformed sts response when acquiring sign-in link`.red.bold,
        json
      );
      return undefined;
    }

    return json.SigninToken;
  } catch (e) {
    console.error(`Could not decode sts sign-in link response`.red.bold, e);
    return undefined;
  }
}
