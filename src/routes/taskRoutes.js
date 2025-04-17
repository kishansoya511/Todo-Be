const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  addComment
} = require('../controllers/taskController');
const protect = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Task routes
router.route('/')
  .post(createTask)
  .get(getTasks);

router.route('/:id')
  .put(updateTask)
  .delete(deleteTask);

// Comment routes
router.post('/:id/comments', addComment);

module.exports = router; 