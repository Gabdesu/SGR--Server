const sql  = require('mssql');
const { JWT } = require('google-auth-library');
const creds = require('./credentials.json');

// ╔══════════════════════════════════════════════════════════════╗
// ║                  📅 DATE RANGE SETTINGS                     ║
// ║  Automatically targets the PREVIOUS month.                   ║
// ║  No manual changes needed — runs on the 1st, gets last month.║
// ╚══════════════════════════════════════════════════════════════╝

function buildLastMonthRange() {
    const now   = new Date();

    // If January → roll back to December of previous year
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    // NOTE: getMonth() is 0-indexed (Jan=0, Apr=3).
    //       We want the PREVIOUS month, so we skip the -1 — that's intentional.
    //       April (getMonth()=3) → month=3 → March ✅

    const pad     = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate(); // day-0 trick: last day of `month`

    const START = `${year}-${pad(month)}-01`;
    const END   = `${year}-${pad(month)}-${lastDay}`;
    const YEAR  = String(year);

    return {
        START,
        END,
        YEAR,
        DATETIME_START: `${START} 00:00:00`,
        DATETIME_END:   `${END} 23:59:59.997`,

        // ── Convenience: pre-formatted for direct SQL injection ──────
        //    Controllers call:  DATE.sql.start  →  e.g. '2026-03-01'
        //    Template literals: `DECLARE @StartDate DATE = '${DATE.sql.start}'`
        sql: {
            start:         START,
            end:           END,
            year:          YEAR,
            datetimeStart: `${START} 00:00:00`,
            datetimeEnd:   `${END} 23:59:59.997`,
        },
    };
}

const DATE = buildLastMonthRange();

// ── Quick log so you always know what range was resolved at startup ──
console.log(`📅 Date range resolved → ${DATE.START}  to  ${DATE.END}  (Year: ${DATE.YEAR})`);

// ─────────────────────────────────────────────────────────────
//  DATABASE CONNECTION
// ─────────────────────────────────────────────────────────────
const baseConfig = {
    user:     'intern',
    password: 'intern2026',
    server:   '192.168.1.165',
    options:  { encrypt: false, trustServerCertificate: true },
    pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout:    60000,
};

const pools = new Map();

async function getPool(dbName) {
    if (pools.has(dbName)) return pools.get(dbName);

    const poolPromise = new sql.ConnectionPool({ ...baseConfig, database: dbName })
        .connect()
        .then(pool => {
            console.log(`✅ Connected to Database: ${dbName}`);
            pool.on('error', err => {
                console.error(`SQL Pool Error (${dbName}):`, err);
                pools.delete(dbName);
            });
            return pool;
        })
        .catch(err => {
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
    key:   creds.private_key,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/drive.file',
    ],
});

async function refreshAuth() {
    await auth.authorize();
}

module.exports = { getPool, auth, refreshAuth, DATE };