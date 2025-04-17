const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  deleteReadNotifications
} = require('../controllers/notificationController');
const protect = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Get all notifications for the current user
router.get('/', getNotifications);

// Mark notifications as read
router.put('/read', markAsRead);

// Delete read notifications
router.delete('/read', deleteReadNotifications);

module.exports = router; 