function duplicateSalesReports() {
  const rootFolderId = '1ZlrquPeXvzaJdAk1bqBLLFPL6m1nqaKm'; // ID/Location po ng folder na paglalagyan ng google sheets
  const masterSheetId = '17oHhzjwvfmJxixa3WpH2EkqgX18XGbujVwVzUVgmyL4'; // ID po ng i-duduplicate na googlesheet file yung empty version po ng sgr file
  const targetYear = 2026; // Year to adjust
  
  const templateFile = DriveApp.getFileById(masterSheetId);
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  
  for (let m = 0; m <= 11; m++) {
    let monthDate = new Date(targetYear, m, 1);
    
    let shortMonth = monthDate.toLocaleString('default', { month: 'short' }).toUpperCase();
    
    let fullMonth = monthDate.toLocaleString('default', { month: 'long' });

    // file name formating MBS, IBS, SBS | ACN, PRD, SLS | Sorsogon, Masbate, Iriga | Accounting, Products, Sales
    let fileName = `BCVR [SGR_ACN_SBS_${shortMonth}_${targetYear}] BCVR Sorsogon Branch Store | ${fullMonth} ${targetYear} - Accounting`;
    
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