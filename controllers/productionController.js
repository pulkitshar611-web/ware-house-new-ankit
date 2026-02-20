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
        if (err.message.includes('capacity exceeded')) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
}

async function pickIngredient(req, res, next) {
    try {
        const { orderId, productId, quantity } = req.body;
        const data = await productionService.pickIngredient(orderId, productId, quantity, req.user);
        res.json({ success: true, data });
    } catch (err) {
        if (err.message.includes('capacity exceeded')) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
}

async function complete(req, res, next) {
    try {
        const data = await productionService.complete(req.params.id, req.user);
        res.json({ success: true, data });
    } catch (err) {
        if (err.message.includes('capacity exceeded')) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
}

module.exports = {
    list,
    create,
    pickIngredient,
    complete
};
