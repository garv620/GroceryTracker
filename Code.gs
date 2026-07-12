// Google Apps Script Backend for Grocery Tracker
// ================================================
// UPDATED: Uses JSONP to bypass CORS restrictions.
//
// Setup instructions:
// 1. In Google Sheets, go to Extensions > Apps Script
// 2. Paste this code
// 3. Click Deploy > New Deployment
// 4. Type: Web App, Execute as: Me, Who has access: Anyone
// 5. Copy the Web App URL
// ================================================

const RECIPIENT_EMAIL = "10426garvmehtaldh@gmail.com,nizamekhass@gmail.com";

// --- doGet handles ALL requests (both reads and writes) via JSONP ---
function doGet(e) {
  try {
    const action = e.parameter.action;
    const callback = e.parameter.callback || "callback";
    let result;

    if (action === "get_products") {
      result = handleGetProducts();
    } else if (action === "get_last_prices") {
      result = handleGetLastPrices();
    } else if (action === "get_statistics") {
      result = handleGetStatistics();
    } else if (action === "get_history") {
      result = handleGetHistory(e.parameter.date);
    } else if (action === "save_purchases") {
      // Receive purchase data as a JSON string in the 'data' parameter
      const payload = JSON.parse(e.parameter.data);
      result = handleSavePurchases(payload);
    } else if (action === "add_product") {
      const payload = JSON.parse(e.parameter.data);
      result = handleAddProduct(payload);
    } else if (action === "edit_product") {
      const payload = JSON.parse(e.parameter.data);
      result = handleEditProduct(payload);
    } else if (action === "delete_product") {
      result = handleDeleteProduct(e.parameter.id);
    } else {
      result = { success: false, error: "Unknown action: " + action };
    }

    // Return as JSONP (JavaScript callback wrapping JSON)
    const jsonString = JSON.stringify(result);
    return ContentService.createTextOutput(callback + "(" + jsonString + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);

  } catch (error) {
    const callback = (e && e.parameter && e.parameter.callback) || "callback";
    const errorResult = JSON.stringify({ success: false, error: error.message });
    return ContentService.createTextOutput(callback + "(" + errorResult + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

// doPost is kept as a fallback but we primarily use doGet with JSONP
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "save_purchases") {
      return ContentService.createTextOutput(JSON.stringify(handleSavePurchases(data.payload)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === "add_product") {
      return ContentService.createTextOutput(JSON.stringify(handleAddProduct(data.payload)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === "edit_product") {
      return ContentService.createTextOutput(JSON.stringify(handleEditProduct(data.payload)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === "delete_product") {
      return ContentService.createTextOutput(JSON.stringify(handleDeleteProduct(data.id)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- Handlers ---

function handleGetProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const data = sheet.getDataRange().getValues();
  
  const products = [];
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "" && data[i][1] === "") continue; // skip empty rows
    products.push({
      id: data[i][0],
      name: data[i][1],
      category: data[i][2],
      unit: data[i][3]
    });
  }
  
  return { success: true, data: products };
}

function handleAddProduct(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const id = payload.id || ("P" + (sheet.getLastRow() + 1));
  
  sheet.appendRow([id, payload.name, payload.category, payload.unit]);
  
  return { success: true, data: { id: id, name: payload.name, category: payload.category, unit: payload.unit } };
}

function handleEditProduct(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(payload.id).trim()) {
      rowIndex = i + 1; // +1 because array is 0-indexed and rows are 1-indexed
      break;
    }
  }
  
  if (rowIndex !== -1) {
    sheet.getRange(rowIndex, 2, 1, 3).setValues([[payload.name, payload.category, payload.unit]]);
  } else {
    // If not found in sheet (e.g. was a default product never edited before), add it
    sheet.appendRow([payload.id, payload.name, payload.category, payload.unit]);
  }
  
  return { success: true, data: payload };
}

function handleDeleteProduct(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  return { success: false, error: "Product not found" };
}

function handleGetLastPrices() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Purchases");
  const data = sheet.getDataRange().getValues();
  
  const lastPrices = {}; // product_id -> rate
  
  // Go backwards to find the most recent price for each product
  for (let i = data.length - 1; i >= 1; i--) {
    const rawId = data[i][2];
    const productId = rawId ? String(rawId).trim() : null;
    const rate = data[i][4];
    
    if (productId && !lastPrices[productId]) {
      lastPrices[productId] = rate;
    }
  }
  
  return { success: true, data: lastPrices };
}

function handleGetStatistics() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Purchases");
  const data = sheet.getDataRange().getValues();
  
  const stats = {};
  
  for (let i = 1; i < data.length; i++) {
    const date = data[i][1];
    const rawId = data[i][2];
    const productId = rawId ? String(rawId).trim() : null;
    const name = data[i][3];
    const rate = data[i][4];
    
    if (!productId) continue;
    
    // Format date properly for JSON avoiding timezone shift
    let formattedDate = date;
    if (date instanceof Date) {
      formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (date && typeof date.toISOString === 'function') {
      formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    
    if (!stats[productId]) {
      stats[productId] = {
        name: name,
        minPrice: rate,
        minDate: formattedDate,
        maxPrice: rate,
        maxDate: formattedDate,
        lastPrice: rate,
        lastDate: formattedDate
      };
    } else {
      if (rate < stats[productId].minPrice) {
        stats[productId].minPrice = rate;
        stats[productId].minDate = formattedDate;
      }
      if (rate > stats[productId].maxPrice) {
        stats[productId].maxPrice = rate;
        stats[productId].maxDate = formattedDate;
      }
      stats[productId].lastPrice = rate;
      stats[productId].lastDate = formattedDate;
    }
  }
  
  return { success: true, data: stats };
}

function handleGetHistory(targetDate) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Purchases");
  const data = sheet.getDataRange().getValues();
  const history = [];
  
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][1];
    let formattedDate = rowDate;
    if (rowDate instanceof Date) {
      formattedDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (rowDate && typeof rowDate.toISOString === 'function') {
      formattedDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    
    if (formattedDate === targetDate) {
      const rawId = data[i][2];
      history.push({
        id: rawId ? String(rawId).trim() : null,
        name: data[i][3],
        rate: data[i][4],
        quantity: data[i][5],
        total: data[i][6]
      });
    }
  }
  return { success: true, data: history };
}

function handleSavePurchases(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Purchases");
  const timestamp = new Date();
  const date = payload.date;
  const items = payload.items;
  
  const rowsToInsert = [];
  const expensiveItems = []; // For email alert
  
  // Get all historical stats for comparison
  const stats = handleGetStatistics().data;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemStats = stats[item.id] || null;
    const leastPrice = itemStats ? itemStats.minPrice : 0;
    const leastDate = itemStats ? itemStats.minDate : "";
    
    rowsToInsert.push([
      timestamp,
      date,
      item.id,
      item.name,
      item.rate,
      item.quantity,
      item.total
    ]);
    
    // Check if new price is more expensive than the all-time least price
    if (leastPrice > 0 && item.rate > leastPrice) {
      expensiveItems.push({
        name: item.name,
        leastPrice: leastPrice,
        leastDate: leastDate,
        newRate: item.rate,
        increase: (((item.rate - leastPrice) / leastPrice) * 100).toFixed(1)
      });
    }
  }
  
  if (rowsToInsert.length > 0) {
    // Insert all rows
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToInsert.length, 7).setValues(rowsToInsert);
  }
  
  // Send Email Alert if expensive items found
  if (expensiveItems.length > 0 && RECIPIENT_EMAIL !== "") {
    sendPriceAlertEmail(date, expensiveItems, RECIPIENT_EMAIL);
  }
  
  return { 
    success: true, 
    message: "Saved successfully",
    alertsSent: expensiveItems.length > 0
  };
}

function sendPriceAlertEmail(date, items, recipients) {
  const subject = "⚠️ Price Alert — " + date + " — Higher than Lowest Recorded Price";
  
  let htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px;">';
  htmlBody += '<h2>Restaurant Grocery Price Alert</h2>';
  htmlBody += '<p>The following items were purchased at HIGHER prices compared to their lowest historical recorded price:</p>';
  htmlBody += '<table style="width: 100%; border-collapse: collapse; margin-top: 15px;">';
  htmlBody += '<thead><tr style="background-color: #f4f4f4; border-bottom: 2px solid #ddd;">';
  htmlBody += '<th style="padding: 10px; text-align: left;">Product</th>';
  htmlBody += '<th style="padding: 10px; text-align: left;">Lowest Price</th>';
  htmlBody += '<th style="padding: 10px; text-align: left;">Today\'s Rate (' + date + ')</th>';
  htmlBody += '<th style="padding: 10px; text-align: left;">Increase</th>';
  htmlBody += '</tr></thead><tbody>';
  
  items.forEach(function(item) {
    htmlBody += '<tr style="border-bottom: 1px solid #eee;">';
    htmlBody += '<td style="padding: 10px;"><strong>' + item.name + '</strong></td>';
    htmlBody += '<td style="padding: 10px;">₹' + item.leastPrice + '<br><span style="font-size:10px;color:#666;">(on ' + item.leastDate + ')</span></td>';
    htmlBody += '<td style="padding: 10px; color: #d32f2f;"><strong>₹' + item.newRate + '</strong></td>';
    htmlBody += '<td style="padding: 10px; color: #d32f2f;">+' + item.increase + '%</td>';
    htmlBody += '</tr>';
  });
  
  htmlBody += '</tbody></table>';
  htmlBody += '<p style="margin-top: 20px; color: #666; font-size: 12px;">Sent automatically by Grocery Tracker backend.</p>';
  htmlBody += '</div>';
  
  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    htmlBody: htmlBody
  });
}
