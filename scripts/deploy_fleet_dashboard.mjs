#!/usr/bin/env node
// Guarded re-deploy helper. --check is read-only; --dispatch invokes only canonical-deploy.yml
// for qnfo-fleet-dashboard after clean-main and successful-check preflight. It uses gh's
// existing authentication and never accepts or prints Cloudflare credentials.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = "QNFO/qnfo-workers";
const WORKFLOW = "canonical-deploy.yml";
const WORKER = "qnfo-fleet-dashboard";
const CHECK_RUNS_PATH = "repos/" + REPO + "/commits/";

export function deploymentPreflight({ branch, dirty, localSha, remoteSha, checkRuns }) {
  if (branch !== "main") return { ok: false, reason: "current branch must be main" };
  if (dirty) return { ok: false, reason: "worktree must be clean" };
  if (!localSha || localSha !== remoteSha) return { ok: false, reason: "local HEAD must match origin main" };
  if (!Array.isArray(checkRuns) || checkRuns.length === 0) return { ok: false, reason: "no GitHub check runs found for main HEAD" };

  const pending = checkRuns.filter((run) => run.status !== "completed" || run.conclusion !== "success");
  if (pending.length) {
    const names = pending.map((run) => `${run.name || "unnamed check"} (${run.status || "unknown"}/${run.conclusion || "none"})`);
    return { ok: false, reason: "checks are not all successful: " + names.join(", ") };
  }
  return { ok: true, reason: "main HEAD matches origin and every check run succeeded" };
}

export function activeCanonicalRun(runs, sha) {
  return (Array.isArray(runs) ? runs : []).find((run) =>
    run.headSha === sha && ["queued", "in_progress", "requested", "waiting", "pending"].includes(run.status)
  ) || null;
}

export function canonicalDispatchArgs() {
  return [
    "workflow", "run", WORKFLOW, "--repo", REPO, "--ref", "main",
    "--field", "workers=" + WORKER
  ];
}

function command(file, args) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true });
  if (result.error) throw new Error(`${file} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || "").trim().slice(0, 1000);
    throw new Error(`${file} ${args[0] || ""} failed${result.status == null ? "" : ` (${result.status})`}${detail ? `: ${detail}` : ""}`);
  }
  return String(result.stdout || "").trim();
}

function readCheckRuns(sha) {
  const output = command("gh", [
    "api", "--paginate", "--jq",
    ".check_runs[] | [.name, .status, (.conclusion // \"\")] | @tsv",
    CHECK_RUNS_PATH + sha + "/check-runs?per_page=100"
  ]);
  return output ? output.split(/\r?\n/).map((line) => {
    const [name, status, conclusion] = line.split("\t");
    return { name, status, conclusion };
  }) : [];
}

function readCanonicalRuns() {
  const output = command("gh", [
    "run", "list", "--repo", REPO, "--workflow", WORKFLOW, "--branch", "main",
    "--limit", "100", "--json", "headSha,event,status,conclusion,url"
  ]);
  return JSON.parse(output || "[]");
}

function main(args) {
  const mode = args[0] || "--check";
  if (mode === "--help" && args.length === 1) {
    console.log("Usage: node scripts/deploy_fleet_dashboard.mjs [--check|--dispatch]\n" +
      "--check verifies clean main, origin/main parity, and successful GitHub checks without deploying.\n" +
      "--dispatch explicitly requests canonical-deploy.yml with workers=qnfo-fleet-dashboard; the workflow performs deployment and live verification.");
    return 0;
  }
  if (!["--check", "--dispatch"].includes(mode) || args.length > 1) {
    console.error("Usage: node scripts/deploy_fleet_dashboard.mjs [--check|--dispatch]");
    return 2;
  }

  try {
    const branch = command("git", ["branch", "--show-current"]);
    const dirty = command("git", ["status", "--porcelain", "--untracked-files=all"]) !== "";
    const localSha = command("git", ["rev-parse", "HEAD"]);
    if (branch !== "main" || dirty) {
      const local = deploymentPreflight({ branch, dirty, localSha, remoteSha: localSha, checkRuns: [{ status: "completed", conclusion: "success" }] });
      console.error("Deployment refused: " + local.reason);
      return 1;
    }

    const remoteSha = command("gh", ["api", "repos/" + REPO + "/commits/main", "--jq", ".sha"]);
    const checkRuns = readCheckRuns(localSha);
    const readiness = deploymentPreflight({ branch, dirty, localSha, remoteSha, checkRuns });
    if (!readiness.ok) {
      console.error("Deployment refused: " + readiness.reason);
      return 1;
    }

    if (mode === "--check") {
      console.log("Preflight passed for " + WORKER + " at " + localSha + ". No deployment was requested.");
      return 0;
    }

    const running = activeCanonicalRun(readCanonicalRuns(), localSha);
    if (running) {
      console.log("Canonical deployment is already " + running.status + " for this commit: " + (running.url || "see GitHub Actions"));
      return 0;
    }

    command("gh", canonicalDispatchArgs());
    console.log("Dispatched " + WORKFLOW + " for " + WORKER + " at " + localSha + ". Verify the workflow run and live health before reporting deployment.");
    return 0;
  } catch (error) {
    console.error("Deployment helper failed: " + error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
