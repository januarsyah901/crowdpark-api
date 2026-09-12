const validate = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                details: err.errors
            }
        });
    }
};

const validateQuery = (schema) => (req, res, next) => {
    try {
        schema.parse(req.query);
        next();
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request query',
                details: err.errors
            }
        });
    }
};

module.exports = { validate, validateQuery };
