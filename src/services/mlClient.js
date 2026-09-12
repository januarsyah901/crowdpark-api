const env = require('../config/env');

const ML_URL = env.ML_URL || 'http://ml:8000';

let failureCount = 0;
let circuitOpenUntil = 0;

const checkCircuit = () => {
    if (failureCount >= 3) {
        const now = Date.now();
        if (now < circuitOpenUntil) {
            const err = new Error('ML Service circuit is open');
            err.code = 'ML_CIRCUIT_OPEN';
            err.status = 503;
            throw err;
        }
        failureCount = 0;
    }
};

const recordFailure = () => {
    failureCount++;
    if (failureCount >= 3) {
        circuitOpenUntil = Date.now() + 30000;
    }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 2500) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const postEstimate = async (payload, reqId = null) => {
    checkCircuit();
    const headers = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    let attempt = 0;
    while (attempt <= 1) {
        try {
            const response = await fetchWithTimeout(`${ML_URL}/analyze/estimate`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            }, 2500);

            if (!response.ok) {
                const error = new Error('ML API Error');
                error.code = 'ML_API_ERROR';
                error.status = response.status;
                throw error;
            }

            failureCount = 0;
            return await response.json();
        } catch (error) {
            attempt++;
            if (attempt > 1) {
                recordFailure();
                error.code = error.name === 'AbortError' ? 'ML_TIMEOUT' : (error.code || 'ML_REQUEST_FAILED');
                error.status = error.status || 500;
                throw error;
            }
            await delay(300);
        }
    }
};

const postSpp = async (payload, reqId = null) => {
    checkCircuit();
    const headers = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    let attempt = 0;
    while (attempt <= 1) {
        try {
            const response = await fetchWithTimeout(`${ML_URL}/analyze/spp`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            }, 2500);

            if (!response.ok) {
                const error = new Error('ML API Error');
                error.code = 'ML_API_ERROR';
                error.status = response.status;
                throw error;
            }

            failureCount = 0;
            return await response.json();
        } catch (error) {
            attempt++;
            if (attempt > 1) {
                recordFailure();
                error.code = error.name === 'AbortError' ? 'ML_TIMEOUT' : (error.code || 'ML_REQUEST_FAILED');
                error.status = error.status || 500;
                throw error;
            }
        }
    }
};

const triggerWalkRefresh = async (reqId = null) => {
    checkCircuit();
    const headers = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    try {
        const response = await fetchWithTimeout(`${ML_URL}/analyze/walk/refresh`, {
            method: 'POST',
            headers
        }, 2500);

        if (!response.ok) {
            const error = new Error('ML API Error');
            error.code = 'ML_API_ERROR';
            error.status = response.status;
            throw error;
        }

        failureCount = 0;
        return await response.json();
    } catch (error) {
        recordFailure();
        error.code = error.name === 'AbortError' ? 'ML_TIMEOUT' : (error.code || 'ML_REQUEST_FAILED');
        error.status = error.status || 500;
        throw error;
    }
};

module.exports = {
    postEstimate,
    postSpp,
    triggerWalkRefresh
};
