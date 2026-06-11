# Deployment Guide - PMMPL Inventory Management System (IMS)

Follow these instructions to connect your React frontend to your Google Sheets database and launch the project on Vercel.

---

## Part 1: Setting up the Google Sheet Database

Create a new Google Sheet in Google Drive. You need to create the following worksheets (tabs) at the bottom, matching the capitalization exactly:

1. **`Login`**
   * Paste this header in row 1: `Username` | `Password` | `FullName` | `Role` | `Branch`
   * Seed a default Admin user in row 2: `admin` | `123` | `System Administrator` | `Admin` | `All`
   * Seed a Main Branch Manager in row 3: `manager_main` | `123` | `Main Branch Manager` | `Branch Manager` | `Main`

2. **`Main`** (Main Branch Inventory)
   * Header: `ItemId` | `ItemName` | `Category` | `Unit` | `CurrentStock` | `OpeningStock` | `MinThreshold`
   * Row 2 Example: `I-001` | `Boulder (Raw)` | `Boulder` | `Ton` | `1000` | `1000` | `500`

3. **`Madhya`** (Madhya Branch Inventory)
   * Same header columns as `Main`.

4. **`Rkl`** (Rkl Branch Inventory)
   * Same header columns as `Main`.

5. **`Purab`** (Purab Branch Inventory)
   * Same header columns as `Main`.

6. **`Pmmpl Rate`**
   * Header: `RateId` | `ItemName` | `Rate` | `EffectiveDate` | `HistoryJson`
   * Row 2 Example: `R-001` | `Boulder (Raw)` | `450` | `2026-04-01` | `[{"date":"2026-04-01","rate":450}]`

7. **`Crushing Logs`**
   * Header: `LogId` | `Date` | `InputItem` | `InputQty` | `OutputsJson` | `RecoveryRate` | `Notes`

8. **`Purchases`**
   * Header: `PurchaseId` | `Date` | `InvoiceNo` | `VendorName` | `Branch` | `ItemName` | `Qty` | `Rate` | `Unit` | `TaxableValue` | `GstRate` | `GstAmount` | `TotalAmount`

9. **`Dispatches`**
   * Header: `DispatchId` | `Date` | `InvoiceNo` | `CustomerName` | `Destination` | `Branch` | `ItemName` | `Qty` | `Rate` | `Unit` | `TotalAmount`

10. **`Transfers`**
    * Header: `TransferId` | `Date` | `FromBranch` | `ToBranch` | `ItemName` | `Qty` | `Unit` | `Status` | `ApprovedBy`

11. **`Settings`**
    * Header: `CompanyName` | `GSTIN` | `Address` | `AlertThresholdPercentage`
    * Row 2: `PMMPL Mining & Infra Pvt Ltd` | `22AAAAA0000A1Z5` | `Mining Sector Zone A, Jharsuguda, Odisha` | `20`

---

## Part 2: Deploying the Google Apps Script Web App

1. In your Google Sheet, click **Extensions > Apps Script** in the top menu.
2. Delete any boilerplate code inside the editor.
3. Open `google-apps-script.js` from this project's root folder, copy the entire file contents, and paste it into the Apps Script editor.
4. Click the **Save** (floppy disk) icon.
5. In the top right, click **Deploy > New deployment**.
6. Click the gear icon next to "Select type" and choose **Web app**.
7. Configure the settings:
   * **Description**: `PMMPL IMS API`
   * **Execute as**: `Me (your-email@gmail.com)`
   * **Who has access**: `Anyone` *(Crucial: This allows your React app to contact the script without Google accounts authentication prompt)*
8. Click **Deploy**.
9. Grant access if prompted (click "Advanced" and then "Go to ... (unsafe)", then "Allow").
10. Copy the **Web App URL** shown in the confirmation window. It will look like:
    `https://script.google.com/macros/s/AKfycbz.../exec`

---

## Part 3: Connecting your Frontend Application

In the React frontend project folder (`/MIS web/MIS web/`), create a new environment file named `.env`:

```env
VITE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_APPS_SCRIPT_DEPLOYMENT_ID/exec"
```

Replace `YOUR_APPS_SCRIPT_DEPLOYMENT_ID` with the URL you copied in Part 2.
*(Note: If this variable is omitted or left empty, the application will automatically run in local Mock Database fallback mode, saving entries to the browser's localStorage for easy testing)*

---

## Part 4: Deploying on Vercel

1. Create a free account on [Vercel](https://vercel.com).
2. Commit your code and push it to a GitHub repository.
3. In Vercel, click **Add New > Project**, select your GitHub repository, and click **Import**.
4. In the **Build and Output Settings**, keep defaults:
   * **Framework Preset**: `Vite`
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
5. Expand the **Environment Variables** section and add:
   * **Key**: `VITE_APPS_SCRIPT_URL`
   * **Value**: *(Paste your deployed Web App URL here)*
6. Click **Deploy**.

Vercel will build and host your modern, lightweight ERP inventory dashboard. All updates will automatically sync to your Google Sheets database in real time!
