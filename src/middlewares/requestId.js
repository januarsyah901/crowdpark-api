const { v4: uuidv4 } = require('uuid');

const requestId = (req, res, next) => {
    const id = req.header('X-Request-Id') || uuidv4();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
};

module.exports = { requestId };
