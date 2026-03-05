const notificationService = require('../services/notificationService');

async function list(req, res, next) {
    try {
        console.log(`[DEBUG] Handling GET /api/notifications for user: ${req.user.id}`);
        const data = await notificationService.list(req.user, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function markAsRead(req, res, next) {
    try {
        const data = await notificationService.markAsRead(req.params.id, req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function markAllAsRead(req, res, next) {
    try {
        const data = await notificationService.markAllAsRead(req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    markAsRead,
    markAllAsRead
};
