function duplicateSalesReports() {
  const rootFolderId = '11WnXyYB0OBX7HuRz_fdCSHQmvdHF9yHI'; // ID/Location po ng folder na paglalagyan ng google sheets
  const masterSheetId = '1ZTcBSZd3T5UiSrMUMATduHvnpE1xBlnbm9_RZuvVNjI'; // ID po ng i-duduplicate na googlesheet file yung empty version po ng sgr file
  const targetYear = 2026; // Year to adjust
  
  const templateFile = DriveApp.getFileById(masterSheetId);
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  
  for (let m = 0; m <= 11; m++) {
    let monthDate = new Date(targetYear, m, 1);

    let shortMonth = monthDate.toLocaleString('default', { month: 'short' }).toUpperCase();
    
    let fullMonth = monthDate.toLocaleString('default', { month: 'long' });

    // file name formating MBS, IBS, SBS | ACN, PRD, SLS | Sorsogon, Masbate, Iriga | Accounting, Products, Sales
    let fileName = `BCVR [SGR_SLS_MBS_${shortMonth}_${targetYear}] BCVR Masbate Branch Store | ${fullMonth} ${targetYear} - Sales`;
    
    let existing = rootFolder.getFilesByName(fileName);
    
    if (!existing.hasNext()) {
      templateFile.makeCopy(fileName, rootFolder);
      console.log('✅ Generated: ' + fileName);
    } else {
      console.log('ℹ️ Skipping: ' + fileName + ' already exists.');
    }
  }
  console.log('🚀 Complete! All files match the image naming convention.');
}