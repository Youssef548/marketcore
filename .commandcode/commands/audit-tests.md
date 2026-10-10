Audit MarketCore tests for fake-green coverage.

Scope:
${ARGUMENTS:-the current branch}

Use the `test-auditor` agent. Focus on assertions that cannot fail, wrong test layers, missing
negative cases, copied contracts, host/proxy/cookie behaviour tested in the wrong harness, and claims
in `docs/superpowers/STATUS.md` that lack executable evidence.

Return findings in severity order and name the smallest test that would prove each missing claim.
