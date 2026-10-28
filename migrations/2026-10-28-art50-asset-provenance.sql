-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS asset_provenance;
-- BP26-PROVENANCE-MARKING-1 (2026-10-28, charter pillar research; agent_issues 1000335; deadline 2026-12-02). EU AI Act Art. 50(2): output of generative systems already on the market before
-- 2026-08-02 must be marked in a machine-readable way by 2026-12-02. The marking is a signed JSON sidecar per generated asset (qnfo-gateway, Ed25519 over WebCrypto, public key at
-- /.well-known/provenance-key.json; docs/BP26-SECURITY-CLUSTER.md section BP26-PROVENANCE-MARKING-1). This table is the LEDGER between the signer and the producer of the metric
-- provenance_marking_coverage (scripts/bp26_provenance_marking_coverage.py, owned by another session, which looks for a table named like asset_provenance):
--   the signer (qnfo-gateway) writes one row per asset it has signed: asset_id (paper:<slug>@<version>), kind, url of the asset, sha256 of the exact bytes signed, the sidecar url, the key id and the
--   signing time; it also writes verified_ok = 1 only after it has re-read its own sidecar and verified the signature with the PUBLIC key as published (a self-check, not an independent one);
--   the producer is the independent verifier: it fetches manifest_url, verifies the signature against the key at /.well-known/provenance-key.json and records its own verdict in verified_by_probe_at /
--   probe_ok. Coverage = assets with probe_ok = 1 over assets published since 2026-08-02 (every row of this table plus the not-yet-signed papers the producer counts from living-paper).
-- No secret or key material is stored here; manifest_kind says 'signed-sidecar' now and 'c2pa' only after a CA-issued certificate exists (docs: identity-bound).
CREATE TABLE IF NOT EXISTS asset_provenance (
  asset_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  published_at TEXT,
  manifest_kind TEXT NOT NULL DEFAULT 'signed-sidecar' CHECK (manifest_kind IN ('signed-sidecar', 'c2pa')),
  manifest_url TEXT NOT NULL,
  key_id TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  provenance TEXT,
  verified_ok INTEGER,
  verified_at TEXT,
  probe_ok INTEGER,
  verified_by_probe_at TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_provenance_kind ON asset_provenance (kind, signed_at);
