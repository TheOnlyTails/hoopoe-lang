# Docs GitHub deployment implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Rust-backed VitePress docs from GitHub Actions on `main` and publish stable Cloudflare preview URLs on same-repository pull requests.

**Architecture:** One workflow owns build, test, production deployment, and preview upload. It builds the existing `hoopoe-wasm` package with pinned Rust and Node toolchains, then selects `wrangler deploy` or `wrangler versions upload` from the GitHub event. A marked GitHub Actions bot comment is created once per pull request and updated on later runs.

**Tech Stack:** GitHub Actions, pnpm 11.15.0, Node.js 24, nightly Rust, wasm-pack, VitePress, Wrangler 4.129.0, Cloudflare Workers preview aliases.

## Global constraints

- Production deploys run only for pushes to `main`.
- Pull-request uploads use the stable alias `pr-<number>` and never receive production traffic.
- Fork pull requests build and test but never receive Cloudflare or GitHub write credentials.
- Use only the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets for Cloudflare authentication.
- Never use `pull_request_target` to build pull-request code.
- Keep one current preview comment per pull request.
- Do not disable Cloudflare Workers Builds until a GitHub Actions production deployment succeeds.

---

### Task 1: Add the docs deployment workflow

**Files:**
- Create: `.github/workflows/docs-deploy.yml`

**Interfaces:**
- Consumes: root `package.json` package-manager pin, `pnpm-lock.yaml`, `rust-toolchain.toml`, `docs/package.json`, `docs/wrangler.jsonc`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID`.
- Produces: production deployments from `main`, aliased preview versions named `pr-<number>`, and one updated preview-link comment per same-repository pull request.

- [ ] **Step 1: Record the failing deployment evidence**

Read the latest failed Cloudflare Workers Build log and confirm it contains:

```text
Error: failed to start `cargo metadata`: No such file or directory (os error 2)
```

This is the RED check: the old deployment path cannot run the existing `prebuild` script because its image has no Rust toolchain.

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/docs-deploy.yml` with this content:

```yaml
name: Deploy docs

on:
  push:
    branches: ["main"]
  pull_request:

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: docs-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Set up pnpm
        uses: pnpm/action-setup@v6
      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - name: Set up Rust
        uses: dtolnay/rust-toolchain@nightly
        with:
          targets: wasm32-unknown-unknown
      - name: Cache Rust build
        uses: Swatinem/rust-cache@v2
        with:
          shared-key: docs-wasm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Test docs
        run: pnpm --filter hoopoe-docs test
      - name: Build docs
        run: pnpm --filter hoopoe-docs build
      - name: Deploy production
        if: github.event_name == 'push'
        uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: docs
          wranglerVersion: 4.129.0
          packageManager: pnpm
          command: deploy
      - name: Upload pull-request preview
        if: >-
          github.event_name == 'pull_request' &&
          github.event.pull_request.head.repo.full_name == github.repository
        id: preview
        uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: docs
          wranglerVersion: 4.129.0
          packageManager: pnpm
          command: versions upload --preview-alias pr-${{ github.event.pull_request.number }}
      - name: Comment preview URL
        if: >-
          github.event_name == 'pull_request' &&
          github.event.pull_request.head.repo.full_name == github.repository
        uses: actions/github-script@v9
        env:
          PREVIEW_URL: ${{ steps.preview.outputs.deployment-url }}
        with:
          script: |
            const marker = "<!-- hoopoe-docs-preview -->";
            const body = `${marker}\nDocs preview: [${process.env.PREVIEW_URL}](${process.env.PREVIEW_URL})`;
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(
              (comment) =>
                comment.user?.login === "github-actions[bot]" &&
                comment.body?.includes(marker),
            );

            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }
```

- [ ] **Step 3: Validate syntax and trust conditions**

Run:

```sh
pnpm dlx yaml-lint .github/workflows/docs-deploy.yml
rg -n "pull_request_target|CLOUDFLARE_|head.repo.full_name|preview-alias" .github/workflows/docs-deploy.yml
```

Expected: YAML validation exits 0; `pull_request_target` has no match; exactly the two intended Cloudflare secret names appear; preview deployment is guarded by the head-repository equality check; and the alias uses the pull-request number.

- [ ] **Step 4: Run docs tests and the complete build**

Run:

```sh
pnpm install --frozen-lockfile
pnpm --filter hoopoe-docs test
pnpm --filter hoopoe-docs build
```

Expected: all docs tests pass and VitePress reports `build complete` after wasm-pack finishes.

- [ ] **Step 5: Verify both Wrangler commands without changing Cloudflare**

Run:

```sh
pnpm --dir docs exec wrangler deploy --dry-run
pnpm --dir docs exec wrangler versions upload --dry-run --preview-alias pr-1
```

Expected: both commands package the contents of `docs/.vitepress/dist` and exit 0 without uploading or deploying.

- [ ] **Step 6: Review and commit the workflow**

Run:

```sh
git diff --check
jj diff --stat
jj diff -- .github/workflows/docs-deploy.yml
jj commit -m "Deploy docs through GitHub Actions"
```

Expected: one new workflow file, no whitespace errors, and a single implementation commit.

### Task 2: Configure and prove the deployment cutover

**Files:**
- Modify: GitHub repository Actions secrets, through repository settings or `gh secret set`.
- Modify after successful production deployment: Cloudflare Worker `hoopoe-lang` build integration.

**Interfaces:**
- Consumes: the workflow from Task 1 and a Cloudflare API token with permission to deploy the `hoopoe-lang` Worker.
- Produces: an authenticated GitHub deployment path and removal of the failing duplicate Cloudflare Git trigger.

- [ ] **Step 1: Configure GitHub repository secrets**

Set `CLOUDFLARE_ACCOUNT_ID` to account `6f6f2b04446ddf30098fc2c2550476a7`. Create a scoped Cloudflare API token that can edit Workers scripts for this account, then store it as `CLOUDFLARE_API_TOKEN`. Never print the token or pass it as a command argument.

Confirm only the names and timestamps:

```sh
gh secret list --repo TheOnlyTails/hoopoe-lang
```

Expected: both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are listed.

- [ ] **Step 2: Push the implementation when explicitly approved**

Move the `main` bookmark to the implementation head and push only after the user approves publishing. The push should start the `Deploy docs` workflow.

- [ ] **Step 3: Verify production and preview behavior**

Confirm the `main` workflow completes successfully and serves the generated docs from the production Worker. Open a same-repository pull request, confirm `versions upload` succeeds, and verify its single bot comment links to an aliased `pr-<number>` preview URL. Push another commit to that pull request and confirm the workflow updates the existing comment rather than adding another.

- [ ] **Step 4: Disable Cloudflare Workers Builds**

After the successful production run, disconnect or disable the Git repository under the `hoopoe-lang` Worker's **Settings > Builds** page. This is a shared infrastructure change and requires explicit approval immediately before execution.

- [ ] **Step 5: Verify the final ownership boundary**

Push a later docs-only commit and confirm exactly one deployment starts, in GitHub Actions, while Cloudflare Workers Builds creates no build. Record any authentication or permission failure without weakening the fork trust check.
