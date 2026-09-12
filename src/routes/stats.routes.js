const express = require('express');
const router = express.Router();
const controller = require('../controllers/stats.controller');

router.get('/', controller.getStats);

module.exports = router;
