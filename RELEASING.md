# Releasing GoodBit

The exact sequence, and the reasons each step is where it is. Every "why" in
here cost something to find out.

## The short version

```bash
# 1. On the release branch, with a clean tree
npm run check                 # typecheck + 431 unit tests, seconds
npm run test:e2e              # the full gate, ~2 minutes, 145 tests, must be 0 skips

# 2. Version, in both files
#    package.json, then sync the lockfile
npm install --package-lock-only
git commit -am "chore: X.Y.Z"

# 3. Prove the artefact, not just the source
npx electron-builder --win    # NOT build:win, see below
npm run check:packaged        # the packaged exe boots on its own

# 4. Merge to main BEFORE tagging, because three workflows only fire there
git switch main && git merge --ff-only <release-branch> && git push

# 5. Tag. The tag is what builds and uploads the release
git tag -a vX.Y.Z -F <notes-file>
git push origin vX.Y.Z

# 6. Watch it, then write the notes and publish
gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
gh release view vX.Y.Z --json name,isDraft,assets
gh release edit vX.Y.Z --notes-file <notes-file>
gh release edit vX.Y.Z --draft=false
```

## Why each step is there

### Merge to main before tagging

**Three workflows only trigger on `main`**, so a release tagged on a branch
ships the app and nothing else:

| workflow | trigger | what it ships |
|---|---|---|
| `pages.yml` | push to `main`, `site/**` | the website |
| `publisher-image.yml` | push to `main` | the `publisher/` Docker image |
| `ci.yml` | push or PR to `main` | typecheck and unit tests |

2.0.0 was tagged on the `2.0` branch first, and the publisher's changes existed
in git and nowhere else until main caught up. Merge first and the tag sits on
main, where all four workflows see it.

Keep `main` as the default branch. A release branch as default means main rots
from the moment it is set, the next release needs its own branch, and every PR
and CI trigger points at what is really a snapshot.

### `electron-builder --win`, not `build:win`

`build:win` runs `check:pre-release`, which runs the whole e2e suite again. You
ran it in step 1. Running it twice adds two minutes and proves nothing new.

The suite cannot run on the CI runner at all: it needs a desktop session, a GPU
and ffmpeg. That is why the gate is a real machine before the tag, and why the
workflow builds with `npm run build` rather than `build:win`.

### The gate must show zero skips

`118 passed` with `2 skipped` is not a green gate, it is a green gate and two
questions. A skip that is really a wrong path looks exactly like a skip that is
really missing data, and both read as success. `hud.spec.ts` skipped for months
because it looked for a Battlefield recording under `~/Videos` on a machine
whose library is on `D:`.

### Version lives in two files

`package.json` is the source, but `package-lock.json` carries the version twice
(top level and `packages[""]`). `npm install --package-lock-only` syncs it
without touching the tree. A release built from a mismatched pair is not
broken, it just lies in `npm ls`.

### Never upload local artefacts to the release

The workflow builds the installers on the runner and uploads those. A local
build of the same commit is **not byte-identical**, so mixing them breaks
`electron-updater`: the `.blockmap` describes one specific binary and is what
differential updates diff against. A blockmap from a different build of the
same version means every update downloads the whole 226 MB, or fails.

Local artefacts are for installing and testing by hand. That is all.

## The two things that have actually gone wrong

### electron-builder creates a second release for one artifact

On 2.0.0 the tag produced **two** draft releases: `GoodBit 2.0.0` with the two
installers and `latest.yml`, and a second called `2.0.0` holding nothing but
`GoodBit-Setup-2.0.0.exe.blockmap`.

It uploads artefacts concurrently, and each upload will create the release if
it cannot find one, so two of them raced and both won. The workflow now creates
the release itself before packaging, so there is always one for the artefacts
to attach to.

If it happens anyway: move the asset across rather than re-uploading a local
copy, because of the blockmap rule above.

```bash
ASSET=$(gh api repos/DarrellVS/goodbit/releases/<stray-id>/assets --jq '.[0].id')
gh api -H "Accept: application/octet-stream" repos/DarrellVS/goodbit/releases/assets/$ASSET > asset.blockmap
gh release upload vX.Y.Z asset.blockmap --clobber
gh api -X DELETE repos/DarrellVS/goodbit/releases/<stray-id>
```

### The release arrives as a draft, on purpose

`electron-builder`'s default `releaseType` is `draft` and it is left that way:
publishing is the last human decision, after reading the notes and the asset
list. It also means `latest.yml` is not live until you say so, and that file is
what every installed copy checks to decide whether to update itself.

So a tag that finishes green is not a release yet. Step 6 is not optional.

## What "released" means for an installed copy

`latest.yml` in the published release is the auto-update feed. The moment the
release stops being a draft, every installed GoodBit on its next check sees the
new version and updates itself. There is no staged rollout and no way to take it
back other than publishing something newer, so the gate belongs before the
publish, not after.

## Checklist

- [ ] `npm run check` green
- [ ] `npm run test:e2e` green, **0 failed and 0 skipped**
- [ ] version bumped in `package.json`, lockfile synced
- [ ] `npx electron-builder --win` succeeds
- [ ] `npm run check:packaged` says the exe boots
- [ ] release branch fast-forwarded into `main` and pushed
- [ ] tag pushed, `release.yml` green
- [ ] exactly **one** release for the tag
- [ ] assets: setup exe, portable exe, `latest.yml`, `.exe.blockmap`
- [ ] notes written
- [ ] draft published
