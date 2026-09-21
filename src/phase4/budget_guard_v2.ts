import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const BUDGET_POOLS = ["dev", "formal_controllers", "formal_qa", "formal_aux"] as const;
export type BudgetPool = typeof BUDGET_POOLS[number];
export interface BudgetConfig {
  campaignId: string;
  totalMicroUsd: number;
  pools: Record<BudgetPool, number>;
}
export const PHASE4_BUDGET_V2: BudgetConfig = {
  campaignId: "phase4-low-budget-28-v2",
  totalMicroUsd: 28_000_000,
  pools: { dev: 1_000_000, formal_controllers: 24_000_000, formal_qa: 1_000_000, formal_aux: 2_000_000 },
};
export type ReservationStatus = "reserved" | "dispatched" | "unknown" | "settled" | "cancelled";
export interface Reservation {
  id: string;
  pool: BudgetPool;
  upperMicroUsd: number;
  requestHash: string;
  status: ReservationStatus;
  actualMicroUsd: number | null;
}
export interface BudgetTotals {
  limitMicroUsd: number;
  settledMicroUsd: number;
  heldMicroUsd: number;
  unknownMicroUsd: number;
  committedMicroUsd: number;
  availableMicroUsd: number;
}
export interface BudgetSnapshot {
  campaignId: string;
  halted: boolean;
  haltReason: string | null;
  total: BudgetTotals;
  pools: Record<BudgetPool, BudgetTotals>;
  reservations: Reservation[];
}

function money(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Money must be nonnegative integer microUSD");
}
function canonicalConfig(config: BudgetConfig): string {
  if (!config.campaignId) throw new Error("campaignId required");
  money(config.totalMicroUsd);
  for (const pool of BUDGET_POOLS) money(config.pools[pool]);
  if (Object.keys(config.pools).length !== BUDGET_POOLS.length) throw new Error("Unexpected pool");
  return JSON.stringify({ campaignId: config.campaignId, totalMicroUsd: config.totalMicroUsd,
    pools: Object.fromEntries(BUDGET_POOLS.map(pool => [pool, config.pools[pool]])) });
}

/** Every paid attempt requires reserve -> markDispatched -> transport.
 * Never automatically resend a dispatched/unknown reservation after a crash.
 */
export class BudgetGuard {
  private readonly db: DatabaseSync;
  private readonly config: BudgetConfig;

  constructor(path: string, config: BudgetConfig) {
    const configJson = canonicalConfig(config);
    this.config = JSON.parse(configJson) as BudgetConfig;
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 30_000 });
    try {
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS budget_config_v2 (
          singleton INTEGER PRIMARY KEY CHECK(singleton=1), config_json TEXT NOT NULL,
          halted INTEGER NOT NULL DEFAULT 0 CHECK(halted IN (0,1)), halt_reason TEXT
        ) STRICT;
        CREATE TABLE IF NOT EXISTS budget_reservations_v2 (
          id TEXT PRIMARY KEY, pool TEXT NOT NULL,
          upper_micro INTEGER NOT NULL CHECK(upper_micro>=0), request_hash TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('reserved','dispatched','unknown','settled','cancelled')),
          actual_micro INTEGER CHECK(actual_micro>=0), created_at TEXT NOT NULL,
          dispatched_at TEXT, updated_at TEXT NOT NULL,
          CHECK((status='settled' AND actual_micro IS NOT NULL) OR (status!='settled' AND actual_micro IS NULL))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS budget_events_v2 (
          seq INTEGER PRIMARY KEY, reservation_id TEXT, event TEXT NOT NULL, detail TEXT, time TEXT NOT NULL
        ) STRICT;
      `);
      this.transaction(() => {
        const prior = this.db.prepare("SELECT config_json FROM budget_config_v2 WHERE singleton=1").get();
        if (prior && prior.config_json !== configJson) throw new Error("Budget config immutable: existing campaign or caps differ");
        if (!prior) this.db.prepare("INSERT INTO budget_config_v2(singleton,config_json) VALUES(1,?)").run(configJson);
      });
    } catch (error) { this.db.close(); throw error; }
  }

  close(): void { this.db.close(); }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private event(id: string, event: string, detail: string | null = null): void {
    this.db.prepare("INSERT INTO budget_events_v2(reservation_id,event,detail,time) VALUES(?,?,?,?)")
      .run(id,event,detail,new Date().toISOString());
  }

  private assertOpen(): void {
    const row = this.db.prepare("SELECT halted,halt_reason FROM budget_config_v2 WHERE singleton=1").get()!;
    if (row.halted) throw new Error(`Budget campaign halted: ${row.halt_reason}`);
  }

  getReservation(id: string): Reservation | null {
    const row = this.db.prepare("SELECT * FROM budget_reservations_v2 WHERE id=?").get(id);
    return row ? { id: String(row.id), pool: String(row.pool) as BudgetPool,
      upperMicroUsd: Number(row.upper_micro), requestHash: String(row.request_hash),
      status: String(row.status) as ReservationStatus,
      actualMicroUsd: row.actual_micro === null ? null : Number(row.actual_micro) } : null;
  }

  private required(id: string): Reservation {
    const row = this.getReservation(id);
    if (!row) throw new Error(`Unknown reservation ${id}`);
    return row;
  }

  reserve(input: {id: string; pool: BudgetPool; upperMicroUsd: number; requestHash: string}): Reservation {
    money(input.upperMicroUsd);
    if (!input.id || !input.requestHash) throw new Error("Reservation id and requestHash required");
    if (!BUDGET_POOLS.includes(input.pool)) throw new Error("Unknown budget pool");
    return this.transaction(() => {
      this.assertOpen();
      if (this.getReservation(input.id)) throw new Error(`Duplicate reservation ${input.id}; never redispatch`);
      const snapshot = this.snapshotUnsafe();
      if (input.upperMicroUsd > snapshot.pools[input.pool].availableMicroUsd) throw new Error(`Budget pool exhausted: ${input.pool}`);
      if (input.upperMicroUsd > snapshot.total.availableMicroUsd) throw new Error("Global budget exhausted");
      const timestamp = new Date().toISOString();
      this.db.prepare("INSERT INTO budget_reservations_v2(id,pool,upper_micro,request_hash,status,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?)")
        .run(input.id,input.pool,input.upperMicroUsd,input.requestHash,timestamp,timestamp);
      this.event(input.id,"reserved");
      return this.required(input.id);
    });
  }

  markDispatched(id: string): Reservation {
    return this.transaction(() => {
      this.assertOpen();
      const row = this.required(id);
      if (row.status !== "reserved") throw new Error(`Cannot dispatch ${row.status} reservation`);
      const timestamp = new Date().toISOString();
      this.db.prepare("UPDATE budget_reservations_v2 SET status='dispatched',dispatched_at=?,updated_at=? WHERE id=?")
        .run(timestamp,timestamp,id);
      this.event(id,"dispatched");
      return this.required(id);
    });
  }

  markUnknown(id: string): Reservation {
    return this.transaction(() => {
      const row = this.required(id);
      if (!["dispatched","unknown"].includes(row.status)) throw new Error(`Cannot mark ${row.status} unknown`);
      this.db.prepare("UPDATE budget_reservations_v2 SET status='unknown',updated_at=? WHERE id=?").run(new Date().toISOString(),id);
      this.event(id,"unknown","Full reservation remains held until authoritative invoice");
      return this.required(id);
    });
  }

  settle(id: string, actualMicroUsd: number): Reservation {
    money(actualMicroUsd);
    const result = this.transaction(() => {
      const row = this.required(id);
      if (row.status === "settled") {
        if (row.actualMicroUsd !== actualMicroUsd) throw new Error("Conflicting invoice for settled reservation");
        return { row, violation: actualMicroUsd > row.upperMicroUsd };
      }
      if (!["dispatched","unknown"].includes(row.status)) throw new Error(`Cannot settle ${row.status} reservation`);
      this.db.prepare("UPDATE budget_reservations_v2 SET status='settled',actual_micro=?,updated_at=? WHERE id=?")
        .run(actualMicroUsd,new Date().toISOString(),id);
      const violation = actualMicroUsd > row.upperMicroUsd;
      this.event(id,"settled",JSON.stringify({actualMicroUsd,violation}));
      if (violation) {
        this.db.prepare("UPDATE budget_config_v2 SET halted=1,halt_reason=? WHERE singleton=1")
          .run(`Invoice exceeds reserved upper bound for ${id}: ${actualMicroUsd} > ${row.upperMicroUsd}`);
        this.event(id,"bound_violation","Campaign permanently halted; invoice retained");
      }
      return { row: this.required(id), violation };
    });
    // Throw only AFTER commit, so the excess invoice and halt survive this exception.
    if (result.violation) throw new Error(`Budget bound violation for ${id}; invoice recorded and campaign halted`);
    return result.row;
  }

  cancelUnsent(id: string, proof: {neverDispatched: true}): Reservation {
    return this.transaction(() => {
      if (proof?.neverDispatched !== true) throw new Error("Explicit neverDispatched marker required");
      const row = this.required(id);
      if (row.status !== "reserved") throw new Error(`Cannot release ${row.status} reservation without known invoice`);
      this.db.prepare("UPDATE budget_reservations_v2 SET status='cancelled',updated_at=? WHERE id=?").run(new Date().toISOString(),id);
      this.event(id,"cancelled_unsent","Caller attests transport never invoked");
      return this.required(id);
    });
  }

  snapshot(): BudgetSnapshot { return this.transaction(() => this.snapshotUnsafe()); }

  private snapshotUnsafe(): BudgetSnapshot {
    const status = this.db.prepare("SELECT halted,halt_reason FROM budget_config_v2 WHERE singleton=1").get()!;
    const reservations = this.db.prepare("SELECT id FROM budget_reservations_v2 ORDER BY created_at,id").all()
      .map(row => this.required(String(row.id)));
    const totals = (rows: Reservation[], limitMicroUsd: number): BudgetTotals => {
      const settledMicroUsd = rows.reduce((sum,row) => sum+(row.actualMicroUsd ?? 0),0);
      const heldMicroUsd = rows.filter(row => ["reserved","dispatched","unknown"].includes(row.status))
        .reduce((sum,row) => sum+row.upperMicroUsd,0);
      const unknownMicroUsd = rows.filter(row => row.status === "unknown").reduce((sum,row) => sum+row.upperMicroUsd,0);
      const committedMicroUsd = settledMicroUsd+heldMicroUsd;
      return {limitMicroUsd,settledMicroUsd,heldMicroUsd,unknownMicroUsd,committedMicroUsd,availableMicroUsd:limitMicroUsd-committedMicroUsd};
    };
    return {campaignId:this.config.campaignId,halted:Boolean(status.halted),haltReason:status.halt_reason === null ? null : String(status.halt_reason),
      total:totals(reservations,this.config.totalMicroUsd),
      pools:Object.fromEntries(BUDGET_POOLS.map(pool => [pool,totals(reservations.filter(row=>row.pool===pool),this.config.pools[pool])])) as Record<BudgetPool,BudgetTotals>,
      reservations};
  }
}
