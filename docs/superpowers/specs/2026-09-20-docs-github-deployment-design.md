# Docs deployment through GitHub Actions

## Goal

Build and deploy the VitePress documentation through GitHub Actions so the
docs compiler lab can compile its Rust WASM package with the repository's
pinned toolchain. Replace Cloudflare Workers Builds, whose build image does not
include Rust, while retaining production deployments and adding pull-request
previews.

## Workflow

Add one workflow that runs for pushes to `main` and pull requests. Every run
will:

1. check out the requested revision;
2. install Node 24 and the repository's pinned pnpm version;
3. install nightly Rust with the `wasm32-unknown-unknown` target;
4. install workspace dependencies from the frozen lockfile;
5. run the docs tests and the existing docs build, including `hoopoe-wasm`;
6. choose the deployment command from the GitHub event.

Pushes to `main` run `wrangler deploy` and replace the production Worker.
Pull requests from this repository run `wrangler versions upload` with the
stable alias `pr-<number>`. Uploading a version does not change production
traffic. A later run for the same pull request moves its alias to the new
version.

The workflow uses concurrency groups to cancel an older in-progress build when
the same branch or pull request receives another commit.

## Preview reporting

The preview upload exposes its URL through `cloudflare/wrangler-action`. A
GitHub Script step will find a bot-owned comment containing a private marker.
It updates that comment when one exists and creates it otherwise. This leaves
one current preview link on each pull request instead of adding a comment for
every commit.

The workflow grants only `contents: read` and `pull-requests: write` repository
permissions. Production runs do not use the comment permission.

## Authentication and trust boundary

Wrangler receives `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from
GitHub Actions repository secrets. The token must be limited to deploying the
`hoopoe-lang` Worker where Cloudflare's token controls permit that scope.

GitHub does not expose repository secrets to pull requests from forks. Those
pull requests still install, test, and build the docs but skip the Cloudflare
upload and preview comment. The workflow will not use `pull_request_target`
because doing so would allow untrusted pull-request code to run with deployment
credentials.

## Cutover

The GitHub workflow becomes the sole deployment owner after one successful
production run. Cloudflare's repository integration must then be disabled so a
push to `main` cannot start a second deployment. Disabling the integration is a
manual or separately approved infrastructure action; it is not encoded in the
repository workflow.

## Verification

Before enabling deployment:

- validate the workflow syntax;
- run the docs tests;
- run the complete docs build with nightly Rust and the WASM target;
- run Wrangler dry runs for the production deploy and preview version upload;
- confirm the workflow references only the two expected Cloudflare secrets.

After the secrets are configured, verify one same-repository pull request
produces a stable preview link and one `main` run deploys production. Only then
disable Cloudflare Workers Builds.
