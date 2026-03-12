# Review checklist

## Critical

- Trust boundary violations
- Missing auth or authorization checks
- Data corruption risks
- Race conditions and stale writes
- Unsafe migrations
- Silent retry loops or duplicate side effects
- Broken idempotency
- Release-blocking config mistakes

## Warning

- Missing tests for risky paths
- Feature flag gaps
- Weak validation
- Frontend states not covered
- Dead code and inconsistent naming
- Logging or observability gaps
- Hidden performance regressions

## Review rules

- Prefer concrete, reproducible findings.
- Name the affected file and behavior.
- Recommend the shortest safe fix.
