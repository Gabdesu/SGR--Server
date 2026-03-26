const express = require('express');
const app = express();
const acnController = require('./controllers/SBSacnController');
const prdController = require('./controllers/SBSprdController');
const slsController = require('./controllers/SBSslsController');

// Centralized Configuration for Branches
const BRANCH_CONFIG = {
    sorsogon: {
        acn: { folderId: '1ZlrquPeXvzaJdAk1bqBLLFPL6m1nqaKm', db: 'SBS_ACN' },
        prd: { folderId: '1s2NS6sTQC8TgfHXEd7BU-fNjRAgaeXNF', db: 'SBS_PRD' },
        sls: { folderId: '1cb2TKC7AgN8PhSvGZo9naZoQOCXeyDxt', db: 'SBS_SLS' }
    }
};

// Route: POST /sync/:branch/:type
// Example: POST /sync/sorsogon/acn
app.post('/sync/:branch/:type', async (req, res) => {
    const { branch, type } = req.params;
    const config = BRANCH_CONFIG[branch]?.[type];

    if (!config) return res.status(404).send('Branch/Type configuration not found.');

    try {
        let result;
        if (type === 'acn') result = await acnController.run(config);
        if (type === 'prd') result = await prdController.run(config);
        if (type === 'sls') result = await slsController.run(config);
        
        res.status(200).json({ status: 'Success', details: result });
    } catch (err) {
        res.status(500).json({ status: 'Error', message: err.message });
    }
});

app.listen(5000, () => console.log('Main Sync Server running on port 5000'));