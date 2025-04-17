const Task = require('../models/Task');
const { createNotification } = require('./notificationController');

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res) => {
  try {
    const { title, description, priority, dueDate, assignees } = req.body;

    // Validate that at least one assignee is provided
    if (!assignees || assignees.length === 0) {
      return res.status(400).json({ message: 'Please assign the task to at least one user' });
    }

    // Add creator to assignees if not already included
    const allAssignees = [...new Set([...assignees, req.user._id])];

    const task = await Task.create({
      title,
      description,
      priority,
      dueDate,
      assignees: allAssignees,
      createdBy: req.user._id
    });

    // Populate assignees and creator before sending response
    await task.populate([
      { path: 'assignees', select: 'name email' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // Emit socket event for task assignment
    req.app.get('io').emit('task:assign', {
      taskId: task._id,
      assigneeId: req.user._id,
      task: task
    });

    // Store notifications for offline users
    for (const assigneeId of assignees) {
      if (assigneeId.toString() !== req.user._id.toString()) {
        await createNotification(
          assigneeId,
          'task:assign',
          task._id,
          `You have been assigned to task "${task.title}"`
        );
      }
    }

    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const { status, priority, assignee } = req.query;
    let query = {
      assignees: req.user._id // Only show tasks assigned to current user
    };

    // Add filters if provided
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignee) query.assignees = assignee;

    const tasks = await Task.find(query)
      .populate('assignees', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email')
      .sort('-createdAt');

    // Add overdue status
    const currentDate = new Date();
    tasks.forEach(task => {
      task.isOverdue = task.dueDate && new Date(task.dueDate) < currentDate;
    });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user is the creator or one of the assignees
    if (task.createdBy.toString() !== req.user._id.toString() && 
        !task.assignees.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }

    // If assignees are being updated, ensure creator remains in the list
    if (req.body.assignees) {
      req.body.assignees = [...new Set([...req.body.assignees, task.createdBy])];
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignees', 'name email')
     .populate('createdBy', 'name email')
     .populate('comments.user', 'name email');

    // Emit socket event for task update
    req.app.get('io').emit('task:update', {
      taskId: updatedTask._id,
      assignees: updatedTask.assignees.map(a => a._id),
      task: updatedTask
    });

    // Store notifications for offline users
    const assigneeIds = updatedTask.assignees.map(a => a._id.toString());
    for (const assigneeId of assigneeIds) {
      if (assigneeId !== req.user._id.toString()) {
        await createNotification(
          assigneeId,
          'task:update',
          updatedTask._id,
          `Task "${updatedTask.title}" has been updated`
        );
      }
    }

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user is the creator
    if (task.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    await Task.findByIdAndDelete(req.params.id);

    // Emit socket event for task deletion
    req.app.get('io').emit('task:update', {
      taskId: task._id,
      assignees: task.assignees,
      deleted: true
    });

    // Store notifications for offline users
    for (const assigneeId of task.assignees) {
      if (assigneeId.toString() !== req.user._id.toString()) {
        await createNotification(
          assigneeId,
          'task:update',
          task._id,
          `Task "${task.title}" has been deleted`
        );
      }
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add comment to task
// @route   POST /api/tasks/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user is creator or assignee
    if (task.createdBy.toString() !== req.user._id.toString() && 
        !task.assignees.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to comment on this task' });
    }

    task.comments.push({
      text,
      user: req.user._id
    });

    await task.save();

    const updatedTask = await Task.findById(req.params.id)
      .populate('assignees', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email');

    // Emit socket event for new comment
    req.app.get('io').emit('comment:new', {
      taskId: task._id,
      taskCreator: task.createdBy,
      assignees: task.assignees,
      task: updatedTask,
      comment: {
        text,
        user: req.user._id,
        createdAt: new Date()
      }
    });

    // Store notifications for offline users
    // Notify task creator if they're not the one commenting
    if (task.createdBy.toString() !== req.user._id.toString()) {
      await createNotification(
        task.createdBy,
        'comment:new',
        task._id,
        `New comment on your task "${task.title}"`
      );
    }

    // Notify assignees (excluding the commenter)
    for (const assigneeId of task.assignees) {
      if (assigneeId.toString() !== req.user._id.toString()) {
        await createNotification(
          assigneeId,
          'comment:new',
          task._id,
          `New comment on task "${task.title}"`
        );
      }
    }

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  addComment
}; 