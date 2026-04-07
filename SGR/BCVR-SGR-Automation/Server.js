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
    acnFolder: "1fra8xw1lwAGrXc27zm44x0vSOTUcg6C3",
    prdFolder: "1uUOydk5AJXSln0IFEjwuFeRycn9CrbSP",
    slsFolder: "1-LYQYff07qTa56hW_zNT5oVdncb8klEP",
  },
  dw: {
    label: "Distribution Warehouse (DW)",
    dbName: "BCVR-DW",
    branchCode: "DW",
    acnFolder: "12uwjH14ASjw4NOjQGrkMkTiZlHiZk-5t",
    prdFolder: "1Z0UlsIvxN9xo-NKcCD9kZ01YOFe7bwIf",
    slsFolder: "1pBKGCjeRwocP5nmfdYXhv7g2AvEV3a0A",
  },
  dds: {
    label: "Distribution Display Store (DDS)",
    dbName: "BCVR-DDS",
    branchCode: "DDS",
    acnFolder: "19J4SfyjRs6cTzGUBKzQ-QrAm2Ef7opar",
    prdFolder: "1LZYG-vKnthpXeK9AsRyIDXe5jb71KBCz",
    slsFolder: "1KLj20-G5VIiNANFCZeFVIJLNaKBeF2i1",
  },
  phssn: {
    label: "Pharmacy Sale Store Naga (PHSSN)",
    dbName: "BCVR-PHSSN",
    branchCode: "PHSSN",
    acnFolder: "1y7anF5jslkQbjqUy9r6GnkRFdnpOjjtg",
    prdFolder: "1zqfeiZx6WlSoCye0f-2cVROV_eB4PU2e",
    slsFolder: "1T8KwgD0JfuQqtbC4FyHbwKlrVJBZgVBh",
  },
  iriga: {
    label: "Iriga Branch (IBS)",
    dbName: "BCVR-IBS",
    branchCode: "IBS",
    acnFolder: "1qDBC8wYtoFSHaStbOWoIGHlrq7teKF3g",
    prdFolder: "1NsXWJvZd_jSuyExdY-LyZ4Xxcb3W4o0o",
    slsFolder: "1AFXHjwtQPU0T4fiyb5pzdc_9iZ4FM3Hp",
  },
  phssi: {
    label: "Pharmacy Sale Store Iriga (PHSSI)",
    dbName: "BCVR-PHSSI",
    branchCode: "PHSSI",
    acnFolder: "1uKJ7MhTLITWXR4ueKojYLUL5rOXdlmDO",
    prdFolder: "1Z9kowZ7tFEeli9z5T8IFGe6DNOyxtUtc",
    slsFolder: "1aoUoZV4YBSMUywMhz-fjsr4TGIOTt-t9",
  },
  masbate: {
    label: "Masbate Branch (MBS)",
    dbName: "BCVR-MBS",
    branchCode: "MBS",
    acnFolder: "11hztIjEOSy67se9iOG09Hf_57nVgO91w",
    prdFolder: "1aTG4BiZoDvAe7j6z9ogSD6V6vOl_S5b4",
    slsFolder: "11NAWr-WJCkSgYCYitbhTq2GtzeyaF2QE",
  },
  sorsogon: {
    label: "Sorsogon Branch (SBS)",
    dbName: "BCVR-SBS",
    branchCode: "SBS",
    acnFolder: "1za1GjUu3yTePdI3iXnYIdoo9w9zbOyDo",
    prdFolder: "13cvrx83vICk_rOz690JG8MWfnVY10s2Q",
    slsFolder: "1r56I38in3Iw1k0v0g61C_i4i8pG9930R"
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