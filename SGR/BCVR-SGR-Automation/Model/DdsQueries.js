const { DATE } = require('../config');

// =============================================================================
// DDS QUERIES
// Centralized SQL query repository for Distribution Display Store controllers.
// Used by: acnController.js | prdController.js | slsController.js
// =============================================================================


// --- ACN (Accounting) QUERIES ---
function buildAcnQueries(dbName) {
    return {
        'ST: DDS->DW': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';

            //query to be added here
            `,

        'ST: DDS->PHSSN': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';

            //query to be added here
            `,

        'RT: DW->DDS': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';

            //query to be added here
            `,

        'RT: PHSSN->DDS': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';

            //query to be added here
            `,

        'Sales Invoice - Govt.': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT 
                TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
                    THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
                    LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
                    ELSE NULL END, NULL))                           AS [Released Date],
                LEFT(Order_Type, 4)                                AS [Sales Category],
                Client_Name                                        AS [Entity],
                Client_terms                                       AS [PO Details],
                COALESCE(ReceiptNo_Note_Extra, '')                 AS [Invoice],
                CAST(Product_Total AS DECIMAL(18,2))               AS [Total Delivered],
                CAST(ISNULL(Waived_Amount, 0) AS DECIMAL(18,2))    AS [Total Waived],
                CAST(ISNULL(PO_Amount, 0) AS DECIMAL(18,2))        AS [Total PO]
            FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
                    THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
                    LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
                    ELSE NULL END, NULL)) BETWEEN @StartDate AND @EndDate
                AND COALESCE(ReceiptNo_Note_Extra, '') != ''
                AND Order_Type LIKE '%Govt%'
            ORDER BY [Released Date]`,

        'Sales Invoice': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT 
                CAST(Order_Date AS DATE)                           AS [Released Date],
                LEFT(Order_Type, 4)                                AS [Sales Category],
                Client_Name                                        AS [Entity],
                Client_terms                                       AS [PO Details],
                COALESCE(ReceiptNo_Note_Extra, '')                 AS [Invoice],
                CAST(Product_Total AS DECIMAL(18,2))               AS [Total Delivered]
            FROM TBL_Orders
            WHERE Order_Date BETWEEN @StartDate AND @EndDate
                AND COALESCE(ReceiptNo_Note_Extra, '') != ''
                AND Order_Type NOT LIKE '%Govt%'
            ORDER BY [Released Date]`,

        'Inv. Discrepancy': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT
                CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '') AS NVARCHAR(50))  AS [Date],
                CAST(ISNULL(PC.P_Details, '')                         AS NVARCHAR(255)) AS [Inventory Group],
                CAST(ISNULL(CI.Item_Name, '')                         AS NVARCHAR(255)) AS [Product Name],
                CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')           AS NVARCHAR(50))  AS [Capital],
                CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [Physical],
                CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [System],
                CAST((PCD.P_Counts - PCD.Total_QTY)                   AS NVARCHAR(50))  AS [Variance],
                CAST(FORMAT(ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2') AS NVARCHAR(50)) AS [Peso Value]
            FROM [${dbName}].dbo.TBL_Physical_Count PC
            INNER JOIN [${dbName}].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
            LEFT  JOIN [${dbName}].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
            LEFT  JOIN [${dbName}].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
            WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
              AND (PCD.P_Counts - PCD.Total_QTY) < 0
            ORDER BY [Date] ASC;

            SELECT
                CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '') AS NVARCHAR(50))  AS [Date],
                CAST(ISNULL(PC.P_Details, '')                         AS NVARCHAR(255)) AS [Inventory Group],
                CAST(ISNULL(CI.Item_Name, '')                         AS NVARCHAR(255)) AS [Product Name],
                CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')           AS NVARCHAR(50))  AS [Capital],
                CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [Physical],
                CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [System],
                CAST((PCD.P_Counts - PCD.Total_QTY)                   AS NVARCHAR(50))  AS [Variance],
                CAST(FORMAT(ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2') AS NVARCHAR(50)) AS [Peso Value]
            FROM [${dbName}].dbo.TBL_Physical_Count PC
            INNER JOIN [${dbName}].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
            LEFT  JOIN [${dbName}].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
            LEFT  JOIN [${dbName}].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
            WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
              AND (PCD.P_Counts - PCD.Total_QTY) > 0
            ORDER BY [Date] ASC`,

        'Remittance': `
            DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
            DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
            SELECT Remittance_Date, LEFT(Order_Type, 4) AS Order_Type, Total_Net, Total_Remittance,
                   Deposit_Deposited, Cash_ShortOver, Deposit_ShortOver, Total_Expense, Expense_Replenished
            FROM TBL_Remittance
            WHERE Remittance_Date BETWEEN @SalesDate_From AND @SalesDate_To
            ORDER BY Remittance_Date;

            SELECT Deposit_Date, Deposit_No, Bank_Name, Amount, Deposit_Type, Deposit_Status
            FROM TBL_Remittance_Deposit
            WHERE Deposit_Date BETWEEN @SalesDate_From AND @SalesDate_To
            ORDER BY Deposit_Date`,

        'Remittance Deposit': `
            SELECT 
                CONVERT(VARCHAR(16), [deposit_date], 120) AS [Deposit Date],
                [deposit_no]     AS [Deposit No],
                [bank_details]   AS [Bank],
                FORMAT(ISNULL([amount], 0), 'N2') AS [Amount],
                [deposit_type]   AS [Deposit Type],
                [deposit_status] AS [Deposit Status]
            FROM dbo.remittance_deposits
            WHERE [deposit_date] BETWEEN '${DATE.sql.start}' AND '${DATE.sql.end}'
            ORDER BY [deposit_date] ASC`,

        'Opex': `
            DECLARE @Date_From DATE = '${DATE.sql.start}';
            DECLARE @Date_To   DATE = '${DATE.sql.end}';
            SELECT 
                CAST(Date_Payment_Check AS DATE)                   AS [Date of Payment],
                ISNULL(OPEX_Particular, '-')                       AS [OPEX Particular],
                ISNULL(Payee, 'N/A')                               AS [Payee],
                ISNULL(OPEX_Category, '-')                         AS [Category],
                ISNULL(Invoice_Number, '')                         AS [Non-Official Inovice],
                ISNULL(Invoice_Number_Extra, '')                   AS [Sales Invoice],
                ISNULL(Invoice_Number_Plus, '')                    AS [Sales Invoice (VAT Ex.)],
                ISNULL(Payment_Info, '')                           AS [Check No.],
                CAST(ISNULL(Payment_Amount, 0) AS DECIMAL(18,2))   AS [Total Expense],
                CAST(CASE WHEN ISNULL(Invoice_Number, '') <> '' 
                          THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Non-Official Inovice],
                CAST(CASE WHEN ISNULL(Invoice_Number_Extra, '') <> '' 
                          THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Sales Invoice],
                CAST(CASE WHEN ISNULL(Invoice_Number_Plus, '') <> '' 
                          THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Sales Invoice (VAT Ex.)]
            FROM dbo.TBL_Operational_Expense
            WHERE Date_Payment_Check BETWEEN @Date_From AND @Date_To
              AND OPEX_Category NOT LIKE '%Cost Of Goods%'
            ORDER BY [Date of Payment] ASC`,

        'OPEX Monthly': `
            SELECT 
                OPEX_Category,
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 1  THEN Payment_Amount ELSE 0 END) AS [January],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 2  THEN Payment_Amount ELSE 0 END) AS [February],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 3  THEN Payment_Amount ELSE 0 END) AS [March],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 4  THEN Payment_Amount ELSE 0 END) AS [April],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 5  THEN Payment_Amount ELSE 0 END) AS [May],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 6  THEN Payment_Amount ELSE 0 END) AS [June],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 7  THEN Payment_Amount ELSE 0 END) AS [July],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 8  THEN Payment_Amount ELSE 0 END) AS [August],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 9  THEN Payment_Amount ELSE 0 END) AS [September],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 10 THEN Payment_Amount ELSE 0 END) AS [October],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 11 THEN Payment_Amount ELSE 0 END) AS [November],
                SUM(CASE WHEN MONTH(Date_Payment_Check) = 12 THEN Payment_Amount ELSE 0 END) AS [December]
            FROM TBL_Operational_Expense
            WHERE YEAR(Date_Payment_Check) = ${DATE.sql.year}
              AND OPEX_Category NOT IN ('Cost Of Goods 1', 'Cost Of Goods 2')
            GROUP BY OPEX_Category`,

        'Disbursement': `
            DECLARE @Date_From DateTime = '${DATE.sql.datetimeStart}';
            DECLARE @Date_To   DateTime = '${DATE.sql.datetimeEnd}';
            SELECT 
                p.Order_Payment_Id  AS [ID],
                ''                  AS [GV No],
                p.BankRef_No        AS [Check No],
                p.Payment_Amount    AS [Check Amount],
                p.Payment_Date      AS [Date Processed],
                o.Client_Name       AS [Particulars],
                o.Misc_CheckVoucher AS [Voucher No],
                p.Payment_Amount    AS [Request Amount],
                p.Payment_Amount    AS [Released Amount],
                0                   AS [Discrepancy / For Deposit],
                ''                  AS [Requestor]
            FROM TBL_Orders_Payment p
            LEFT JOIN TBL_Orders o ON p.Order_No = o.Order_No
            WHERE p.Payment_Date BETWEEN @Date_From AND @Date_To
            UNION ALL
            SELECT 
                OPEX_ID             AS [ID],
                ''                  AS [GV No],
                Voucher_no          AS [Check No],
                Payment_Amount      AS [Check Amount],
                Voucher_date        AS [Date Processed],
                ISNULL(payee, OPEX_Particular) AS [Particulars],
                Voucher_no          AS [Voucher No],
                Payment_Amount      AS [Request Amount],
                Payment_Amount      AS [Released Amount],
                0                   AS [Discrepancy / For Deposit],
                Encoded_by          AS [Requestor]
            FROM TBL_Operational_Expense
            WHERE Voucher_date BETWEEN @Date_From AND @Date_To
            ORDER BY [Date Processed] ASC`,

        'Disbursement Deposit': `
            SELECT 
                CAST(FORMAT(deposit_date, 'yyyy-MM-dd HH:mm:ss') AS VARCHAR(50)) AS [Deposit Date],
                deposit_no     AS [Deposit No],
                bank_name      AS [Bank],
                amount         AS [Amount],
                deposit_status AS [Deposit Status]
            FROM [${dbName}].dbo.disbursement_deposits
            WHERE deposit_date >= '${DATE.sql.start}'
              AND deposit_date <  '${DATE.sql.end}'
            ORDER BY deposit_date ASC`,

        'OPEX: SOP/Cashout': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT 
                ISNULL(category,   '')                               AS [Category],
                ISNULL(order_no,   '')                               AS [Order No],
                ISNULL(CONVERT(VARCHAR(10), record_date, 120), '')   AS [Date],
                ISNULL(payee,      '')                               AS [Payee],
                ISNULL(voucher_no, '')                               AS [Voucher No],
                ISNULL(payment_type, '')                             AS [Payment Type],
                ISNULL(check_no,   '')                               AS [Check No],
                ISNULL(cashout,    0)                                AS [CashOut],
                ISNULL(commitment, 0)                                AS [Commitment],
                ISNULL(paper_use,  0)                                AS [Paper Use],
                ISNULL(rebates,    0)                                AS [Rebates]
            FROM [${dbName}].dbo.opex_sop_records
            WHERE record_date BETWEEN @StartDate AND @EndDate
            ORDER BY record_date ASC, voucher_no ASC`,

        'AR: SOP/Cashout': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT 
                trans_type      AS [Type],
                order_no        AS [Order No],
                CAST(trans_date AS VARCHAR(10)) AS [Date],
                contact_person  AS [Contact Person],
                cv_no           AS [CV No.],
                contact_no      AS [Contact No.],
                release_mode    AS [Release Mode],
                cashout         AS [Cashout],
                sop             AS [SOP]
            FROM [${dbName}].dbo.ar_sop_cashout
            WHERE trans_date >= @StartDate
              AND trans_date < DATEADD(DAY, 1, @EndDate)
            ORDER BY trans_date ASC`,

        'Commitment': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT 
                ROW_NUMBER() OVER(ORDER BY O.Order_Date ASC)    AS [ID],
                CAST(O.Order_Type AS NVARCHAR(50))              AS [Type],
                CAST(O.Order_No AS NVARCHAR(50))                AS [Order No],
                CONVERT(VARCHAR(10), O.Order_Date, 120)         AS [Date],
                CAST(O.Client_Name AS NVARCHAR(255))            AS [Recipient],
                CAST('' AS NVARCHAR(50))                        AS [CV No.],
                CAST('' AS NVARCHAR(50))                        AS [Release Mode],
                FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2')    AS [Cashout],
                CAST('0.00' AS NVARCHAR(50))                    AS [SOP],
                CAST('0.00' AS NVARCHAR(50))                    AS [Paper use]
            FROM dbo.TBL_Orders O
            INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
            WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
            GROUP BY O.Order_No, O.Order_Date, O.Order_Type, O.Client_Name
            ORDER BY O.Order_Date ASC`,
    };
}


// --- PRD (Products) QUERIES ---
const prdQueries = {
    'Fast Moving (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4
                 THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4)
                 ELSE MAX(I.Item_Name) END AS Product,
            COUNT(O.order_no) AS "Freq.",
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Orders_Detail OD
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 1
          AND Order_Type LIKE '%Sales%'
          AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END
        ORDER BY COUNT(O.order_no) DESC`,

    'Fast Moving (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4
                 THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4)
                 ELSE MAX(I.Item_Name) END AS Product,
            COUNT(O.order_no) AS "Freq.",
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Orders_Detail OD
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 2
          AND Order_Type LIKE '%Sales%'
          AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END
        ORDER BY COUNT(O.order_no) DESC`,

    'Procurement': `
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
            AND OL_BookingDate <= @EndDate
        ORDER BY Item_Description`,

    'Procurement-Special': `
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
            AND OL_BookingDate <= @EndDate
        ORDER BY Item_Description`,

    'Slow Moving': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            Item_Name,
            SUM(TBL_Stocks_Balances.Item_QTY) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Stocks_Balances
        INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Item_ID = TBL_Stocks_Balances.Item_ID
        WHERE Item_Name NOT IN (
            SELECT Item_Name FROM TBL_Orders_Detail
            INNER JOIN tbl_orders ON tbl_orders.order_no = TBL_Orders_Detail.order_no
            INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
            WHERE CASE
                    WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                        THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime)
                  END BETWEEN @StartDate AND @EndDate
            AND order_type LIKE '%Sales%'
        )
        AND TBL_Stocks_Balances.Item_QTY > 0
        AND Item_Name NOT LIKE '%Loose%'
        GROUP BY Item_Name
        ORDER BY SUM(TBL_Stocks_Balances.Item_QTY) DESC`,

    'Out of Stocks': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            CONCAT(TRIM(OS_Product_Name), ' ', OS_Brand) AS Product,
            SUM(OS_Quantity) AS Qty,
            MAX(OS_Unit) AS Unit,
            CASE WHEN SUM(OS_Price * OS_Quantity) = 0 THEN 0 ELSE SUM(OS_Price * OS_Quantity) / SUM(OS_Quantity) END,
            SUM(OS_Price * OS_Quantity) AS Total
        FROM TBL_OutOfStock_Lacking
        WHERE OS_date >= @StartDate AND OS_date <= @EndDate
        GROUP BY CONCAT(TRIM(OS_Product_Name), ' ', OS_Brand)`,

    'Discounted (Loyalty)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name                 AS "Product Name",
            SUM(OD.QTY)                 AS Quantity,
            I.Item_Packaging            AS Packaging,
            AVG(OD.Disc_Price)          AS "Discounted Price",
            AVG(OD.Orig_Price)          AS "Original Price",
            SUM(OD.Disc_Price * OD.QTY) AS "Total Discounted",
            SUM(OD.Orig_Price * OD.QTY) AS "Total Original"
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
          AND OD.isLoyalty = 'Yes'
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID
        ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

    'Discounted (Senior)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name                 AS "Product Name",
            SUM(OD.QTY)                 AS Quantity,
            I.Item_Packaging            AS Packaging,
            AVG(OD.Disc_Price)          AS "Discounted Price",
            AVG(OD.Orig_Price)          AS "Original Price",
            SUM(OD.Disc_Price * OD.QTY) AS "Total Discounted",
            SUM(OD.Orig_Price * OD.QTY) AS "Total Original"
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
          AND OD.isSenior = 'Yes'
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID
        ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

    'Expired': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            CONCAT(TBL_Category_Item_File.Item_Name, ' ', TBL_Category_File.Catg_Name) AS Item_Name,
            CASE 
                WHEN LEFT(TBL_category_item_file.Item_Description, 4) = 'BCVR' THEN '-' 
                ELSE TBL_category_item_file.Item_Description 
            END AS 'Item_Description',
            REPLACE(FORMAT(TBL_Category_Item_File.Item_Exp_Date, 'MM/yyyy'), '01/2040', '-') AS Item_Exp_Date,
            TBL_Category_Item_File.Item_Price AS Capital,
            TBL_Category_Item_File.Item_Price * TBL_Stocks_Balances.Item_QTY AS Total,
            CONCAT(TBL_Stocks_Balances.Item_QTY, ' ', Item_packaging) AS Quantity
        FROM TBL_Category_Item_File
        INNER JOIN TBL_Stocks_Balances ON TBL_Stocks_Balances.Item_ID = TBL_Category_Item_File.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
        WHERE Item_Exp_Date <= CAST(EOMONTH(DATEADD(MONTH, 10, GETDATE())) AS DATETIME)
          AND TBL_Stocks_Balances.Item_QTY > 0
        ORDER BY TBL_Category_Item_File.Item_Exp_Date, Item_Name`,

    'Near Expiry': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            CONCAT(TBL_Category_Item_File.Item_Name, ' ', TBL_Category_File.Catg_Name) AS Item_Name,
            CASE 
                WHEN LEFT(TBL_category_item_file.Item_Description, 4) = 'BCVR' THEN '-' 
                ELSE TBL_category_item_file.Item_Description 
            END AS 'Item_Description',
            REPLACE(FORMAT(TBL_Category_Item_File.Item_Exp_Date, 'MM/yyyy'), '01/2040', '-') AS Item_Exp_Date,
            TBL_Category_Item_File.Item_Price AS Capital,
            TBL_Category_Item_File.Item_Price * TBL_Stocks_Balances.Item_QTY AS Total,
            CONCAT(TBL_Stocks_Balances.Item_QTY, ' ', Item_packaging) AS Quantity
        FROM TBL_Category_Item_File
        INNER JOIN TBL_Stocks_Balances ON TBL_Stocks_Balances.Item_ID = TBL_Category_Item_File.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
        WHERE Item_Exp_Date <= CAST(EOMONTH(DATEADD(MONTH, -1, GETDATE())) AS DATETIME)
          AND TBL_Stocks_Balances.Item_QTY > 0
        ORDER BY TBL_Category_Item_File.Item_Exp_Date, Item_Name`,

    'Top Peso Sold (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CONCAT(Item_Name, ' ', Catg_Name) AS Product,
            SUM(QTY) AS Quantity,
            MAX(Item_Packaging) AS Packaging,
            SUM(total_Cost) AS Total
        FROM TBL_Orders_Detail
        INNER JOIN tbl_orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
        INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
        WHERE group_id = 1 AND Order_Type LIKE '%Sales%'
          AND Order_Type NOT LIKE '%Transfer%'
          AND CASE
                WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                ELSE CONVERT(DATE, Encode_DateTime)
              END BETWEEN @StartDate AND @EndDate
        GROUP BY CONCAT(Item_Name, ' ', Catg_Name)
        ORDER BY SUM(total_Cost) DESC`,

    'Top Peso Sold (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CONCAT(Item_Name, ' ', Catg_Name) AS Product,
            SUM(QTY) AS Quantity,
            MAX(Item_Packaging) AS Packaging,
            SUM(total_Cost) AS Total
        FROM TBL_Orders_Detail
        INNER JOIN tbl_orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
        INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
        WHERE group_id = 2 AND Order_Type LIKE '%Sales%'
          AND Order_Type NOT LIKE '%Transfer%'
          AND CASE
                WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                ELSE CONVERT(DATE, Encode_DateTime)
              END BETWEEN @StartDate AND @EndDate
        GROUP BY CONCAT(Item_Name, ' ', Catg_Name)
        ORDER BY SUM(total_Cost) DESC`,

    'Lacking Served': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            MAX(LEFT(Order_type, 4))                                AS Order_type,
            MAX(TBL_Orders_Detail.Order_No)                         AS Order_No,
            MAX(Client_Name)                                        AS Entity,
            MAX(Client_Terms)                                       AS PO_Details,
            MAX(TBL_Orders_Detail.OrderDetail_ItemNo)               AS Item_No,
            TBL_Orders_Detail.Product_Name,
            MAX(TBL_Orders_Lacking_Details.Item_Description)        AS Lacking_Description,
            MAX(TBL_Orders_Detail.Remarks)                          AS Remarks,
            MAX(TBL_Orders_Detail.QTY)                              AS Order_Quantity,
            SUM(TBL_Orders_Lacking_Details.Quantity)                AS Lacking_Quantity,
            MAX(OL_Purchasing)                                      AS Purchasing_Assigned,
            MAX(OL_Encoder)
        FROM TBL_Orders_Detail
        INNER JOIN TBL_Orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
        INNER JOIN TBL_Orders_Lacking ON TBL_Orders_Lacking.Order_No = TBL_Orders_Detail.Order_No
        INNER JOIN TBL_Orders_Lacking_Details ON TBL_Orders_Lacking_Details.OL_ID = TBL_Orders_Lacking.OL_ID
        WHERE CASE
                WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                ELSE CONVERT(DATE, Encode_DateTime)
              END BETWEEN @StartDate AND @EndDate
          AND Order_Type LIKE '%GOVT%'
          AND Item_No = OrderDetail_ItemNo
        GROUP BY Order_Dtl, TBL_Orders_Detail.Product_Name`,
};


// --- SLS (Sales) QUERIES ---
const slsQueries = {
    'DPGS-Delivered': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            Order_Date              AS [Order Date],
            Client_Name             AS [Client Name],
            Client_Address          AS [Client Address],
            Misc_NOAdate            AS [Non-official Invoice],
            Misc_SalesInvoice       AS [Sales Invoice],
            Misc_DeliveryReceipt    AS [Official Delivery Receipt],
            ''                      AS [Charge Invoice],
            0.00                    AS [DM],
            0.00                    AS [MSDE],
            0.00                    AS [GM],
            0.00                    AS [LSAE],
            0.00                    AS [OSEF],
            0.00                    AS [ASME],
            0.00                    AS [REEV],
            PO_Amount               AS [Total Peso Sale]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Sorsogon Wholesale Retail Sales%' OR Order_Type LIKE '%SWRS%')
        ORDER BY Order_Date ASC`,

    'DPGS-Collected': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            Order_No                AS [Order No],
            Order_Date              AS [Booking Date],
            Misc_PODate             AS [Payment Date],
            ''                      AS [Check Date],
            Client_Name             AS [Entity],
            Order_Type              AS [Order Details],
            Misc_NOAdate            AS [Non-official Invoice],
            Misc_SalesInvoice       AS [Sales Invoice],
            Misc_DeliveryReceipt    AS [Delivery Receipt],
            ''                      AS [Charge Invoice],
            Order_Payment_Status    AS [Payment Type],
            ''                      AS [Bank Details],
            0.00                    AS [Discount],
            0.00                    AS [Return],
            0.00                    AS [Rebates],
            0.00                    AS [Tax],
            0.00                    AS [Other Charges],
            PO_Amount               AS [Sales Delivered],
            Payment_Amount          AS [Net Collected]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        ORDER BY Order_Date ASC`,

    'DPGS-Booking': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            O.Order_Date AS [Booking Date],
            CASE 
                WHEN I.Catg_ID IN (392979, 564572, 91602, 101990, 81593) THEN 'MEDICINES'
                WHEN I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908) THEN 'SUPPLIES'
                ELSE 'OTHER'
            END          AS [Sales Category],
            O.Client_Name    AS [Entity],
            O.Client_Address AS [End User],
            O.Order_Type     AS [PO Details],
            O.PO_Amount      AS [PO Amount],
            O.Payment_Amount AS [Total Delivered]
        FROM TBL_Orders O
        INNER JOIN TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON OD.Item_ID = I.Item_ID
        WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (O.Order_Type LIKE '%Sorsogon Field Government%' OR O.Order_Type LIKE '%SFGS%')
        ORDER BY O.Order_Date ASC`,

    'DWRS-Delivered': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            Order_Date           AS [Order Date],
            Client_Name          AS [Client Name],
            Client_Address       AS [Client Address],
            Misc_NOAdate         AS [Non-official Invoice],
            Misc_SalesInvoice    AS [Sales Invoice],
            Misc_DeliveryReceipt AS [Official Delivery Receipt],
            ''                   AS [Charge Invoice],
            0.00                 AS [DM],
            0.00                 AS [MSDE],
            0.00                 AS [GM],
            0.00                 AS [LSAE],
            0.00                 AS [OSEF],
            0.00                 AS [ASME],
            0.00                 AS [REEV],
            PO_Amount            AS [Total Peso Sale]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Sorsogon Field Government%' OR Order_Type LIKE '%SFGS%')
        ORDER BY Order_Date ASC`,

    'DWRS-Collected': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            O.Order_No              AS [Order No],
            O.Order_Date            AS [Booking Date],
            O.Misc_PODate           AS [Payment Date],
            ''                      AS [Check Date],
            O.Client_Name           AS [Procuring Entity],
            O.Order_Type            AS [Order Details],
            'Order Slip#' + CAST(O.Order_No AS VARCHAR(20)) AS [Non-official Invoice],
            O.Misc_SalesInvoice     AS [Sales Invoice],
            O.Misc_DeliveryReceipt  AS [Official Delivery Receipt],
            ''                      AS [Charge Invoice],
            O.Misc_RFQDate          AS [RFQ Date],
            O.Misc_PQDate           AS [PQ Date],
            O.Misc_NOAdate          AS [NOA Date],
            O.Misc_NTPdate          AS [NTP Date],
            O.Misc_PODate           AS [PO Date],
            O.Order_Payment_Status  AS [Payment Type],
            0.00                    AS [Tax Amount],
            O.PO_Amount             AS [Stocks Delivered],
            O.Payment_Amount        AS [Net Collected]
        FROM TBL_Orders O
        WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (O.Order_Type LIKE '%Sorsogon Field Government%' OR O.Order_Type LIKE '%SFGS%')
        ORDER BY O.Order_Date ASC`,

    'Top 30': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 30 'SWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(PO_Amount, 0)) AS [Total PO]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        SELECT TOP 30 'SWRS' AS [BOSC], Client_Name AS [Entity], SUM(CASE WHEN Misc_DeliveryReceipt IS NOT NULL THEN ISNULL(PO_Amount, 0) ELSE 0 END) AS [Total Delivered]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        SELECT TOP 30 'SWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(Payment_Amount, 0)) AS [Total Collected]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;`,

    'Top AR': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 30
            ''              AS [#],
            'SWRS'          AS [BOSC],
            Client_Name     AS [Entity],
            SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) AS [Total Balance]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name
        HAVING SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) > 0
        ORDER BY [Total Balance] DESC`,

    'Top Inactive': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 30
            ''  AS [#],
            CASE 
                WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%SFGS%' THEN 'SFGS'
                ELSE 'SWRS'
            END AS [BOSC],
            Client_Name AS [Entity],
            SUM(ISNULL(PO_Amount, 0)) AS [Total Consumption]
        FROM TBL_Orders
        WHERE (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%' OR Order_Type LIKE '%SFGS%')
        GROUP BY Client_Name, Order_Type
        HAVING MAX(CAST(Order_Date AS DATE)) < @StartDate
        ORDER BY [Total Consumption] DESC`,

    'New Clients': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            ''              AS [#],
            FORMAT(MIN(O.Order_Date), 'yyyy-MM-dd') AS [Date Added],
            O.Client_Name   AS [Name],
            O.Client_Address AS [Address],
            O.Order_Type    AS [Type]
        FROM TBL_Orders O
        WHERE (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
        GROUP BY O.Client_Name, O.Client_Address, O.Order_Type
        HAVING MIN(CAST(O.Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate
        ORDER BY [Date Added] ASC`,

    'Active Clients Update Audit': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            ''              AS [#],
            FORMAT(MIN(Order_Date), 'yyyy-MM-dd') AS [Date Recorded],
            CASE 
                WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%SFGS%' THEN 'SFGS'
                ELSE 'SWRS'
            END             AS [Sales Category],
            Client_Name     AS [Entity],
            FORMAT(MAX(Order_Date), 'yyyy-MM-dd') AS [Most Recent Order Date],
            COUNT(Order_No) AS [No. of Transactions]
        FROM TBL_Orders
        WHERE (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%' OR Order_Type LIKE '%SFGS%')
        GROUP BY Client_Name, Order_Type
        HAVING MAX(Order_Date) >= @StartDate
        ORDER BY [No. of Transactions] DESC`,

    'New Client Contacts': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            ''      AS [#],
            CASE WHEN Order_Type LIKE '%SFGS%' THEN 'SFGS' ELSE 'SWRS' END AS [Sales Category],
            Client_Name AS [Entity],
            ''      AS [Contact Person],
            ''      AS [Position],
            ''      AS [Department],
            ''      AS [Birthday],
            ''      AS [Contact Number],
            ''      AS [Email Address],
            'New Client March 2026' AS [Remarks]
        FROM TBL_Orders
        GROUP BY Client_Name, Order_Type
        HAVING MIN(CAST(Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate`,

    'Canvass Details': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            O.Order_No      AS [Canvass No],
            CAST(O.Order_Date AS DATE) AS [Plot Date],
            O.Client_Name   AS [Canvass Name],
            CASE 
                WHEN O.Order_Type LIKE '%SFGS%' THEN 'SFGS' 
                ELSE 'SWRS' 
            END             AS [Sales Category],
            ''              AS [End User],
            'Sorsogon Staff' AS [Canvasser Name],
            ''              AS [Contact],
            ''              AS [Designation],
            'YES'           AS [Approved?],
            'WON'           AS [Result],
            O.PO_Amount     AS [ABC Total],
            O.PO_Amount     AS [Canvass Total],
            'System'        AS [Encoder]
        FROM TBL_Orders O
        WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
          AND (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
        ORDER BY O.Order_Date ASC`,

    'Ordering Kiosk Details': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            CASE 
                WHEN O.Order_Type LIKE '%SFGS%' THEN 'SFGS' 
                ELSE 'SWRS' 
            END             AS [Sales Category],
            O.Order_No      AS [Order No],
            CAST(O.Order_Date AS DATE) AS [Booking Date],
            CAST(O.Order_Date AS DATE) AS [Order Date],
            O.Client_Name   AS [Entity],
            O.Client_Address AS [Address],
            ''              AS [End User/Requestor],
            'System_User'   AS [Encoder],
            ''              AS [Picker],
            ''              AS [Checker],
            ''              AS [Packer],
            O.Order_No      AS [Canvass No./SRF No.],
            O.Order_Type    AS [PO Details / Order Details],
            O.PO_Amount     AS [PO Amount / Order Total]
        FROM TBL_Orders O
        WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
          AND (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
        ORDER BY O.Order_No ASC`,
};


module.exports = {
    buildAcnQueries,   // function — requires dbName param
    prdQueries,        // plain object
    slsQueries,        // plain object
};
