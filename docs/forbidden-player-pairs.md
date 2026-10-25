# Forbidden player pairs

SuperAdmin manages the list under “Spillere som ikke må spille på samme bane”. Each pair contains two distinct membership numbers. The server canonicalizes order and rejects duplicate/reversed pairs. A member may appear in multiple pairs.

## Storage and behavior

Rules are stored in `forbidden_pairs` in the installation's D1 database. They are hard constraints for both partners and opponents: the two members cannot share a court in the same match.

The optimizer receives the list with its input. The website independently validates solver proposals and manual edits. A change during calculation invalidates the old result's save; calculate again. Already saved plans are not rewritten automatically.

[Migration 0023](../drizzle/0023_forbidden_pairs.sql) transfers the historical HIK exclusions when relevant legacy members are present. A new empty club database gets no HIK-specific rows. Those historical values remain migration data, not constants in the solver.

## Deployment and tests

Changes to this contract require the website and optimizer to agree, and the migration must exist before code uses the table. Use the coordinated [deployment procedure](../DEPLOYMENT.md).

Relevant coverage: `tests/forbidden-pairs.test.mjs`, `tests/forbidden-pairs-api.test.mjs`, and the optimizer self-tests. This feature does not introduce multiple-club isolation within one database.
