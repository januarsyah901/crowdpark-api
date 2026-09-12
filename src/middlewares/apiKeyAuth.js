const env = require('../config/env');

const apiKeyAuth = (scope) => {
    return (req, res, next) => {
        const apiKey = req.header('X-API-Key');
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'API key is missing'
                }
            });
        }

        const adminKey = env.INTERNAL_API_KEY_ADMIN;
        if (adminKey && apiKey === adminKey) {
            return next();
        }

        let expectedKey;
        switch (scope) {
            case 'csv_import':
                expectedKey = env.INTERNAL_API_KEY_CSV;
                break;
            case 'mapid_sync':
                expectedKey = env.INTERNAL_API_KEY_MAPID;
                break;
            default:
                expectedKey = null;
        }

        if (!expectedKey || apiKey !== expectedKey) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid API key for this scope'
                }
            });
        }

        next();
    };
};

module.exports = { apiKeyAuth };
