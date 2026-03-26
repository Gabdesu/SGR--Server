const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { OpenAI } = require('openai');
const creds = require('./credentials.json');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const FOLDER_ID = '1s2NS6sTQC8TgfHXEd7BU-fNjRAgaeXNF'; 

// Initialize OpenAI with your .env key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, 
});

const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets', 
        'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
});

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- SQL CONFIG (Updated to .182 as per your request) ---
const dbConfig = {
    user: 'intern', 
    password: 'intern2026', 
    server: '192.168.1.182',
    database: 'BCVR-SBS', 
    options: { encrypt: false, trustServerCertificate: true }
};

// --- HELPER: FIND SPREADSHEET BY MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth() {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    const now = new Date();
    // Generates string like "March 2026"
    const currentFileName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    console.log(`📂 Searching for Drive file: "${currentFileName}"...`);

    try {
        const response = await driveApi.files.list({
            q: `'${FOLDER_ID}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            fields: 'files(id, name)',
        });

        if (response.data.files.length === 0) {
            return null;
        }

        const file = response.data.files[0];
        console.log(`✅ Found Active Spreadsheet: ${file.name} (${file.id})`);
        return file.id;
    } catch (err) {
        console.error("❌ Drive Search Error:", err.message);
        return null;
    }
}

// --- AI QUERY GENERATOR ---
async function generateAIQuery(sheetName, headers) {
    // Filter out empty strings from headers caused by merged cells or formatting
    const cleanHeaders = headers.filter(h => h && h.trim() !== "");
    console.log(`🤖 AI is mapping headers for tab: [${sheetName}]...`);
    
    const prompt = `
        Act as a SQL Expert for the BCVR medical inventory system. 
        Tables: TBL_Orders, TBL_Orders_Detail, TBL_Category_Item_File, TBL_Stocks_Balances, TBL_Category_File.
        
        Task: Generate a T-SQL SELECT statement for the tab "${sheetName}".
        The Google Sheet has these specific headers: [${cleanHeaders.join(", ")}].
        
        Rules:
        1. Map SQL columns to these headers using "AS". Match header spelling exactly.
        2. Use 2025 records (Order_Date BETWEEN '2025-01-01' AND '2025-12-31').
        3. Join TBL_Orders_Detail with TBL_Category_Item_File on Item_ID.
        4. Return ONLY the raw T-SQL code. No markdown, no comments.
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: [{ role: "user", content: prompt }],
        });
        return completion.choices[0].message.content.replace(/```sql|```/g, '').trim();
    } catch (err) {
        console.error("❌ AI Query Generation Failed:", err.message);
        return null;
    }
}

// --- CORE SYNC ENGINE ---
async function syncTabWithAI(spreadsheetId, sheetName) {
    let pool;
    try {
        // 1. Get the first 10 rows to find the headers dynamically (handles the blue banner)
        const rangeRes = await sheetsApi.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!A1:Z10`, 
        });

        const rows = rangeRes.data.values;
        if (!rows || rows.length === 0) {
            console.log(`⚠️ [${sheetName}] Tab is empty. Skipping.`);
            return;
        }

        // 2. DYNAMIC HEADER FINDER: Look for the row that contains "Product" or "Freq"
        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < rows.length; i++) {
            const rowStr = rows[i].join(" ").toLowerCase();
            // Look for common keywords in your BCVR reports
            if (rowStr.includes("product") || rowStr.includes("freq") || rowStr.includes("item") || rowStr.includes("qty")) {
                headerRowIndex = i;
                headers = rows[i];
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.log(`⚠️ [${sheetName}] Could not find a header row (e.g., 'Product'). Skipping.`);
            return;
        }

        // Calculate where data starts: +1 for 0-index, +1 to go below headers
        const startDataRow = headerRowIndex + 2; 
        console.log(`🔍 [${sheetName}] Headers detected at Row ${headerRowIndex + 1}. Data starts at ${startDataRow}.`);

        // 3. Generate Dynamic SQL via AI based on those headers
        const dynamicQuery = await generateAIQuery(sheetName, headers);
        if (!dynamicQuery) return;

        // 4. Connect to SQL Server and Execute
        pool = await new sql.ConnectionPool(dbConfig).connect();
        const result = await pool.request().query(dynamicQuery);
        const dbRows = result.recordset;

        // 5. Update Sheet
        if (dbRows && dbRows.length > 0) {
            const values = dbRows.map(r => Object.values(r));
            
            // Clear previous data starting from the dynamic start row
            await sheetsApi.spreadsheets.values.clear({ 
                spreadsheetId, 
                range: `'${sheetName}'!A${startDataRow}:Z1000` 
            });

            // Write new AI-mapped data
            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A${startDataRow}`,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`✨ [${sheetName}] Sync Successful: ${dbRows.length} rows inserted starting at A${startDataRow}.`);
        } else {
            console.log(`⚠️ [${sheetName}] No matching records found in database.`);
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Sync Error:`, err.message);
    } finally {
        if (pool) await pool.close();
    }
}

// --- MAIN RUNNER ---
async function runFullSync() {
    console.log(`\n🚀 STARTING AI SYNC CYCLE: ${new Date().toLocaleString()}`);
    
    // Step 1: Find the right file
    const spreadsheetId = await getSpreadsheetIdForCurrentMonth();

    if (!spreadsheetId) {
        console.log("❌ Sync Aborted: Could not find a spreadsheet for the current month in Drive.");
        return;
    }

    // Step 2: Get all tab names within that spreadsheet
    try {
        const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
        const tabs = meta.data.sheets.map(s => s.properties.title);

        // Step 3: Process each tab one by one
        for (const tabName of tabs) {
            await syncTabWithAI(spreadsheetId, tabName);
            await sleep(3000); // 3-second delay to stay within Google/OpenAI API limits
        }
    } catch (err) {
        console.error("❌ Metadata Fetch Error:", err.message);
    }
    
    console.log(`\n🏁 SYNC CYCLE FINISHED.\n`);
}

app.listen(PORT, () => {
    console.log(`🚀 AI Backend running on port ${PORT}`);
    runFullSync(); 
});