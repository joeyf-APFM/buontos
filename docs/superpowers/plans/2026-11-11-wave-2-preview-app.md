# Wave 2 preview app (Nucleus): deploy plan

**Status:** wave 2 was merged into `development` as `54277c32` on 2026-11-12, so A1 (the wave commits), A2 and A4 are done. A2 needed no rebase: local `development` had not moved and the remote had nothing new. **Nothing is created until the owner approves the deploy itself.** Every step below that writes to the workspace is confirmed first.

## Owner decisions (2026-11-11)
- A **separate app**, deployed from `restyle/wave-2`. apfm-ontos is untouched.
- A **new SQL warehouse** of its own.
- **Data:** a **branch of the prod Lakebase** (`projects/ontos-db`, branched from `production`), copy-on-write, so nothing done in the preview reaches prod.
- **Access:** the owner and **a group of reviewers**.
- **AI features as in prod:** `LLM_ENABLED=True` with the same serving endpoint, and `HELIX_ENABLED=false`.

## Decided 2026-11-11
1. **Workspace:** the same one as apfm-ontos, `dbc-88a3d066-4cdb`. Pass `--profile dbc-88a3d066-4cdb` explicitly.
2. **App name:** "Nucleus" (owner confirmed the spelling 2026-11-11). Databricks app names are lowercase, so the app id is `nucleus` and the display name is "Nucleus".
3. **Reviewer group:** a new Databricks group, `NucleusOntosReviewers`, with these members:
   - the group `DataServicesAdmins`, as a nested group;
   - brian.flynn@aplaceformom.com;
   - matthew.monahan@aplaceformom.com;
   - the owner, who is also granted access directly.

   Creating the group is a workspace or account write, so it's confirmed at deploy time.

## Still open
4. **Branch lifetime:** the default is `no_expiry`, deleted by hand when wave 2 ships, unless the owner says otherwise.
5. **Warehouse size:** proposed the smallest serverless size, with auto-stop at 10 minutes.
6. **The Lakebase branch id and warehouse name:** proposed `nucleus` and `nucleus-warehouse`.

## Steps

### Part A: Code first. The app deploys only from code that's in the repo.
A1. **Commit everything.**
- The wave-2 task commits already exist on `restyle/wave-2`.
- Commit this plan and any preview config: the bundle target, and the `app.yaml` change from step 5.
- `git status` must be clean, apart from git-ignored scratch.

A2. **Rebase onto the latest `development`.**
- `git fetch`, then rebase `restyle/wave-2` onto `origin/development`, or onto local `development` if it has moved.
- Resolve any conflicts in the owning task's files.
- No force-push to any shared branch without the owner.

A3. **Re-verify the rebased tree:**
- `npx vitest run` and `npm run type-check`;
- the full Playwright suite on 3200;
- `git diff --stat development -- src/backend` must be empty, apart from the preview config.

A4. **Merge into `development`** (plan Task 17, Step 5), only on the owner's go-ahead.

A5. **Push,** only on the owner's go-ahead. Push `development`, plus the branch if the owner wants it kept on the remote.

A6. **Deploy from that commit.**
- Record the pushed SHA.
- The Nucleus app is built and deployed from exactly that commit, in a clean checkout or the worktree at that SHA. Never from uncommitted files.
- Note the SHA in the deployment's description, so what's running can always be traced.

### Part B: Workspace setup and deploy. Each write is confirmed first.
1. **Discover (read-only).** Collect apfm-ontos's resources, env, `user_api_scopes`, permissions and service principal. Also collect the ontos-db project, its branches (the limit is 10 unarchived), its endpoint and database, and the schema `app_ontos`. Check the workspace's warehouse options.
2. **Warehouse.** Create the preview's own serverless warehouse. Grant the preview SP `CAN_USE` on it.
3. **Lakebase branch.** `create-branch projects/ontos-db <preview-branch>` from `production`, with the chosen expiry, plus a read-write endpoint on it.
4. **Schema ownership on the branch (the known trap).**
   - The branch's `app_ontos` schema and its tables are owned by **apfm-ontos's SP role**, copied over with the data.
   - The new app's SP only gets `CAN_CONNECT_AND_CREATE`, so it would fail with `permission denied … 42501`.
   - **On the branch only**, as the project owner, either transfer ownership (`REASSIGN OWNED BY <prod SP> TO <preview SP>`, or `ALTER SCHEMA/TABLE … OWNER TO`) or grant usage and DML plus default privileges.
   - This touches only the preview branch. The `production` branch is never changed.
5. **App config.**
   - Add a bundle target, or app config, for the preview, with no workspace values hard-coded:
     - `LAKEBASE_INSTANCE_NAME`, or the `postgres` resource (`branch` and `database` paths), pointing at the preview branch;
     - `DATABRICKS_WAREHOUSE_ID` from the new warehouse resource;
     - the same volume, or a preview volume (decide at discovery);
     - the same serving endpoint (`LLM_ENDPOINT`);
     - `HELIX_ENABLED=false`.
   - **Also fix:** `src/app.yaml` hard-codes `LAKEBASE_INSTANCE_NAME = projects/ontos-db/branches/production`. Move it to a per-target value, so the preview and the future workspace move can override it.
6. **Create the app.** Create it and match apfm-ontos's `user_api_scopes`, which are prod scope changes, so the owner confirms them first. Grant the preview SP access to the warehouse, the volume, the Lakebase branch and the serving endpoint.
7. **Build and deploy.** Build the frontend from `restyle/wave-2` and deploy it to the preview app.
8. **Permissions.** `CAN_USE` for the owner and the reviewer group only. There is no `*` grant, unlike apfm-ontos's bundle default.
9. **Verify.** Open the app as the owner, and check the Build pages as an owner and as a reviewer-group member, one dialog per area, a data contract and the Asset Explorer. Check that a write in the preview doesn't appear in apfm-ontos. Check the app logs for schema or permission errors.
10. **Teardown, after wave 2 ships:** delete the app, the warehouse and the preview branch. All three are confirmed first.

## Risks
- **Real prod data in the preview:** the branch is a full copy, so the reviewers see prod metadata. That's intended, but the reviewer group should match who may see prod.
- **Startup migrations:** the preview runs wave 2's backend against a copy of prod's schema. Wave 2 changes no backend code (Task 17 checks `git diff development -- src/backend`), so the migrations are expected to be a no-op.
- **The branch drifts:** it stops tracking prod once created. Recreate it to refresh, since the CLI has no reset.
