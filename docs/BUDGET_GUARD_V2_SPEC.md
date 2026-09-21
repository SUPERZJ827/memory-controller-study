# Phase 4 budget guard v2

This additive guard preserves all older code/configurations. The campaign ceiling is $28 inclusive of development. Separate immutable pools are development $1, formal B/C controllers $24, formal QA $1, and formal failed/retry/auxiliary requests $2. Unused pool money is never transferred. Development retries, failures, QA, and auxiliaries all use `dev`; they cannot consume formal reserves.

All accounting uses integer microUSD. Before transport starts, the runner must compute a conservative upper cost bound using uncached input pricing, maximum paid output (including reasoning where applicable), request overhead and any applicable fees. Round upward. Unknown or unbounded pricing means no dispatch. The guard cannot turn an incorrect price/token bound into a guarantee; any bound violation is retained in the ledger and permanently halts new dispatch.

`reserve({id,pool,upperMicroUsd,requestHash})` uses SQLite `BEGIN IMMEDIATE`, WAL and FULL synchronous commits. It checks settled actual invoices plus all reserved, dispatched and unknown upper bounds against both pool and campaign caps. Each physical retry gets its own unique attempt ID and reservation. Identical retry payload hashes do not waive a reservation.

The runner calls `markDispatched(id)` immediately before invoking transport. This transition is atomic and permitted exactly once. A crash between this marker and transport conservatively retains the hold. Duplicate IDs throw; resumed dispatched or unknown attempts must never automatically resend. The dispatch marker and HTTP delivery cannot be made one transaction, so the guard favors retaining excess reservations over duplicate billing.

After a known authoritative invoice, `settle(id,actualMicroUsd)` records the actual bill and releases only the unused portion. A zero bill must be authoritative, never inferred from an error/timeout/missing metadata. `markUnknown(id)` preserves the full reservation until authoritative settlement. Reopening the same database retains all holds and refuses any campaign identity or cap change.

`cancelUnsent(id,{neverDispatched:true})` is only valid while status is `reserved`, with explicit caller attestation that transport was never invoked. It cannot release dispatched or unknown attempts. No expiry or automatic unlock exists. Known invoices can still be reconciled after a halt. `getReservation(id)` and `snapshot()` expose durable state for resume and reporting.

The database is the campaign authority, so every Phase 4 paid caller must share its path. Creating another database is not a supported budget reset. The runner must retain existing Phase 4 development usage in this ledger, if any, before new paid dispatch.

Simulation command: `npx tsx src/phase4/budget_guard_v2_test.ts --report phase4/budget_guard_v2_simulation.json`. Tests issue no network/model requests. They exercise exact boundaries, pool and global ceilings, restart persistence, duplicate dispatch, independent retry reservations, unknown bills, cancellation restrictions, immutable caps, bound violations and simultaneous reservations from 12 OS processes.
