const formulaService = require('../services/formulaService');

async function list(req, res, next) {
    try {
        const data = await formulaService.list(req.user, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function getByProductId(req, res, next) {
    try {
        const data = await formulaService.getByProductId(req.params.productId, req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const data = await formulaService.create(req.body, req.user);
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const data = await formulaService.update(req.params.id, req.body, req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await formulaService.remove(req.params.id, req.user);
        res.json({ success: true, message: 'Formula deleted' });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    getByProductId,
    create,
    update,
    remove
};
