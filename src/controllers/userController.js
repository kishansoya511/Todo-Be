const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    // Find all users and exclude password field
    const users = await User.find().select('-password');
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers
}; 