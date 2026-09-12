const notFound = (req, res, next) => {
    const err = new Error(`Not Found - ${req.originalUrl}`);
    err.status = 404;
    err.code = 'NOT_FOUND';
    next(err);
};

const errorHandler = (err, req, res, next) => {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred';

    res.status(status).json({
        success: false,
        error: {
            code,
            message
        },
        meta: {
            request_id: req.id
        }
    });
};

module.exports = { notFound, errorHandler };
