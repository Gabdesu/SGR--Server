const { google } = require("googleapis");
const { auth, DATE } = require("../../config");

const sheetsApi = google.sheets({ version: "v4", auth });
const driveApi = google.drive({ version: "v3", auth });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
  DW: { prefix: "SGR_SLS_DW", label: "Distribution Warehouse" }
};

const MONTH_LABELS = [
  ["JAN", "January"],
  ["FEB", "February"],
  ["MAR", "March"],
  ["APR", "April"],
  ["MAY", "May"],
  ["JUN", "June"],
  ["JUL", "July"],
  ["AUG", "August"],
  ["SEP", "September"],
  ["OCT", "October"],
  ["NOV", "November"],
  ["DEC", "December"],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
  const meta = BRANCH_META[branchCode] || BRANCH_META["DW"];
  const now = new Date();

  // Target LAST month (mirrors config.js buildLastMonthRange logic)
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
  const [shortMon, longMon] = MONTH_LABELS[month];

  const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - Sales`;
  console.log(
    `🔎 [SLS] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`,
  );

  try {
    const response = await driveApi.files.list({
      q: `'${folderId}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name)",
    });

    if (response.data.files.length === 0) {
      console.error(
        `❌ No spreadsheet found matching "${currentFileName}" in folder.`,
      );
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
  "DFGS1-Booking": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS1%';

                SELECT
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) as Booking_Date, 
                LEFT(Order_type, 4) as 'Sales Category',
                Client_Name,
                Requestor_EndUser,
                Client_Terms,
                FORMAT(PO_Amount, 'N2') as PO_Amount,
                FORMAT(Product_Total, 'N2') as total_delivered
                FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) between @SalesDate_From and @SalesDate_To
                        and Order_type like @SalesCategory
            order by Booking_Date

            update TBL_Orders
            set Misc_BookingDate = CONCAT('OK - ', FORMAT(Order_Date, 'yyyy-MM-dd'))
            where Client_Name = 'LGU Bulan - Botica ng Bayan'`,

  "DFGS2-Booking": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS2%';

                SELECT
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) as Booking_Date, 
                LEFT(Order_type, 4) as 'Sales Category',
                Client_Name,
                Requestor_EndUser,
                Client_Terms,
                FORMAT(PO_Amount, 'N2') as PO_Amount,
                FORMAT(Product_Total, 'N2') as total_delivered
                FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) between @SalesDate_From and @SalesDate_To
                        and Order_type like @SalesCategory
            order by Booking_Date

            update TBL_Orders
            set Misc_BookingDate = CONCAT('OK - ', FORMAT(Order_Date, 'yyyy-MM-dd'))
            where Client_Name = 'LGU Bulan - Botica ng Bayan'`,

  "GPFS-Booking": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%GPFS%';

                SELECT
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) as Booking_Date, 
                LEFT(Order_type, 4) as 'Sales Category',
                Client_Name,
                Requestor_EndUser,
                Client_Terms,
                FORMAT(PO_Amount, 'N2') as PO_Amount,
                FORMAT(Product_Total, 'N2') as total_delivered
                FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) between @SalesDate_From and @SalesDate_To
                        and Order_type like @SalesCategory
            order by Booking_Date

            update TBL_Orders
            set Misc_BookingDate = CONCAT('OK - ', FORMAT(Order_Date, 'yyyy-MM-dd'))
            where Client_Name = 'LGU Bulan - Botica ng Bayan'`,

  "DFS1-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFS1%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "DFS2-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS2%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "DFGS1-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS1%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "DFGS2-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS2%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "GPFS-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%GPFS%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  // collected

  //  Top
  "Top 30": `
    DECLARE @SalesCategory VARCHAR(MAX);
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
    SET @SalesCategory = '%Sales%';

SELECT TOP 30 LEFT(MAX(Order_Type),4) as OT, Client_Name, sum(COALESCE(PO_Amount,0)) AS Total
FROM TBL_Orders
WHERE Order_Date BETWEEN @SalesDate_From AND @SalesDate_To
  AND Order_Type LIKE @SalesCategory
  AND Order_Type LIKE '%Govt%'
GROUP BY Client_Name
ORDER BY Total desc

SELECT TOP 30 LEFT(MAX(Order_Type),4) as OT, Client_Name, sum(COALESCE(TOTAL_COST,0)) AS Total
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
WHERE CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To
  AND Order_Type LIKE @SalesCategory
  AND Order_Type NOT LIKE '%Transfer%'
GROUP BY Client_Name
ORDER BY Total desc

SELECT TOP 30 LEFT(MAX(Order_Type),4) as OT, Client_Name,
           SUM(COALESCE(TBL_Orders_Payment.Payment_Amount, 0) + 
               COALESCE(Tax_Amount, 0) + 
               COALESCE(OtherCharges_Amount, 0) + 
               COALESCE(LiqDamages_Amount, 0) + 
               COALESCE(Retention_Amount, 0)) AS Total
    FROM TBL_Orders_Payment
    INNER JOIN TBL_Orders ON TBL_Orders.Order_No = TBL_Orders_Payment.Order_No
    WHERE Payment_Date BETWEEN @SalesDate_From AND @SalesDate_To
      AND Order_Type LIKE @SalesCategory
      AND Order_Type NOT LIKE '%Transfer%'
    GROUP BY Client_Name
    ORDER BY Total desc
    `,

  "Top AR": `
    DECLARE @SalesCategory VARCHAR(MAX);
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
    SET @SalesCategory = '%Sales%';
    
    SELECT Top 30

	LEFT(MAX(Order_Type), 4),
    Client_Name,
	SUM(Product_Total) 
	- sum(coalesce(TBL_Orders_Payment.Payment_Amount, 0)) 
	- sum(coalesce(TBL_Orders_Payment.Tax_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.Retention_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.Discount_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.OtherCharges_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.LiqDamages_Amount, 0)) as Total

FROM tbl_orders
LEFT JOIN TBL_Orders_Payment ON TBL_Orders_Payment.Order_No = tbl_orders.Order_No
WHERE Order_Type LIKE @SalesCategory
and Order_Type NOT LIKE '%Transfer%'
AND Order_Date >= '2023-02-01' 
AND Order_Date <= @SalesDate_To
and Order_Payment_Status != 'Paid' 
GROUP BY Client_Name
ORDER BY Total desc`,

  "Top Inactive": `
    DECLARE @SalesCategory VARCHAR(MAX);
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
    DECLARE @Active_From DATE = '2023-01-01';
    DECLARE @Active_To   DATE = '2025-12-31';
     

    SET @SalesCategory = 'Sales';
        
    SELECT TOP 30
        LEFT(MAX(Order_Type), 4) AS OrderTypePrefix,
        Client_Name,
        SUM(Product_Total) AS Total
    FROM TBL_Orders
    WHERE 
            Order_Date BETWEEN @Active_From AND @Active_To
        AND Order_Type LIKE '%' + @SalesCategory + '%'
        AND Order_Type NOT LIKE '%Transfer%'
        AND Client_Name NOT IN (
    SELECT Client_Name 
        FROM TBL_Orders 
        WHERE 
            Order_Date BETWEEN @SalesDate_From AND @SalesDate_To 
            AND Order_Type LIKE '%' + @SalesCategory + '%'
            AND Order_Type NOT LIKE '%Transfer%'
        GROUP BY Client_Name
    )
    GROUP BY Client_Name
    ORDER BY Total DESC;`,

  "New Client Contacts": `
    DECLARE @Date_From DATE = '${DATE.sql.start}';
    DECLARE @Date_To   DATE = '${DATE.sql.end}';
   
    select 
LEFT(Client_Type, 4) as SalesCategory,
Company_Name,
Contact_Name,
Position,
Department,
Birthday,
Contact_No,
Email_Address,
Remarks
from TBL_Client_Details
inner join TBL_Clients on TBL_Clients.Client_ID = TBL_Client_Details.Client_ID
where TBL_Client_Details.Date_Added between @Date_From and @Date_To
order by Client_Type, Company_Name`,

  "Canvass Details": `
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
   
    select 
Canvass_No,
Canvass_recvDate,
Canvass_Name,
LEFT(Canvass_Type,4),
End_User,
Canvasser_Name,
Canvasser_Contact,
Canvasser_Designation,
Canvass_Approved,
COALESCE(Bid_Result, '') as Bid_Result,
ABC_Total,
Canvass_bidTotal as Bid,
Encoded_By
from TBL_Canvass
where Canvass_No in 
(select Canvass_No from TBL_Orders where order_type like '%Govt%')
and Canvass_recvDate between @SalesDate_From and @SalesDate_To`,

  "Ordering Kiosk Details": `
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
   
    select
CASE WHEN Order_Type like '%Transfer%' or Order_Type like '%Return%' or Order_Type like '%Office%' Or Order_Type like '%Social%' then LEFT(Order_Type, 2) Else LEFT(Order_Type, 4) End as Order_Type,
Order_No, 
REPLACE(Case WHEN Order_Type like '%Govt%' then 
TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
			THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
			LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE '' END, '')) else Order_Date End, '1900-01-01', '') as Booking_Date,
Order_Date,
Client_Name, 
Client_Address, 
Requestor_Enduser, 
Encoded_By,
Picker, 
Checker, 
Packer, 
Canvass_No, 
Client_Terms, 
case when Order_Type like '%Govt%' then PO_Amount else Product_Total end as Total
from TBL_Orders
where Order_Date between @SalesDate_From and @SalesDate_To
and Order_Type not like '%Retail%'
Order by Order_Type`,
};
// --- FORMATTING HELPERS ---
const PESO_KEYS =
  /price|total|value|sold|amount|cost|disc|orig|balance|consumption|collected|delivered|booking|peso/i;
const DATE_KEYS = /date/i;

function formatCell(key, val) {
  if (val === null || val === undefined || val === "") return val;
  if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
  }
  if (PESO_KEYS.test(key)) {
    const num = parseFloat(String(val).replace(/,/g, ""));
    if (!isNaN(num))
      return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return val;
}

function formatRow(rowObj) {
  return Object.entries(rowObj).map(([key, val]) => formatCell(key, val));
}

// --- Extract headers from first row of recordset ---
function getHeaders(recordset) {
  if (!recordset || recordset.length === 0) return [];
  return Object.keys(recordset[0]);
}

// --- Extract headers from mssql column metadata (works even on 0-row results) ---
function getHeadersFromColumns(recordset) {
  return Object.keys(recordset?.columns || {});
}

async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
  try {
    const request = pool.request();
        request.multiple = true;
        const result = await request.query(query);

    // ── TOP 30: side-by-side tables ──────────────────────────────────────────
    // Layout (all anchored at row 5):
    //   Row 5  → headers for each table
    //   Row 6+ → data rows
    //   Table 1 Booking   → B5:D   Table 2 Delivered → G5:I   Table 3 Collected → L5:N
    if (sheetName === "Top 30") {
      const headerRow = 5;
      const sets = result.recordsets;

      if (!sets || sets.length === 0) {
        console.warn(`⚠️  [${sheetName}] No recordsets returned.`);
        return;
      }

      // Clear all 3 zones (header + data)
      await sheetsApi.spreadsheets.values.batchClear({
        spreadsheetId,
        requestBody: {
          ranges: [
            `'${sheetName}'!B${headerRow}:D200`,
            `'${sheetName}'!G${headerRow}:I200`,
            `'${sheetName}'!L${headerRow}:N200`,
          ],
        },
      });

      const batchData = [];

      // Table 1 — Booking
      const t1Headers = sets[0]?.length
        ? getHeaders(sets[0])
        : getHeadersFromColumns(sets[0]);
      if (t1Headers.length) {
        const rows = (sets[0] || []).map((r) => formatRow(r));
        batchData.push({
          range: `'${sheetName}'!B${headerRow}`,
          values: [t1Headers, ...rows],
        });
        if (!rows.length)
          console.warn(
            `⚠️  [${sheetName}] Table 1 (Booking): 0 rows. Header written.`,
          );
      }

      // Table 2 — Delivered
      const t2Headers = sets[1]?.length
        ? getHeaders(sets[1])
        : getHeadersFromColumns(sets[1]);
      if (t2Headers.length) {
        const rows = (sets[1] || []).map((r) => formatRow(r));
        batchData.push({
          range: `'${sheetName}'!G${headerRow}`,
          values: [t2Headers, ...rows],
        });
        if (!rows.length)
          console.warn(
            `⚠️  [${sheetName}] Table 2 (Delivered): 0 rows. Header written.`,
          );
      }

      // Table 3 — Collected
      const t3Headers = sets[2]?.length
        ? getHeaders(sets[2])
        : getHeadersFromColumns(sets[2]);
      if (t3Headers.length) {
        const rows = (sets[2] || []).map((r) => formatRow(r));
        batchData.push({
          range: `'${sheetName}'!L${headerRow}`,
          values: [t3Headers, ...rows],
        });
        if (!rows.length)
          console.warn(
            `⚠️  [${sheetName}] Table 3 (Collected): 0 rows. Header written.`,
          );
      }

      if (batchData.length > 0) {
        await sheetsApi.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { data: batchData, valueInputOption: "RAW" },
        });
        console.log(
          `✅ [${sheetName}] Side-by-side sync complete (with headers at row ${headerRow}).`,
        );
      }
      return;
    }

    // ── ALL OTHER SHEETS: headers at A5, data from A6 ────────────────────────
    const rows = result.recordset;

    // Clear from A5 downward
    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetName}'!A5:Z1000`,
    });

    // Derive headers: from rows if data exists, otherwise from mssql column metadata
    const headers =
      rows && rows.length > 0 ? getHeaders(rows) : getHeadersFromColumns(rows);

    if (headers.length > 0) {
      const data = rows ? rows.map((r) => formatRow(r)) : [];

      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A5`,
        valueInputOption: "RAW",
        requestBody: { values: [headers, ...data] },
      });

      if (data.length > 0) {
        console.log(
          `✅ [${sheetName}] Synced ${data.length} row(s) + header at A5.`,
        );
      } else {
        console.warn(
          `⚠️  [${sheetName}] Query returned 0 rows. Header written at A5.`,
        );
      }
    } else {
      console.warn(
        `⚠️  [${sheetName}] Query returned 0 rows and no column metadata. Nothing written.`,
      );
    }
  } catch (err) {
    console.error(`❌ [${sheetName}] Error:`, err.message);
  }
}

// --- MAIN EXPORT ---
exports.run = async (pool, folderId, branchCode) => {
  console.log(`\n💰 [SLS] Sync started at ${new Date().toLocaleString()}`);

  const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(
    folderId,
    branchCode,
  );

  if (!currentSpreadsheetId) {
    console.log("[SLS] ⚠️  Sync aborted: could not find target spreadsheet.");
    return;
  }

  const tabNames = Object.keys(queries);
  console.log(`📋 [SLS] Processing ${tabNames.length} tab(s)...`);

  for (let i = 0; i < tabNames.length; i++) {
    const tabName = tabNames[i];
    console.log(
      `   ⏳ [SLS] [${i + 1}/${tabNames.length}] Syncing: "${tabName}"...`,
    );
    await syncQueryToSheet(
      pool,
      currentSpreadsheetId,
      queries[tabName],
      tabName,
    );
    await sleep(3000);
  }

  console.log("✨ [SLS] All tabs synced successfully.");
};
