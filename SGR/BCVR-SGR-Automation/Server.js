const cron = require('node-cron');
const { getPool, refreshAuth } = require('./config');

// ─────────────────────────────────────────────
//  BRANCH CONFIGURATION
//  controllerDir → maps to ./controllers/{controllerDir}/
//  Each branch loads its own acn/prd/sls controllers
//  from its dedicated folder automatically.
// ─────────────────────────────────────────────
const BRANCHES = {
    catanduanes: {
    label: "Catanduanes Branch (CBS)",
    dbName: "BCVR-CBS",
    branchCode: "CBS",
    acnFolder: "1YatHY6HZzgxNqM6Tmsj9w-0_TGYP8TPB",
    prdFolder: "172IN0fmXBe2VP_RHkrgnDVYocUFGcBeb",
    slsFolder: "1rCRTIfQncjm5svX1zQTkWKp3CMy22zrg",
  },
  dw: {
    label: "Distribution Warehouse (DW)",
    dbName: "BCVR-DW",
    branchCode: "DW",
    acnFolder: "13O7nLrcMA-MV_bLJHrfG6ZZbQSS6n59p",
    prdFolder: "1s2NS6sTQC8TgfHXEd7BU-fNjRAgaeXNF",
    slsFolder: "14VG5m1l-B5eTemvK0ZXk6MqcXGwbX4Q4",
  },
  dds: {
    label: "Distribution Display Store (DDS)",
    dbName: "BCVR-DDS",
    branchCode: "DDS",
    acnFolder: "1vKy8WpmZfj4QOKdCnQiE_UWufAsOvBv_",
    prdFolder: "172IN0fmXBe2VP_RHkrgnDVYocUFGcBeb",
    slsFolder: "1R-1-l3BAzKe3W8wye9FHMOVYW0jBKFby",
  },
  phssn: {
    label: "Pharmacy Sale Store Naga (PHSSN)",
    dbName: "BCVR-PHSSN",
    branchCode: "PHSSN",
    acnFolder: "1DMHOI4Q5nxrrq1Y386U_NvWK9QRmhe0N",
    prdFolder: "18_ipVF6W9kmk2hKV0V0yBRYC-GXrBPsn",
    slsFolder: "13So2gjFcokEM23wud2TMDuqFY24pZpKf",
  },
  iriga: {
    label: "Iriga Branch (IBS)",
    dbName: "BCVR-IBS",
    branchCode: "IBS",
    acnFolder: "1NYRzyrMh0y24051_9AaWLg45CHHMc4zL",
    prdFolder: "1geoGvNvDngTzlXD-LaE8PPyp5LwUG-3z",
    slsFolder: "1MgJDN1xhxypvLsb-CvlF-LhU_jLP6F8V",
  },
  phssi: {
    label: "Pharmacy Sale Store Iriga (PHSSI)",
    dbName: "BCVR-PHSSI",
    branchCode: "PHSSI",
    acnFolder: "1PXPiIQbYAw44K_9Wd2LfF4myad2xkavd",
    prdFolder: "1lfAyChAcgWhqUzzfxvrEEVYglZwAx6Rj",
    slsFolder: "1_nKcXtf_jt4S6_dfb-YFxdRiff7iNSnS",
  },
  masbate: {
    label: "Masbate Branch (MBS)",
    dbName: "BCVR-MBS",
    branchCode: "MBS",
    acnFolder: "1lgz5m7pXQsS8u25V4tjIIlMU_ojQYaNY",
    prdFolder: "1AuxNUBHdiZUQLLOyzG7Lc66q6sJvRQFX",
    slsFolder: "11WnXyYB0OBX7HuRz_fdCSHQmvdHF9yHI",
  },
  sorsogon: {
    label: "Sorsogon Branch (SBS)",
    dbName: "BCVR-SBS",
    branchCode: "SBS",
    acnFolder: "1ZlrquPeXvzaJdAk1bqBLLFPL6m1nqaKm",
    prdFolder: "1s2NS6sTQC8TgfHXEd7BU-fNjRAgaeXNF",
    slsFolder: "1cb2TKC7AgN8PhSvGZo9naZoQOCXeyDxt",
  },

};

// ─────────────────────────────────────────────
//  CONTROLLER LOADER
//  Requires the branch-specific controller files.
//  Falls back to mainserver if a branch folder
//  doesn't have its own version yet.
// ─────────────────────────────────────────────
function loadControllers(controllerDir) {
    function load(name) {
        const branchPath     = `./controllers/${controllerDir}/${name}Controller`;
        const mainserverPath = `./controllers/mainserver/${name}Controller`;
        try {
            const ctrl = require(branchPath);
            console.log(`   📂 [${name.toUpperCase()}] Using branch controller: ${branchPath}`);
            return ctrl;
        } catch {
            console.warn(`   ⚠️  [${name.toUpperCase()}] Branch controller not found at "${branchPath}", falling back to mainserver.`);
            return require(mainserverPath);
        }
    }
    return {
        acn: load('acn'),
        prd: load('prd'),
        sls: load('sls'),
    };
}

// ─────────────────────────────────────────────
//  CORE SYNC FUNCTION
// ─────────────────────────────────────────────
async function syncBranch(branchKey) {
    const config = BRANCHES[branchKey];
    if (!config) {
        console.error(`❌ Unknown branch: "${branchKey}"`);
        return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 Auto-sync triggered — Branch: ${branchKey.toUpperCase()} | DB: ${config.dbName}`);
    console.log(`📁 Controller folder: ./controllers/${branchKey}/`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    console.log(`${'='.repeat(60)}`);

    try {
        // 0. Load this branch's controllers
        console.log(`\n🔧 Loading controllers for ${branchKey}...`);
        const { acn, prd, sls } = loadControllers(branchKey);

        // 1. Refresh Google Auth token
        console.log(`\n🔑 Refreshing Google Auth token...`);
        await refreshAuth();
        console.log(`✅ Auth refreshed.`);

        // 2. Connect to branch database
        console.log(`\n🔌 Connecting to ${config.dbName}...`);
        const pool = await getPool(config.dbName);
        console.log(`✅ Pool acquired for ${config.dbName}.`);

        // 3. Sequential Sync — PRD → SLS → ACN
        console.log(`\n--- [1/3] Starting PRD (Products) Sync for ${config.branchCode} ---`);
        await prd.run(pool, config.prdFolder, config.branchCode);
        console.log(`--- ✅ PRD Sync complete for ${config.branchCode} ---`);

        console.log(`\n--- [2/3] Starting SLS (Sales) Sync for ${config.branchCode} ---`);
        await sls.run(pool, config.slsFolder, config.branchCode);
        console.log(`--- ✅ SLS Sync complete for ${config.branchCode} ---`);

        console.log(`\n--- [3/3] Starting ACN (Accounting) Sync for ${config.branchCode} ---`);
        await acn.run(pool, config.acnFolder, config.branchCode, config.dbName);
        console.log(`--- ✅ ACN Sync complete for ${config.branchCode} ---`);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎉 ALL SYNCS DONE — ${branchKey.toUpperCase()} at ${new Date().toLocaleString()}`);
        console.log(`${'='.repeat(60)}\n`);

    } catch (err) {
        console.error(`\n❌ SYNC FAILED for ${branchKey.toUpperCase()}:`, err.message);
        console.error(err.stack);
    }
}

// ─────────────────────────────────────────────
//  SYNC ALL BRANCHES IN SEQUENCE
// ─────────────────────────────────────────────
async function syncAllBranches() {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`🚀 SCHEDULED SYNC STARTED — ${new Date().toLocaleString()}`);
    console.log(`${'#'.repeat(60)}`);

    for (const branchKey of Object.keys(BRANCHES)) {
        await syncBranch(branchKey);
    }

    console.log(`\n${'#'.repeat(60)}`);
    console.log(`✅ ALL BRANCHES SYNCED — ${new Date().toLocaleString()}`);
    console.log(`${'#'.repeat(60)}\n`);
}

// ─────────────────────────────────────────────
//  CRON SCHEDULE
//  Runs every day at 6:00 AM and 6:00 PM (PST).
//  Examples:
//    '0 6 * * *'       → 6:00 AM daily
//    '0 18 * * *'      → 6:00 PM daily
//    '0 6,18 * * *'    → 6:00 AM and 6:00 PM daily
//    '0 */4 * * *'     → Every 4 hours
//    '*/30 * * * *'    → Every 30 minutes
// ─────────────────────────────────────────────
const SCHEDULE = '0 6,18 * * *';

cron.schedule(SCHEDULE, () => {
    syncAllBranches().catch(err => {
        console.error('❌ Unhandled error in scheduled sync:', err);
    });
}, {
    scheduled: true,
    timezone: 'Asia/Manila',
});

// ─────────────────────────────────────────────
//  STARTUP — run once immediately on launch
// ─────────────────────────────────────────────
console.log('\n🤖 BCVR Auto-Sync Service started.');
console.log(`📅 Schedule: "${SCHEDULE}" (Asia/Manila / PST)`);
console.log(`📋 Branches: ${Object.keys(BRANCHES).map(b => `${b} → controllers/${b}/`).join(', ')}`);
console.log(`⏰ Starting initial sync now...\n`);

syncAllBranches().catch(err => {
    console.error('❌ Startup sync failed:', err);
});