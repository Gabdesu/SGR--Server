const sql = require("mssql");
const { JWT } = require("google-auth-library");
const creds = require("./credentials.json");

// ╔══════════════════════════════════════════════════════════════╗
// ║                  📅 DATE RANGE SETTINGS                     ║
// ║  Adjust these values before running a sync.                  ║
// ║  All controllers read from here — one place to change.       ║
// ╚══════════════════════════════════════════════════════════════╝

const DATE = {
  // ── Primary range (used by most tabs) ─────────────────────
  START: "2026-02-01", // YYYY-MM-DD
  END: "2026-03-31", // YYYY-MM-DD

  // ── Year-only filter (used by OPEX Monthly tab) ────────────
  YEAR: "2026", // Used in:  YEAR(Date_Payment_Check) = <YEAR>

  // ── Disbursement DateTime range (includes time component) ──
  DATETIME_START: "2026-03-01 00:00:00",
  DATETIME_END: "2026-03-31 23:59:59.997",

  // ── Remittance uses a different variable name in its query ──
  //    but still reads from START / END above — no need to
  //    duplicate unless you want a different range for it.
};

// ── Convenience: pre-formatted for direct SQL injection ─────────
//    Controllers call:  DATE.sql.start  →  '2025-01-01'
//    Template literals: `DECLARE @StartDate DATE = '${DATE.sql.start}'`
DATE.sql = {
  start: DATE.START,
  end: DATE.END,
  year: DATE.YEAR,
  datetimeStart: DATE.DATETIME_START,
  datetimeEnd: DATE.DATETIME_END,
};

// ─────────────────────────────────────────────────────────────
//  DATABASE CONNECTION
// ─────────────────────────────────────────────────────────────
const baseConfig = {
  user: "bcvr",
  password: "ButCha!142630!",
  server: "114.29.238.181",
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 15000,
  requestTimeout: 60000,
};

const pools = new Map();

async function getPool(dbName) {
  if (pools.has(dbName)) return pools.get(dbName);

  const poolPromise = new sql.ConnectionPool({
    ...baseConfig,
    database: dbName,
  })
    .connect()
    .then((pool) => {
      console.log(`✅ Connected to Database: ${dbName}`);
      pool.on("error", (err) => {
        console.error(`SQL Pool Error (${dbName}):`, err);
        pools.delete(dbName);
      });
      return pool;
    })
    .catch((err) => {
      pools.delete(dbName);
      throw err;
    });

  pools.set(dbName, poolPromise);
  return poolPromise;
}

// ─────────────────────────────────────────────────────────────
//  GOOGLE AUTH
// ─────────────────────────────────────────────────────────────
const auth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
});

async function refreshAuth() {
  await auth.authorize();
}

module.exports = { getPool, auth, refreshAuth, DATE };
