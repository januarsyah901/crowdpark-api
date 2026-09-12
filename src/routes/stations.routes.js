const express = require('express');
const router = express.Router();
const controller = require('../controllers/stations.controller');

router.get('/search', controller.searchStations);
router.get('/:id', controller.getStationById);
router.get('/', controller.getStations);

module.exports = router;
