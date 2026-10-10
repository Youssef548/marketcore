Review the current MarketCore diff.

Scope:
${ARGUMENTS:-current working tree}

Use the `reviewer` agent. Review for correctness, security, tenant isolation, financial consistency,
concurrency regressions, contract drift, broken package boundaries, missing tests, fake-green tests,
and proof gaps.

Lead with findings. If there are no findings, say so plainly and name any residual test risk.
