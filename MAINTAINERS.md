# Project maintenance

## Ownership

The initial maintenance contact is [@ShiYu0318](https://github.com/ShiYu0318).
`.github/CODEOWNERS` routes review requests to that account until module reviewers are assigned.
It is a temporary routing default, not a requirement that one person implement or review every
change. Owners listed there must have write access to the repository.

Assign a primary reviewer and a backup for each area in the CONTRIBUTING repository map as team
members join. Record real GitHub handles in CODEOWNERS once those responsibilities are agreed.
Use one Issue with an assignee per work item, and link dependent Issues when work crosses modules.
Discuss shared API, schema, SSE and widget contracts before splitting their implementation.

Give regular contributors write access where appropriate; reserve administrator access for the
people maintaining repository settings. External contributors can use forks. Accounts, signing
keys and provider credentials belong to individuals or managed service accounts, not a shared login.

## Planning work

Use a small board with Backlog, Ready, In progress, In review, and Done states. A Ready item has
an owner, a bounded outcome, acceptance criteria and known dependencies. Keep one main work item
per person where possible, and resolve interface dependencies before parallel implementation.
Review priorities and blocked work together regularly. A change is Done after review, passing
checks, a merge, and any required documentation or release note updates.

## Review and merge

Authors explain the change and its checks. Reviewers examine behavior, failure cases, compatibility,
and maintainability. The maintainer resolves release and merge decisions. An automated review can
help find problems but does not replace an accountable human approval.

Use a merge commit when a branch contains meaningful commits worth preserving. For noisy
development branches, agree on a squash merge and use an English Conventional Commit title for
the resulting commit; the PR title itself remains Traditional Chinese. Never force-push `main`.
Keep source branches when needed to preserve experiments or coursework history. After merging,
fetch and update local `main` with `git pull --ff-only`; protect any uncommitted work first.

## Repository setup

The files in this repository provide guidance and CI, but do not enable GitHub merge protection
by themselves. An administrator should configure and verify a ruleset for `main`:

- Require pull requests and at least one non-author approving review.
- Dismiss stale approvals after changes and require review conversations to be resolved.
- Require the `api` and `web` CI jobs to succeed before merging.
- Block force pushes and branch deletion. Keep any bypass permissions narrow and documented.
- Require Code Owner approval after module owners and backups have been agreed, so the initial
  fallback owner does not become a bottleneck.

Enable private vulnerability reporting if available, and confirm who monitors it before directing
reporters there. Configure labels and team access deliberately; Issue forms avoid relying on labels
that might not exist yet. Consider dependency update automation after assigning someone to triage it.
These settings must be checked in GitHub; they are not asserted to be enabled by this document.

## Maintaining a usable project

Keep the README setup path, environment templates and CI aligned. Review outdated Issues and
release notes regularly. Mark incomplete capabilities as planned and separate model-quality
measurements from deterministic software tests. Keep decisions needed by other contributors in
tracked Issues, PRs or public documentation rather than local ignored notes.
