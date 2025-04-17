const Notification = require('../models/Notification');
const Task = require('../models/Task');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort('-createdAt')
      .populate({
        path: 'taskId',
        select: 'title status priority',
      });

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark notifications as read
// @route   PUT /api/notifications/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { notificationIds } = req.body;

    // Check if notification IDs are provided
    if (!notificationIds || !notificationIds.length) {
      return res.status(400).json({ message: 'Please provide notification IDs' });
    }

    // Update all specified notifications
    await Notification.updateMany(
      { 
        _id: { $in: notificationIds },
        user: req.user._id 
      },
      { read: true }
    );

    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new notification (internal use only)
// @access  Private
const createNotification = async (userId, type, taskId, message) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
      taskId,
      message
    });
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// @desc    Delete read notifications
// @route   DELETE /api/notifications/read
// @access  Private
const deleteReadNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user._id, read: true });
    res.json({ message: 'Read notifications deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  createNotification,
  deleteReadNotifications
}; 