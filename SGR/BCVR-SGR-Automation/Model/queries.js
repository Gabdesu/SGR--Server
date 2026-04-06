const { DATE } = require('./config');

// =============================================================================
// PRD QUERIES — used by prdController.js
// =============================================================================
const prdQueries = {
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

// =============================================================================
// SLS QUERIES — used by slsController.js
// =============================================================================
const slsQueries = {
    'SWRS-Delivered': `
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

    'SWRS-Collected': `
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

    'SFGS-Booking': `
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

    'SFGS-Delivered': `
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

    'SFGS-Collected': `
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
            ''               AS [#],
            FORMAT(MIN(O.Order_Date), 'yyyy-MM-dd') AS [Date Added],
            O.Client_Name    AS [Name],
            O.Client_Address AS [Address],
            O.Order_Type     AS [Type]
        FROM TBL_Orders O
        WHERE (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
        GROUP BY O.Client_Name, O.Client_Address, O.Order_Type
        HAVING MIN(CAST(O.Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate
        ORDER BY [Date Added] ASC`,

    'Active Clients Update Audit': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            ''  AS [#],
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

// =============================================================================
// ACN QUERIES — used by acnController.js
// Wrapped in a function because some queries reference a dynamic ${dbName}
// Usage: const queries = buildAcnQueries(dbName);
// =============================================================================
function buildAcnQueries(dbName) {
    return {
        'ST: SBS->DW': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT [Order Date], [Client Name], [Client Address], [Non-official Invoice], [DM], [MSDE], [GM], [LSAE], [OSEF], [ASME], [REEV], [Total Peso Sale]
            FROM (
                SELECT 1 AS SortOrder,
                    CAST(ISNULL(CONVERT(VARCHAR(10), O.Order_Date, 120), '') AS NVARCHAR(50)) AS [Order Date],
                    CAST(ISNULL(O.Client_Name, '') AS NVARCHAR(255)) AS [Client Name],
                    CAST(ISNULL(O.Client_Address, '') AS NVARCHAR(255)) AS [Client Address],
                    CAST('STF#' + CAST(O.Order_No AS VARCHAR(20)) AS NVARCHAR(255)) AS [Non-official Invoice],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 1 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [DM],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 2 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [MSDE],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 3 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [GM],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 4 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [LSAE],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 5 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [OSEF],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 6 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [ASME],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 7 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [REEV],
                    CAST(FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2') AS NVARCHAR(50)) AS [Total Peso Sale]
                FROM dbo.TBL_Orders O
                INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
                LEFT JOIN dbo.TBL_Category_Item_File CI ON OD.Item_ID = CI.Item_ID
                LEFT JOIN dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
                LEFT JOIN dbo.TBL_Group G ON CF.Group_ID = G.Group_ID
                WHERE O.Order_Type LIKE 'TS - Transfer Sales%'
                  AND O.Client_Name NOT LIKE '%Distribution%'
                  AND O.Client_Name NOT LIKE '%BCVR-DW%'
                  AND O.Order_Date BETWEEN @StartDate AND @EndDate
                GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
            ) AS ST_Report
            ORDER BY [Order Date] ASC`,

        'RT: DW->SBS': `
            DECLARE @StartDate DATE = '${DATE.sql.start}';
            DECLARE @EndDate   DATE = '${DATE.sql.end}';
            SELECT [Order Date], [Client Name], [Client Address], [Non-official Invoice], [DM], [MSDE], [GM], [LSAE], [OSEF], [ASME], [REEV], [Total Peso Sale]
            FROM (
                SELECT 1 AS SortOrder,
                    CAST(ISNULL(CONVERT(VARCHAR(10), O.Order_Date, 120), '') AS NVARCHAR(50)) AS [Order Date],
                    CAST(ISNULL(O.Client_Name, '') AS NVARCHAR(255)) AS [Client Name],
                    CAST(ISNULL(O.Client_Address, '') AS NVARCHAR(255)) AS [Client Address],
                    CAST('STF#' + CAST(O.Order_No AS VARCHAR(20)) AS NVARCHAR(255)) AS [Non-official Invoice],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 1 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [DM],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 2 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [MSDE],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 3 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [GM],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 4 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [LSAE],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 5 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [OSEF],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 6 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [ASME],
                    CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 7 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [REEV],
                    CAST(FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2') AS NVARCHAR(50)) AS [Total Peso Sale]
                FROM dbo.TBL_Orders O
                INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
                LEFT JOIN dbo.TBL_Category_Item_File CI ON OD.Item_ID = CI.Item_ID
                LEFT JOIN dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
                LEFT JOIN dbo.TBL_Group G ON CF.Group_ID = G.Group_ID
                WHERE O.Order_Type LIKE 'TS - Transfer Sales%'
                  AND (O.Client_Name LIKE '%Distribution%' OR O.Client_Name LIKE '%BCVR-DW%')
                  AND O.Order_Date BETWEEN @StartDate AND @EndDate
                GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
            ) AS RT_Report
            ORDER BY [Order Date] ASC`,

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

module.exports = { prdQueries, slsQueries, buildAcnQueries };
