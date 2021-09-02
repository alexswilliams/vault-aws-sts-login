# AWS STS Token Generator via Vault


This is a utility for precisely the following scenario:
 - you have a Vault instance that mounts AWS accounts, and allows role assumption through STS by writing to those mounts
 - you have vault users that are granted access to those mounts
 - those users authenticate with vault using LDAP binding

(This was made with a very specific company in mind, but is open-sourced in case it's of any use to others.)

## Pre-requisites
Depends on:
 - an installation of Node 14 or above (this repo supplies an `.nvmrc` file for this purpose)
 - to have all packages installed.

```bash
nvm use # (and perhaps `nvm install .....` if prompted)
npm ci
./run.sh .....
```
## Usage

### Keys
To persist a temporary AWS credential into your ~/.aws/credentials file, run the following:
```bash
./run.sh keys  https://vault-url/
```
You will be prompted for a username and password for Vault LDAP authentication, and then prompted to choose an account and role to assume.

### Console
To both persist temporary AWS credentials _and_ open a link to the web console as that federated role, you can use the command `console`:
```bash
./run.sh console  https://vault-url/ "aws/xxxxx-" "token-issuer" "eu-west-1"
```
The required parameters are:
 - Vault URL
 - Mount prefix (that can filter your vault mountpoints to those which are relevant)
 - Token issuer for STS
 - Region to make STS call in

### Specifying Account and Role
You can optionally specify all parameters in order to also hard-code an account name and role name, and avoid any interactive prompts, e.g.:
```bash
./run.sh keys  https://vault-url/ "aws/xxxxx-" "token-issuer" "eu-west-1" "aws-account-mount-name" "assumed-role-name"
```


### Options
You can specify some flags to affect the behaviour of this app:
```
--no-pass-prompt: Disables prompting for passwords, and uses the VAULT_* environment variables
--url-only: When invoking `console`, prints the sign-in url without also opening it
```

### Environment Variables
The `VAULT_USERNAME` and `VAULT_PASSWORD` environment variables provide defaults for the vault login prompt.
