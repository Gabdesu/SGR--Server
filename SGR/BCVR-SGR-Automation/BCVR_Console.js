/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           BCVR MANUAL SYNC CONSOLE (CLI)                 ║
 * ║  Run: node Console.js                                    ║
 * ║  Select branch(es) + controller(s) to sync manually.     ║
 * ║  The automated Server.js cron runs independently.        ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const inquirer = require("inquirer");
const { getPool, refreshAuth } = require("./config");

// ─────────────────────────────────────────────────────────────
//  BRANCH REGISTRY
//  Each branch maps to its own controller folder and DB name.
//  Folder convention: controllers/<branchKey>/prdController.js
//                                             slsController.js
//                                             acnController.js
// ─────────────────────────────────────────────────────────────
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
    dbName: "BCVR-SBS",
    branchCode: "SBS",
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
    acnFolder: "1-YKqq_8CCAA3tENqH_sGJKz1x_C1VHaE",
    prdFolder: "1uSM3YyTOLmnMcIubRQsov3vvAuyAEui1",
    slsFolder: "1LK1kmCB-iVb37p7Lj2w6RUQ-Ozm6AUfa",
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
    acnFolder: "10p-jWvb8LdVFwWy-bzyP10om0b6KgKn6",
    prdFolder: "1GWxLrCyxKjKX1A19hJYpsAIIkDNeNoiT",
    slsFolder: "1czYqvtmYrvSjUleTdMtEJkOfbyJpzvr7",
  },
  sorsogon: {
    label: "Sorsogon Branch (SBS)",
    dbName: "BCVR-SBS",
    branchCode: "SBS",
    acnFolder: "1MWei3v1aAv6gZqnGZ_vFDogUHpwtsw3o",
    prdFolder: "16EUF96TG5GZBowNHo37pTmA1YsZlGOys",
    slsFolder: "1wMYho2SlFSjO8JIUAIK88Ls4yqLGRdln",
  },
  // ── Add the remaining 5 branches below ──────────────────
  // branch4: {
  //     label:      'Branch 4 (B4S)',
  //     dbName:     'BCVR-B4S',
  //     branchCode: 'B4S',
  //     acnFolder:  'FOLDER_ID',
  //     prdFolder:  'FOLDER_ID',
  //     slsFolder:  'FOLDER_ID',
  // },
  // branch5: { ... },
  // branch6: { ... },
  // branch7: { ... },
  // branch8: { ... },
};

// ─────────────────────────────────────────────────────────────
//  CONTROLLER LOADER
//  Dynamically requires the correct controller file per branch.
//  e.g. controllers/sorsogon/prdController.js
// ─────────────────────────────────────────────────────────────
function loadController(branchKey, type) {
  try {
    return require(`./controllers/${branchKey}/${type}Controller`);
  } catch (err) {
    throw new Error(
      `❌ Cannot load "${type}Controller" for branch "${branchKey}".\n` +
        `   Expected: ./controllers/${branchKey}/${type}Controller.js\n` +
        `   ${err.message}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SYNC RUNNER
// ─────────────────────────────────────────────────────────────
async function runSync(branchKey, controllers) {
  const config = BRANCHES[branchKey];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🌐  Branch : ${config.label}`);
  console.log(`🗄️   DB     : ${config.dbName}`);
  console.log(`⚙️   Syncing: ${controllers.join(", ")}`);
  console.log(`⏰  Started : ${new Date().toLocaleString()}`);
  console.log(`${"═".repeat(60)}\n`);

  try {
    // 1. Refresh Google auth
    console.log("🔑 Refreshing Google Auth token...");
    await refreshAuth();
    console.log("✅ Auth token refreshed.\n");

    // 2. Get DB pool
    console.log(`🔌 Connecting to ${config.dbName}...`);
    const pool = await getPool(config.dbName);
    console.log(`✅ Pool acquired.\n`);

    // 3. Run selected controllers in order: PRD → SLS → ACN
    const ORDER = ["prd", "sls", "acn"];
    const selected = ORDER.filter((c) => controllers.includes(c.toUpperCase()));
    const total = selected.length;

    for (let i = 0; i < total; i++) {
      const type = selected[i];
      const label = type.toUpperCase();
      console.log(`--- [${i + 1}/${total}] Starting ${label} Sync ---`);

      const ctrl = loadController(branchKey, type);

      if (type === "acn") {
        await ctrl.run(
          pool,
          config.acnFolder,
          config.branchCode,
          config.dbName,
        );
      } else if (type === "sls") {
        await ctrl.run(pool, config.slsFolder, config.branchCode);
      } else if (type === "prd") {
        await ctrl.run(pool, config.prdFolder, config.branchCode);
      }

      console.log(`--- ✅ ${label} Sync complete ---\n`);
    }

    console.log(`${"═".repeat(60)}`);
    console.log(
      `🎉 DONE — ${config.label} synced at ${new Date().toLocaleString()}`,
    );
    console.log(`${"═".repeat(60)}\n`);
  } catch (err) {
    console.error(`\n❌ SYNC FAILED for ${config.label}:`);
    console.error(`   ${err.message}`);
    if (err.stack) console.error(err.stack);
    console.log("");
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS: Print header banner
// ─────────────────────────────────────────────────────────────
function printBanner() {
  console.clear();
  console.log("");
  console.log("  ╔═════════════════════════════════════════════╗");
  console.log("  ║        BCVR  MANUAL  SYNC  CONSOLE          ║");
  console.log("  ║   Select a branch and controllers to sync   ║");
  console.log("  ╚═════════════════════════════════════════════╝");
  console.log("");
}

// ─────────────────────────────────────────────────────────────
//  MAIN MENU LOOP
// ─────────────────────────────────────────────────────────────
async function mainMenu() {
  printBanner();

  const branchChoices = Object.entries(BRANCHES).map(([key, val]) => ({
    name: val.label,
    value: key,
  }));

  // ── Step 1: Pick a branch ──────────────────────────────
  const { branchKey } = await inquirer.prompt([
    {
      type: "list",
      name: "branchKey",
      message: "📍 Select a branch to sync:",
      choices: [
        ...branchChoices,
        new inquirer.Separator(),
        { name: "🚫  Exit", value: "__exit__" },
      ],
      pageSize: 12,
    },
  ]);

  if (branchKey === "__exit__") {
    console.log("\n👋 Exiting BCVR Sync Console. Goodbye!\n");
    process.exit(0);
  }

  // ── Step 2: Pick controllers ───────────────────────────
  const { controllers } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "controllers",
      message: `⚙️  Which controllers to run for ${BRANCHES[branchKey].label}?`,
      choices: [
        { name: "📦  PRD — Products", value: "PRD", checked: true },
        { name: "💰  SLS — Sales", value: "SLS", checked: true },
        { name: "📊  ACN — Accounting", value: "ACN", checked: true },
      ],
      validate(answer) {
        if (answer.length === 0) {
          return "⚠️  Please select at least one controller.";
        }
        return true;
      },
    },
  ]);

  // ── Step 3: Confirm ────────────────────────────────────
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `\n▶  Run [ ${controllers.join(" + ")} ] for ${BRANCHES[branchKey].label}?`,
      default: true,
    },
  ]);

  if (!confirmed) {
    console.log("\n↩️  Cancelled. Returning to menu...\n");
    return mainMenu();
  }

  // ── Step 4: Run sync ───────────────────────────────────
  await runSync(branchKey, controllers);

  // ── Step 5: Ask to run another ─────────────────────────
  const { again } = await inquirer.prompt([
    {
      type: "confirm",
      name: "again",
      message: "🔁  Sync another branch?",
      default: true,
    },
  ]);

  if (again) {
    return mainMenu();
  } else {
    console.log("\n👋 Exiting BCVR Sync Console. Goodbye!\n");
    process.exit(0);
  }
}

// ─────────────────────────────────────────────────────────────
//  ENTRY POINT
// ─────────────────────────────────────────────────────────────
mainMenu().catch((err) => {
  console.error("\n❌ Fatal error in Console.js:", err.message);
  process.exit(1);
});
