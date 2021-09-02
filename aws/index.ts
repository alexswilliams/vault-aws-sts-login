import "colors";
import { default as open } from "open";
import { stringify } from "querystring";
import { chooseAccount, chooseRole } from "./role-selection";
import { assumeRole, getSigninToken } from "./sts";
import { vaultLogin } from "./vault-login";

export let VAULT_URL: string;
export let VAULT_MOUNT_PREFIX: string = "aws/";
export const VAULT_TIMEOUT = 10_000;
export const AWS_API_TIMEOUT = 10_000;

run();

async function run() {
  // eslint-disable-next-line prefer-const
  let [, , command, vaultUrl, mountPrefix, issuer, region, account, role]: (
    | string
    | undefined
  )[] = process.argv.filter(
    (it) => !["--no-pass-prompt", "--url-only"].includes(it)
  );

  if (!["keys", "console"].includes(command ?? "")) {
    console.error(`\nUnknown command: ${command ?? ""}`.red.bold);
    printUsage();
    process.exit(1);
  }

  if (!vaultUrl) {
    console.error(`\nMissing parameters: vault url is required`.red.bold);
    printUsage();
    process.exit(1);
  }
  VAULT_URL = vaultUrl;

  if (mountPrefix) VAULT_MOUNT_PREFIX = mountPrefix;

  if (command == "console" && (!issuer || !region)) {
    console.error(
      `\nMissing parameters: issuer and region are required for generating console links`
        .red.bold
    );
    printUsage();
    process.exit(1);
  }

  const vaultToken = await vaultLogin();
  if (!vaultToken) process.exit(2);

  if (!account) {
    account = await chooseAccount(vaultToken);
    if (!account) process.exit(3);
  }

  if (!role) {
    role = await chooseRole(vaultToken, account);
    if (!role) process.exit(4);
  }

  switch (command) {
    case "keys": {
      const keys = await assumeRole(vaultToken, account, role);
      if (!keys) process.exit(5);
      break;
    }

    case "console": {
      const keys = await assumeRole(vaultToken, account, role);
      if (!keys) process.exit(6);

      const signinToken = await getSigninToken(keys);
      if (!signinToken) process.exit(7);

      const queryString = stringify({
        Action: "login",
        Issuer: issuer,
        Destination: `https://${region}.console.aws.amazon.com/`,
        SigninToken: signinToken,
      });
      console.info(`\n\n Sign-in URL:\n`);
      console.info(
        `https://signin.aws.amazon.com/federation?${queryString}\n\n`.bold
      );
      if (!process.argv.includes("--url-only")) {
        await open(`https://signin.aws.amazon.com/federation?${queryString}`);
      }
      break;
    }
  }

  process.exit(0);
}

function printUsage() {
  console.info(
    `\nUsage: ./aws-login.ts  keys|console  vault-url  [mount-filter  [sts-issuer  aws-region  [account  [role]]]]  [--no-pass-prompt] [--url-only]\n`
      .bold
  );
  console.info(
    "  --no-pass-prompt     Disables prompting for passwords, and uses the VAULT_* environment variables"
  );
  console.info(
    "  --url-only           When invoking `console`, prints the sign-in url without also opening it"
  );
  console.info(
    "\nThe environment variables VAULT_USERNAME and VAULT_PASSWORD are used as defaults for form entry."
  );
}
