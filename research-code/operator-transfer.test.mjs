import assert from "node:assert/strict";
import test from "node:test";
import { convolve1d, evaluateOperatorTransfer } from "./operator-transfer.mjs";

test("convolve1d uses centered zero padding and accepts typed arrays", () => {
  assert.deepEqual(convolve1d(new Float32Array([1, 2, 3]), [1, 1, 1]), [3, 6, 5]);
  assert.deepEqual(convolve1d([1, 2, 3], [0, 1, 0]), [1, 2, 3]);
});

test("operator transfer reports prediction gain when the shared primitive transfers", () => {
  const domains = ["physics", "computing"].map((name) => ({
    name,
    samples: [
      { input: [1, 4, 2, 8], target: convolve1d([1, 4, 2, 8], [0, 1, -1]) },
      { input: [3, 5, 9, 2], target: convolve1d([3, 5, 9, 2], [0, 1, -1]) }
    ]
  }));
  const identity = (input) => input;
  const result = evaluateOperatorTransfer({
    domains,
    transfer: (input) => convolve1d(input, [0, 1, -1]),
    domainSpecific: { physics: identity, computing: identity }
  });

  assert.equal(result.domains.length, 2);
  assert.ok(result.relativeErrorGain > 0);
  assert.equal(result.transferWinsDomains, 2);
  assert.ok(result.domains.every((domain) => domain.transferMs >= 0 && domain.domainSpecificMs >= 0));
});

test("operator transfer exposes negative transfer when domain structure differs", () => {
  const input = [2, 5, 3, 7];
  const result = evaluateOperatorTransfer({
    domains: [{ name: "shifted", samples: [{ input, target: input }] }],
    transfer: (values) => convolve1d(values, [0, 1, -1]),
    domainSpecific: { shifted: (values) => values }
  });

  assert.ok(result.absoluteErrorGain < 0);
  assert.equal(result.relativeErrorGain, null);
  assert.equal(result.transferWinsDomains, 0);
  assert.ok(result.domains[0].runtimeRatio === null || result.domains[0].runtimeRatio >= 0);
});

test("operator strategies receive isolated input copies", () => {
  const result = evaluateOperatorTransfer({
    domains: [{ name: "mutable", samples: [{ input: [1, 2], target: [1, 2] }] }],
    transfer: (values) => {
      values[0] = 100;
      return values;
    },
    domainSpecific: { mutable: (values) => values }
  });

  assert.equal(result.domains[0].domainSpecificMse, 0);
  assert.ok(result.domains[0].transferMse > 0);
});

test("operator transfer rejects malformed inputs and incomplete baselines", () => {
  assert.throws(() => convolve1d([1, 2], [1, 1]), /odd/);
  assert.throws(() => convolve1d([1, Infinity], [1]), /finite/);
  assert.throws(() => evaluateOperatorTransfer({
    domains: [{ name: "toString", samples: [{ input: [1], target: [1] }] }],
    transfer: (input) => input,
    domainSpecific: {}
  }), /missing domain-specific baseline/);
  assert.throws(() => evaluateOperatorTransfer({
    domains: [{ name: "bad", samples: [{ input: [1], target: [1, 2] }] }],
    transfer: (input) => input,
    domainSpecific: { bad: (input) => input }
  }), /input length must match target length/);
});
