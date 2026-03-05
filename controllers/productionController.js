const productionService = require('../services/productionService');

async function list(req, res, next) {
    try {
        const data = await productionService.list(req.user, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const data = await productionService.create(req.body, req.user);
        res.status(201).json({ success: true, data });
    } catch (err) {
        // Return 400 for known user errors, 500 for unexpected ones
        const userErrors = ['formula not found', 'product not found', 'formula', 'No production'];
        const isUserError = userErrors.some(e => err.message.toLowerCase().includes(e.toLowerCase()));
        if (isUserError) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
}

async function validateStock(req, res, next) {
    try {
        const data = await productionService.validateStock(req.params.id, req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function startProduction(req, res, next) {
    try {
        const data = await productionService.startProduction(req.params.id, req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function complete(req, res, next) {
    try {
        const data = await productionService.complete(req.params.id, req.user);
        res.json({ success: true, data });
    } catch (err) {
        if (err.message.includes('Insufficient stock')) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
}

module.exports = {
    list,
    create,
    validateStock,
    startProduction,
    complete
};
