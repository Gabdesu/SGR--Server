const { google } = require('googleapis');
const { auth, DATE } = require('../../config');

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    SBS: { prefix: 'SGR_ACN_SBS', label: 'Sorsogon Branch Store' },
    MBS: { prefix: 'SGR_ACN_MBS', label: 'Masbate Branch Store'  },
    IBS: { prefix: 'SGR_ACN_IBS', label: 'Iriga Branch Store'    },
    DW:  { prefix: 'SGR_ACN_DW',  label: 'Distribution Warehouse'},
    DDS: { prefix: 'SGR_ACN_DDS', label: 'Distribution Display Store' },
    PHSSN:  { prefix: 'SGR_ACN_PHSSN',  label: 'Pharmacy & Health Supplies Store Naga'},
    PHSSI:  { prefix: 'SGR_ACN_PHSSI',  label: 'Pharmacy & Health Supplies Store Iriga'},
    CBS:  { prefix: 'SGR_ACN_CBS',  label: 'Catanduanes Branch Store'},

};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta  = BRANCH_META[branchCode] || BRANCH_META['DDS'];
    
    // Target LAST month (mirrors config.js buildLastMonthRange logic)
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
    const [shortMon, longMon] = MONTH_LABELS[month];
    
    const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - \u200BProducts`;
    console.log(`🔎 [PRD] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`);

    try {
        const response = await driveApi.files.list({
            q: `'${folderId}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
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
    // Retrieves the top 100 medicine items with the highest transaction frequency
  "Fast Moving (Meds)": `
      DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    select top 100
case when max(group_ID) = 1 then 
	LEFT(TBL_Category_Item_File.Item_Name, LEN(TBL_Category_Item_File.Item_Name) -4) 
	else max(TBL_Category_Item_File.Item_Name) end as Product, 
COUNT(tbL_orders.order_no) as Freq, 
SUM(case when order_type like '%Sales%' and order_type Not like '%Transfer%' then QTY else 0 end) as Quantity,
MAX(Item_Packaging) as Packaging
		from TBL_Orders_Detail
		inner join tbl_orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
		inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
		inner join TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
where group_id = 1 and Order_Type like '%Sales%'
and Order_Type not like '%Transfer%'
AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
--and Item_Preparation in (
--SELECT PrepType FROM @Preparation
--)
group by LEFT(TBL_Category_Item_File.Item_Name, LEN(TBL_Category_Item_File.Item_Name) -4)
order by Freq desc`,

  // Retrieves the top 100 medical supplies with the highest transaction frequency
  "Fast Moving (Supplies)": `
   DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    select top 100
case when max(group_ID) = 1 then 
	LEFT(TBL_Category_Item_File.Item_Name, LEN(TBL_Category_Item_File.Item_Name) -4) 
	else max(TBL_Category_Item_File.Item_Name) end as Product, 
COUNT(tbL_orders.order_no) as Freq, 
SUM(case when order_type like '%Sales%' and order_type Not like '%Transfer%' then QTY else 0 end) as Quantity,
MAX(Item_Packaging) as Packaging
		from TBL_Orders_Detail
		inner join tbl_orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
		inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
		inner join TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
where group_id = 2 and Order_Type like '%Sales%'
and Order_Type not like '%Transfer%'
AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
--and Item_Preparation in (
--SELECT PrepType FROM @Preparation
--)
group by LEFT(TBL_Category_Item_File.Item_Name, LEN(TBL_Category_Item_File.Item_Name) -4)
order by Freq desc`,

  // Lists unfulfilled orders that need procurement action
  Procurement: `
   DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT
    OL_BookingDate,
    OL_Entity AS 'Entity',
    DATEDIFF(DAY, OL_BookingDate, @EndDate) as Days_Lacking,
    Item_Description AS 'Product',
    Item_Brand AS 'Brand',
    Quantity,
    Item_Packaging,
    Unit_Cost 'Unit Cost',
    Unit_Total AS 'Total',
    Item_Status AS Status
FROM TBL_Orders_Lacking_Details
INNER JOIN TBL_Orders_Lacking
    ON TBL_Orders_Lacking.OL_ID = TBL_Orders_Lacking_Details.OL_ID
WHERE
    (Item_Status != 'Served'
     AND Item_Status != 'Changed Item'
     AND Item_Status != 'Waived')
    and OL_BookingDate <= @EndDate
ORDER BY Item_Description;

`,

  // Lists unfulfilled orders specifically marked as Changed or Waived
  "Procurement-Special": `
   DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT
    OL_BookingDate,
    OL_Entity AS 'Entity',
    DATEDIFF(DAY, OL_BookingDate, @EndDate) as Days_Lacking,
    Item_Description AS 'Product',
    Item_Brand AS 'Brand',
    Quantity,
    Item_Packaging,
    Unit_Cost 'Unit Cost',
    Unit_Total AS 'Total',
    Item_Status AS Status
FROM TBL_Orders_Lacking_Details
INNER JOIN TBL_Orders_Lacking
    ON TBL_Orders_Lacking.OL_ID = TBL_Orders_Lacking_Details.OL_ID
WHERE
    (Item_Status = 'Changed Item'
     AND Item_Status = 'Waived')
    and OL_BookingDate <= @EndDate
ORDER BY Item_Description;
`,

  // Identifies stock on hand that has zero sales within the selected date range
  "Slow Moving": `
   DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT
        I.Item_Name AS Product,
        S.Item_QTY AS Quantity,
        I.Item_Packaging AS Packaging
    FROM TBL_Category_Item_File I
    INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
    WHERE S.Item_QTY > 0
      AND I.Item_ID NOT IN (
          SELECT DISTINCT OD.Item_ID
          FROM TBL_Orders_Detail OD
          INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
          WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
      )
    ORDER BY S.Item_QTY DESC`,

  // Lists items where stock levels are critically low (2 units or less)
  "Out of Stocks": `
    SELECT DISTINCT
        I.Item_Name AS Product,
        S.Item_QTY AS Quantity,
        I.Item_Packaging AS Packaging,
        I.Item_Org_Price AS "Price",
        (S.Item_QTY * I.Item_Org_Price) AS "Total"
    FROM TBL_Category_Item_File I
    INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
    WHERE S.Item_QTY > 0
      AND S.Item_QTY <= 2
    ORDER BY S.Item_QTY ASC`,

  // Summarizes sales and price variance for items sold under Loyalty discounts
  "Discounted (Loyalty)": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT
        I.Item_Name AS "Product Name",
        SUM(OD.QTY) AS Quantity,
        I.Item_Packaging AS Packaging,
        AVG(OD.Disc_Price) AS "Discounted Price",
        AVG(OD.Orig_Price) AS "Original Price",
        SUM(OD.Disc_Price * OD.QTY) AS "Total Discounted",
        SUM(OD.Orig_Price * OD.QTY) AS "Total Original"
    FROM TBL_Orders_Detail OD
    INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
    INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
    WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
      AND OD.isLoyalty = 'Yes'
    GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID
    ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

  // Summarizes sales and price variance for items sold under Senior Citizen discounts
  "Discounted (Senior)": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT
        I.Item_Name AS "Product Name",
        SUM(OD.QTY) AS Quantity,
        I.Item_Packaging AS Packaging,
        AVG(OD.Disc_Price) AS "Discounted Price",
        AVG(OD.Orig_Price) AS "Original Price",
        SUM(OD.Disc_Price * OD.QTY) AS "Total Discounted",
        SUM(OD.Orig_Price * OD.QTY) AS "Total Original"
    FROM TBL_Orders_Detail OD
    INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
    INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
    WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
      AND OD.isSenior = 'Yes'
    GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID
    ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

  // Identifies items in stock that have already passed their expiration date
  Expired: `
    SELECT 
        CONCAT(I.Item_Name, ' ', C.Catg_Name) AS Item_Name,
        CASE 
            WHEN LEFT(I.Item_Description, 4) = 'BCVR' THEN '-' 
            ELSE I.Item_Description 
        END AS Item_Description,
        REPLACE(FORMAT(I.Item_Exp_Date, 'MM/yyyy'), '01/2040', '-') AS Item_Exp_Date,
        I.Item_Price AS Capital,
        I.Item_Price * S.Item_QTY AS Total,
        CONCAT(S.Item_QTY, ' ', I.Item_packaging) AS Quantity
    FROM TBL_Category_Item_File I
    INNER JOIN TBL_Stocks_Balances S ON S.Item_ID = I.Item_ID
    INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
    WHERE I.Item_Exp_Date <= CAST(EOMONTH(DATEADD(MONTH, -1, GETDATE())) AS DATETIME)
      AND S.Item_QTY > 0
    ORDER BY I.Item_Exp_Date, Item_Name`,

  // Lists items expiring within the next 10 months
  "Near Expiry": `
    SELECT 
        CONCAT(I.Item_Name, ' ', C.Catg_Name) AS Item_Name,
        CASE 
            WHEN LEFT(I.Item_Description, 4) = 'BCVR' THEN '-' 
            ELSE I.Item_Description 
        END AS Item_Description,
        REPLACE(FORMAT(I.Item_Exp_Date, 'MM/yyyy'), '01/2040', '-') AS Item_Exp_Date,
        I.Item_Price AS Capital,
        I.Item_Price * S.Item_QTY AS Total,
        CONCAT(S.Item_QTY, ' ', I.Item_packaging) AS Quantity
    FROM TBL_Category_Item_File I
    INNER JOIN TBL_Stocks_Balances S ON S.Item_ID = I.Item_ID
    INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
    WHERE I.Item_Exp_Date <= CAST(EOMONTH(DATEADD(MONTH, 10, GETDATE())) AS DATETIME)
      AND S.Item_QTY > 0
    ORDER BY I.Item_Exp_Date, Item_Name`,

  // Ranks the top 100 medicines based on total sales value (Peso)
  "Top Peso Sold (Meds)": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT TOP 100
        CONCAT(Item_Name, ' ', Catg_Name) AS Product,
        SUM(QTY) AS Quantity,
        MAX(Item_Packaging) AS Packaging,
        SUM(total_Cost) AS Total
    FROM TBL_Orders_Detail OD
    INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
    INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
    INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
    WHERE C.group_id = 1 
      AND O.Order_Type LIKE '%Sales%'
      AND O.Order_Type NOT LIKE '%Transfer%'
      AND (CASE 
            WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date)
            ELSE CONVERT(DATE, Encode_DateTime) 
          END) BETWEEN @StartDate AND @EndDate
    GROUP BY CONCAT(Item_Name, ' ', Catg_Name)
    ORDER BY SUM(total_Cost) DESC`,

  // Ranks the top 100 supplies based on total sales value (Peso)
  "Top Peso Sold (Supplies)": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT TOP 100
        CONCAT(Item_Name, ' ', Catg_Name) AS Product,
        SUM(QTY) AS Quantity,
        MAX(Item_Packaging) AS Packaging,
        SUM(total_Cost) AS Total
    FROM TBL_Orders_Detail OD
    INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
    INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
    INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
    WHERE C.group_id = 2 
      AND O.Order_Type LIKE '%Sales%'
      AND O.Order_Type NOT LIKE '%Transfer%'
      AND (CASE 
            WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date)
            ELSE CONVERT(DATE, Encode_DateTime) 
          END) BETWEEN @StartDate AND @EndDate
    GROUP BY CONCAT(Item_Name, ' ', Catg_Name)
    ORDER BY SUM(total_Cost) DESC`,

  // Identifies high-investment inventory items (Meds & Supplies separately)
  "High Peso Value": `
    /* Section 1: Medicines (Group ID 1) */
    SELECT TOP 30
        ROW_NUMBER() OVER (ORDER BY SUM(I.Item_Price * S.Item_QTY) DESC) AS Number,
        CONCAT(Item_Name, ' ', Catg_Name) AS Item_Name,
        CONCAT(SUM(S.Item_QTY), ' ', MAX(Item_packaging)) AS Qty,
        SUM(I.Item_Price * S.Item_QTY) AS 'Capital_Price',
        SUM(I.Item_Distribution * S.Item_QTY) AS 'Distribution_Price',
        SUM(I.Item_Retail_Price * S.Item_QTY) AS 'Retail_Price'
    FROM TBL_Category_Item_File I
    INNER JOIN TBL_Stocks_Balances S ON S.Item_ID = I.Item_ID
    INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
    WHERE Group_ID = '1'
    GROUP BY CONCAT(Item_Name, ' ', Catg_Name)
    ORDER BY Capital_Price DESC;

    /* Section 2: Non-Medicines (Group ID != 1) */
    SELECT TOP 30
        ROW_NUMBER() OVER (ORDER BY SUM(I.Item_Price * S.Item_QTY) DESC) AS Number,
        CONCAT(Item_Name, ' ', Catg_Name) AS Item_Name,
        CONCAT(SUM(S.Item_QTY), ' ', MAX(Item_packaging)) AS Qty,
        SUM(I.Item_Price * S.Item_QTY) AS 'Capital_Price',
        SUM(I.Item_Distribution * S.Item_QTY) AS 'Distribution_Price',
        SUM(I.Item_Retail_Price * S.Item_QTY) AS 'Retail_Price'
    FROM TBL_Category_Item_File I
    INNER JOIN TBL_Stocks_Balances S ON S.Item_ID = I.Item_ID
    INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
    WHERE Group_ID != '1'
    GROUP BY CONCAT(Item_Name, ' ', Catg_Name)
    ORDER BY Capital_Price DESC;`,

  // Tracks Government orders and provides details on what was unfulfilled/lacking
  "Lacking Served": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT 
        MAX(LEFT(Order_type, 4)) AS Order_type,
        MAX(OD.Order_No) AS Order_No,
        MAX(Client_Name) AS Entity, 
        MAX(Client_Terms) AS PO_Details,
        MAX(OD.OrderDetail_ItemNo) AS Item_No,
        OD.Product_Name,
        MAX(LD.Item_Description) AS Lacking_Description,
        MAX(OD.QTY) AS Order_Quantity,
        SUM(LD.Quantity) AS Lacking_Quantity,
        MAX(OL_Purchasing) AS Purchasing_Assigned,
        MAX(OL_Encoder) AS Encoder
    FROM TBL_Orders_Detail OD
    INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
    INNER JOIN TBL_Orders_Lacking L ON L.Order_No = OD.Order_No
    INNER JOIN TBL_Orders_Lacking_Details LD ON LD.OL_ID = L.OL_ID
    WHERE (CASE 
            WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date)
            ELSE CONVERT(DATE, Encode_DateTime) 
          END) BETWEEN @StartDate AND @EndDate
      AND Order_Type LIKE '%GOVT%'
      AND Item_No = OrderDetail_ItemNo
    GROUP BY Order_Dtl, OD.Product_Name`,

  // Finds items received for a specific purpose (non-refill) that haven't been sold yet
  "Remained Stock For Serve": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT Received_Date, Item_ProductName, PO_Name, Lot_No, Exp_Date, S.Item_QTY, Packaging, PurchasePurpose 
    FROM TBL_Stocks_Balances S
    INNER JOIN TBL_Purchase_Detail PD ON PD.Item_ID = S.Item_ID
    INNER JOIN TBL_Purchase_Order PO ON PO.Purchase_ID = PD.Purchase_ID
    INNER JOIN TBL_Suppliers SP ON SP.Supp_ID = PO.Supp_ID
    WHERE PurchasePurpose NOT LIKE '%Refill%'
      AND SuppName NOT LIKE '%BCVR%'
      AND Received_Date BETWEEN @StartDate AND @EndDate
      AND PurchasePurpose != ''
      AND S.Item_QTY > 0
      AND Item_ProductName NOT IN (
          SELECT Product_Name FROM TBL_Orders_Detail OD
          INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
          WHERE (CASE 
                  WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date)
                  ELSE CONVERT(DATE, Encode_DateTime) 
                END) BETWEEN @StartDate AND @EndDate
      )
    ORDER BY Received_Date`,

  // Audits purchase orders to find items that were delivered but had quantities lower than ordered
  "Purchase Order Items Audit": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT POI.PO_No, Supplier_Name, Delivery_Status, Item_Availability, Item_Status, Item_Description, Order_Qty, Recv_Qty, Unit_Cost, Recv_Price, Total_Cost, Recv_Total, Prepared_by 
    FROM TBL_Purchase_Order_Items POI
    INNER JOIN TBL_Purchase_Order_Tracking POT ON POT.PO_No = POI.PO_No
    WHERE Delivery_Status = 'Complete'
      AND Item_Availability = 'Available'
      AND Order_Qty > Recv_Qty
      AND POI.PO_No IN (
          SELECT PurchaseOrder_No FROM TBL_Purchase_Order
          WHERE Received_Date BETWEEN @StartDate AND @EndDate
      )
    ORDER BY Item_Description`,

  // Analyzes associations between products and unfulfilled government orders
  "Brand Association": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

   SELECT 
    Catg_Name,
    MAX(Manufacturer) AS Manufacturer,
    MAX(Distributor) AS Distributor,
    MAX(Trader) AS Trader,
    MAX(Importer) AS Importer
FROM TBL_Category_File
INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Catg_ID = TBL_Category_File.Catg_ID
INNER JOIN TBL_Purchase_Detail ON TBL_Purchase_Detail.Item_ID = TBL_Category_Item_File.Item_ID
INNER JOIN TBL_Purchase_Order ON TBL_Purchase_Order.Purchase_ID = TBL_Purchase_Detail.Purchase_ID
INNER JOIN TBL_Suppliers ON TBL_Suppliers.Supp_ID = TBL_Purchase_Order.Supp_ID
WHERE 
    SuppName NOT LIKE '%BCVR%'
    AND Received_Date BETWEEN @StartDate AND @EndDate
    AND Group_ID = 1
GROUP BY Catg_Name;`,
};

// --- FORMATTING HELPERS ---
// ✅ Added capital|distribution to catch the renamed HPV columns
const PESO_KEYS = /price|total|value|sold|amount|cost|disc|orig|capital|distribution/i;
const DATE_KEYS = /date/i;

function formatCell(key, val) {
    if (val === null || val === undefined || val === '') return val;
    if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            const mm   = String(d.getMonth() + 1).padStart(2, '0');
            const dd   = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        }
    }
    if (PESO_KEYS.test(key)) {
        const num = parseFloat(String(val).replace(/,/g, ''));
        if (!isNaN(num)) return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return val;
}

function formatRow(rowObj) {
    return Object.entries(rowObj).map(([key, val]) => formatCell(key, val));
}

/**
 * Internal helper to sync a single query to a specific sheet.
 */
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        const result = await pool.request().query(query);
        const rows   = result.recordset;
        const START_ROW = 5;

        // --- SPECIAL LOGIC: HIGH PESO VALUE (Meds on Left, Supplies on Right) ---
        if (sheetName === 'High Peso Value') {

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!A${START_ROW}:F1000`,
                        `'${sheetName}'!H${START_ROW}:M1000`,
                    ]
                }
            });

            // ✅ Headers always defined outside if/else — always written regardless of records
            const hpvHeaders = ['', 'Product Name', 'Qty', 'Capital', 'Distribution', 'Retail'];

            if (rows && rows.length > 0) {
                const mapRow = (r) => [
                    '',
                    r['Product Name'],
                    r.Qty,
                    formatCell('Price', r.Capital),
                    formatCell('Price', r.Distribution),
                    formatCell('Price', r.Retail),
                ];
                const meds     = rows.filter(r => r.Type === 'MEDICINES').map(mapRow);
                const supplies = rows.filter(r => r.Type === 'SUPPLIES').map(mapRow);

                const batchData = [];
                if (meds.length > 0)     batchData.push({ range: `'${sheetName}'!A${START_ROW}`, values: [hpvHeaders, ...meds] });
                if (supplies.length > 0) batchData.push({ range: `'${sheetName}'!H${START_ROW}`, values: [hpvHeaders, ...supplies] });

                // ✅ Even if both filtered arrays are empty, still write headers
                if (batchData.length === 0) {
                    batchData.push({ range: `'${sheetName}'!A${START_ROW}`, values: [hpvHeaders] });
                    batchData.push({ range: `'${sheetName}'!H${START_ROW}`, values: [hpvHeaders] });
                }

                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'RAW' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync completed (headers on Row ${START_ROW}).`);

            } else {
                // ✅ No records at all — write headers only on both sides
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        data: [
                            { range: `'${sheetName}'!A${START_ROW}`, values: [hpvHeaders] },
                            { range: `'${sheetName}'!H${START_ROW}`, values: [hpvHeaders] },
                        ],
                        valueInputOption: 'RAW'
                    }
                });
                console.log(`⚠️ [${sheetName}] No records — headers written on Row ${START_ROW}.`);
            }

        // --- STANDARD LOGIC: ALL OTHER SHEETS ---
        } else {

            await sheetsApi.spreadsheets.values.clear({
                spreadsheetId,
                range: `'${sheetName}'!A${START_ROW}:Z1000`
            });

            // ✅ Headers always extracted outside if/else — always written regardless of records
            const headers = Object.keys(result.recordset.columns);

            if (rows && rows.length > 0) {
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${START_ROW}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [
                            headers,                        // ← Row 5 : header
                            ...rows.map(r => formatRow(r)), // ← Row 6+ : data
                        ]
                    },
                });
                console.log(`✅ [${sheetName}] Data synced (headers on Row ${START_ROW}, data from Row ${START_ROW + 1}).`);
            } else {
                // ✅ No records — write headers only
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${START_ROW}`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [headers] },
                });
                console.log(`⚠️ [${sheetName}] No records — headers written on Row ${START_ROW}.`);
            }
        }

    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
}

/**
 * Main entry point exported to Server.js
 */
exports.run = async (pool, folderId, branchCode) => {
    console.log(`\n📦 [PRD] Sync started at ${new Date().toLocaleString()}`);

    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(folderId, branchCode);

    if (!currentSpreadsheetId) {
        console.log('[PRD] ⚠️  Sync aborted: could not find target spreadsheet.');
        return;
    }

    const tabNames = Object.keys(queries);
    console.log(`📋 [PRD] Processing ${tabNames.length} tab(s)...`);
    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [PRD] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, queries[tabName], tabName);
        await sleep(3000);
    }
    console.log('✨ [PRD] All tabs synced successfully.');
};