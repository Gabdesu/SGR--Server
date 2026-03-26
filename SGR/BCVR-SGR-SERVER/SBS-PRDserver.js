const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const creds = require('./credentials.json');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
// REPLACE THIS: The ID of the Google Drive folder containing your monthly reports
const FOLDER_ID = '1s2NS6sTQC8TgfHXEd7BU-fNjRAgaeXNF'; 

const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets', 
        'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
});

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth }); // Initialize Drive API
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth() {
    const monthNames = ["BCVR [SGR_PRD_SBS_JAN_2026] BCVR Sorsogon Branch Store | January 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_FEB_2026] BCVR Sorsogon Branch Store | February 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_MAR_2026] BCVR Sorsogon Branch Store | March 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_APR_2026] BCVR Sorsogon Branch Store | April 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_MAY_2026] BCVR Sorsogon Branch Store | May 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_JUN_2026] BCVR Sorsogon Branch Store | June 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_JUL_2026] BCVR Sorsogon Branch Store | July 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_AUG_2026] BCVR Sorsogon Branch Store | August 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_SEP_2026] BCVR Sorsogon Branch Store | September 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_OCT_2026] BCVR Sorsogon Branch Store | October 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_NOV_2026] BCVR Sorsogon Branch Store | November 2026 - ​Products",
                        "BCVR [SGR_PRD_SBS_DEC_2026] BCVR Sorsogon Branch Store | December 2026 - ​Products"               
    ];
    const now = new Date();
    const currentFileName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    try {
        const response = await driveApi.files.list({
            q: `'${FOLDER_ID}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            fields: 'files(id, name)',
        });

        if (response.data.files.length === 0) {
            console.error(`❌ No spreadsheet found matching "${currentFileName}" in folder.`);
            return null;
        }

        const file = response.data.files[0];
        console.log(`📂 Found active file: ${file.name} (ID: ${file.id})`);
        return file.id;
    } catch (err) {
        console.error("❌ Drive Search Error:", err.message);
        return null;
    }
}

// --- SQL QUERY REPOSITORY ---
const queries = {
    'Fast Moving (Meds)': `
        DECLARE @StartDate DATE = '2025-01-01', @EndDate DATE = '2025-12-31';
        SELECT TOP 100 
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4 
            THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4) ELSE MAX(I.Item_Name) END as Product, 
            COUNT(O.order_no) as Freq, 
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) as Quantity, 
            MAX(Item_Packaging) as Packaging
        FROM TBL_Orders_Detail OD 
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No 
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 1 
        AND Order_Type LIKE '%Sales%' 
        AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date) ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END 
        ORDER BY COUNT(O.order_no) DESC`,

    'Fast Moving (Supplies)': `
        DECLARE @StartDate DATE = '2025-01-01', @EndDate DATE = '2025-12-31';
        SELECT TOP 100 
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4 
            THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4) ELSE MAX(I.Item_Name) END as Product, 
            COUNT(O.order_no) as Freq, 
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) as Quantity, 
            MAX(Item_Packaging) as Packaging
        FROM TBL_Orders_Detail OD 
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No 
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 2 
        AND Order_Type LIKE '%Sales%' 
        AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date) ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END 
        ORDER BY COUNT(O.order_no) DESC`,

    'Procurement': `
        DECLARE @EndDate DATE = '2025-12-31';
        SELECT NULL AS Encode, NULL AS Entity, DATEDIFF(day, O.Order_Date, @EndDate) AS DaysLacking, I.Item_Name, NULL AS Brand, SUM(OD.QTY) AS Quantity, I.Item_Packaging, I.Item_Org_Price, (SUM(OD.QTY) * I.Item_Org_Price) AS Total, 'Lacking' AS Status
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0 AND O.Order_Date BETWEEN '2025-01-01' AND @EndDate
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date ORDER BY DATEDIFF(day, O.Order_Date, @EndDate) DESC`,

    'Procurement-Special': `
        DECLARE @EndDate DATE = '2025-12-31';
        SELECT NULL AS Encode, NULL AS Entity, DATEDIFF(day, O.Order_Date, @EndDate) AS DaysLacking, I.Item_Name, NULL AS Brand, SUM(OD.QTY) AS Quantity, I.Item_Packaging, I.Item_Org_Price, SUM(OD.QTY * I.Item_Org_Price) AS Total, 'Special Case' AS Status
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0 AND O.Order_Date BETWEEN '2025-01-01' AND @EndDate AND I.Catg_ID IN (SELECT Catg_ID FROM TBL_Category_File WHERE group_ID = 3)
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date ORDER BY DATEDIFF(day, O.Order_Date, @EndDate) DESC`,

    'Slow Moving': `
        SELECT I.Item_Name, S.Item_QTY, I.Item_Packaging FROM TBL_Category_Item_File I INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0 AND I.Item_ID NOT IN (SELECT DISTINCT OD.Item_ID FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No WHERE O.Order_Date BETWEEN '2025-10-02' AND '2025-12-31')
        ORDER BY S.Item_QTY DESC`,

    'Out of Stocks': `
        SELECT DISTINCT I.Item_Name, S.Item_QTY, I.Item_Packaging, I.Item_Org_Price, (S.Item_QTY * I.Item_Org_Price)
        FROM TBL_Category_Item_File I INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0 AND S.Item_QTY <= 2 ORDER BY S.Item_QTY ASC`,

    'Discounted (Loyalty)': `
        SELECT I.Item_Name, SUM(OD.QTY) AS Qty, I.Item_Packaging, AVG(OD.Disc_Price) AS AvgDisc, AVG(OD.Orig_Price) AS AvgOrig, SUM(OD.Disc_Price * OD.QTY) AS TotalDisc, SUM(OD.Orig_Price * OD.QTY) AS TotalOrig
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID 
        WHERE O.Order_Date BETWEEN '2025-01-01' AND '2025-12-31' AND OD.isLoyalty = 'Yes' GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

    'Discounted (Senior)': `
        SELECT I.Item_Name, SUM(OD.QTY) AS Qty, I.Item_Packaging, AVG(OD.Disc_Price) AS AvgDisc, AVG(OD.Orig_Price) AS AvgOrig, SUM(OD.Disc_Price * OD.QTY) AS TotalDisc, SUM(OD.Orig_Price * OD.QTY) AS TotalOrig
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID 
        WHERE O.Order_Date BETWEEN '2025-01-01' AND '2025-12-31' AND OD.isSenior = 'Yes' GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

    'Expired': `
        SELECT I.Item_Name, OD.Lot_No, OD.Exp_Date, I.Item_Org_Price, (OD.QTY * I.Item_Org_Price), OD.QTY
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0 AND (OD.Exp_Date = '02/2026' OR OD.Exp_Date = '2/2026') ORDER BY OD.Exp_Date ASC`,

    'Near Expiry': `
        SELECT I.Item_Name, OD.Lot_No, OD.Exp_Date, I.Item_Org_Price, (OD.QTY * I.Item_Org_Price) as Total, OD.QTY
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE TRY_CAST(OD.Exp_Date AS DATE) BETWEEN '2025-01-01' AND '2025-12-31' AND OD.QTY > 0 ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC`,

    'Top Peso Sold (Meds)': `
        SELECT I.Item_Name, OD.Lot_No, OD.Exp_Date, SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS TotalSold
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE I.Catg_ID IN (392979, 564572, 91602, 81593) AND O.Order_Type LIKE '%Sorsogon%' AND CAST(O.Order_Date AS DATE) BETWEEN '2025-01-01' AND '2025-12-31'
        GROUP BY I.Item_Name, OD.Lot_No, OD.Exp_Date ORDER BY SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) DESC`,

    'Top Peso Sold (Supplies)': `
        SELECT I.Item_Name, OD.Lot_No, OD.Exp_Date, SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS TotalSold
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908) AND O.Order_Type LIKE '%Sorsogon%' AND O.Order_Date BETWEEN '2025-01-01' AND '2025-12-31'
        GROUP BY I.Item_Name, OD.Lot_No, OD.Exp_Date ORDER BY SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) DESC`,

    'High Peso Value': `
        SELECT CASE WHEN I.Catg_ID IN (392979, 564572, 91602, 101990, 81593) THEN 'MEDICINES' ELSE 'SUPPLIES' END AS Type, 
        I.Item_Name AS Product, S.Item_QTY AS Qty, I.Item_Org_Price AS Price, I.Item_WS_With_OR AS WSOR, I.Item_Retail_Price AS Retail
        FROM TBL_Category_Item_File I INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0 AND I.Catg_ID IN (392979, 564572, 91602, 101990, 81593, 272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908)
        ORDER BY 1 ASC, I.Item_Org_Price DESC`,

    'Lacking Served': `
        SELECT 'GPFS', O.Order_No, OOS.OS_Client, OOS.OS_OrderType, I.Item_ID, I.Item_Name, O.Order_Remarks, OOS.OS_Quantity, OOS.OS_Quantity AS LackingQty, '', O.Encoded_By
        FROM TBL_OutOfStock_Lacking OOS INNER JOIN TBL_Category_Item_File I ON OOS.OS_ID = I.Item_ID LEFT JOIN TBL_Orders O ON OOS.OS_Client = O.Client_Name
        WHERE OOS.OS_OrderType LIKE '%Sorsogon%' ORDER BY OOS.OS_Date DESC`

    
};

async function syncQueryToSheet(spreadsheetId, query, sheetName) {
    let pool;
    try {
        pool = await new sql.ConnectionPool({
            user: 'intern', 
            password: 'intern2026', 
            server: '192.168.1.191',
            database: 'BCVR-SBS', 
            options: { encrypt: false, trustServerCertificate: true }
        }).connect();

        const result = await pool.request().query(query);
        const rows = result.recordset;

        const startAtRow6 = [
            'Out of Stocks', 'Expired', 'Near Expiry', 
            'Top Peso Sold (Meds)', 'Top Peso Sold (Supplies)'
        ];

        const startRow = (sheetName === 'High Peso Value') ? 5 : (startAtRow6.includes(sheetName) ? 6 : 5);

        if (sheetName === 'High Peso Value') {
            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: [`'${sheetName}'!A${startRow}:F1000`, `'${sheetName}'!H${startRow}:M1000`] }
            });

            if (rows && rows.length > 0) {
                const mapRow = (r) => ['', r.Product, r.Qty, r.Price, r.WSOR, r.Retail];
                const meds = rows.filter(r => r.Type === 'MEDICINES').map(mapRow);
                const supplies = rows.filter(r => r.Type === 'SUPPLIES').map(mapRow);

                const batchData = [];
                if (meds.length > 0) batchData.push({ range: `'${sheetName}'!A${startRow}`, values: meds });
                if (supplies.length > 0) batchData.push({ range: `'${sheetName}'!H${startRow}`, values: supplies });

                if (batchData.length > 0) {
                    await sheetsApi.spreadsheets.values.batchUpdate({
                        spreadsheetId,
                        requestBody: { data: batchData, valueInputOption: 'RAW' }
                    });
                    console.log(`✅ [${sheetName}] Data synced starting at A${startRow}.`);
                } else {
                    console.log(`⚠️ [${sheetName}] SKIPPED: No sub-records for Meds or Supplies.`);
                }
            } else {
                console.log(`⚠️ [${sheetName}] SKIPPED: Database returned 0 records.`);
            }
        } else {
            const dataRange = `'${sheetName}'!A${startRow}:Z1000`; 
            await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: dataRange });

            if (rows && rows.length > 0) {
                const values = rows.map(r => Object.values(r));
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${startRow}`,
                    valueInputOption: 'RAW',
                    requestBody: { values },
                });
                console.log(`✅ [${sheetName}] Data synced at Row ${startRow}.`);
            } else {
                console.log(`⚠️ [${sheetName}] SKIPPED: No records found in SQL.`);
            }
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    } finally {
        if (pool) await pool.close();
    }
}

async function runSyncCycle() {
    console.log(`\n🚀 STARTING SYNC CYCLE: ${new Date().toLocaleString()}`);
    
    // Dynamically find the spreadsheet for the current month
    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth();

    if (!currentSpreadsheetId) {
        console.log("⚠️ Sync Cycle Aborted: Could not find target spreadsheet in folder.");
        return;
    }

    for (const [tabName, sqlQuery] of Object.entries(queries)) {
        await syncQueryToSheet(currentSpreadsheetId, sqlQuery, tabName);
        await sleep(3000); 
    }
    console.log(`\n✨ SYNC CYCLE FINISHED SUCCESSFULLY.\n`);
}

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    runSyncCycle(); 
});